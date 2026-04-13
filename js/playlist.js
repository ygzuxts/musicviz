/**
 * playlist.js — 播放列表模块
 *
 * 职责：
 *   · 渲染播放列表 DOM
 *   · 删除 / 清空曲目
 *   · 拖拽音频文件（到列表区 / 到 Canvas）
 *   · 列表内拖拽排序
 *   · 循环模式切换（顺序 / 列表循环 / 单曲循环 / 随机）
 *   · 图片导入
 *
 * 依赖：state.js / audio.js（playTk / updUI / fmt / loadFiles）
 */

// ══════════════════════════════════════════
// 循环模式
// ══════════════════════════════════════════

const _loopModes = ['seq', 'loop', 'one', 'shuffle'];
const _loopIcons = { seq: '⇢', loop: '🔁', one: '🔂', shuffle: '🔀' };
const _loopTips  = { seq: '顺序播放', loop: '列表循环', one: '单曲循环', shuffle: '随机播放' };

function togLoop() {
  const idx = _loopModes.indexOf(S.loopMode);
  S.loopMode = _loopModes[(idx + 1) % _loopModes.length];
  _syncLoopBtn();
  saveSettings();
}

function _syncLoopBtn() {
  const btn = document.getElementById('plloop');
  if (!btn) return;
  btn.textContent = _loopIcons[S.loopMode];
  btn.title       = _loopTips[S.loopMode];
  btn.classList.toggle('plb-on', S.loopMode !== 'seq');
}

// ══════════════════════════════════════════
// 播放列表渲染
// ══════════════════════════════════════════

/** 重新渲染播放列表 DOM */
function renderPL() {
  const el = document.getElementById('pll');

  // 更新曲目数量徽章
  const plc = document.getElementById('plc');
  if (plc) plc.textContent = plist.length ? `${plist.length} 首` : '';

  if (plist.length === 0) {
    el.innerHTML = '<div id="ple">🎵 播放列表为空<br>点击「添加音乐」<br>或拖拽到此处</div>';
    return;
  }

  el.innerHTML = '';
  plist.forEach((t, i) => {
    const d = document.createElement('div');
    d.className  = 'pi' + (i === curI ? ' on' : '');
    d.draggable  = true;
    d.dataset.idx = i;
    d.innerHTML = `
      <div class="peq"><div class="eb"></div><div class="eb"></div><div class="eb"></div></div>
      <span class="pnum">${i + 1}</span>
      <div class="pinfo">
        <div class="pn" title="${t.name}">${t.name}</div>
        <div class="pd">${fmt(t.duration)}</div>
      </div>
      <button class="pdel" onclick="rmPL(${i},event)" title="删除">✕</button>
    `;

    // 点击播放
    d.addEventListener('click', e => {
      if (!e.target.classList.contains('pdel')) playTk(i);
    });

    // ── 拖拽排序 ──
    d.addEventListener('dragstart', e => {
      _dragIdx = i;
      e.dataTransfer.setData('text/plain', 'pl-reorder');
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => d.classList.add('dragging'), 0);
    });
    d.addEventListener('dragend', () => {
      _dragIdx = -1;
      d.classList.remove('dragging');
      document.querySelectorAll('.pi').forEach(el => el.classList.remove('drag-over'));
    });
    d.addEventListener('dragover', e => {
      if (_dragIdx < 0) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      document.querySelectorAll('.pi').forEach(el => el.classList.remove('drag-over'));
      if (i !== _dragIdx) d.classList.add('drag-over');
    });
    d.addEventListener('drop', e => {
      e.preventDefault();
      e.stopPropagation();
      d.classList.remove('drag-over');
      if (_dragIdx < 0 || _dragIdx === i) return;

      // 重排数组
      const item = plist.splice(_dragIdx, 1)[0];
      plist.splice(i, 0, item);

      // 修正 curI
      if      (curI === _dragIdx)              curI = i;
      else if (_dragIdx < curI && i >= curI)   curI--;
      else if (_dragIdx > curI && i <= curI)   curI++;

      _dragIdx = -1;
      renderPL();
    });

    el.appendChild(d);
  });
}

// ══════════════════════════════════════════
// 删除 / 清空
// ══════════════════════════════════════════

