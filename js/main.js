/**
 * main.js — 主循环与 UI 交互
 *
 * 职责：
 *   · requestAnimationFrame 渲染主循环（render）
 *   · Canvas resize 处理
 *   · 右侧面板 UI 回调（setThm / setPal / setV / togFx / setIFx）
 *   · 页面初始化
 *
 * 依赖：所有其他模块（state / audio / background / visualizer / playlist）
 */

// ══════════════════════════════════════════
// 图片拖拽定位
// ══════════════════════════════════════════

let _imgDrag = null;

function getStageCenter() {
  const portraitUI = document.body.classList.contains('portrait-ui');
  return {
    x: CV.width / 2,
    y: CV.height * (portraitUI ? 0.43 : 0.5),
  };
}

CV.addEventListener('pointerdown', e => {
  if (!imgOff && !vidActive) return;
  const rect = CV.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const center = getStageCenter();
  const cx = center.x + S.imgX;
  const cy = center.y + S.imgY;
  const half = Math.min(CV.width, CV.height) * S.imgSize * 0.65;
  if (Math.abs(mx - cx) < half && Math.abs(my - cy) < half) {
    _imgDrag = { sx: mx, sy: my, ox: S.imgX, oy: S.imgY };
    CV.style.cursor = 'grabbing';
    CV.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  }
});
document.addEventListener('pointermove', e => {
  if (!_imgDrag) return;
  const rect = CV.getBoundingClientRect();
  S.imgX = _imgDrag.ox + (e.clientX - rect.left  - _imgDrag.sx);
  S.imgY = _imgDrag.oy + (e.clientY - rect.top   - _imgDrag.sy);
});
document.addEventListener('pointerup', () => {
  if (_imgDrag) {
    _imgDrag = null;
    CV.style.cursor = '';
    saveSettings();
  }
});

// ══════════════════════════════════════════
// Canvas 尺寸
// ══════════════════════════════════════════

function resize() {
  const cw  = document.getElementById('cw');
  const portraitUI = window.innerHeight > window.innerWidth && window.innerWidth <= 900;
  document.body.classList.toggle('portrait-ui', portraitUI);
  CV.width  = cw.clientWidth;
  CV.height = cw.clientHeight;
  resizeGL(CV.width, CV.height);
  initStars(); // 背景粒子跟随尺寸重建
  if (portraitUI) document.body.classList.add('portrait-quick-collapsed');
  else {
    closePortraitPanels();
    document.body.classList.remove('portrait-quick-collapsed');
  }
  _syncPortraitLayout();
  _syncPortraitUI();
}
window.addEventListener('resize', resize);

// ══════════════════════════════════════════
// 键盘快捷键（1-7 切换主题）
// ══════════════════════════════════════════

const _thmKeys = ['bars','circle','waveform','particles','tunnel','galaxy','auto'];
document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  const n = parseInt(e.key);
  if (n >= 1 && n <= 7) {
    const theme = _thmKeys[n - 1];
    const btn = document.querySelector(`.tb[data-theme="${theme}"]`);
    if (btn) setThm(theme, btn);
  }
  if (e.key === 'd' || e.key === 'D') _debugMode = !_debugMode;
});

// ══════════════════════════════════════════
// 调试覆盖层（按 D 键开关）
// ══════════════════════════════════════════

let _debugMode = false;
let _beatLog = [];   // 记录最近节拍时间戳，用于计算实测BPM

