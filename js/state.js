/**
 * state.js — 全局状态与配置
 *
 * 所有模块共享的变量集中在这里，避免各文件互相引用造成耦合。
 * 其他模块直接读写这些变量（同一页面作用域）。
 */

// ── Canvas 上下文 ──
const CV  = document.getElementById('mc');
const ctx = CV.getContext('2d');
const MS  = document.getElementById('ms');
const mctx = MS.getContext('2d');

// ── WebAudio 节点 ──
let aCtx, anlz, src, gain;
let dArr, fArr;             // 时域数组 / 频域数组

// ── 播放状态 ──
let playing = false;
let sTime   = 0;            // AudioContext 开始时间
let pOff    = 0;            // 暂停偏移量
let plist   = [];           // 播放列表 [{name, buffer, duration}]
let curI    = -1;           // 当前曲目索引
let muted   = false;

// ── 动画帧计数器 ──
let tk = 0;

// ── 节拍检测状态 ──
let bEnergy  = 0;
let lastBeat = 0;
let bCool    = 0;
let isBeat   = false;
let beatPulse = 1;          // 1.0 = 静止，> 1.0 = 节拍爆发
let bassHit   = 0;          // 大鼓点冲击强度，用于缩放脉冲+闪白光
let rhythmHit = 0;          // 节拍器律动脉冲（0~1）
let beatIntervals = [];
let aFeat = {
  kick: 0,
  subBass: 0,
  bass: 0,
  mid: 0,
  high: 0,
  flux: 0,
  energy: 0,
};

// ── 粒子 / 背景特效粒子池 ──
let parts = [];
let stars = [];
let rain  = [];
let snow  = [];
let bolts = [];             // 闪电

// ── 用户图片 ──
let uImg      = null;       // 原始 Image 对象
let imgOff    = null;       // offscreen canvas 缓存（原色）
let imgGray   = null;       // 灰度 offscreen canvas
let imgPixels = null;       // 小尺寸像素数据 {w,h,data} 供半调采样

// ── 多图列表 ──
let imgList = [];            // [{off, gray, pixels, img, thumbUrl, name}]
let imgIdx  = 0;

// ── 视频 ──
let bgVidEl   = null;        // 背景视频 <video> 元素（独立）
let bgVidOn   = false;       // 背景视频是否激活

// ══════════════════════════════════════════
// 用户设置（所有可调参数）
// ══════════════════════════════════════════
const S = {
  theme:        'bars',
  renderMode:   'canvas',   // 'canvas' | 'webgl'
  palette:      'cyan',
  bgTheme:      'dark',     // 'dark' | 'light'
  sensitivity:  1.5,
  speed:        1,
  blur:         0.18,
  shake:        1.5,        // 节拍震动强度（0=关闭，3=最猛）
  rhythmBPM:    120,        // 律动基准 BPM
  rhythmClick:  false,      // 节拍器提示音开关
  rhythmPatKey: null,       // 当前节奏型 key，供持久化恢复
  rhythmPat:    null,       // 当前节奏型 pattern 数组，null=关闭
  imgBeat:      0.6,
  imgSize:      0.22,  // 图片大小（占画布短边比例）
  imgX:         0,     // 图片中心 X 偏移（像素）
  imgY:         0,     // 图片中心 Y 偏移（像素）
  volume:       0.8,
  vidBg:        false,       // 视频作为全屏背景
  customColor:  '#00f5ff',
  loopMode:     'seq',   // 'seq' | 'loop' | 'one' | 'shuffle'
  fx: {
    stars:     true,
    rain:      false,
    snow:      false,
    fog:       false,
    lightning: false,
    aurora:    false,
  },
  // 背景特效专属参数
  fxParams: {
    starsDensity:    420,   // 星星数量
    rainSpeed:       1.0,   // 雨速倍率
    snowDensity:     170,   // 雪花数量
    fogDensity:      0.5,   // 雾浓度
    lightningFreq:   0.5,   // 闪电频率
    auroraIntensity: 0.5,   // 极光强度
  },
  // 主题专属参数
  themeParams: {
    barsCount:      128,    // 条形数量
    barsFreqLow:    0,      // 条形频率下限 Hz
    barsFreqHigh:   16000,  // 条形频率上限 Hz
    circleN:        256,    // 圆形频谱条数
    waveSmooth:     0.08,   // 声波波速
    particleCount:  400,    // 粒子数量（原 S.particleCount）
    tunnelRings:    26,     // 隧道环数
    galaxyArms:     5,      // 星系旋臂数
  },
  imgFx:    'glow',
  imgShape: 'circle',   // 'circle' | 'rect' | 'none'
};

