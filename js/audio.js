/**
 * audio.js — 音频分析模块
 *
 * 职责：
 *   1. 初始化 WebAudio API（AudioContext → AnalyserNode → GainNode）
 *   2. 加载 / 解码音频文件
 *   3. 播放控制（播放、暂停、上一首、下一首、拖动进度、音量）
 *   4. 节拍检测（Beat Detection）：实时分析低频能量，输出 isBeat / beatPulse
 *
 * 依赖：state.js（读写 aCtx / anlz / src / gain / dArr / fArr /
 *               playing / sTime / pOff / plist / curI / muted /
 *               isBeat / beatPulse / bEnergy / lastBeat / bCool / S）
 */

// ══════════════════════════════════════════
// 1. WebAudio 初始化
// ══════════════════════════════════════════

/** 首次操作时惰性初始化 AudioContext（浏览器要求用户手势触发） */
function ensureCtx() {
  if (aCtx) return;
  aCtx  = new (window.AudioContext || window.webkitAudioContext)();
  anlz  = aCtx.createAnalyser();
  anlz.fftSize = 2048;                // FFT 窗口：频率分辨率 1024 个 bin
  anlz.smoothingTimeConstant = 0.80;  // 平滑系数，减少闪烁

  gain  = aCtx.createGain();
  gain.gain.value = S.volume;

  // 信号链：AnalyserNode → GainNode → 扬声器
  anlz.connect(gain);
  gain.connect(aCtx.destination);

  // 分配数据缓冲区
  dArr = new Uint8Array(anlz.frequencyBinCount); // 时域（波形）
  fArr = new Uint8Array(anlz.frequencyBinCount); // 频域（频谱）
}

function playRhythmClick(level = 1) {
  ensureCtx();
  if (!aCtx || !S.rhythmClick) return;

  const now = aCtx.currentTime;
  const osc = aCtx.createOscillator();
  const g = aCtx.createGain();

  // 强拍更高更亮，弱拍稍低更轻
  const freq = level >= 0.85 ? 1760 : level >= 0.55 ? 1320 : 980;
  const amp = Math.min(0.08, 0.028 + level * 0.04);

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq, now);
  osc.frequency.exponentialRampToValueAtTime(Math.max(520, freq * 0.72), now + 0.035);

  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(amp, now + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);

  osc.connect(g);
  g.connect(aCtx.destination);
  osc.start(now);
  osc.stop(now + 0.06);
}

let _prevFreq = null;
let _fluxAvg = 0;
let _kickHist = [];
let _lowHist = [];

function avgBand(freq, lowHz, highHz) {
  if (!freq || !freq.length || !anlz) return 0;
  const binHz = aCtx ? (aCtx.sampleRate / anlz.fftSize) : 21.5;
  const start = Math.max(0, Math.floor(lowHz / binHz));
  const end = Math.min(freq.length - 1, Math.floor(highHz / binHz));
  if (end < start) return 0;
  let sum = 0;
  for (let i = start; i <= end; i++) sum += freq[i];
  return sum / (end - start + 1);
}

function extractAudioFeatures(freq) {
  const kick = avgBand(freq, 40, 120);
  const subBass = avgBand(freq, 20, 60);
  const bass = avgBand(freq, 60, 250);
  const mid = avgBand(freq, 250, 2000);
  const high = avgBand(freq, 2000, 8000);

  let flux = 0;
  if (_prevFreq && _prevFreq.length === freq.length) {
    for (let i = 0; i < freq.length; i++) {
      const diff = freq[i] - _prevFreq[i];
      if (diff > 0) flux += diff;
    }
  }
  _prevFreq = new Uint8Array(freq);
  _fluxAvg = _fluxAvg * 0.9 + flux * 0.1;

  _kickHist.push(kick);
  if (_kickHist.length > 9) _kickHist.shift();
  const lowMix = kick * 0.72 + bass * 0.28;
  _lowHist.push(lowMix);
  if (_lowHist.length > 9) _lowHist.shift();

  aFeat = {
    kick,
    subBass,
    bass,
    mid,
    high,
    flux,
    energy: (subBass + bass + mid + high) / 4,
  };
  return aFeat;
}

