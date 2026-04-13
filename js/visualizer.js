/**
 * visualizer.js — 可视化渲染模块
 *
 * 职责：实现六种音频可视化主题 + 迷你频谱 + 图片互动
 *
 *   dBars    — 条形频谱
 *   dCircle  — 圆形频谱
 *   dWave    — 声波形态
 *   dParts   — 粒子星云（高性能，无 shadowBlur 循环）
 *   dTunnel  — 音频隧道
 *   dGalaxy  — 星系旋转
 *   dMini    — 右侧面板实时迷你频谱
 *   dImg     — 用户图片互动层
 *
 * 依赖：state.js（CV / ctx / MS / mctx / tk / S / gp / hr / lc /
 *               dArr / fArr / isBeat / beatPulse / parts / uImg / imgOff）
 */

// ══════════════════════════════════════════
// 粒子初始化
// ══════════════════════════════════════════

function initParts() {
  parts = Array.from({ length: S.themeParams.particleCount }, mkP);
}

function mkP() {
  const a = Math.random() * Math.PI * 2;
  return {
    x: CV.width  * 0.5 + (Math.random() - 0.5) * CV.width,
    y: CV.height * 0.5 + (Math.random() - 0.5) * CV.height,
    vx: Math.cos(a) * (0.08 + Math.random() * 0.7),
    vy: Math.sin(a) * (0.08 + Math.random() * 0.7),
    r:       0.8 + Math.random() * 4,
    life:    0,
    maxLife: 1.5 + Math.random() * 4,
    hue:     Math.random(),
    bright:  0.5 + Math.random() * 0.5,
    trail:   [],
    angle:   Math.random() * Math.PI * 2,
    orbitR:  60 + Math.random() * Math.min(CV.width, CV.height) * 0.38,
  };
}

// ══════════════════════════════════════════
// 1. 条形频谱
// ══════════════════════════════════════════

function dBars(freq) {
  const p = gp(), N = S.themeParams.barsCount || 128, bw = CV.width / N, mH = CV.height * 0.74;
  // 频率范围映射：Hz → freq 数组下标（每 bin ≈ sampleRate/fftSize Hz）
  const binHz   = (aCtx ? aCtx.sampleRate : 44100) / (freq.length * 2);
  const binLow  = Math.max(0,              Math.floor((S.themeParams.barsFreqLow  || 0)     / binHz));
  const binHigh = Math.min(freq.length - 1, Math.floor((S.themeParams.barsFreqHigh || 16000) / binHz));
  const binSpan = Math.max(1, binHigh - binLow);

  for (let i = 0; i < N; i++) {
    const v   = freq[binLow + Math.floor(i * binSpan / N)] / 255;
    const h   = v * mH * S.sensitivity;
    const x   = i * bw;
    const y   = CV.height - h;
    const col = lc(p.a, p.b, i / N);
    ctx.shadowBlur  = 10 + v * 20;
    ctx.shadowColor = col;
    const g = ctx.createLinearGradient(x, y, x, CV.height);
    g.addColorStop(0, col);
    g.addColorStop(1, p.b + '22');
    ctx.fillStyle = g;
    ctx.fillRect(x + 0.5, y, bw - 1.5, h);
    ctx.fillStyle = 'rgba(255,255,255,.8)';
    ctx.fillRect(x + 0.5, y, bw - 1.5, 2);
    ctx.shadowBlur = 0;
  }
  // 倒影
  ctx.save();
  ctx.scale(1, -1);
  ctx.translate(0, -CV.height * 2);
  ctx.globalAlpha = 0.09;
  for (let i = 0; i < N; i++) {
    const v = freq[binLow + Math.floor(i * binSpan / N)] / 255;
    const h = v * mH * S.sensitivity;
    const x = i * bw;
    ctx.fillStyle = lc(p.a, p.b, i / N);
    ctx.fillRect(x + 0.5, CV.height - h, bw - 1.5, h);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ══════════════════════════════════════════
// 2. 圆形频谱
// ══════════════════════════════════════════

function dCircle(freq) {
  const p     = gp();
  const cx    = CV.width / 2, cy = CV.height / 2;
  const N     = S.themeParams.circleN || 256;
  const bassN = (aFeat.bass || 0) / 255;
  const baseR = Math.min(CV.width, CV.height) * (0.18 + bassN * 0.035);
  const maxR  = Math.min(CV.width, CV.height) * 0.3 * S.sensitivity;

  // 中心辉光
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseR * 1.3);
  g.addColorStop(0, p.a + '55');
  g.addColorStop(1, 'transparent');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CV.width, CV.height);

  // 频谱辐射条
  for (let i = 0; i < N; i++) {
    const angle = (i / N) * Math.PI * 2 - Math.PI / 2;
    const v     = freq[Math.floor(i * freq.length / N)] / 255;
    const r     = baseR + v * maxR;
    const col   = lc(p.a, p.b, i / N);
    ctx.strokeStyle = col;
    ctx.lineWidth   = 2;
    ctx.shadowBlur  = 8 + v * 16;
    ctx.shadowColor = col;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * baseR, cy + Math.sin(angle) * baseR);
    ctx.lineTo(cx + Math.cos(angle) * r,     cy + Math.sin(angle) * r);
    ctx.stroke();
  }

  // 内圆环
  ctx.beginPath();
  ctx.arc(cx, cy, baseR, 0, Math.PI * 2);
  ctx.strokeStyle = p.a + '99';
  ctx.lineWidth   = 2;
  ctx.shadowBlur  = 24;
  ctx.shadowColor = p.a;
  ctx.stroke();
  ctx.shadowBlur  = 0;

  // 内圆波形
  if (dArr) {
    ctx.beginPath();
    for (let i = 0; i <= dArr.length; i++) {
      const angle = (i / dArr.length) * Math.PI * 2 - Math.PI / 2;
      const v     = (dArr[i % dArr.length] - 128) / 128;
      const r     = baseR * 0.55 + v * baseR * 0.3 * S.sensitivity;
      i === 0
        ? ctx.moveTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r)
        : ctx.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
    }
    ctx.closePath();
    ctx.strokeStyle = p.c + 'bb';
    ctx.lineWidth   = 1.5;
    ctx.stroke();
  }
  // 节拍闪光
  if (beatPulse > 1.01) {
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = Math.min(0.85, (beatPulse - 1) * 0.55);
    ctx.fillRect(0, 0, CV.width, CV.height);
    ctx.globalAlpha = 1;
  }
}