const STORAGE_KEY = 'musicviz-settings-v2';
let _savedSettings = null;

function _cloneSettingsForSave() {
  return {
    theme: S.theme,
    renderMode: S.renderMode,
    palette: S.palette,
    bgTheme: S.bgTheme,
    sensitivity: S.sensitivity,
    speed: S.speed,
    blur: S.blur,
    shake: S.shake,
    rhythmBPM: S.rhythmBPM,
    rhythmClick: S.rhythmClick,
    rhythmPatKey: S.rhythmPatKey,
    imgBeat: S.imgBeat,
    imgSize: S.imgSize,
    imgX: S.imgX,
    imgY: S.imgY,
    volume: S.volume,
    vidBg: S.vidBg,
    customColor: S.customColor,
    loopMode: S.loopMode,
    fx: { ...S.fx },
    fxParams: { ...S.fxParams },
    themeParams: { ...S.themeParams },
    imgFx: S.imgFx,
    imgShape: S.imgShape,
  };
}

function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_cloneSettingsForSave()));
  } catch (e) {
    console.warn('保存设置失败:', e);
  }
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    _savedSettings = parsed;
    Object.assign(S, parsed);
    if (parsed.fx) Object.assign(S.fx, parsed.fx);
    if (parsed.fxParams) Object.assign(S.fxParams, parsed.fxParams);
    if (parsed.themeParams) Object.assign(S.themeParams, parsed.themeParams);
    return parsed;
  } catch (e) {
    console.warn('读取设置失败:', e);
    return null;
  }
}

loadSettings();

// ══════════════════════════════════════════
// 调色板定义
// ══════════════════════════════════════════
const PAL = {
  cyan:   { a: '#00f5ff', b: '#0066ff', c: '#00ddff', bg: '#050810' },
  fire:   { a: '#ff006e', b: '#ff9500', c: '#ff3300', bg: '#100508' },
  neon:   { a: '#aaff00', b: '#00ff88', c: '#66ff00', bg: '#050a03' },
  purple: { a: '#cc44ff', b: '#ff44aa', c: '#aa00ff', bg: '#08050f' },
  gold:   { a: '#ffd700', b: '#ff8c00', c: '#ffaa00', bg: '#0f0a02' },
  mono:   { a: '#ffffff', b: '#aaaacc', c: '#ddddff', bg: '#060608' },
};

/** HSL → hex（供彩虹模式使用） */
function hslHex(h, s, l) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * c).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** 返回当前调色板（自定义色时三色相同） */
function gp() {
  const bgByTheme = darkBg => {
    return darkBg;
  };
  if (S.palette === 'custom')
    return { a: S.customColor, b: S.customColor, c: S.customColor, bg: bgByTheme('#050810') };
  if (S.palette === 'rainbow') {
    const h = (tk * 0.4) % 360;
    return {
      a: hslHex(h, 100, 62),
      b: hslHex((h + 120) % 360, 100, 62),
      c: hslHex((h + 240) % 360, 100, 62),
      bg: bgByTheme('#050810'),
    };
  }
  const pal = PAL[S.palette] || PAL.cyan;
  return { ...pal, bg: bgByTheme(pal.bg) };
}

/** 颜色工具：hex → "r,g,b" */
function hr(hex) {
  return `${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)}`;
}

/** 颜色插值：在两个 hex 色之间按 t(0~1) 插值 */
function lc(c1, c2, t) {
  const p = v => parseInt(v, 16);
  const ch = (a, b) => Math.round(p(a) + (p(b) - p(a)) * t).toString(16).padStart(2, '0');
  return `#${ch(c1.slice(1,3), c2.slice(1,3))}${ch(c1.slice(3,5), c2.slice(3,5))}${ch(c1.slice(5,7), c2.slice(5,7))}`;
}

/** 格式化秒数为 m:ss */
function fmt(s) {
  s = Math.max(0, s);
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}
