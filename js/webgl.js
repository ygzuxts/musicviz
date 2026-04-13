/**
 * webgl.js — WebGL 主题扩展
 *
 * 说明：
 *   · 作为内部渲染扩展使用，优先加速 particles / galaxy / tunnel 主题
 *   · 若浏览器不支持 WebGL，则自动回退到 Canvas 2D
 */

let glCV = null, gl = null, glProg = null, glLineProg = null;
let glPosBuf = null, glSizeBuf = null, glColorBuf = null;
let glLinePosBuf = null, glLineColorBuf = null;
let glReady = false;
let glViewportW = 0, glViewportH = 0;

function initGL() {
  if (glReady) return true;

  glCV = document.createElement('canvas');
  gl = glCV.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true });
  if (!gl) return false;

  const vs = `
    attribute vec2 a_pos;
    attribute float a_size;
    attribute vec3 a_color;
    varying vec3 v_color;
    void main() {
      gl_Position = vec4(a_pos, 0.0, 1.0);
      gl_PointSize = a_size;
      v_color = a_color;
    }
  `;
  const fs = `
    precision mediump float;
    varying vec3 v_color;
    void main() {
      vec2 p = gl_PointCoord - vec2(0.5);
      float d = length(p);
      if (d > 0.5) discard;
      float alpha = smoothstep(0.5, 0.0, d);
      gl_FragColor = vec4(v_color, alpha * 0.9);
    }
  `;

  const vert = _mkShader(gl.VERTEX_SHADER, vs);
  const frag = _mkShader(gl.FRAGMENT_SHADER, fs);
  if (!vert || !frag) return false;

  glProg = gl.createProgram();
  gl.attachShader(glProg, vert);
  gl.attachShader(glProg, frag);
  gl.linkProgram(glProg);
  if (!gl.getProgramParameter(glProg, gl.LINK_STATUS)) {
    console.warn('WebGL program link failed:', gl.getProgramInfoLog(glProg));
    return false;
  }

  const lineVS = `
    attribute vec2 a_pos;
    attribute vec3 a_color;
    varying vec3 v_color;
    void main() {
      gl_Position = vec4(a_pos, 0.0, 1.0);
      v_color = a_color;
    }
  `;
  const lineFS = `
    precision mediump float;
    varying vec3 v_color;
    uniform float u_alpha;
    void main() {
      gl_FragColor = vec4(v_color, u_alpha);
    }
  `;
  const lvert = _mkShader(gl.VERTEX_SHADER, lineVS);
  const lfrag = _mkShader(gl.FRAGMENT_SHADER, lineFS);
  if (!lvert || !lfrag) return false;
  glLineProg = gl.createProgram();
  gl.attachShader(glLineProg, lvert);
  gl.attachShader(glLineProg, lfrag);
  gl.linkProgram(glLineProg);
  if (!gl.getProgramParameter(glLineProg, gl.LINK_STATUS)) {
    console.warn('WebGL line program link failed:', gl.getProgramInfoLog(glLineProg));
    return false;
  }

  glPosBuf = gl.createBuffer();
  glSizeBuf = gl.createBuffer();
  glColorBuf = gl.createBuffer();
  glLinePosBuf = gl.createBuffer();
  glLineColorBuf = gl.createBuffer();
  glReady = true;
  return true;
}

function _mkShader(type, src) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn('WebGL shader compile failed:', gl.getShaderInfoLog(shader));
    return null;
  }
  return shader;
}

function resizeGL(w, h) {
  if (!initGL()) return false;
  if (glViewportW === w && glViewportH === h) return true;
  glViewportW = w;
  glViewportH = h;
  glCV.width = Math.max(1, w);
  glCV.height = Math.max(1, h);
  gl.viewport(0, 0, glCV.width, glCV.height);
  return true;
}

function canUseWebGLTheme(theme) {
  return ['particles', 'galaxy', 'tunnel'].includes(theme) && initGL();
}