function rmPL(i, e) {
  e.stopPropagation();
  const wasPlaying = playing;
  plist.splice(i, 1);

  if (curI === i) {
    if (src) { try { src.stop(); } catch (err) {} }
    playing = false;
    curI = Math.min(i, plist.length - 1);
    if (plist.length > 0) {
      if (wasPlaying) playTk(curI);
      else {
        document.getElementById('ns').textContent = plist[curI].name;
        document.getElementById('dt').textContent = fmt(plist[curI].duration);
        document.getElementById('ct').textContent = '0:00';
        const sk = document.getElementById('sk');
        sk.value = 0;
        sk.style.setProperty('--sp', '0%');
        updUI();
      }
    }
    else {
      curI = -1;
      updUI();
      document.getElementById('ns').textContent = '未加载音乐';
      document.getElementById('do').classList.remove('h');
    }
  } else if (curI > i) {
    curI--;
  }
  renderPL();
}

function clrPL() {
  if (plist.length === 0) return;
  if (src) { try { src.stop(); } catch (e) {} }
  playing = false;
  plist   = [];
  curI    = -1;
  updUI();
  document.getElementById('ns').textContent = '未加载音乐';
  document.getElementById('nb').textContent = 'MusicViz · 音乐可视化';
  document.getElementById('do').classList.remove('h');
  const sk = document.getElementById('sk');
  sk.value = 0;
  sk.style.setProperty('--sp', '0%');
  document.getElementById('ct').textContent = '0:00';
  document.getElementById('dt').textContent = '0:00';
  renderPL();
}

// ══════════════════════════════════════════
// 拖拽排序状态
// ══════════════════════════════════════════

let _dragIdx = -1;

// ══════════════════════════════════════════
// 拖拽文件导入
// ══════════════════════════════════════════

const plp = document.getElementById('plp');
const pld = document.getElementById('pld');

// 拖到播放列表区（仅处理文件拖入，排序 drop 已 stopPropagation）
plp.addEventListener('dragover', e => {
  e.preventDefault();
  if (e.dataTransfer.types.includes('Files')) pld.classList.add('dov');
});
plp.addEventListener('dragleave', () => pld.classList.remove('dov'));
plp.addEventListener('drop', e => {
  e.preventDefault();
  pld.classList.remove('dov');
  if (e.dataTransfer.types.includes('Files')) {
    loadFiles([...e.dataTransfer.files]);
  }
});

// 拖到 Canvas 区（只接受音频）
document.getElementById('cw').addEventListener('dragover', e => e.preventDefault());
document.getElementById('cw').addEventListener('drop', e => {
  e.preventDefault();
  loadFiles([...e.dataTransfer.files].filter(f => f.type.startsWith('audio/') || /\.(mp3|wav|ogg|aac|m4a|flac|wma|opus|webm)$/i.test(f.name)));
});

// ══════════════════════════════════════════
// 图片导入（支持多图）
// ══════════════════════════════════════════

document.getElementById('ii').addEventListener('change', e => {
  addImages([...e.target.files]);
  e.target.value = '';
});

/** 批量加载图片，追加到 imgList */
function addImages(files) {
  const imgFiles = files.filter(f => f.type.startsWith('image/'));
  if (!imgFiles.length) return;
  imgFiles.forEach(f => {
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      const entry = _buildImgEntry(img, url, f.name.replace(/\.[^.]+$/, ''));
      imgList.push(entry);
      // 如果是第一张，立即激活
      if (imgList.length === 1) _activateImg(0);
      renderImgGallery();
    };
    img.src = url;
  });
}

/** 从 Image 对象构建图片条目 */
function _buildImgEntry(img, thumbUrl, name) {
  const off = document.createElement('canvas');
  off.width  = img.width;
  off.height = img.height;
  off.getContext('2d').drawImage(img, 0, 0);

  const gray = document.createElement('canvas');
  gray.width  = img.width;
  gray.height = img.height;
  const gctx = gray.getContext('2d');
  gctx.drawImage(img, 0, 0);
  const id = gctx.getImageData(0, 0, img.width, img.height);
  const d  = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const g = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    d[i] = d[i + 1] = d[i + 2] = g;
  }
  gctx.putImageData(id, 0, 0);

  const SW = 80, SH = Math.round(80 * img.height / img.width);
  const sc = document.createElement('canvas');
  sc.width = SW; sc.height = SH;
  sc.getContext('2d').drawImage(img, 0, 0, SW, SH);
  const pixels = { w: SW, h: SH, data: sc.getContext('2d').getImageData(0, 0, SW, SH).data };

  return { img, off, gray, pixels, thumbUrl, name };
}

/** 激活指定索引的图片 */
function _activateImg(i) {
  imgIdx    = i;
  vidActive = false;
  const e   = imgList[i];
  uImg      = e.img;
  imgOff    = e.off;
  imgGray   = e.gray;
  imgPixels = e.pixels;
}

/** 切换到指定图片 */
function switchImg(i) {
  _activateImg(i);
  renderImgGallery();
}