function _drawDebug(en) {
  if (!_debugMode) return;

  // 节拍时间戳记录
  if (isBeat) {
    _beatLog.push(performance.now());
    if (_beatLog.length > 8) _beatLog.shift();
  }

  // 计算实测BPM（最近几次节拍间隔均值）
  let bpmStr = '--';
  if (_beatLog.length >= 2) {
    const gaps = [];
    for (let i = 1; i < _beatLog.length; i++) gaps.push(_beatLog[i] - _beatLog[i-1]);
    const avgGap = gaps.reduce((a,b) => a+b,0) / gaps.length;
    bpmStr = (60000 / avgGap).toFixed(1);
  }

  // 找出当前帧能量最高的频率bin
  let peakBin = 0, peakVal = 0;
  if (fArr) {
    for (let i = 0; i < fArr.length; i++) {
      if (fArr[i] > peakVal) { peakVal = fArr[i]; peakBin = i; }
    }
  }
  const binHz = aCtx ? (aCtx.sampleRate / anlz.fftSize) : 21.5;
  const peakHz = (peakBin * binHz).toFixed(0);

  // 绘制半透明背景面板
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  ctx.fillRect(10, 10, 260, 160);

  ctx.font = 'bold 11px monospace';
  ctx.textBaseline = 'top';

  const lines = [
    `[DEBUG MODE]  按 D 关闭`,
    `平均能量 en   : ${en.toFixed(1)} / 255  (${(en/255*100).toFixed(1)}%)`,
    `峰值频率      : bin ${peakBin}  ≈ ${peakHz} Hz  (${peakVal})`,
    `节拍 isBeat   : ${isBeat ? '▶ YES' : '  no'}   pulse=${beatPulse.toFixed(3)}`,
    `频段 sb/b/m/h : ${aFeat.subBass.toFixed(0)} / ${aFeat.bass.toFixed(0)} / ${aFeat.mid.toFixed(0)} / ${aFeat.high.toFixed(0)}`,
    `实测 BPM      : ${bpmStr}`,
    `帧计数 tk     : ${tk}`,
    `主题 / 形状   : ${S.theme} / ${S.imgShape}`,
    `灵敏度        : ${S.sensitivity}`,
  ];

  lines.forEach((txt, i) => {
    ctx.fillStyle = i === 0 ? '#ffdd00' : (i === 3 && isBeat ? '#ff4444' : '#00ff99');
    ctx.fillText(txt, 18, 18 + i * 18);
  });

  // 绘制频谱缩略图（底部小条形）
  if (fArr) {
    const bw = 256 / 64;
    for (let i = 0; i < 64; i++) {
      const v = fArr[Math.floor(i * fArr.length / 64)] / 255;
      ctx.fillStyle = `hsl(${i * 4},100%,55%)`;
      ctx.fillRect(10 + i * bw, 170 - v * 40, bw - 0.5, v * 40);
    }
    ctx.strokeStyle = '#ffffff33';
    ctx.strokeRect(10, 130, 256, 40);
  }

  ctx.restore();
}

// ══════════════════════════════════════════
// 主题切换辅助状态
// ══════════════════════════════════════════

let _prevAutoIdx = -1;
let _prevBeat    = false;

function _drawRhythmFrameGlow() {
  const rhythmGlow = Math.max(0, rhythmHit - 0.02);
  const beatGlow = Math.max(0, bassHit * 0.75);
  const glow = Math.max(rhythmGlow * 0.55, beatGlow * 0.45);
  if (glow <= 0.015) return;

  const inset = Math.max(0, Math.min(CV.width, CV.height) * 0.008);
  const depth = Math.max(26, Math.min(CV.width, CV.height) * (0.05 + glow * 0.025));
  const alpha = Math.min(0.16, glow * 0.12);
  const p = gp();

  function edgeGradient(x0, y0, x1, y1, c0, c1, c2) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, c0);
    g.addColorStop(0.35, c1);
    g.addColorStop(1, c2);
    return g;
  }

  ctx.save();
  ctx.globalCompositeOperation = 'screen';

  // 四边：由外向内渐隐的柔和边缘光
  ctx.fillStyle = edgeGradient(
    0, inset, 0, inset + depth,
    `rgba(255,255,255,${alpha})`,
    `rgba(${hr(p.a)},${alpha * 0.55})`,
    'rgba(255,255,255,0)'
  );
  ctx.fillRect(0, 0, CV.width, inset + depth);

  ctx.fillStyle = edgeGradient(
    0, CV.height - inset, 0, CV.height - inset - depth,
    `rgba(255,255,255,${alpha})`,
    `rgba(${hr(p.a)},${alpha * 0.55})`,
    'rgba(255,255,255,0)'
  );
  ctx.fillRect(0, CV.height - inset - depth, CV.width, inset + depth);

  ctx.fillStyle = edgeGradient(
    inset, 0, inset + depth, 0,
    `rgba(255,255,255,${alpha})`,
    `rgba(${hr(p.a)},${alpha * 0.55})`,
    'rgba(255,255,255,0)'
  );
  ctx.fillRect(0, 0, inset + depth, CV.height);

  ctx.fillStyle = edgeGradient(
    CV.width - inset, 0, CV.width - inset - depth, 0,
    `rgba(255,255,255,${alpha})`,
    `rgba(${hr(p.a)},${alpha * 0.55})`,
    'rgba(255,255,255,0)'
  );
  ctx.fillRect(CV.width - inset - depth, 0, inset + depth, CV.height);

  // 四角：加一点圆角辉光，避免边缘是生硬直线
  const cr = depth * 1.25;
  const corners = [
    [0, 0],
    [CV.width, 0],
    [0, CV.height],
    [CV.width, CV.height],
  ];
  corners.forEach(([x, y]) => {
    const rg = ctx.createRadialGradient(x, y, 0, x, y, cr);
    rg.addColorStop(0, `rgba(255,255,255,${alpha * 1.15})`);
    rg.addColorStop(0.45, `rgba(${hr(p.a)},${alpha * 0.42})`);
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(
      x === 0 ? 0 : x - cr,
      y === 0 ? 0 : y - cr,
      cr,
      cr
    );
  });
  ctx.restore();
}

