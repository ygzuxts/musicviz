/**
 * background.js — 背景特效模块
 *
 * 职责：渲染六种可切换的背景环境特效：
 *   星空 (stars) · 雨 (rain) · 雪 (snow) · 雾 (fog) · 闪电 (lightning) · 极光 (aurora)
 *
 * 所有函数在 render() 主循环中调用。
 * 依赖：state.js（CV / ctx / tk / S / gp / hr / stars / rain / snow / bolts）
 */

// ══════════════════════════════════════════
// 粒子池初始化
// ══════════════════════════════════════════

function initStars() {
  const n = S.fxParams.starsDensity || 420;
  stars = Array.from({ length: n }, () => ({
    x:  Math.random() * CV.width,
    y:  Math.random() * CV.height,
    r:  Math.random() * 2.4 + 0.3,
    a:  Math.random() * 0.6 + 0.4,
    tw: Math.random() * Math.PI * 2,
    sp: Math.random() * 0.025 + 0.006,
    col: Math.random() < 0.15, // 15% 彩色星
  }));
  const rainLv = getRainLevel();
  const nRain = Math.round(140 + rainLv * 120 + Math.max(0, rainLv - 2) * 260);
  rain = Array.from({ length: Math.max(50, nRain) }, mkR);
  const nSnow = S.fxParams.snowDensity || 170;
  snow = Array.from({ length: nSnow }, mkS);
}

function getRainLevel() {
  return Math.max(0.2, S.fxParams.rainSpeed || 1);
}

function getRainProfile() {
  const lv = getRainLevel();
  const storm = Math.max(0, lv - 2);
  return {
    level: lv,
    speedMul: 0.65 + lv * 0.55 + storm * 0.6,
    drift: 1.0 + lv * 0.55 + storm * 0.5,
    lenMul: 0.75 + lv * 0.22 + storm * 0.45,
    widthMul: 0.9 + lv * 0.16 + storm * 0.4,
    alphaMul: 0.72 + lv * 0.12 + storm * 0.2,
    glow: storm > 0 ? 8 + storm * 4 : 6,
  };
}

function mkR() {
  const rainFx = getRainProfile();
  return {
    x: Math.random() * CV.width,
    y: Math.random() * CV.height,
    len: (14 + Math.random() * 20) * rainFx.lenMul,
    sp:  (5.5 + Math.random() * 5.5) * rainFx.speedMul,
    a:   Math.min(0.95, (0.32 + Math.random() * 0.28) * rainFx.alphaMul),
    w:   (0.9 + Math.random() * 0.9) * rainFx.widthMul,
  };
}

function mkS() {
  return {
    x:  Math.random() * CV.width,
    y:  Math.random() * CV.height,
    r:  1   + Math.random() * 3,
    sp: 0.4 + Math.random() * 1.4,
    dr: (Math.random() - 0.5) * 0.5,
    a:  0.4 + Math.random() * 0.5,
  };
}

// ══════════════════════════════════════════
// 特效绘制函数
// ══════════════════════════════════════════

/** 星空：随音量起伏的闪烁星点 */
function dStars(en) {
  if (!S.fx.stars) return;
  const p = gp();
  stars.forEach(s => {
    s.tw += s.sp;
    const tw    = Math.sin(s.tw) * 0.5 + 0.5;
    const boost = 1 + (en / 255) * 1.4;
    const r     = s.r * boost;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    if (s.col) {
      // 彩色星：使用调色板颜色
      const col = s.r > 1.5 ? p.a : p.c;
      ctx.fillStyle = `rgba(${hr(col)},${s.a * tw})`;
      ctx.shadowBlur  = 14 + r * 4;
      ctx.shadowColor = col;
    } else {
      ctx.fillStyle = `rgba(255,255,255,${s.a * tw})`;
      if (s.r > 1.5) {
        ctx.shadowBlur  = 12 + r * 3;
        ctx.shadowColor = p.a;
      } else if (s.r > 0.9) {
        ctx.shadowBlur  = 5;
        ctx.shadowColor = '#ffffff';
      }
    }
    ctx.fill();
    ctx.shadowBlur = 0;
  });
}

/** 雨：斜线雨滴，随能量加速 */
function dRain(en) {
  if (!S.fx.rain) return;
  const rainFx = getRainProfile();
  const b = 1 + en / 255;
  rain.forEach(r => {
    r.y += r.sp * S.speed * b;
    r.x += rainFx.drift;
    if (r.y > CV.height || r.x > CV.width) { Object.assign(r, mkR()); r.y = -20; r.x = Math.random() * CV.width; }
    ctx.globalAlpha = r.a;
    ctx.strokeStyle = 'rgba(155,210,255,0.95)';
    ctx.lineWidth   = r.w;
    ctx.shadowBlur  = rainFx.glow;
    ctx.shadowColor = 'rgba(120,185,255,0.45)';
    ctx.beginPath();
    ctx.moveTo(r.x, r.y);
    ctx.lineTo(r.x + 3.4 + rainFx.drift * 0.8, r.y + r.len);
    ctx.stroke();
  });
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
}