/** 删除指定图片 */
function removeImg(i, ev) {
  ev.stopPropagation();
  URL.revokeObjectURL(imgList[i].thumbUrl);
  imgList.splice(i, 1);
  if (imgList.length === 0) {
    uImg = null; imgOff = null; imgGray = null; imgPixels = null;
    imgIdx = 0;
  } else {
    const next = Math.min(i, imgList.length - 1);
    _activateImg(next);
  }
  renderImgGallery();
}

/** 渲染图片画廊缩略图 */
function renderImgGallery() {
  const el = document.getElementById('igal');
  if (!el) return;
  el.innerHTML = '';
  imgList.forEach((entry, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'igth' + (i === imgIdx && !vidActive ? ' on' : '');
    wrap.title = entry.name;
    wrap.innerHTML = `
      <img src="${entry.thumbUrl}" alt="${entry.name}">
      <button class="igdel" onclick="removeImg(${i},event)">✕</button>
    `;
    wrap.addEventListener('click', e => {
      if (!e.target.classList.contains('igdel')) switchImg(i);
    });
    el.appendChild(wrap);
  });
}

// ══════════════════════════════════════════
// 视频导入
// ══════════════════════════════════════════

document.getElementById('vi2').addEventListener('change', e => {
  const f = e.target.files[0];
  if (!f || !f.type.startsWith('video/')) return;
  loadVideo(f);
  e.target.value = '';
});

function loadVideo(file) {
  // 停止旧视频
  if (vidEl) { vidEl.pause(); vidEl.src = ''; }

  vidEl = document.createElement('video');
  vidEl.muted    = true;
  vidEl.loop     = true;
  vidEl.playsInline = true;
  vidEl.src      = URL.createObjectURL(file);
  vidEl.play().catch(() => {});

  // 初始化 offscreen canvas（等视频元数据加载后）
  vidEl.addEventListener('loadedmetadata', () => {
    const scale = Math.min(1, 640 / vidEl.videoWidth);
    const ow = Math.round(vidEl.videoWidth  * scale);
    const oh = Math.round(vidEl.videoHeight * scale);
    imgOff = document.createElement('canvas');
    imgOff.width = ow; imgOff.height = oh;
    imgGray   = null;
    imgPixels = null;
    uImg      = null;
    vidActive = true;
    _vidGrayC = null; _vidPixC = null;
    renderImgGallery();
    _syncVidStatus(file.name.replace(/\.[^.]+$/, ''));
  }, { once: true });
}

function stopVideo() {
  if (vidEl) { vidEl.pause(); vidEl.src = ''; vidEl = null; }
  vidActive = false;
  imgOff = null; imgGray = null; imgPixels = null;
  // 恢复到图片列表中的当前图
  if (imgList.length > 0) _activateImg(imgIdx);
  _syncVidStatus(null);
  renderImgGallery();
}

function _syncVidStatus(name) {
  const el = document.getElementById('ivid');
  if (!el) return;
  if (name) {
    el.style.display = 'flex';
    el.innerHTML = `<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">🎬 ${name}</span>`
      + `<button class="igdel" style="position:static;color:var(--muted)" onclick="stopVideo()">✕</button>`;
    el.classList.add('on');
  } else {
    el.style.display = 'none';
    el.classList.remove('on');
  }
}

// 视频帧缓存 canvas
let _vidGrayC = null, _vidPixC = null;

// ══════════════════════════════════════════
// 背景视频（独立于图片互动层）
// ══════════════════════════════════════════

document.getElementById('bgvi').addEventListener('change', e => {
  const f = e.target.files[0];
  if (!f || !f.type.startsWith('video/')) return;
  loadBgVideo(f);
  e.target.value = '';
});

function loadBgVideo(file) {
  if (bgVidEl) { bgVidEl.pause(); bgVidEl.src = ''; }
  bgVidEl = document.createElement('video');
  bgVidEl.muted = true;
  bgVidEl.loop  = true;
  bgVidEl.playsInline = true;
  bgVidEl.src = URL.createObjectURL(file);
  bgVidEl.play().catch(() => {});
  bgVidEl.addEventListener('loadedmetadata', () => {
    bgVidOn = true;
    S.vidBg = true;
    const btn = document.getElementById('vidBgBtn');
    if (btn) btn.classList.add('on');
    _syncBgVidStatus(file.name.replace(/\.[^.]+$/, ''));
  }, { once: true });
}

function stopBgVideo() {
  if (bgVidEl) { bgVidEl.pause(); bgVidEl.src = ''; bgVidEl = null; }
  bgVidOn = false;
  S.vidBg = false;
  const btn = document.getElementById('vidBgBtn');
  if (btn) btn.classList.remove('on');
  _syncBgVidStatus(null);
}