/** 同步 auto 模式下侧边栏子主题高亮 + 进度条 */
function _syncAutoUI() {
  if (_autoIdx !== _prevAutoIdx) {
    _prevAutoIdx = _autoIdx;
    const cur = _autoThemes[_autoIdx];
    document.querySelectorAll('.tb[data-theme]').forEach(b => {
      b.classList.toggle('sub-on', b.dataset.theme === cur);
    });
  }
  if (tk % 2 === 0) {
    const prog = document.getElementById('tb-auto-prog');
    if (prog) prog.style.width = (_autoTk / _AUTO_HOLD * 100).toFixed(1) + '%';
  }
}

/** 清除 auto 子主题高亮 */
function _clearAutoUI() {
  _prevAutoIdx = -1;
  document.querySelectorAll('.tb.sub-on').forEach(b => b.classList.remove('sub-on'));
  const prog = document.getElementById('tb-auto-prog');
  if (prog) prog.style.width = '0%';
}

// ══════════════════════════════════════════
// 主渲染循环
// ══════════════════════════════════════════

function render() {
  requestAnimationFrame(render);
  tk++;

  const p  = gp();
  let   en = 0;

  // ── 读取音频数据 ──
  if (anlz && playing) {
    anlz.getByteTimeDomainData(dArr);   // 波形（时域）
    anlz.getByteFrequencyData(fArr);    // 频谱（频域）
    en     = fArr.reduce((a, b) => a + b, 0) / fArr.length;
    isBeat = detectBeat(fArr);
    dMini(fArr);

    // 更新进度条（用户交互期间跳过，避免覆盖用户点击的位置）
    const elapsed = Math.max(0, aCtx.currentTime - sTime);
    if (!_skActive && curI >= 0 && plist[curI]) {
      const dur = plist[curI].buffer.duration;
      const pct = Math.min((elapsed / dur) * 100, 100);
      const sk  = document.getElementById('sk');
      sk.value  = pct;
      sk.style.setProperty('--sp', pct + '%');
      document.getElementById('ct').textContent = fmt(elapsed);
    }
  } else {
    isBeat     = false;
    beatPulse  = beatPulse * 0.87 + 1 * 0.13;
    dMini(null);
  }

  // ── 背景淡化（拖影效果）──
  ctx.fillStyle   = p.bg;
  ctx.globalAlpha = 1 - S.blur;
  ctx.fillRect(0, 0, CV.width, CV.height);
  ctx.globalAlpha = 1;

  // ── 视频背景：独立的背景视频铺满画布 ──
  if (S.vidBg && bgVidOn && bgVidEl && bgVidEl.readyState >= 2) {
    ctx.save();
    ctx.globalAlpha = 0.85;
    const vw = bgVidEl.videoWidth, vh = bgVidEl.videoHeight;
    const cw = CV.width, ch = CV.height;
    const scale = Math.max(cw / vw, ch / vh);
    const sw = cw / scale, sh = ch / scale;
    const sx = (vw - sw) / 2, sy = (vh - sh) / 2;
    ctx.drawImage(bgVidEl, sx, sy, sw, sh, 0, 0, cw, ch);
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, cw, ch);
    ctx.restore();
  }

  // ── 节奏型律动：按 pattern 循环产生强弱不同的缩放脉冲 ──
  if (S.rhythmPat && playing) {
    const eighthMs = 60000 / S.rhythmBPM / 2;  // 一个八分音符的毫秒数
    const now = performance.now();
    if (!render._lastTick) render._lastTick = now;
    if (!render._patIdx) render._patIdx = 0;
    const step = S.rhythmPat[render._patIdx % S.rhythmPat.length];
    const interval = eighthMs * step.t;
    if (now - render._lastTick >= interval) {
      render._lastTick = now;
      rhythmHit = step.v;  // 按力度打拍
      playRhythmClick(step.v);
      render._patIdx++;
    }
  }
  rhythmHit *= 0.88;  // 放慢衰减，让律动更容易被感知

  // ── 缩放脉冲：律动（小）+ 大鼓点冲击（大）──
  const rhythmBase  = S.rhythmPat ? 0.008 : 0;
  const rhythmScale = rhythmHit * (rhythmBase + S.shake * 0.01); // 律动：持续、有层次的轻弹
  const hitScale    = bassHit * 0.035;                             // 大鼓点：更克制，避免频繁炸屏
  const totalScale  = rhythmScale + hitScale;
  const _beating = totalScale > 0.002;
  if (_beating) {
    const sc = 1 + totalScale;
    const center = getStageCenter();
    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.scale(sc, sc);
    ctx.translate(-center.x, -center.y);
  }

  // ── 背景特效层 ──
  dAurora();
  dStars(en);
  dFog();

  // ── 可视化主题 ──
  const freq = fArr || new Uint8Array(256);
  switch (S.theme) {
    case 'bars':      dBars(freq);        break;
    case 'circle':    dCircle(freq);      break;
    case 'waveform':  dWave();            break;
    case 'particles':
      if (!(S.renderMode === 'webgl' && dPartsGL(en))) dParts(en);
      break;
    case 'tunnel':
      if (!(S.renderMode === 'webgl' && dTunnelGL(freq))) dTunnel(freq);
      break;
    case 'galaxy':
      if (!(S.renderMode === 'webgl' && dGalaxyGL(freq))) dGalaxy(freq);
      break;
    case 'auto':      dAuto(freq, en);    break;
  }

  // ── 图片互动层 ──
  if (vidActive) updateVideoFrame();
  if (uImg || vidActive) dImg(en);

  // ── 天气特效层 ──
  dRain(en);
  dSnow();
  dLightning(isBeat);

  // ── 节拍器边框闪光：强化人工律动与真实节拍的可见反馈 ──
  _drawRhythmFrameGlow();

  // ── 关闭节拍缩放变换 ──
  if (_beating) {
    ctx.restore();
  }

  // ── 节拍闪白光（与缩放同步，bassHit 驱动） ──
  if (bassHit > 0.05) {
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = Math.min(0.1, bassHit * 0.12);
    ctx.fillRect(0, 0, CV.width, CV.height);
    ctx.globalAlpha = 1;
  }

  // ── 空闲动画（无音频时保持画面活跃）──
  if (!playing) {
    const t    = tk * 0.007;
    const idle = new Uint8Array(512);
    for (let i = 0; i < 512; i++)
      idle[i] = Math.floor((Math.sin(t + i * 0.14) * 0.38 + 0.42) * 120 + Math.sin(t * 0.6 + i * 0.28) * 35);
    switch (S.theme) {
      case 'bars':      dBars(idle);        break;
      case 'circle':    dCircle(idle);      break;
      case 'tunnel':
        if (!(canUseWebGLTheme('tunnel') && dTunnelGL(idle))) dTunnel(idle);
        break;
      case 'galaxy':
        if (!(canUseWebGLTheme('galaxy') && dGalaxyGL(idle))) dGalaxy(idle);
        break;
      case 'particles':
        if (!(canUseWebGLTheme('particles') && dPartsGL(60))) dParts(60);
        break;
      case 'auto':      dAuto(idle, 60);    break;
    }
  }

  // ── auto 模式：同步侧边栏高亮 + 进度条 ──
  if (S.theme === 'auto') {
    _syncAutoUI();
  }

  // ── 节拍闪光：当前激活主题按钮 ──
  if (isBeat && !_prevBeat) {
    const activeBtn = document.querySelector('.tb.on');
    if (activeBtn) {
      activeBtn.classList.remove('beat-flash');
      void activeBtn.offsetWidth; // 重置动画
      activeBtn.classList.add('beat-flash');
    }
  }
  _prevBeat = isBeat;
  _drawDebug(en);
}