// ══════════════════════════════════════════
// 3. 声波形态
// ══════════════════════════════════════════

// 声波平滑缓冲（跨帧 lerp，消除抖动）
let _wSmooth = null;

function dWave() {
  if (!dArr) return;
  const p  = gp();
  const N  = dArr.length;
  const cy = CV.height / 2;

  // 初始化 / 重置平滑缓冲
  if (!_wSmooth || _wSmooth.length !== N) {
    _wSmooth = new Float32Array(N);
    for (let i = 0; i < N; i++) _wSmooth[i] = 128;
  }

  // 时域平滑：lerp 系数由 waveSmooth 控制
  const ws = S.themeParams.waveSmooth || 0.12;
  for (let i = 0; i < N; i++) {
    _wSmooth[i] += (dArr[i] - _wSmooth[i]) * ws;
  }

  // 振幅上限：屏幕高度的 42%，sensitivity 线性缩放
  const maxAmp = CV.height * 0.42 * Math.min(S.sensitivity / 1.5, 2);

  // 降采样：每 STEP 个样本取均值，拉长波长（波峰间距 ×8）
  const STEP = 8;
  const M  = Math.floor(N / STEP);
  const sw = CV.width / (M - 1);

  // 预计算路径点（降采样后）
  const pts = new Array(M);
  for (let i = 0; i < M; i++) {
    let sum = 0;
    for (let j = 0; j < STEP; j++) sum += _wSmooth[i * STEP + j];
    const v = (sum / STEP - 128) / 128;
    pts[i] = { x: i * sw, y: cy + v * maxAmp };
  }

  const g = ctx.createLinearGradient(0, 0, CV.width, 0);
  g.addColorStop(0,   p.a);
  g.addColorStop(0.5, p.c);
  g.addColorStop(1,   p.b);

  // ── 波形下方柔和填充 ──
  ctx.save();
  const fillG = ctx.createLinearGradient(0, cy - maxAmp, 0, cy + maxAmp);
  fillG.addColorStop(0,   `rgba(${hr(p.a)},0.07)`);
  fillG.addColorStop(0.5, `rgba(${hr(p.c)},0.03)`);
  fillG.addColorStop(1,   `rgba(${hr(p.b)},0.07)`);
  ctx.fillStyle = fillG;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < M - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2;
    const my = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
  }
  ctx.lineTo(pts[M - 1].x, pts[M - 1].y);
  ctx.lineTo(CV.width, cy);
  ctx.lineTo(0, cy);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // ── 主波形（贝塞尔平滑曲线）──
  ctx.strokeStyle = g;
  ctx.lineWidth   = 2;
  ctx.shadowBlur  = 10;
  ctx.shadowColor = p.a;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < M - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2;
    const my = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
  }
  ctx.lineTo(pts[M - 1].x, pts[M - 1].y);
  ctx.stroke();

  // ── 镜像波形（更淡，增加层次感）──
  ctx.globalAlpha = 0.13;
  ctx.lineWidth   = 1.5;
  ctx.shadowBlur  = 5;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, cy - (pts[0].y - cy));
  for (let i = 1; i < M - 1; i++) {
    const mirY  = cy - (pts[i].y - cy);
    const mirY2 = cy - (pts[i + 1].y - cy);
    const mx = (pts[i].x + pts[i + 1].x) / 2;
    const my = (mirY + mirY2) / 2;
    ctx.quadraticCurveTo(pts[i].x, mirY, mx, my);
  }
  ctx.lineTo(pts[M - 1].x, cy - (pts[M - 1].y - cy));
  ctx.stroke();

  ctx.globalAlpha = 1;
  ctx.shadowBlur  = 0;

  // ── 中心线 ──
  ctx.strokeStyle = p.a + '22';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(0, cy);
  ctx.lineTo(CV.width, cy);
  ctx.stroke();
  // 节拍闪光
  if (beatPulse > 1.01) {
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = Math.min(0.85, (beatPulse - 1) * 0.55);
    ctx.fillRect(0, 0, CV.width, CV.height);
    ctx.globalAlpha = 1;
  }
}