function _avg(arr, from = 0, to = arr.length) {
  const slice = arr.slice(from, to);
  if (!slice.length) return 0;
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

function _isLocalPeak(arr) {
  if (arr.length < 5) return false;
  const c = arr.length - 3;
  const v = arr[c];
  return v > arr[c - 1] && v >= arr[c + 1] && v > arr[c - 2] && v >= arr[c + 2];
}

function _beatTempoConfidence(now) {
  if (!beatIntervals.length) return 1;
  const avgInt = _avg(beatIntervals);
  const lastInt = now - lastBeat;
  const diff = Math.abs(lastInt - avgInt);
  if (avgInt <= 0) return 1;
  if (diff < avgInt * 0.2) return 1.08;
  if (diff < avgInt * 0.42) return 1.0;
  return 0.9;
}

// ══════════════════════════════════════════
// 2. 文件加载 & 解码
// ══════════════════════════════════════════

/** 批量加载音频文件，解码后加入播放列表 */
async function loadFiles(files) {
  ensureCtx();
  for (const f of files) {
    if (!f.type.startsWith('audio/') && !/\.(mp3|wav|ogg|aac|m4a|flac|wma|opus|webm)$/i.test(f.name)) continue;
    try {
      const buf = await f.arrayBuffer();
      const dec = await aCtx.decodeAudioData(buf);
      plist.push({ name: f.name.replace(/\.[^.]+$/, ''), buffer: dec, duration: dec.duration });
      renderPL();
    } catch (e) {
      console.warn('解码失败:', f.name, e);
    }
  }
  if (curI === -1 && plist.length > 0) playTk(0);
  document.getElementById('do').classList.add('h'); // 隐藏空状态提示
}

// 顶部工具栏「添加音乐」按钮
document.getElementById('fi').addEventListener('change', e => {
  loadFiles([...e.target.files]);
  e.target.value = '';
});

// ══════════════════════════════════════════
// 3. 播放控制
// ══════════════════════════════════════════

/** 播放指定索引的曲目 */
function playTk(i) {
  if (i < 0 || i >= plist.length) return;
  curI = i;
  if (src) { src.onended = null; try { src.stop(); } catch (e) {} }

  const t = plist[i];
  src = aCtx.createBufferSource();
  src.buffer = t.buffer;
  src.connect(anlz);
  src.start(0, 0);
  sTime   = aCtx.currentTime;
  pOff    = 0;
  playing = true;

  document.getElementById('ns').textContent = t.name;
  document.getElementById('dt').textContent = fmt(t.duration);
  src.onended = () => { if (playing) autoNext(); };

  updUI();
  renderPL();
}

/** 播完自动切下一首（遵循循环模式） */
function autoNext() {
  if (plist.length === 0) { playing = false; updUI(); return; }
  switch (S.loopMode) {
    case 'loop':
      playTk((curI + 1) % plist.length);
      break;
    case 'one':
      playTk(curI);
      break;
    case 'shuffle': {
      let next = Math.floor(Math.random() * plist.length);
      if (plist.length > 1) while (next === curI) next = Math.floor(Math.random() * plist.length);
      playTk(next);
      break;
    }
    default: // 'seq' 顺序播放到底停止
      if (curI < plist.length - 1) playTk(curI + 1);
      else { playing = false; updUI(); }
  }
}

/** 播放 / 暂停切换 */
function togPlay() {
  if (!aCtx || plist.length === 0) return;
  if (playing) {
    pOff = aCtx.currentTime - sTime;
    try { src.stop(); } catch (e) {}
    playing = false;
  } else {
    if (curI === -1) { playTk(0); return; }
    if (src) { try { src.stop(); } catch (e) {} }
    src = aCtx.createBufferSource();
    src.buffer = plist[curI].buffer;
    src.connect(anlz);
    src.start(0, pOff);
    sTime   = aCtx.currentTime - pOff;
    playing = true;
    src.onended = () => { if (playing) autoNext(); };
  }
  updUI();
}

/** 上一首（3秒内重播当前曲，否则切上一首） */
function prevTk() {
  if (src) src.onended = null;
  const elapsed = aCtx ? aCtx.currentTime - sTime : 0;
  if (elapsed > 3) playTk(curI);
  else if (curI > 0) playTk(curI - 1);
}

/** 下一首 */
function nextTk() {
  if (src) src.onended = null;
  if (curI < plist.length - 1) playTk(curI + 1);
  else if (S.loopMode === 'loop' || S.loopMode === 'shuffle') playTk(0);
}

/** 进度条拖动跳转 */
let _skWasPlaying = false;
let _skActive     = false;   // 交互期间阻止渲染循环覆盖 slider 值
const _seekSlider  = document.getElementById('sk');

// pointerdown：记录播放状态，锁定渲染循环对进度条的写入
_seekSlider.addEventListener('pointerdown', function () {
  _skWasPlaying = playing;
  _skActive     = true;
});

// input：拖动时实时更新时间显示和填充色
_seekSlider.addEventListener('input', function () {
  if (curI < 0 || !plist[curI]) return;
  const t = (this.value / 100) * plist[curI].buffer.duration;
  this.style.setProperty('--sp', this.value + '%');
  document.getElementById('ct').textContent = fmt(t);
});

// change：松手后执行实际跳转，恢复原来的播放/暂停状态
_seekSlider.addEventListener('change', function () {
  _skActive = false;
  if (!aCtx || curI < 0) return;
  const t = (this.value / 100) * plist[curI].buffer.duration;
  if (src) { src.onended = null; try { src.stop(); } catch (e) {} }
  pOff = t;
  if (_skWasPlaying) {
    src = aCtx.createBufferSource();
    src.buffer = plist[curI].buffer;
    src.connect(anlz);
    src.start(0, t);
    sTime   = aCtx.currentTime - t;
    playing = true;
    src.onended = () => { if (playing) autoNext(); };
  } else {
    playing = false;
    const pct = Math.min((t / plist[curI].buffer.duration) * 100, 100);
    this.style.setProperty('--sp', pct + '%');
    document.getElementById('ct').textContent = fmt(t);
  }
  updUI();
});
document.addEventListener('pointerup', () => {
  if (_skActive && document.activeElement !== _seekSlider) _skActive = false;
});

// ── 音量控制 ──
function setVol(v) {
  S.volume = parseFloat(v);
  if (gain) gain.gain.value = S.volume;
  muted = false;
  document.getElementById('vs').style.setProperty('--vp', (S.volume * 100).toFixed(1) + '%');
  document.getElementById('vi').textContent = S.volume > .5 ? '🔊' : S.volume > 0 ? '🔉' : '🔇';
  saveSettings();
}

function togMute() {
  if (!gain) return;
  muted = !muted;
  gain.gain.value = muted ? 0 : S.volume;
  document.getElementById('vi').textContent = muted ? '🔇' : S.volume > .5 ? '🔊' : '🔉';
  saveSettings();
}

// ── 更新播放器按钮状态 ──
function updUI() {
  const p = document.getElementById('pb');
  p.textContent = playing ? '⏸' : '▶';
  p.disabled = plist.length === 0;
  document.getElementById('pvb').disabled = plist.length === 0;
  document.getElementById('nxb').disabled = plist.length === 0;
}

// ══════════════════════════════════════════
// 4. 节拍检测（Beat Detection）
// ══════════════════════════════════════════

/**
 * 分析低频能量，检测节拍冲击
 *
 * 算法：
 *   - 取前 14 个频率 bin（低频 ~0–650Hz）的平均能量
 *   - 与指数移动平均（EMA）比较，超过阈值 1.4 倍即为节拍
 *   - 设置 160ms 冷却期防止重复触发
 *
 * @param {Uint8Array} f - 频率数据数组
 * @returns {boolean} 本帧是否检测到节拍
 */
function detectBeat(f) {
  const feat = extractAudioFeatures(f);
  const low = feat.kick * 0.72 + feat.bass * 0.28;
  const fluxBoost = _fluxAvg > 0 ? feat.flux / _fluxAvg : 1;
  const e = low * Math.min(1.28, 0.86 + fluxBoost * 0.12);

  // 指数移动平均（EMA）平滑背景能量
  bEnergy = bEnergy * 0.96 + e * 0.04;

  const now = performance.now();
  const kickNorm = feat.kick / 255;
  const bassNorm = feat.bass / 255;
  const lowHistAvg = _avg(_lowHist, 0, Math.max(0, _lowHist.length - 3)) || low;
  const kickHistAvg = _avg(_kickHist, 0, Math.max(0, _kickHist.length - 3)) || feat.kick;
  const localPeak = _isLocalPeak(_kickHist) || _isLocalPeak(_lowHist);
  const tempoBias = _beatTempoConfidence(now);
  const strongEnough = kickNorm > 0.16 || (kickNorm > 0.11 && bassNorm > 0.16);
  const kickRise = kickHistAvg > 0 ? feat.kick / kickHistAvg : 1;
  const lowRise = lowHistAvg > 0 ? low / lowHistAvg : 1;
  const candidate = strongEnough
    && localPeak
    && e > bEnergy * (1.34 / tempoBias)
    && kickRise > 1.18
    && lowRise > 1.12
    && fluxBoost > 1.05;

  if (candidate && now - lastBeat > 220 && bCool <= 0) {
    if (lastBeat > 0) {
      beatIntervals.push(now - lastBeat);
      if (beatIntervals.length > 8) beatIntervals.shift();
    }
    lastBeat   = now;
    bCool      = 11;
    beatPulse  = 1 + 0.16 + Math.min(0.2, kickNorm * 0.24);
    bassHit = Math.max(0, S.shake - 0.08) * (0.18 + kickNorm * 0.34);
    // 触发屏幕闪光
    const bf = document.getElementById('bf');
    if (bassHit > 0.045) {
      bf.style.opacity = Math.min(0.38, bassHit * 0.55).toFixed(2);
      setTimeout(() => { bf.style.opacity = '0'; }, 55);
    }
    return true;
  }
  bCool--;
  beatPulse = beatPulse * 0.89 + 1 * 0.11; // 衰减回 1.0
  bassHit *= 0.78;
  return false;
}