// ══════════════════════════════════════════
// UI 回调（HTML 中 onclick 调用）
// ══════════════════════════════════════════

/** 频率范围双滑块 */
function setFreqRange() {
  const wrap = document.getElementById('freqRange');
  const lo = wrap.querySelector('.rng2-lo');
  const hi = wrap.querySelector('.rng2-hi');
  let vLo = parseInt(lo.value), vHi = parseInt(hi.value);
  // 保证不交叉，最小间距 500Hz
  if (vLo > vHi - 500) {
    if (document.activeElement === lo) { vLo = vHi - 500; lo.value = vLo; }
    else                               { vHi = vLo + 500; hi.value = vHi; }
  }
  S.themeParams.barsFreqLow  = vLo;
  S.themeParams.barsFreqHigh = vHi;
  document.getElementById('vtpfr').textContent = `${vLo} – ${vHi} Hz`;
  // 更新高亮区间 CSS 变量
  const max = parseInt(lo.max);
  wrap.style.setProperty('--lo', (vLo / max * 100).toFixed(1) + '%');
  wrap.style.setProperty('--hi', (vHi / max * 100).toFixed(1) + '%');
  saveSettings();
}

/** 切换可视化主题 */
function setThm(n, el) {
  S.theme = n;
  document.querySelectorAll('.tb').forEach(b => b.classList.remove('on'));
  document.querySelectorAll(`.tb[data-theme="${n}"]`).forEach(b => b.classList.add('on'));
  if (el) el.classList.add('on');
  initParts();
  if (n !== 'auto') _clearAutoUI();
  // 显示对应主题专属参数块
  ['bars','circle','waveform','particles','tunnel','galaxy','auto'].forEach(t => {
    const blk = document.getElementById('tp-' + t);
    if (blk) blk.style.display = (t === n) ? '' : 'none';
  });
  _syncRenderModeUI();
  saveSettings();
}