// ══════════════════════════════════════════
// 4. 粒子星云（高性能版）
//
// 优化策略：
//   · 零 shadowBlur 循环：改用 'lighter' 加法混合模拟辉光
//   · 每粒子一条折线路径（非逐段 stroke）
//   · Offscreen canvas glow stamp：径向渐变只算一次，之后 drawImage 复用
//   · 频率数据每 3 帧刷新一次（per-particle 缓存）
//   · Trail 长度限制为 8
// ══════════════════════════════════════════

let glowStamp = null, glowStampColor = '', glowStampR = 0;

/** 生成或复用一个辉光离屏 canvas（代替 per-particle radialGradient） */
function getGlowStamp(col, r) {
  const need = Math.round(r);
  if (glowStamp && glowStampColor === col && glowStampR === need) return glowStamp;
  const size = need * 2 + 2;
  const oc   = document.createElement('canvas');
  oc.width = oc.height = size;
  const ox  = oc.getContext('2d');
  const grd = ox.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, need);
  const rgb = hr(col);
  grd.addColorStop(0,    `rgba(${rgb},0.9)`);
  grd.addColorStop(0.35, `rgba(${rgb},0.45)`);
  grd.addColorStop(1,    `rgba(${rgb},0)`);
  ox.fillStyle = grd;
  ox.fillRect(0, 0, size, size);
  glowStamp = oc; glowStampColor = col; glowStampR = need;
  return oc;
}