function clearGL() {
  if (!glReady) return;
  gl.viewport(0, 0, glCV.width, glCV.height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
}

function dPartsGL(en) {
  if (!resizeGL(CV.width, CV.height)) return false;
  clearGL();

  while (parts.length < S.themeParams.particleCount) parts.push(mkP());
  while (parts.length > S.themeParams.particleCount) parts.pop();

  const p = gp();
  const baseRGB = _hexToRGBNorm(p.a);
  const hotRGB = _hexToRGBNorm(p.b);
  const cx = CV.width / 2;
  const cy = CV.height / 2;
  const norm = en / 255;
  const hi = (aFeat.high || 0) / 255;
  const bass = (aFeat.bass || 0) / 255;

  const pos = new Float32Array(parts.length * 2);
  const size = new Float32Array(parts.length);
  const color = new Float32Array(parts.length * 3);
  const trailPos = [];
  const trailColor = [];
  const trailPointPos = [];
  const trailPointColor = [];
  const trailPointSize = [];
  const trailCounts = [];
  const TRAIL = 10;

  for (let i = 0; i < parts.length; i++) {
    const pt = parts[i];
    const fi = Math.min(Math.floor(pt.hue * 200), (fArr || []).length - 1);
    const fv = fArr ? fArr[Math.max(0, fi)] / 255 : 0.1;
    pt.angle += (0.0024 + fv * 0.015) * S.speed * (0.9 + hi * 0.35);
    const orbit = pt.orbitR * (1 + fv * S.sensitivity * 0.38 + bass * 0.18);
    const wob = Math.sin(pt.angle * 2.8 + tk * 0.02) * 8 * (0.5 + hi);
    pt.x = cx + Math.cos(pt.angle) * (orbit + wob);
    pt.y = cy + Math.sin(pt.angle) * (orbit + wob) * 0.68;

    if (!pt.trail) pt.trail = [];
    pt.trail.push({ x: pt.x, y: pt.y });
    if (pt.trail.length > TRAIL) pt.trail.shift();

    const clipX = pt.x / CV.width * 2 - 1;
    const clipY = 1 - pt.y / CV.height * 2;
    pos[i * 2] = clipX;
    pos[i * 2 + 1] = clipY;

    size[i] = Math.max(2, (pt.r * 2.5 + fv * 12 + norm * 6) * (1 + bass * 0.25));

    const t = Math.min(1, pt.hue * 0.75 + hi * 0.25);
    color[i * 3] = baseRGB[0] + (hotRGB[0] - baseRGB[0]) * t;
    color[i * 3 + 1] = baseRGB[1] + (hotRGB[1] - baseRGB[1]) * t;
    color[i * 3 + 2] = baseRGB[2] + (hotRGB[2] - baseRGB[2]) * t;

    if (pt.trail.length >= 2) {
      trailCounts.push(pt.trail.length);
      for (let j = 0; j < pt.trail.length; j++) {
        const tp = pt.trail[j];
        trailPos.push(tp.x / CV.width * 2 - 1, 1 - tp.y / CV.height * 2);
        const fade = j / (pt.trail.length - 1 || 1);
        const tf = Math.max(0.12, fade * 0.78);
        trailColor.push(
          color[i * 3] * tf,
          color[i * 3 + 1] * tf,
          color[i * 3 + 2] * tf
        );
        trailPointPos.push(tp.x / CV.width * 2 - 1, 1 - tp.y / CV.height * 2);
        trailPointColor.push(
          color[i * 3] * tf,
          color[i * 3 + 1] * tf,
          color[i * 3 + 2] * tf
        );
        trailPointSize.push(Math.max(1.8, (1 - fade) * 5.5 + 1.6));
      }
    }
  }

  if (trailPos.length) {
    _drawPolylineSeries(new Float32Array(trailPos), new Float32Array(trailColor), trailCounts, 0.34);
  }
  if (trailPointPos.length) {
    _drawPointCloud(
      new Float32Array(trailPointPos),
      new Float32Array(trailPointSize),
      new Float32Array(trailPointColor)
    );
  }
  _drawPointCloud(pos, size, color);
  ctx.drawImage(glCV, 0, 0, CV.width, CV.height);
  return true;
}

function dGalaxyGL(freq) {
  if (!resizeGL(CV.width, CV.height)) return false;
  clearGL();

  const p = gp();
  const cx = CV.width / 2;
  const cy = CV.height / 2;
  const time = tk * 0.0014 * S.speed;
  const norm = freq.reduce((a, b) => a + b, 0) / freq.length / 255;
  const arms = S.themeParams.galaxyArms || 5;
  const pts = 180;
  const total = arms * pts + 40;
  const pos = new Float32Array(total * 2);
  const size = new Float32Array(total);
  const color = new Float32Array(total * 3);
  const a = _hexToRGBNorm(p.a);
  const b = _hexToRGBNorm(p.b);
  const c = _hexToRGBNorm(p.c);
  const hi = (aFeat.high || 0) / 255;
  const mid = (aFeat.mid || 0) / 255;

  let idx = 0;
  for (let arm = 0; arm < arms; arm++) {
    const armA = (arm / arms) * Math.PI * 2;
    for (let j = 0; j < pts; j++) {
      const t = j / pts;
      const fi = Math.floor(t * freq.length * 0.72);
      const fv = freq[fi] / 255;
      const baseR = t * Math.min(CV.width, CV.height) * 0.46;
      const audioR = baseR * (1 + fv * S.sensitivity * 0.5);
      const beatR = isBeat ? audioR * (beatPulse - 1) * 0.28 * t : 0;
      const spin = t * Math.PI * 2.6 + armA + time;
      const x = cx + Math.cos(spin) * (audioR + beatR);
      const y = cy + Math.sin(spin) * (audioR + beatR) * 0.72;

      pos[idx * 2] = x / CV.width * 2 - 1;
      pos[idx * 2 + 1] = 1 - y / CV.height * 2;
      size[idx] = Math.max(1.8, (1 - t * 0.65) * 4 + fv * 10 + hi * 2.5);

      const mix = (arm / arms + t * 0.4) % 1;
      const col = mix < 0.5
        ? _mixRGB(a, b, mix * 2)
        : _mixRGB(b, c, (mix - 0.5) * 2);
      color[idx * 3] = col[0];
      color[idx * 3 + 1] = col[1];
      color[idx * 3 + 2] = col[2];
      idx++;
    }
  }

  for (let i = 0; i < 40; i++) {
    const ang = (i / 40) * Math.PI * 2 + time * 1.2;
    const r = 12 + i * 0.75 + norm * 28;
    const x = cx + Math.cos(ang) * r;
    const y = cy + Math.sin(ang) * r * 0.72;
    pos[idx * 2] = x / CV.width * 2 - 1;
    pos[idx * 2 + 1] = 1 - y / CV.height * 2;
    size[idx] = 5 + mid * 5 + (40 - i) * 0.08;
    color[idx * 3] = 1;
    color[idx * 3 + 1] = 1;
    color[idx * 3 + 2] = 1;
    idx++;
  }

  _drawPointCloud(pos, size, color);
  ctx.drawImage(glCV, 0, 0, CV.width, CV.height);
  return true;
}

function dTunnelGL(freq) {
  if (!resizeGL(CV.width, CV.height)) return false;
  clearGL();

  const p = gp();
  const cx = CV.width / 2;
  const cy = CV.height / 2;
  const rings = S.themeParams.tunnelRings || 26;
  const seg = 72;
  const beams = 20;
  const total = rings * seg + beams * 14;
  const pos = new Float32Array(total * 2);
  const size = new Float32Array(total);
  const color = new Float32Array(total * 3);
  const a = _hexToRGBNorm(p.a);
  const b = _hexToRGBNorm(p.b);
  const c = _hexToRGBNorm(p.c);
  const outerR = Math.min(CV.width, CV.height) * 0.55;

  const linePos = [];
  const lineColor = [];

  let idx = 0;
  for (let i = rings; i >= 1; i--) {
    const fi = Math.floor((i / rings) * (freq.length * 0.5));
    const v = freq[fi] / 255;
    const r = (i / rings) * Math.min(CV.width, CV.height) * 0.55 + v * 55 * S.sensitivity;
    const mix = i / rings;
    const ringFade = (1 - i / rings) * 0.72 + 0.06;
    const ringCol = _mixRGB(a, b, mix);
    const col = [
      ringCol[0] * ringFade,
      ringCol[1] * ringFade,
      ringCol[2] * ringFade,
    ];
    for (let j = 0; j < seg; j++) {
      const ang = (j / seg) * Math.PI * 2 + tk * 0.0025 * S.speed;
      const x = cx + Math.cos(ang) * r;
      const y = cy + Math.sin(ang) * r;
      pos[idx * 2] = x / CV.width * 2 - 1;
      pos[idx * 2 + 1] = 1 - y / CV.height * 2;
      size[idx] = Math.max(5.4, (4.6 + v * 6.2) * (0.9 + ringFade * 0.58));
      color[idx * 3] = col[0];
      color[idx * 3 + 1] = col[1];
      color[idx * 3 + 2] = col[2];

      linePos.push(x / CV.width * 2 - 1, 1 - y / CV.height * 2);
      lineColor.push(col[0], col[1], col[2]);
      idx++;
    }
    linePos.push(linePos[linePos.length - seg * 2], linePos[linePos.length - seg * 2 + 1]);
    lineColor.push(col[0], col[1], col[2]);
  }

  for (let i = 0; i < beams; i++) {
    const ang = (i / beams) * Math.PI * 2 + tk * 0.003 * S.speed;
    const fi = Math.floor((i / beams) * freq.length * 0.4);
    const v = freq[fi] / 255;
    const beamCol = [c[0] * 0.82, c[1] * 0.9, c[2] * 0.98];
    for (let j = 1; j <= 14; j++) {
      const t = j / 14;
      const x = cx + Math.cos(ang) * outerR * t;
      const y = cy + Math.sin(ang) * outerR * t;
      pos[idx * 2] = x / CV.width * 2 - 1;
      pos[idx * 2 + 1] = 1 - y / CV.height * 2;
      size[idx] = Math.max(0.8, 0.75 + v * 1.15 * (1 - t * 0.45));
      color[idx * 3] = beamCol[0];
      color[idx * 3 + 1] = beamCol[1];
      color[idx * 3 + 2] = beamCol[2];
      if (j === 1) {
        linePos.push(cx / CV.width * 2 - 1, 1 - cy / CV.height * 2);
        lineColor.push(beamCol[0], beamCol[1], beamCol[2]);
      }
      linePos.push(x / CV.width * 2 - 1, 1 - y / CV.height * 2);
      lineColor.push(beamCol[0], beamCol[1], beamCol[2]);
      idx++;
    }
  }

  _drawLines(new Float32Array(linePos), new Float32Array(lineColor), gl.LINE_STRIP, seg + 1, rings, 0.82);
  _drawRadialBeams(new Float32Array(linePos.slice((rings * (seg + 1)) * 2)), new Float32Array(lineColor.slice((rings * (seg + 1)) * 3)), 15, beams, 0.16);
  _drawPointCloud(pos, size, color);
  ctx.drawImage(glCV, 0, 0, CV.width, CV.height);
  return true;
}

function _drawPointCloud(pos, size, color) {
  gl.useProgram(glProg);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

  const aPos = gl.getAttribLocation(glProg, 'a_pos');
  const aSize = gl.getAttribLocation(glProg, 'a_size');
  const aColor = gl.getAttribLocation(glProg, 'a_color');

  gl.bindBuffer(gl.ARRAY_BUFFER, glPosBuf);
  gl.bufferData(gl.ARRAY_BUFFER, pos, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, glSizeBuf);
  gl.bufferData(gl.ARRAY_BUFFER, size, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(aSize);
  gl.vertexAttribPointer(aSize, 1, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, glColorBuf);
  gl.bufferData(gl.ARRAY_BUFFER, color, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(aColor);
  gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, 0, 0);

  gl.drawArrays(gl.POINTS, 0, size.length);
}

function _drawLines(pos, color, mode, vertsPerShape, shapeCount, alpha = 0.72) {
  gl.useProgram(glLineProg);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

  const aPos = gl.getAttribLocation(glLineProg, 'a_pos');
  const aColor = gl.getAttribLocation(glLineProg, 'a_color');
  const uAlpha = gl.getUniformLocation(glLineProg, 'u_alpha');
  gl.uniform1f(uAlpha, alpha);

  gl.bindBuffer(gl.ARRAY_BUFFER, glLinePosBuf);
  gl.bufferData(gl.ARRAY_BUFFER, pos, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, glLineColorBuf);
  gl.bufferData(gl.ARRAY_BUFFER, color, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(aColor);
  gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, 0, 0);

  for (let i = 0; i < shapeCount; i++) {
    gl.drawArrays(mode, i * vertsPerShape, vertsPerShape);
  }
}

function _drawRadialBeams(pos, color, vertsPerBeam, beamCount, alpha = 0.28) {
  gl.useProgram(glLineProg);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

  const aPos = gl.getAttribLocation(glLineProg, 'a_pos');
  const aColor = gl.getAttribLocation(glLineProg, 'a_color');
  const uAlpha = gl.getUniformLocation(glLineProg, 'u_alpha');
  gl.uniform1f(uAlpha, alpha);

  gl.bindBuffer(gl.ARRAY_BUFFER, glLinePosBuf);
  gl.bufferData(gl.ARRAY_BUFFER, pos, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, glLineColorBuf);
  gl.bufferData(gl.ARRAY_BUFFER, color, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(aColor);
  gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, 0, 0);

  for (let i = 0; i < beamCount; i++) {
    gl.drawArrays(gl.LINE_STRIP, i * vertsPerBeam, vertsPerBeam);
  }
}

function _drawPolylineSeries(pos, color, counts, alpha = 0.2) {
  gl.useProgram(glLineProg);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

  const aPos = gl.getAttribLocation(glLineProg, 'a_pos');
  const aColor = gl.getAttribLocation(glLineProg, 'a_color');
  const uAlpha = gl.getUniformLocation(glLineProg, 'u_alpha');
  gl.uniform1f(uAlpha, alpha);

  gl.bindBuffer(gl.ARRAY_BUFFER, glLinePosBuf);
  gl.bufferData(gl.ARRAY_BUFFER, pos, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, glLineColorBuf);
  gl.bufferData(gl.ARRAY_BUFFER, color, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(aColor);
  gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, 0, 0);

  let offset = 0;
  for (let i = 0; i < counts.length; i++) {
    const verts = counts[i];
    if (verts >= 2) gl.drawArrays(gl.LINE_STRIP, offset, verts);
    offset += verts;
  }
}

function _hexToRGBNorm(hex) {
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  ];
}

function _mixRGB(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}