/** 切换调色板 */
function setPal(n, el) {
  S.palette = n;
  document.querySelectorAll('.cs').forEach(b => b.classList.remove('on'));
  el.classList.add('on');
  saveSettings();
}

function applyBgTheme() {
  document.body.dataset.bgTheme = S.bgTheme === 'light' ? 'light' : 'dark';
  document.querySelectorAll('.bg-theme-btn').forEach(btn => {
    btn.classList.toggle('on', btn.dataset.bgTheme === S.bgTheme);
  });
}

function setBgTheme(n, el) {
  S.bgTheme = n === 'light' ? 'light' : 'dark';
  applyBgTheme();
  if (el) {
    document.querySelectorAll('.bg-theme-btn').forEach(btn => btn.classList.remove('on'));
    el.classList.add('on');
  }
  saveSettings();
}

/** 设置自定义颜色 */
function setCustCol(v) {
  S.customColor = v;
  S.palette     = 'custom';
  document.querySelectorAll('.cs').forEach(b => b.classList.remove('on'));
  saveSettings();
}

/** 滑块参数调节（通用，支持 "obj.key" 嵌套路径） */
function setV(k, el, vid, dec = 1) {
  const val = parseFloat(el.value);
  if (k.includes('.')) {
    const [obj, key] = k.split('.');
    S[obj][key] = val;
  } else {
    S[k] = val;
  }
  const v = document.getElementById(vid);
  if (v) v.textContent = val.toFixed(dec);
  if (k === 'themeParams.particleCount') initParts();
  if (k === 'fxParams.starsDensity' || k === 'fxParams.rainSpeed' || k === 'fxParams.snowDensity') initStars();
  saveSettings();
}

/** 律动 BPM 输入 */
function setBPM(el) {
  S.rhythmBPM = Math.max(40, Math.min(300, parseInt(el.value) || 120));
  el.value = S.rhythmBPM;
  document.getElementById('bpmVal').textContent = S.rhythmBPM + ' BPM';
  render._lastTick = 0;
  saveSettings();
}