/** 雪：飘落雪花 */
function dSnow() {
  if (!S.fx.snow) return;
  snow.forEach(s => {
    s.y += s.sp * S.speed;
    s.x += s.dr + Math.sin(tk * 0.02 + s.r) * 0.3;
    if (s.y > CV.height) { Object.assign(s, mkS()); s.y = -10; }
    ctx.globalAlpha  = s.a;
    ctx.fillStyle    = 'rgba(255,255,255,.9)';
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

/** 雾：漂浮云雾团，持续向右缓慢漂移 */
function dFog() {
  if (!S.fx.fog) return;
  const t = tk * 0.001 * S.speed;  // 连续漂移时间基准

  // 底层：静态雾底（仅底部 40%）
  const fogA = (S.fxParams.fogDensity || 0.5) * 0.32;
  const base = ctx.createLinearGradient(0, CV.height * 0.6, 0, CV.height);
  base.addColorStop(0, 'transparent');
  base.addColorStop(1, `rgba(155,170,200,${fogA})`);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, CV.width, CV.height);

  // 漂浮云雾团：8 个椭圆形雾团，各自以不同速度持续向右漂移
  const puffs = [
    { ys: 0.72, ry: 0.13, sp: 1.0, a: 0.30, ph: 0.0 },
    { ys: 0.62, ry: 0.11, sp: 0.65, a: 0.24, ph: 0.7 },
    { ys: 0.83, ry: 0.15, sp: 1.4,  a: 0.34, ph: 1.4 },
    { ys: 0.55, ry: 0.09, sp: 0.45, a: 0.18, ph: 2.1 },
    { ys: 0.78, ry: 0.12, sp: 1.1,  a: 0.26, ph: 2.8 },
    { ys: 0.68, ry: 0.10, sp: 0.80, a: 0.22, ph: 3.5 },
    { ys: 0.90, ry: 0.14, sp: 0.55, a: 0.32, ph: 4.2 },
    { ys: 0.58, ry: 0.08, sp: 1.25, a: 0.20, ph: 5.0 },
  ];

  const fogScale = (S.fxParams.fogDensity || 0.5) * 2;
  puffs.forEach((pf, i) => {
    // 连续向右漂移，超出右边界后从左侧重新进入（模 2.2 映射到 -0.6W ~ 1.6W）
    const xNorm = (t * pf.sp + pf.ph) % 2.2;
    const x = (xNorm - 0.6) * CV.width;
    // 垂直轻微起伏
    const y  = CV.height * pf.ys + Math.sin(t * 0.35 + i * 1.3) * CV.height * 0.025;
    const rx = CV.width * 0.38;
    const ry = CV.height * pf.ry;

    ctx.save();
    ctx.scale(1, ry / rx);
    const g = ctx.createRadialGradient(x, y * (rx / ry), 0, x, y * (rx / ry), rx);
    g.addColorStop(0,   `rgba(175,188,212,${pf.a * fogScale})`);
    g.addColorStop(0.5, `rgba(160,175,200,${pf.a * fogScale * 0.45})`);
    g.addColorStop(1,   'transparent');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CV.width, CV.height * (rx / ry));
    ctx.restore();
  });
}

/** 极光：多层正弦波形光带，仅在画面顶部区域 */
function dAurora() {
  if (!S.fx.aurora) return;
  const auroraA = (S.fxParams.auroraIntensity || 0.5) * 2;
  const p = gp(), t = tk * 0.004 * S.speed;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // 5 条光带，全部限制在顶部 22% 以内
  for (let i = 0; i < 5; i++) {
    const y    = CV.height * 0.02 + i * CV.height * 0.038;
    const nc   = i % 3 === 0 ? p.a : i % 3 === 1 ? p.b : p.c;
    const amp1 = 38 + i * 5;
    const amp2 = 22 + i * 3;
    const bandH = 75;

    const g = ctx.createLinearGradient(0, y - bandH, 0, y + bandH);
    g.addColorStop(0,    'transparent');
    g.addColorStop(0.25, `rgba(${hr(nc)},${(0.03 * auroraA).toFixed(3)})`);
    g.addColorStop(0.5,  `rgba(${hr(nc)},${(0.20 * auroraA).toFixed(3)})`);
    g.addColorStop(0.75, `rgba(${hr(nc)},${(0.03 * auroraA).toFixed(3)})`);
    g.addColorStop(1,    'transparent');
    ctx.fillStyle   = g;
    ctx.shadowBlur  = 22;
    ctx.shadowColor = nc;

    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= CV.width; x += 10) {
      const yo = Math.sin(x * 0.008 + t + i * 1.4) * amp1
               + Math.sin(x * 0.005 + t * 0.55 + i * 0.7) * amp2;
      ctx.lineTo(x, y + yo);
    }
    ctx.lineTo(CV.width, y + bandH);
    ctx.lineTo(0, y + bandH);
    ctx.closePath();
    ctx.fill();
  }

  ctx.shadowBlur = 0;
  ctx.restore();

  // 第二遍：亮核心光带（顶部 15% 以内）
  ctx.save();
  for (let i = 0; i < 3; i++) {
    const y  = CV.height * 0.03 + i * CV.height * 0.045;
    const nc = i % 3 === 0 ? p.a : i % 3 === 1 ? p.c : p.b;
    const g  = ctx.createLinearGradient(0, y - 45, 0, y + 45);
    g.addColorStop(0,   'transparent');
    g.addColorStop(0.5, `rgba(${hr(nc)},.16)`);
    g.addColorStop(1,   'transparent');
    ctx.fillStyle = g;

    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= CV.width; x += 10) {
      const yo = Math.sin(x * 0.009 + t * 1.1 + i * 1.8) * 35
               + Math.sin(x * 0.006 + t * 0.6) * 20;
      ctx.lineTo(x, y + yo);
    }
    ctx.lineTo(CV.width, y + 60);
    ctx.lineTo(0, y + 60);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// ══════════════════════════════════════════
// 闪电
// ══════════════════════════════════════════

/**
 * 递归生成闪电路径点（中点偏移算法）
 * @returns {Array<{x,y}>} 路径点列表
 */
function mkBoltPts(x1, y1, x2, y2, depth) {
  if (depth === 0) return [{ x: x1, y: y1 }, { x: x2, y: y2 }];
  const len = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  const mx  = (x1 + x2) / 2 + (Math.random() - 0.5) * len * 0.65;
  const my  = (y1 + y2) / 2 + (Math.random() - 0.5) * len * 0.1;
  const a   = mkBoltPts(x1, y1, mx, my, depth - 1);
  const b   = mkBoltPts(mx, my, x2, y2, depth - 1);
  return [...a, ...b.slice(1)];
}

/** 将路径点列表绘制为一条折线 */
function drawBoltPath(pts) {
  if (!pts || pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
}

/**
 * 闪电特效
 * 触发条件：节拍 或 随机概率（0.15%/帧），确保无音乐时也能看到效果
 * 三层叠加（宽光晕 → 蓝白中层 → 白色核心）+ 分支，柔和渐隐
 */
function dLightning(beat) {
  if (!S.fx.lightning) return;
  const p = gp();

  // 节拍触发 或 随机触发，频率由 fxParams.lightningFreq 控制
  const lfreq = (S.fxParams.lightningFreq || 0.5) * 0.01;
  if ((beat || Math.random() < lfreq) && bolts.length === 0) {
    const x    = CV.width * 0.1 + Math.random() * CV.width * 0.8;
    const endX = x + (Math.random() - 0.5) * CV.width * 0.25;
    const pts  = mkBoltPts(x, 0, endX, CV.height, 6);

    const branches = [];
    for (let b = 0; b < 1 + Math.floor(Math.random() * 2); b++) {
      const srcPt = pts[Math.floor(pts.length * 0.15 + Math.random() * pts.length * 0.5)];
      const bx    = srcPt.x + (Math.random() - 0.5) * CV.width * 0.25;
      const by    = srcPt.y + 30 + Math.random() * CV.height * 0.25;
      branches.push(mkBoltPts(srcPt.x, srcPt.y, bx, by, 4));
    }
    bolts.push({ life: 20, maxLife: 20, pts, branches });
  }

  bolts = bolts.filter(b => b.life > 0);
  if (!bolts.length) return;

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.lineCap  = 'round';
  ctx.lineJoin = 'round';

  bolts.forEach(b => {
    b.life--;
    const t = b.life / b.maxLife; // 1 → 0（渐隐）

    // 层 1：宽色彩光晕（柔和）
    ctx.shadowBlur  = 18 * t;
    ctx.shadowColor = p.a;
    ctx.strokeStyle = `rgba(${hr(p.a)},${t * 0.25})`;
    ctx.lineWidth   = 10 + t * 6;
    drawBoltPath(b.pts);

    // 层 2：蓝白中层
    ctx.shadowBlur  = 8 * t;
    ctx.shadowColor = '#aaddff';
    ctx.strokeStyle = `rgba(160,215,255,${t * 0.55})`;
    ctx.lineWidth   = 3 + t * 2;
    drawBoltPath(b.pts);

    // 层 3：白色高亮核心
    ctx.shadowBlur  = 4 * t;
    ctx.shadowColor = '#ffffff';
    ctx.strokeStyle = `rgba(235,245,255,${t * 0.85})`;
    ctx.lineWidth   = 1 + t;
    drawBoltPath(b.pts);

    // 分支（两层，更细）
    b.branches.forEach(bpts => {
      ctx.shadowBlur  = 6 * t;
      ctx.shadowColor = p.c;
      ctx.strokeStyle = `rgba(${hr(p.c)},${t * 0.3})`;
      ctx.lineWidth   = 5 + t * 2;
      drawBoltPath(bpts);
      ctx.strokeStyle = `rgba(200,235,255,${t * 0.5})`;
      ctx.lineWidth   = 1.2;
      drawBoltPath(bpts);
    });

    ctx.shadowBlur = 0;
  });

  ctx.restore();
}