function _syncBgVidStatus(name) {
  const el = document.getElementById('ibgvid');
  if (!el) return;
  if (name) {
    el.style.display = 'flex';
    el.innerHTML = `<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">📺 ${name}</span>`
      + `<button class="igdel" style="position:static;color:var(--muted)" onclick="stopBgVideo()">✕</button>`;
    el.classList.add('on');
  } else {
    el.style.display = 'none';
    el.classList.remove('on');
  }
}

/** 每帧更新视频 offscreen canvas（在 render 循环中调用） */
function updateVideoFrame() {
  if (!vidEl || vidEl.readyState < 2 || !imgOff) return;
  imgOff.getContext('2d').drawImage(vidEl, 0, 0, imgOff.width, imgOff.height);

  // 灰度 & 像素数据每 4 帧更新一次
  if (tk % 4 !== 0) return;
  const ow = imgOff.width, oh = imgOff.height;

  if (!_vidGrayC || _vidGrayC.width !== ow) {
    _vidGrayC = document.createElement('canvas');
    _vidGrayC.width = ow; _vidGrayC.height = oh;
  }
  const gctx = _vidGrayC.getContext('2d');
  gctx.drawImage(imgOff, 0, 0);
  const id = gctx.getImageData(0, 0, ow, oh);
  const d  = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const g = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    d[i] = d[i + 1] = d[i + 2] = g;
  }
  gctx.putImageData(id, 0, 0);
  imgGray = _vidGrayC;

  const SW = 80, SH = Math.round(80 * oh / ow);
  if (!_vidPixC || _vidPixC.height !== SH) {
    _vidPixC = document.createElement('canvas');
    _vidPixC.width = SW; _vidPixC.height = SH;
  }
  _vidPixC.getContext('2d').drawImage(imgOff, 0, 0, SW, SH);
  imgPixels = { w: SW, h: SH, data: _vidPixC.getContext('2d').getImageData(0, 0, SW, SH).data };
}

// ══════════════════════════════════════════
// 位置重置
// ══════════════════════════════════════════

function resetImgPos() { S.imgX = 0; S.imgY = 0; }

// ══════════════════════════════════════════
// 默认示例图片（程序化生成，无需外部文件）
// ══════════════════════════════════════════

function _makeDefaultImg(drawFn, name) {
  const c = document.createElement('canvas');
  c.width = 400; c.height = 400;
  drawFn(c.getContext('2d'), 400);
  const img = new Image();
  img.onload = () => {
    const entry = _buildImgEntry(img, c.toDataURL(), name);
    imgList.push(entry);
    if (imgList.length === 1) _activateImg(0);
    renderImgGallery();
  };
  img.src = c.toDataURL();
}

function loadDefaultImages() {
  // 1. 青蓝渐变
  _makeDefaultImg((ctx, s) => {
    const g = ctx.createRadialGradient(s/2, s/2, 0, s/2, s/2, s/1.4);
    g.addColorStop(0, '#00f5ff'); g.addColorStop(0.5, '#0066ff'); g.addColorStop(1, '#000033');
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.arc(s/2, s/2, 40 + i * 30, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(0,245,255,${0.15 - i * 0.02})`; ctx.lineWidth = 2;
      ctx.stroke();
    }
  }, '默认-青蓝');

  // 2. 火焰渐变
  _makeDefaultImg((ctx, s) => {
    const g = ctx.createRadialGradient(s/2, s*0.7, 0, s/2, s/2, s/1.2);
    g.addColorStop(0, '#fff200'); g.addColorStop(0.3, '#ff6600'); g.addColorStop(0.7, '#ff006e'); g.addColorStop(1, '#1a0000');
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 5; i++) {
      const x = s/2 + (Math.random() - 0.5) * 60;
      ctx.beginPath(); ctx.arc(x, s/2, 15 + i * 18, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,150,0,${0.2 - i * 0.03})`; ctx.lineWidth = 1.5; ctx.stroke();
    }
  }, '默认-火焰');

  // 3. 紫粉渐变
  _makeDefaultImg((ctx, s) => {
    const g = ctx.createLinearGradient(0, 0, s, s);
    g.addColorStop(0, '#cc44ff'); g.addColorStop(0.5, '#ff44aa'); g.addColorStop(1, '#220033');
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    ctx.save(); ctx.translate(s/2, s/2);
    for (let i = 0; i < 8; i++) {
      ctx.rotate(Math.PI / 4);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, s * 0.45);
      ctx.strokeStyle = `rgba(255,200,255,0.12)`; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.restore();
  }, '默认-紫粉');
}