/**
 * 节奏型定义：每个 pattern 是 [{t, v}] 数组
 * t = 这一拍占多少个八分音符时值（1=八分, 2=四分, 3=附点四分, 4=二分）
 * v = 力度（0~1，1=强拍，0.3=弱拍）
 * 一个循环结束后从头重复
 */
const PATTERNS = {
  // 等拍
  q:    [{t:2,v:1},{t:2,v:1},{t:2,v:1},{t:2,v:1}],                         // ♩♩♩♩
  e:    [{t:1,v:1},{t:1,v:1},{t:1,v:1},{t:1,v:1},{t:1,v:1},{t:1,v:1},{t:1,v:1},{t:1,v:1}], // ♪×8
  s:    [{t:.5,v:1},{t:.5,v:1},{t:.5,v:1},{t:.5,v:1},{t:.5,v:1},{t:.5,v:1},{t:.5,v:1},{t:.5,v:1},
         {t:.5,v:1},{t:.5,v:1},{t:.5,v:1},{t:.5,v:1},{t:.5,v:1},{t:.5,v:1},{t:.5,v:1},{t:.5,v:1}], // ♬×16
  // 强弱型
  sw:   [{t:2,v:1},{t:2,v:.35}],                                            // 强弱
  sww:  [{t:2,v:1},{t:2,v:.35},{t:2,v:.35}],                                // 强弱弱（华尔兹）
  swmw: [{t:2,v:1},{t:2,v:.3},{t:2,v:.6},{t:2,v:.3}],                       // 强弱次强弱
  // 长短型
  lss:  [{t:3,v:1},{t:1,v:.5},{t:1,v:.5},{t:3,v:1}],                        // 长短短 长
  ssl:  [{t:1,v:.6},{t:1,v:.6},{t:3,v:1},{t:1,v:.6},{t:1,v:.6},{t:3,v:1}],  // 短短长 短短长
  lssl: [{t:3,v:1},{t:1,v:.45},{t:1,v:.45},{t:3,v:.8}],                     // 长短短长（摇摆）
  trip: [{t:2/3*2,v:1},{t:2/3*2,v:.5},{t:2/3*2,v:.5}],                      // 三连音
};

/** 选择节奏型 */
function setPat(key, el) {
  S.rhythmPatKey = key || null;
  S.rhythmPat = key ? PATTERNS[key] : null;
  document.querySelectorAll('.rhythm-btn').forEach(b => b.classList.remove('on'));
  if (el) el.classList.add('on');
  render._lastTick = 0;
  render._patIdx = 0;
  saveSettings();
}

function togRhythmClick(el) {
  S.rhythmClick = !S.rhythmClick;
  if (el) el.classList.toggle('on', S.rhythmClick);
  if (S.rhythmClick) playRhythmClick(1);
  saveSettings();
}

/** 切换背景特效开关 */
function togFx(n, el) {
  S.fx[n] = !S.fx[n];
  document.querySelectorAll(`.fb[data-fx="${n}"]`).forEach(btn => btn.classList.toggle('on', S.fx[n]));
  if (el && !el.dataset.fx) el.classList.toggle('on', S.fx[n]);
  const blk = document.getElementById('fxp-' + n);
  if (blk) blk.style.display = S.fx[n] ? '' : 'none';
  saveSettings();
}

/** 切换图片形状（圆形 / 矩形 / 无图片） */
function setISh(n, el) {
  S.imgShape = n;
  ['isc', 'isr', 'isn'].forEach(id => {
    const b = document.getElementById(id);
    if (b) b.classList.remove('on');
  });
  if (el) el.classList.add('on');
  saveSettings();
}

/** 切换图片特效模式 */
function setIFx(n, el) {
  S.imgFx = n;
  ['igb', 'ihb', 'ilb'].forEach(id => {
    const b = document.getElementById(id);
    if (b) b.classList.remove('on');
  });
  if (el) el.classList.add('on');
  saveSettings();
}