function dParts(en) {
  const p    = gp();
  const cx   = CV.width / 2, cy = CV.height / 2;
  const norm = en / 255;
  const hi   = (aFeat.high || 0) / 255;
  const bass = (aFeat.bass || 0) / 255;

  while (parts.length < S.themeParams.particleCount) parts.push(mkP());
  while (parts.length > S.themeParams.particleCount) parts.pop();

  // 单层星云渐变（背景氛围）
  const nR = Math.min(CV.width, CV.height) * 0.72 * (1 + norm * S.sensitivity * 0.28 + hi * 0.12) * beatPulse;
  const ng = ctx.createRadialGradient(cx, cy, nR * 0.04, cx, cy, nR);
  ng.addColorStop(0,    `rgba(${hr(p.a)},${0.07 + norm * 0.11})`);
  ng.addColorStop(0.55, `rgba(${hr(p.b)},${0.03 + norm * 0.05})`);
  ng.addColorStop(1,    'transparent');
  ctx.fillStyle = ng;
  ctx.fillRect(0, 0, CV.width, CV.height);

  // ── 物理更新（不绘制）──
  const TRAIL = 5;
  parts.forEach(pt => {
    if (!pt.trail) pt.trail = [];
    pt.life += 0.0032 * S.speed;
    if (pt.life > pt.maxLife) { Object.assign(pt, mkP()); pt.trail = []; return; }

    // 频率缓存（每 3 帧更新一次）
    if (pt._fvTk === undefined || tk - pt._fvTk >= 3) {
      const fi = Math.min(Math.floor(pt.hue * 200), (fArr || []).length - 1);
      pt._fv   = fArr ? fArr[fi] / 255 : 0.1;
      pt._fvTk = tk;
    }
    const fv = pt._fv;

    pt.angle += (0.0033 + fv * 0.014 + hi * 0.0045) * S.speed * (isBeat ? beatPulse * 0.5 + 0.55 : 0.78);
    const dynR = pt.orbitR * (1 + fv * S.sensitivity * 0.45 + bass * 0.18) * (isBeat ? beatPulse * 0.2 + 0.8 : 1);
    const wob  = Math.sin(pt.angle * 3 + tk * 0.018) * 10 * fv;
    pt.x = cx + Math.cos(pt.angle) * (dynR + wob);
    pt.y = cy + Math.sin(pt.angle) * (dynR + wob) * 0.68;

    pt.trail.push({ x: pt.x, y: pt.y });
    if (pt.trail.length > TRAIL) pt.trail.shift();

    pt._alpha = Math.sin((pt.life / pt.maxLife) * Math.PI) * pt.bright;
    pt._r     = pt.r * (1 + fv * S.sensitivity * 0.5) * (isBeat ? beatPulse * 0.3 + 0.7 : 1);
    pt._col   = lc(p.a, p.b, pt.hue);
  });

  // ── 绘制（加法混合，无 shadowBlur）──
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // Pass 1：拖尾折线（每粒子一次 stroke）
  parts.forEach(pt => {
    const tl = pt.trail;
    if (!tl || tl.length < 2 || !pt._alpha) return;
    ctx.strokeStyle = pt._col;
    ctx.lineWidth   = Math.max(0.45, pt._r * 0.62);
    ctx.globalAlpha = pt._alpha * 0.28;
    ctx.beginPath();
    ctx.moveTo(tl[0].x, tl[0].y);
    for (let i = 1; i < tl.length; i++) ctx.lineTo(tl[i].x, tl[i].y);
    ctx.stroke();
  });

  // Pass 2：辉光 stamp（drawImage 远快于 createRadialGradient）
  const stampR = Math.max(7, parts[0] ? parts[0]._r * 3.8 : 10);
  const stamp  = getGlowStamp(p.a, stampR);
  const half   = stamp.width / 2;
  parts.forEach(pt => {
    if (!pt._alpha) return;
    ctx.globalAlpha = pt._alpha * 0.14;
    ctx.drawImage(stamp, pt.x - half, pt.y - half);
  });

  // Pass 3：实体核心（按色相分桶，减少 fillStyle 切换）
  const BUCKETS = 6;
  const buckets = Array.from({ length: BUCKETS }, () => []);
  parts.forEach(pt => { if (pt._alpha) buckets[Math.floor(pt.hue * BUCKETS) % BUCKETS].push(pt); });

  buckets.forEach((bk, bi) => {
    if (!bk.length) return;
    const col = lc(p.a, p.b, bi / BUCKETS);
    ctx.fillStyle = col;
    bk.forEach(pt => { ctx.globalAlpha = pt._alpha * 0.22; ctx.beginPath(); ctx.arc(pt.x, pt.y, pt._r * 1.85, 0, Math.PI * 2); ctx.fill(); });
    bk.forEach(pt => { ctx.globalAlpha = pt._alpha * 0.74; ctx.beginPath(); ctx.arc(pt.x, pt.y, pt._r,        0, Math.PI * 2); ctx.fill(); });
  });

  // 白色高亮中心（全部粒子一次 pass）
  ctx.fillStyle = '#fff';
  parts.forEach(pt => {
    if (!pt._alpha) return;
    ctx.globalAlpha = pt._alpha * 0.78;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt._r * 0.25, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();

  // 节拍冲击波环（循环外唯一一次 shadowBlur）
  if (isBeat) {
    const rR = Math.min(CV.width, CV.height) * 0.11 * beatPulse;
    ctx.shadowBlur  = 45;
    ctx.shadowColor = p.a;
    ctx.strokeStyle = p.a;
    ctx.lineWidth   = Math.max(1, 12 * (beatPulse - 1));
    ctx.globalAlpha = Math.min(0.85, (beatPulse - 1) * 1.6);
    ctx.beginPath();
    ctx.arc(cx, cy, rR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.shadowBlur  = 0;
  }
}

// ══════════════════════════════════════════
// 5. 音频隧道
// ══════════════════════════════════════════

function dTunnel(freq) {
  const p = gp(), cx = CV.width / 2, cy = CV.height / 2;

  // 同心圆环
  const rings = S.themeParams.tunnelRings || 26;
  for (let i = rings; i >= 1; i--) {
    const fi  = Math.floor((i / rings) * (freq.length * 0.5));
    const v   = freq[fi] / 255;
    const r   = (i / rings) * Math.min(CV.width, CV.height) * 0.55 + v * 55 * S.sensitivity;
    const col = lc(p.a, p.b, i / rings);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = col;
    ctx.globalAlpha = (1 - i / rings) * 0.75 + 0.05;
    ctx.lineWidth   = 1.5 + v * 4;
    ctx.shadowBlur  = v * 26;
    ctx.shadowColor = col;
    ctx.stroke();
    ctx.shadowBlur  = 0;
  }
  ctx.globalAlpha = 1;

  // 辐射线
  for (let i = 0; i < 32; i++) {
    const angle = (i / 32) * Math.PI * 2 + tk * 0.003 * S.speed;
    const fi    = Math.floor((i / 32) * freq.length * 0.4);
    const v     = freq[fi] / 255;
    ctx.strokeStyle = p.c + '55';
    ctx.lineWidth   = 1;
    ctx.globalAlpha = v * 0.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * CV.width, cy + Math.sin(angle) * CV.width);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// ══════════════════════════════════════════
// 6. 星系旋转
// ══════════════════════════════════════════

function dGalaxy(freq) {
  const p    = gp();
  const cx   = CV.width / 2, cy = CV.height / 2;
  const time = tk * 0.0014 * S.speed;
  const norm = freq.reduce((a, b) => a + b, 0) / freq.length / 255;
  const midN = (aFeat.mid || 0) / 255;
  const hiN  = (aFeat.high || 0) / 255;
  const arms = S.themeParams.galaxyArms || 5, pts = 200;

  // 多层星云
  [90, 160, 240, 330].forEach((base, ni) => {
    const nR  = base * (1 + norm * S.sensitivity * 0.5) * (isBeat ? beatPulse * 0.3 + 0.7 : 1);
    const ng  = ctx.createRadialGradient(cx, cy, nR * 0.1, cx, cy, nR);
    const nc  = [p.a, p.b, p.c, p.a][ni];
    ng.addColorStop(0,   `rgba(${hr(nc)},${0.05 + norm * 0.1})`);
    ng.addColorStop(0.5, `rgba(${hr(nc)},${0.02 + norm * 0.04})`);
    ng.addColorStop(1,   'transparent');
    ctx.fillStyle = ng;
    ctx.beginPath();
    ctx.arc(cx, cy, nR, 0, Math.PI * 2);
    ctx.fill();
  });

  // 旋臂
  for (let arm = 0; arm < arms; arm++) {
    const armA = (arm / arms) * Math.PI * 2;
    for (let j = 0; j < pts; j++) {
      const t     = j / pts;
      const fi    = Math.floor(t * freq.length * 0.72);
      const fv    = freq[fi] / 255;
      const baseR = t * Math.min(CV.width, CV.height) * 0.46;
      const audioR = baseR * (1 + fv * S.sensitivity * 0.5);
      const beatR  = isBeat ? audioR * (beatPulse - 1) * 0.4 * t : 0;
      const spin  = t * Math.PI * 2.6 + armA + time;
      const x     = cx + Math.cos(spin) * (audioR + beatR);
      const y     = cy + Math.sin(spin) * (audioR + beatR) * 0.72;
      const sz    = (1 - t * 0.65) * 3.5 + fv * 7 * S.sensitivity + hiN * 2.2 + (isBeat ? beatPulse * 2.5 : 0);
      const col   = lc(p.a, p.b, (arm / arms + t * 0.4) % 1);
      const alpha = (1 - t * 0.8) * (0.12 + fv * 0.88 + midN * 0.18) * (isBeat ? Math.min(beatPulse, 2.5) * 0.65 : 1);

      ctx.beginPath();
      ctx.arc(x, y, sz, 0, Math.PI * 2);
      ctx.fillStyle   = col;
      ctx.globalAlpha = alpha;
      ctx.shadowBlur  = sz * 7 + (isBeat ? 25 : 0);
      ctx.shadowColor = col;
      ctx.fill();

      if (fv > 0.62 || (isBeat && Math.random() < 0.06)) {
        ctx.beginPath();
        ctx.arc(x, y, sz * 0.28, 0, Math.PI * 2);
        ctx.fillStyle   = '#fff';
        ctx.globalAlpha = alpha * 2;
        ctx.shadowBlur  = sz * 2;
        ctx.shadowColor = '#fff';
        ctx.fill();
      }
      ctx.shadowBlur = 0;
    }
  }
  ctx.globalAlpha = 1;

  // 炽热核心
  const cR = 55 * (1 + norm * S.sensitivity * 0.7) * (isBeat ? beatPulse * 0.45 + 0.55 : 1);
  const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, cR);
  cg.addColorStop(0,   '#ffffff');
  cg.addColorStop(0.12, p.a + 'ff');
  cg.addColorStop(0.4,  p.b + 'aa');
  cg.addColorStop(0.8,  p.c + '33');
  cg.addColorStop(1,   'transparent');
  ctx.fillStyle   = cg;
  ctx.shadowBlur  = 55;
  ctx.shadowColor = p.a;
  ctx.beginPath();
  ctx.arc(cx, cy, cR, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // 节拍光束 + 扩散环
  if (isBeat) {
    const fL = cR * 6 * beatPulse;
    [0, Math.PI / 2, Math.PI / 4, Math.PI * 3 / 4].forEach(a => {
      [[1, 1], [-1, -1]].forEach(([sx, sy]) => {
        const fg = ctx.createLinearGradient(cx, cy, cx + Math.cos(a) * sx * fL, cy + Math.sin(a) * sy * fL);
        fg.addColorStop(0,   p.a + 'dd');
        fg.addColorStop(0.3, p.b + '88');
        fg.addColorStop(1,   'transparent');
        ctx.strokeStyle = fg;
        ctx.lineWidth   = 2.5;
        ctx.globalAlpha = (beatPulse - 1) * 0.65;
        ctx.shadowBlur  = 22;
        ctx.shadowColor = p.a;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * sx * fL, cy + Math.sin(a) * sy * fL);
        ctx.stroke();
      });
    });
    ctx.shadowBlur = 0; ctx.lineWidth = 1; ctx.globalAlpha = 1;
    const ring = cR * beatPulse * 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy, ring, 0, Math.PI * 2);
    ctx.strokeStyle = p.a;
    ctx.lineWidth   = Math.max(0, 3 * (beatPulse - 1));
    ctx.globalAlpha = Math.min(0.9, (beatPulse - 1) * 0.8);
    ctx.shadowBlur  = 30;
    ctx.shadowColor = p.a;
    ctx.stroke();
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  }
}

// ══════════════════════════════════════════
// 7. 迷你频谱（右侧面板）
// ══════════════════════════════════════════

function dMini(freq) {
  const W = MS.width, H = MS.height, p = gp();
  const bars = 64, bw = W / bars;
  mctx.fillStyle = 'rgba(0,0,0,.55)';
  mctx.fillRect(0, 0, W, H);
  for (let i = 0; i < bars; i++) {
    const v   = freq ? freq[Math.floor(i * freq.length / bars)] / 255 : 0;
    const h   = v * H * S.sensitivity;
    const col = lc(p.a, p.b, i / bars);
    mctx.fillStyle = col;
    mctx.fillRect(i * bw + 0.5, H - h, bw - 1, h);
  }
}

// ══════════════════════════════════════════
// 8. 图片互动层
// ══════════════════════════════════════════

/**
 * 入口：根据 S.imgFx 分发到三种特效
 * 支持：glow（分层光效）/ gray（灰度化）/ halftone（半色调化）
 * 所有模式均响应音乐节拍产生律动
 */
function dImg(en) {
  if (!imgOff || S.imgShape === 'none') return;
  const p    = gp();
  const cx   = CV.width  / 2 + S.imgX;
  const cy   = CV.height / 2 + S.imgY;
  const norm = en / 255;

  const beatS = isBeat ? 1 + (beatPulse - 1) * S.imgBeat * 0.18 : 1;
  const base  = Math.min(CV.width, CV.height) * S.imgSize * beatS;
  const W = base, H = base;

  ctx.save();
  ctx.translate(cx, cy);

  // 圆形模式：旋转 + 圆形裁剪
  if (S.imgShape === 'circle') {
    const rot = playing ? tk * 0.004 * S.speed : 0;
    ctx.rotate(rot);
    ctx.beginPath();
    ctx.arc(0, 0, W / 2, 0, Math.PI * 2);
    ctx.clip();
  } else {
    // 矩形模式：圆角裁剪
    const r = W * 0.06;
    ctx.beginPath();
    ctx.roundRect(-W / 2, -H / 2, W, H, r);
    ctx.clip();
  }

  switch (S.imgFx) {
    case 'glow':     _dImgGlow(W, H, norm, p);     break;
    case 'gray':     _dImgGray(W, H, norm, p);     break;
    case 'halftone': _dImgHalftone(W, H, norm, p); break;
  }

  ctx.globalAlpha             = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();

  // 圆形模式：裁剪外的外圈光晕（不受 clip 影响，单独画）
  if (S.imgShape === 'circle') {
    const rg = ctx.createRadialGradient(cx, cy, W * 0.48, cx, cy, W * 0.82);
    rg.addColorStop(0, `rgba(${hr(p.a)},${0.18 + norm * 0.25})`);
    rg.addColorStop(1, 'transparent');
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(cx, cy, W * 0.82, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/* ── 分层光效 ── */
function _dImgGlow(W, H, norm, p) {
  // 外层漫射光晕（模糊放大版）
  ctx.filter      = 'blur(20px)';
  ctx.globalAlpha = 0.07 + norm * 0.13;
  ctx.drawImage(imgOff, -W * 0.7, -H * 0.7, W * 1.4, H * 1.4);
  ctx.filter      = 'none';

  // 中层柔光
  ctx.filter      = 'blur(5px)';
  ctx.globalAlpha = 0.18 + norm * 0.1;
  ctx.drawImage(imgOff, -W * 0.54, -H * 0.54, W * 1.08, H * 1.08);
  ctx.filter      = 'none';

  // 主图层
  ctx.globalAlpha = 1;
  ctx.drawImage(imgOff, -W / 2, -H / 2, W, H);

  // 调色板色调叠加（screen 混合，随能量增强）
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = 0.06 + norm * 0.18;
  ctx.fillStyle   = p.a;
  ctx.fillRect(-W / 2, -H / 2, W, H);
  ctx.globalCompositeOperation = 'source-over';

  // 边缘辉光环
  const rg = ctx.createRadialGradient(0, 0, W * 0.28, 0, 0, W * 0.72);
  rg.addColorStop(0,   'transparent');
  rg.addColorStop(0.65, `rgba(${hr(p.a)},${0.04 + norm * 0.14})`);
  rg.addColorStop(1,    `rgba(${hr(p.b)},${0.12 + norm * 0.22})`);
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = 1;
  ctx.fillStyle   = rg;
  ctx.fillRect(-W, -H, W * 2, H * 2);
  ctx.globalCompositeOperation = 'source-over';

  // 节拍：白闪 + 色差偏移
  if (isBeat) {
    const fa  = Math.min(0.45, (beatPulse - 1) * S.imgBeat * 0.38);
    const off = (beatPulse - 1) * 9 * S.imgBeat;
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = fa * 0.35;
    ctx.drawImage(imgOff, -W / 2 + off, -H / 2, W, H);
    ctx.drawImage(imgOff, -W / 2 - off, -H / 2, W, H);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = fa;
    ctx.fillStyle   = '#ffffff';
    ctx.fillRect(-W / 2, -H / 2, W, H);
  }
}

/* ── 灰度化 + 扫描线律动 ── */
function _dImgGray(W, H, norm, p) {
  const src = imgGray || imgOff;

  // 亮度 / 对比度随能量动态变化
  const br = (0.82 + norm * S.imgBeat * 0.45 + (isBeat ? (beatPulse - 1) * 0.28 : 0)).toFixed(2);
  const ct = (1 + norm * S.imgBeat * 0.25).toFixed(2);
  ctx.filter      = `brightness(${br}) contrast(${ct})`;
  ctx.globalAlpha = 1;
  ctx.drawImage(src, -W / 2, -H / 2, W, H);
  ctx.filter = 'none';

  // 动态扫描线（随节拍速度加快）
  const lineH  = 3;
  const speed  = S.speed * (isBeat ? beatPulse * 1.4 : 0.7);
  const scanOff = (tk * speed * 0.55) % (lineH * 2);
  ctx.globalAlpha = 0.1 + norm * 0.1;
  ctx.fillStyle   = 'rgba(0,0,0,0.65)';
  for (let y = -H / 2 - scanOff; y < H / 2; y += lineH * 2)
    ctx.fillRect(-W / 2, y, W, lineH);
  ctx.globalAlpha = 1;

  // 暗角
  const vg = ctx.createRadialGradient(0, 0, W * 0.18, 0, 0, W * 0.72);
  vg.addColorStop(0, 'transparent');
  vg.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.globalAlpha = 0.55 + norm * 0.25;
  ctx.fillStyle   = vg;
  ctx.fillRect(-W / 2, -H / 2, W, H);
  ctx.globalAlpha = 1;

  // 节拍：调色板色调闪入
  if (isBeat) {
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = Math.min(0.38, (beatPulse - 1) * S.imgBeat * 0.28);
    ctx.fillStyle   = p.a;
    ctx.fillRect(-W / 2, -H / 2, W, H);
    ctx.globalCompositeOperation = 'source-over';
  }
}

/* ── 半色调化 ── */
function _dImgHalftone(W, H, norm, p) {
  // 极淡底图作参考
  ctx.globalAlpha = 0.07;
  ctx.drawImage(imgOff, -W / 2, -H / 2, W, H);
  ctx.globalAlpha = 1;

  if (!imgPixels) return;
  const { w: sw, h: sh, data } = imgPixels;

  // 网格步长随能量缩小（点变密）
  const step = Math.max(5, 15 - norm * S.imgBeat * 7);
  const maxR = step * 0.6 * (1 + norm * S.imgBeat * 0.55) * (isBeat ? beatPulse * 0.35 + 0.65 : 1);

  ctx.globalCompositeOperation = 'lighter';
  for (let row = 0; row < H; row += step) {
    for (let col = 0; col < W; col += step) {
      const sx  = Math.floor((col / W) * sw);
      const sy  = Math.floor((row / H) * sh);
      const idx = (sy * sw + sx) * 4;
      const bri = (data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114) / 255;
      const r   = bri * maxR;
      if (r < 0.6) continue;

      ctx.fillStyle   = lc(p.b, p.a, bri);
      ctx.globalAlpha = 0.45 + bri * 0.55;
      ctx.beginPath();
      ctx.arc(-W / 2 + col + step / 2, -H / 2 + row + step / 2, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  // 节拍：全局色调闪
  if (isBeat) {
    ctx.globalAlpha = Math.min(0.28, (beatPulse - 1) * S.imgBeat * 0.2);
    ctx.fillStyle   = p.a;
    ctx.fillRect(-W / 2, -H / 2, W, H);
    ctx.globalAlpha = 1;
  }
}

// ══════════════════════════════════════════
// 9. 综合循环（Auto）
// ══════════════════════════════════════════

const _autoThemes = ['bars', 'circle', 'waveform', 'particles', 'tunnel', 'galaxy'];
const _autoNames  = ['条形频谱', '圆形频谱', '声波形态', '粒子星云', '音频隧道', '星系旋转'];
let _autoIdx = 0, _autoTk = 0;
const _AUTO_HOLD = 600;  // 每个主题持续帧数（~10s）
const _AUTO_FADE = 55;   // 淡入/淡出帧数

function dAuto(freq, en) {
  _autoTk++;
  if (_autoTk > _AUTO_HOLD) {
    _autoTk = 1;
    _autoIdx = (_autoIdx + 1) % _autoThemes.length;
  }

  // 绘制当前主题
  switch (_autoThemes[_autoIdx]) {
    case 'bars':      dBars(freq);   break;
    case 'circle':    dCircle(freq); break;
    case 'waveform':  dWave();       break;
    case 'particles':
      if (!(canUseWebGLTheme('particles') && dPartsGL(en))) dParts(en);
      break;
    case 'tunnel':
      if (!(canUseWebGLTheme('tunnel') && dTunnelGL(freq))) dTunnel(freq);
      break;
    case 'galaxy':
      if (!(canUseWebGLTheme('galaxy') && dGalaxyGL(freq))) dGalaxy(freq);
      break;
  }

  // 过渡：淡入黑 / 淡出黑
  const fadeOut = _autoTk > _AUTO_HOLD - _AUTO_FADE;
  const fadeIn  = _autoTk <= _AUTO_FADE;
  if (fadeOut || fadeIn) {
    const a = fadeOut
      ? (_autoTk - (_AUTO_HOLD - _AUTO_FADE)) / _AUTO_FADE
      : 1 - _autoTk / _AUTO_FADE;
    ctx.fillStyle = `rgba(0,0,0,${Math.min(1, a).toFixed(3)})`;
    ctx.fillRect(0, 0, CV.width, CV.height);
  }

  // 主题名称标签（淡入后短暂显示）
  if (_autoTk >= _AUTO_FADE && _autoTk <= _AUTO_FADE + 120) {
    const p  = gp();
    const t  = _autoTk - _AUTO_FADE;
    const la = t < 30 ? t / 30 : t > 90 ? 1 - (t - 90) / 30 : 1;
    if (la > 0) {
      const fs = Math.max(14, Math.round(CV.height * 0.03));
      ctx.save();
      ctx.globalAlpha = la * 0.9;
      ctx.font        = `bold ${fs}px 'Noto Sans SC', sans-serif`;
      ctx.textAlign   = 'center';
      ctx.shadowBlur  = 24;
      ctx.shadowColor = p.a;
      ctx.fillStyle   = p.a;
      ctx.fillText(_autoNames[_autoIdx], CV.width / 2, CV.height * 0.91);
      // 下划线装饰
      const tw = ctx.measureText(_autoNames[_autoIdx]).width;
      ctx.globalAlpha = la * 0.5;
      ctx.fillStyle   = p.c;
      ctx.fillRect(CV.width / 2 - tw / 2, CV.height * 0.91 + fs * 0.3, tw, 1.5);
      ctx.restore();
    }
  }
}