function setRenderMode(mode, el) {
  const webglReady = canUseWebGLTheme(S.theme);
  const themeSupportsGL = ['particles', 'galaxy', 'tunnel'].includes(S.theme);
  S.renderMode = themeSupportsGL && mode === 'webgl' && webglReady ? 'webgl' : 'canvas';
  _syncRenderModeUI();
  saveSettings();
}

function _syncRenderModeUI() {
  const wrap = document.getElementById('renderModeWrap');
  if (!wrap) return;

  const themeSupportsGL = ['particles', 'galaxy', 'tunnel'].includes(S.theme);
  const webglReady = themeSupportsGL && canUseWebGLTheme(S.theme);
  const host = themeSupportsGL ? document.getElementById('tp-' + S.theme) : null;
  if (themeSupportsGL && host && wrap.parentElement !== host) host.appendChild(wrap);
  wrap.style.display = themeSupportsGL ? '' : 'none';

  if (!themeSupportsGL) {
    S.renderMode = 'canvas';
    return;
  }

  if (S.renderMode === 'webgl' && !webglReady) S.renderMode = 'canvas';
  document.getElementById('renderModeLabel').textContent = S.renderMode === 'webgl' ? 'WebGL' : 'Canvas';

  ['rbc', 'rbw'].forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.classList.toggle('on', (id === 'rbc' && S.renderMode === 'canvas') || (id === 'rbw' && S.renderMode === 'webgl'));
  });

  const webglBtn = document.getElementById('rbw');
  if (webglBtn) {
    webglBtn.disabled = !webglReady;
    webglBtn.title = webglReady ? 'WebGL 加速当前主题' : '当前浏览器不支持 WebGL';
  }
}

function _syncUIFromState() {
  applyBgTheme();
  document.querySelectorAll('.tb').forEach(b => b.classList.toggle('on', b.dataset.theme === S.theme));
  document.querySelectorAll('.cs').forEach(b => b.classList.remove('on'));
  if (S.palette !== 'custom') {
    const palBtn = document.querySelector(`.cs[onclick*="setPal('${S.palette}'"]`);
    if (palBtn) palBtn.classList.add('on');
  }

  const map = [
    ['sensitivity', S.sensitivity, 'vs1', 1],
    ['blur', S.blur, 'vs4', 2],
    ['shake', S.shake, 'vs5', 1],
    ['imgBeat', S.imgBeat, 'vs6', 2],
    ['imgSize', S.imgSize, 'vs7', 2],
    ['themeParams.barsCount', S.themeParams.barsCount, 'vtp1', 0],
    ['themeParams.circleN', S.themeParams.circleN, 'vtp2', 0],
    ['themeParams.waveSmooth', S.themeParams.waveSmooth, 'vtp3', 2],
    ['themeParams.particleCount', S.themeParams.particleCount, 'vtp4', 0],
    ['speed', S.speed, 'vtp4s', 1],
    ['themeParams.tunnelRings', S.themeParams.tunnelRings, 'vtp5', 0],
    ['speed', S.speed, 'vtp5s', 1],
    ['themeParams.galaxyArms', S.themeParams.galaxyArms, 'vtp6', 0],
    ['speed', S.speed, 'vtp6s', 1],
    ['speed', S.speed, 'vtpa', 1],
    ['fxParams.starsDensity', S.fxParams.starsDensity, 'vfx1', 0],
    ['fxParams.rainSpeed', S.fxParams.rainSpeed, 'vfx2', 1],
    ['fxParams.snowDensity', S.fxParams.snowDensity, 'vfx3', 0],
    ['fxParams.fogDensity', S.fxParams.fogDensity, 'vfx4', 1],
    ['fxParams.lightningFreq', S.fxParams.lightningFreq, 'vfx5', 1],
    ['fxParams.auroraIntensity', S.fxParams.auroraIntensity, 'vfx6', 1],
  ];

  document.querySelectorAll('.sl').forEach(sl => {
    const oninput = sl.getAttribute('oninput') || '';
    const m = oninput.match(/setV\('([^']+)'/);
    if (!m) return;
    const path = m[1];
    const found = map.find(x => x[0] === path);
    if (!found) return;
    sl.value = found[1];
    const label = document.getElementById(found[2]);
    if (label) label.textContent = Number(found[1]).toFixed(found[3]);
  });

  const bpmInput = document.getElementById('bpmInput');
  if (bpmInput) bpmInput.value = S.rhythmBPM;
  document.getElementById('bpmVal').textContent = `${S.rhythmBPM} BPM`;
  const rhythmClickBtn = document.getElementById('rhythmClickBtn');
  if (rhythmClickBtn) rhythmClickBtn.classList.toggle('on', !!S.rhythmClick);

  const freqWrap = document.getElementById('freqRange');
  if (freqWrap) {
    freqWrap.querySelector('.rng2-lo').value = S.themeParams.barsFreqLow;
    freqWrap.querySelector('.rng2-hi').value = S.themeParams.barsFreqHigh;
    setFreqRange();
  }

  document.querySelectorAll('.fb').forEach(btn => {
    const name = btn.dataset.fx || ((btn.getAttribute('onclick') || '').match(/togFx\('([^']+)'/) || [])[1];
    if (!name) return;
    btn.classList.toggle('on', !!S.fx[name]);
  });
  ['stars','rain','snow','fog','lightning','aurora'].forEach(name => {
    const blk = document.getElementById('fxp-' + name);
    if (blk) blk.style.display = S.fx[name] ? '' : 'none';
  });

  setISh(S.imgShape, document.getElementById(S.imgShape === 'circle' ? 'isc' : S.imgShape === 'rect' ? 'isr' : 'isn'));
  setIFx(S.imgFx, document.getElementById(S.imgFx === 'gray' ? 'igb' : S.imgFx === 'halftone' ? 'ihb' : 'ilb'));
  setPat(S.rhythmPatKey, document.querySelector(`.rhythm-btn[onclick*="setPat('${S.rhythmPatKey}'"]`) || document.querySelector('.rhythm-btn[onclick*="setPat(null"]'));
  _syncLoopBtn();
  _syncRenderModeUI();
}

function _isPortraitUI() {
  return document.body.classList.contains('portrait-ui');
}

function _syncPortraitUI() {
  const btn = document.getElementById('portraitHdrSettingsBtn');
  if (!btn) return;
  const open = document.body.classList.contains('portrait-settings-open');
  btn.textContent = open ? '收起' : '参数';
  btn.classList.toggle('on', open);
}

function _syncPortraitLayout() {
  const bar = document.getElementById('bar');
  if (!bar) return;
  const h = Math.ceil(bar.getBoundingClientRect().height || 0);
  document.documentElement.style.setProperty('--bar-h', `${h}px`);
}

function closePortraitPanels() {
  document.body.classList.remove('portrait-playlist-open', 'portrait-settings-open');
  _syncPortraitLayout();
  _syncPortraitUI();
}

function togglePortraitPanel(name) {
  if (!_isPortraitUI()) return;
  const cls = name === 'playlist' ? 'portrait-playlist-open' : 'portrait-settings-open';
  const other = name === 'playlist' ? 'portrait-settings-open' : 'portrait-playlist-open';
  const willOpen = !document.body.classList.contains(cls);
  document.body.classList.remove(other);
  document.body.classList.toggle(cls, willOpen);
  _syncPortraitLayout();
  _syncPortraitUI();
}

function togglePortraitQuickBar() {
  if (!_isPortraitUI()) return;
  document.body.classList.toggle('portrait-quick-collapsed');
  _syncPortraitLayout();
}

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!document.body.classList.contains('portrait-playlist-open') && !document.body.classList.contains('portrait-settings-open')) return;
  closePortraitPanels();
});

window.closePortraitPanels = closePortraitPanels;
window.togglePortraitPanel = togglePortraitPanel;
window.togglePortraitQuickBar = togglePortraitQuickBar;

// ══════════════════════════════════════════
// 页面初始化
// ══════════════════════════════════════════

renderPL();   // 渲染空播放列表
updUI();      // 禁用播放按钮
_syncLoopBtn(); // 同步循环模式按钮图标
resize();     // 设置 Canvas 尺寸
initParts();  // 初始化粒子池
loadDefaultImages(); // 加载默认示例图片
_syncUIFromState(); // 恢复持久化设置
// 初始化主题专属参数块（默认显示 bars）
setThm(S.theme, document.querySelector(`.tb[data-theme="${S.theme}"]`) || document.querySelector('.tb'));
setFreqRange(); // 初始化双滑块高亮
render();     // 启动渲染循环
