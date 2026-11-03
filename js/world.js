/* 工作島嶼 · 等角渲染層
 * 負責：座標投影、地圖與建築繪製、鏡頭（拖曳 / 縮放）、點選判定、道路尋路。
 * 不含任何遊戲規則，規則在 app.js。全部用 Canvas 2D 程式繪製，沒有外部圖檔。
 */
(function (global) {
  'use strict';

  const TW = 64, TH = 32, SIDE = 12; // 單格寬 / 高 / 土地厚度（px）

  const TILE = {
    g: { top: '#86c46a', alt: '#7dbb62', left: '#a97b4f', right: '#8d6540' },
    s: { top: '#efdca4', alt: '#e8d39a', left: '#cfb87e', right: '#b9a26a' },
    p: { top: '#dccdac', alt: '#d6c6a4', left: '#a97b4f', right: '#8d6540' },
    d: { top: '#b98a56', alt: '#b08250', left: '#7a5733', right: '#654626' },
  };
  const WALKABLE = { p: true, d: true };
  const EMOJI_FONT = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';

  // 貼圖：Kenney 素材每格寬 132、標準厚度格高 99；縮放到 TW 寬，以底邊對齊
  const SPRITE_BASE = 99, K = TW / 132, SPRITE_TOP = 30;
  const imgs = {};
  let tileSrc = {};
  function loadImg(src) {
    if (!src || imgs[src]) return;
    const im = new Image();
    imgs[src] = im; im.src = src;
  }
  const ready = (src) => { const im = src && imgs[src]; return im && im.complete && im.naturalWidth ? im : null; };

  let canvas, ctx, W = 0, H = 0, dpr = 1;
  let map = [], cols = 0, rows = 0;
  let buildings = [], trees = [], palms = [], sparkles = [];
  const cam = { cx: 0, cy: 0, base: 1, z: 1 };

  /* ---------- 投影與小工具 ---------- */
  const iso = (x, y, z) => ({ x: ((x - y) * TW) / 2, y: ((x + y) * TH) / 2 - (z || 0) });
  const up = (p, z) => ({ x: p.x, y: p.y - z });
  const lerp = (a, b, u) => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
  const tileAt = (x, y) => (map[y] && map[y][x]) || '.';
  const isLand = (x, y) => tileAt(x, y) !== '.';

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
    else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
    return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
  }

  function poly(pts, fill, stroke) {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }

  function circle(x, y, r, fill) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = fill; ctx.fill();
  }

  function pill(x, y, w, h, fill) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, h / 2); else ctx.rect(x, y, w, h);
    ctx.fillStyle = fill; ctx.fill();
  }

  // 牆面上的四邊形：P0→P1 為底邊，u 沿底邊 0~1，v 為離地高度
  function faceQuad(P0, P1, u0, u1, v0, v1) {
    const a = lerp(P0, P1, u0), b = lerp(P0, P1, u1);
    return [up(a, v0), up(b, v0), up(b, v1), up(a, v1)];
  }

  // 世界座標的長方體，只畫看得到的三面
  function box(x0, y0, x1, y1, z0, z1, cl, cr, ct) {
    const D0 = iso(x0, y1, z0), C0 = iso(x1, y1, z0), B0 = iso(x1, y0, z0);
    const D1 = iso(x0, y1, z1), C1 = iso(x1, y1, z1), B1 = iso(x1, y0, z1), A1 = iso(x0, y0, z1);
    poly([D0, C0, C1, D1], cl);
    poly([C0, B0, B1, C1], cr);
    if (ct) poly([A1, B1, C1, D1], ct);
  }

  /* ---------- 初始化與鏡頭 ---------- */
  function init(el, data) {
    canvas = el; ctx = canvas.getContext('2d');
    map = data.map; rows = map.length; cols = map[0].length;
    tileSrc = data.tiles || {};
    Object.keys(tileSrc).forEach((k) => loadImg(tileSrc[k]));
    data.buildings.forEach((b) => loadImg(b.sprite));

    buildings = data.buildings.map((b) => {
      const s = b.style, cx = b.x + 0.5, cy = b.y + 0.5;
      const top = s.h + (s.roofType === 'hip' ? s.roofH : 0);
      b._hit = {
        l: iso(cx - s.w / 2, cy + s.d / 2).x - 4,
        r: iso(cx + s.w / 2, cy - s.d / 2).x + 4,
        t: iso(cx, cy, top + 44).y,
        b: iso(cx + s.w / 2, cy + s.d / 2).y + 2,
      };
      return b;
    });
    const blocked = new Set(buildings.map((b) => b.x + ',' + b.y));
    buildings.forEach((b) => { if (b.decor) blocked.add(b.decor.x + ',' + b.decor.y); });

    trees = data.trees.filter(([x, y]) => tileAt(x, y) === 'g' && !blocked.has(x + ',' + y));
    palms = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      if (tileAt(x, y) === 's' && (x * 7 + y * 13) % 5 === 0) palms.push([x, y]);
    }

    sparkles = [];
    for (let i = 0; i < 70; i++) {
      const x = -2 + ((i * 37) % 19) + ((i * 13) % 10) / 10;
      const y = -2 + ((i * 53) % 19) + ((i * 7) % 10) / 10;
      if (!isLand(Math.floor(x), Math.floor(y))) sparkles.push({ x, y, ph: i * 1.7 });
    }

    const c = iso(cols / 2, rows / 2 - 0.5, 20);
    cam.cx = c.x; cam.cy = c.y; cam.z = 1;
    resize();
  }

  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    cam.base = Math.max(0.4, Math.min(1.6, Math.min(W / 800, H / 520)));
  }

  const zoom = () => cam.base * cam.z;

  function toWorld(sx, sy) {
    const z = zoom();
    return { x: (sx - W / 2) / z + cam.cx, y: (sy - H / 2) / z + cam.cy };
  }

  function panBy(dx, dy) { cam.cx -= dx / zoom(); cam.cy -= dy / zoom(); }

  function zoomBy(f, sx, sy) {
    const px = sx == null ? W / 2 : sx, py = sy == null ? H / 2 : sy;
    const before = toWorld(px, py);
    cam.z = Math.max(0.6, Math.min(2.4, cam.z * f));
    const z = zoom();
    cam.cx = before.x - (px - W / 2) / z;
    cam.cy = before.y - (py - H / 2) / z;
  }

  function resetView() {
    const c = iso(cols / 2, rows / 2 - 0.5, 20);
    cam.cx = c.x; cam.cy = c.y; cam.z = 1;
  }

  /* ---------- 點選判定 ---------- */
  function pick(sx, sy) {
    const w = toWorld(sx, sy);
    const list = buildings.slice().sort((a, b) => b.x + b.y - (a.x + a.y));
    for (const b of list) {
      let h = b._hit;
      if (ready(b.sprite)) {
        const A = iso(b.x, b.y);
        h = { l: A.x - 34, r: A.x + 34, t: A.y - 62, b: A.y + 50 };
      }
      if (w.x >= h.l && w.x <= h.r && w.y >= h.t && w.y <= h.b) return b;
    }
    return null;
  }

  /* ---------- 道路尋路（BFS，只走道路與碼頭） ---------- */
  function findPath(a, b) {
    const key = (x, y) => y * cols + x;
    const prev = new Map([[key(a.x, a.y), null]]);
    const q = [a];
    while (q.length) {
      const c = q.shift();
      if (c.x === b.x && c.y === b.y) break;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = c.x + dx, ny = c.y + dy;
        if (!WALKABLE[tileAt(nx, ny)] || prev.has(key(nx, ny))) continue;
        prev.set(key(nx, ny), c); q.push({ x: nx, y: ny });
      }
    }
    const out = [];
    let c = prev.has(key(b.x, b.y)) ? b : null;
    while (c) { out.unshift({ x: c.x, y: c.y }); c = prev.get(key(c.x, c.y)); }
    return out;
  }

  const bubblePos = (b) => {
    const s = b.style;
    const top = ready(b.sprite) ? SPRITE_TOP : s.h + (s.roofType === 'hip' ? s.roofH : 0);
    return iso(b.x + 0.5, b.y + 0.5, top + 26);
  };

  // 把貼圖貼到格子 (x, y)：圖的上頂點對齊格子上頂點，底邊對齊標準厚度格
  function drawImg(img, x, y) {
    const A = iso(x, y), w = img.naturalWidth * K, h = img.naturalHeight * K;
    ctx.drawImage(img, A.x - w / 2, A.y + (SPRITE_BASE - img.naturalHeight) * K, w, h);
  }

  /* ---------- 繪製：地形 ---------- */
  function drawTile(x, y, type) {
    const img = ready(tileSrc[type]);
    if (img) {
      drawImg(img, x, y);
      if (type === 'd') { // 碼頭：在低一階的土色格上畫木板線
        const lo = -(SPRITE_BASE - img.naturalHeight) * K;
        const a = iso(x, y, lo), b = iso(x + 1, y, lo), c = iso(x + 1, y + 1, lo), d = iso(x, y + 1, lo);
        ctx.strokeStyle = 'rgba(80,50,20,.4)'; ctx.lineWidth = 1; ctx.beginPath();
        for (let i = 1; i < 4; i++) {
          const p = lerp(a, d, i / 4), q = lerp(b, c, i / 4);
          ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y);
        }
        ctx.stroke();
      } else if (type === 'g' && (x * 31 + y * 17) % 7 === 0) {
        const f = iso(x + 0.3 + ((x * 3 + y) % 4) * 0.1, y + 0.35 + ((x + y * 5) % 4) * 0.1);
        circle(f.x, f.y, 2.2, (x + y) % 2 ? '#f6a6c1' : '#fff0a8');
        circle(f.x + 5, f.y + 2, 1.6, '#ffffff');
      }
      return;
    }
    const c = TILE[type];
    const A = iso(x, y), B = iso(x + 1, y), C = iso(x + 1, y + 1), D = iso(x, y + 1);
    const depth = type === 'd' ? 8 : SIDE;
    poly([D, C, up(C, -depth), up(D, -depth)], c.left);
    poly([C, B, up(B, -depth), up(C, -depth)], c.right);
    poly([A, B, C, D], (x + y) % 2 ? c.alt : c.top);

    if (type === 'd') {
      ctx.strokeStyle = 'rgba(80,50,20,.35)'; ctx.lineWidth = 1; ctx.beginPath();
      for (let i = 1; i < 4; i++) {
        const a = lerp(A, D, i / 4), b = lerp(B, C, i / 4);
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();
    } else if (type === 'p') {
      poly([A, B, C, D], null, 'rgba(120,95,60,.18)');
    } else if (type === 'g' && (x * 31 + y * 17) % 7 === 0) {
      const f = iso(x + 0.3 + ((x * 3 + y) % 4) * 0.1, y + 0.35 + ((x + y * 5) % 4) * 0.1);
      circle(f.x, f.y, 2.2, (x + y) % 2 ? '#f6a6c1' : '#fff0a8');
      circle(f.x + 5, f.y + 2, 1.6, '#ffffff');
    }
  }

  function drawWater(t) {
    ctx.lineCap = 'round'; ctx.lineWidth = 2;
    for (const s of sparkles) {
      const a = Math.sin(t * 1.2 + s.ph);
      if (a <= 0) continue;
      const p = iso(s.x, s.y, 0);
      ctx.strokeStyle = 'rgba(255,255,255,' + (a * 0.55).toFixed(2) + ')';
      ctx.beginPath(); ctx.moveTo(p.x - 6, p.y); ctx.lineTo(p.x + 6, p.y); ctx.stroke();
    }
    // 岸邊淺水光暈
    const pulse = 0.34 + Math.sin(t * 1.6) * 0.06;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      if (!isLand(x, y)) continue;
      const e = 0.42;
      poly([iso(x - e, y - e, -9), iso(x + 1 + e, y - e, -9), iso(x + 1 + e, y + 1 + e, -9), iso(x - e, y + 1 + e, -9)],
        'rgba(200,244,248,' + pulse.toFixed(2) + ')');
    }
  }

  /* ---------- 繪製：物件 ---------- */
  function drawTree(x, y) {
    const p = iso(x + 0.5, y + 0.55, 0);
    ctx.fillStyle = 'rgba(0,0,0,.18)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y, 13, 6, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#7a5733'; ctx.fillRect(p.x - 2.5, p.y - 16, 5, 16);
    const sway = ((x * 5 + y * 3) % 5) - 2;
    circle(p.x + sway * 0.4, p.y - 28, 13, '#4f9a4a');
    circle(p.x - 8, p.y - 21, 9, '#5aa953');
    circle(p.x + 8, p.y - 22, 9, '#468f44');
    circle(p.x - 3 + sway * 0.4, p.y - 33, 8, '#66b85d');
  }

  // 完成學習站後開出的小花圃
  function drawDecor(d, t) {
    for (let i = 0; i < 10; i++) {
      const ox = 0.16 + ((i * 37 + d.x * 11) % 66) / 100, oy = 0.16 + ((i * 53 + d.y * 7) % 66) / 100;
      const p = iso(d.x + ox, d.y + oy, 0), sw = Math.sin(t * 2 + i + d.x) * 1.5;
      ctx.strokeStyle = '#3f8a45'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + sw, p.y - 9); ctx.stroke();
      circle(p.x + sw, p.y - 10, 3.2, d.color);
      circle(p.x + sw, p.y - 10, 1.2, '#fff6c8');
    }
  }

  function drawPalm(x, y, t) {
    const p = iso(x + 0.5, y + 0.55, 0);
    ctx.fillStyle = 'rgba(0,0,0,.16)';
    ctx.beginPath(); ctx.ellipse(p.x + 4, p.y, 12, 5, 0, 0, 7); ctx.fill();
    const lean = ((x * 3 + y) % 2 ? 1 : -1) * 7;
    const top = { x: p.x + lean, y: p.y - 40 };
    ctx.strokeStyle = '#9a7048'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.quadraticCurveTo(p.x + lean * 1.6, p.y - 22, top.x, top.y); ctx.stroke();
    const sw = Math.sin(t * 1.5 + x) * 2;
    ctx.fillStyle = '#3f9a55';
    [-150, -110, -70, -30, 10, 50].forEach((deg, i) => {
      const a = (deg * Math.PI) / 180, len = 20 + (i % 2) * 4;
      const ex = top.x + Math.cos(a) * len, ey = top.y + Math.sin(a) * len * 0.55 + 6 + sw * 0.5;
      ctx.beginPath(); ctx.moveTo(top.x, top.y);
      ctx.quadraticCurveTo(top.x + Math.cos(a) * len * 0.5, top.y - 8, ex, ey);
      ctx.quadraticCurveTo(top.x + Math.cos(a) * len * 0.5, top.y + 1, top.x, top.y);
      ctx.fill();
    });
    circle(top.x - 2, top.y + 2, 2.4, '#7a5733');
    circle(top.x + 3, top.y + 3, 2.4, '#7a5733');
  }

  function drawBoat(t) {
    const p = iso(10.2, 12.6, 0), bob = Math.sin(t * 1.4) * 2;
    ctx.save(); ctx.translate(p.x, p.y + bob);
    ctx.fillStyle = 'rgba(0,0,0,.14)';
    ctx.beginPath(); ctx.ellipse(0, 4, 22, 6, 0, 0, 7); ctx.fill();
    poly([{ x: -18, y: -6 }, { x: 18, y: -6 }, { x: 12, y: 4 }, { x: -12, y: 4 }], '#c9573f');
    ctx.fillStyle = '#6f4f2f'; ctx.fillRect(-1, -34, 2, 28);
    poly([{ x: 1, y: -33 }, { x: 15, y: -9 }, { x: 1, y: -9 }], '#ffffff');
    poly([{ x: -2, y: -28 }, { x: -12, y: -10 }, { x: -2, y: -10 }], '#f3e6c8');
    ctx.restore();
  }

  function windows(P0, P1, win, h, skipMiddle) {
    const bandLo = h * 0.3, bandHi = h * 0.82;
    const rowH = (bandHi - bandLo) / win.rows;
    for (let r = 0; r < win.rows; r++) {
      for (let i = 0; i < win.cols; i++) {
        const uc = (i + 0.5) / win.cols;
        if (skipMiddle && r === 0 && Math.abs(uc - 0.5) < 0.2) continue;
        const wu = Math.min(0.26, 0.55 / win.cols) / 2;
        const v0 = bandLo + r * rowH + rowH * 0.18, v1 = bandLo + (r + 1) * rowH - rowH * 0.18;
        poly(faceQuad(P0, P1, uc - wu, uc + wu, v0, v1), win.color, 'rgba(255,255,255,.55)');
      }
    }
  }

  function drawBuilding(b, t, st, hover) {
    const sprite = ready(b.sprite);
    if (sprite) {
      ctx.save();
      const f = [];
      if (st.locked) f.push('saturate(.5)', 'brightness(.92)');
      if (hover) f.push('brightness(1.12)');
      if (f.length) ctx.filter = f.join(' ');
      drawImg(sprite, b.x, b.y);
      ctx.restore();
      return;
    }
    const s = b.style, cx = b.x + 0.5, cy = b.y + 0.5, hw = s.w / 2, hd = s.d / 2;
    const x0 = cx - hw, x1 = cx + hw, y0 = cy - hd, y1 = cy + hd, h = s.h;
    const D0 = iso(x0, y1, 0), C0 = iso(x1, y1, 0), B0 = iso(x1, y0, 0);

    // 影子
    ctx.fillStyle = 'rgba(0,0,0,.2)';
    poly([iso(x0 - 0.05, y0 + 0.1), iso(x1 + 0.25, y0 + 0.1), iso(x1 + 0.25, y1 + 0.2), iso(x0 - 0.05, y1 + 0.2)], 'rgba(0,0,0,.16)');

    // 牆身
    const lc = shade(s.wall, -0.06), rc = shade(s.wall, -0.24);
    box(x0, y0, x1, y1, 0, h, lc, rc, s.roofType === 'flat' ? shade(s.roof, 0.04) : null);

    // 門（朝向門口那一面）
    const doorOnRight = b.door.x - b.x === 1;
    const dh = Math.min(h * 0.55, 26);
    if (doorOnRight) poly(faceQuad(C0, B0, 0.38, 0.62, 0, dh), s.door);
    else poly(faceQuad(D0, C0, 0.38, 0.62, 0, dh), s.door);

    // 窗
    if (s.win) {
      windows(D0, C0, s.win, h, !doorOnRight);
      windows(C0, B0, s.win, h, doorOnRight);
    }

    // 遮陽棚（條紋）
    if (s.awning) {
      const v0 = h * 0.48, v1 = h * 0.62, n = 6;
      for (let i = 0; i < n; i++) {
        poly(faceQuad(D0, C0, i / n, (i + 1) / n, v0, v1).map((p) => ({ x: p.x - 3, y: p.y + 2 })),
          s.awning[i % 2]);
      }
    }

    // 屋頂
    if (s.roofType === 'hip') {
      const ov = 0.07;
      const Ao = iso(x0 - ov, y0 - ov, h), Bo = iso(x1 + ov, y0 - ov, h);
      const Co = iso(x1 + ov, y1 + ov, h), Do = iso(x0 - ov, y1 + ov, h);
      const apex = iso(cx, cy, h + s.roofH);
      poly([Ao, Do, apex], shade(s.roof, -0.3));
      poly([Bo, Ao, apex], shade(s.roof, -0.3));
      poly([Do, Co, apex], s.roof, 'rgba(0,0,0,.12)');
      poly([Co, Bo, apex], shade(s.roof, -0.2), 'rgba(0,0,0,.12)');
    } else {
      const A1 = iso(x0, y0, h), B1 = iso(x1, y0, h), C1 = iso(x1, y1, h), D1 = iso(x0, y1, h);
      poly([A1, B1, C1, D1], null, 'rgba(0,0,0,.2)');
      if (s.antenna) {
        const m = iso(cx, cy, h);
        ctx.strokeStyle = '#7b8794'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(m.x, m.y - 24); ctx.stroke();
        circle(m.x, m.y - 25, 2.6, Math.sin(t * 4) > 0 ? '#ef5350' : '#7b8794');
      } else {
        box(cx - 0.12, cy - 0.12, cx + 0.12, cy + 0.12, h, h + 7, shade(s.roof, -0.1), shade(s.roof, -0.28), shade(s.roof, 0.12));
      }
    }

    // 煙囪與煙
    if (s.chimney) {
      box(cx - 0.02, cy - 0.3, cx + 0.12, cy - 0.16, h + 6, h + s.roofH + 6, '#a8553f', '#8d4331', '#c46a52');
      const base = iso(cx + 0.05, cy - 0.23, h + s.roofH + 8);
      for (let i = 0; i < 3; i++) {
        const k = (t * 0.5 + i / 3) % 1;
        ctx.fillStyle = 'rgba(255,255,255,' + (0.55 * (1 - k)).toFixed(2) + ')';
        ctx.beginPath(); ctx.arc(base.x + k * 10 + Math.sin(k * 6) * 2, base.y - k * 26, 3 + k * 4, 0, 7); ctx.fill();
      }
    }

    // 屋外小物
    if (s.extra === 'hay') {
      box(cx + 0.28, cy + 0.3, cx + 0.46, cy + 0.46, 0, 9, '#e6c15a', '#c9a23a', '#f2d777');
    } else if (s.extra === 'crates') {
      box(cx + 0.26, cy + 0.3, cx + 0.42, cy + 0.46, 0, 8, '#b98a56', '#98703f', '#cfa56d');
      box(cx + 0.36, cy + 0.18, cx + 0.5, cy + 0.32, 0, 6, '#c19760', '#9f7746', '#d8b07a');
    } else if (s.extra === 'tables') {
      [[0.32, 0.36], [0.42, 0.12]].forEach(([ox, oy]) => {
        const p = iso(cx + ox, cy + oy, 8);
        ctx.fillStyle = '#6f4f2f'; ctx.fillRect(p.x - 1, p.y, 2, 8);
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(p.x, p.y, 7, 3.5, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#e8604c'; ctx.beginPath(); ctx.ellipse(p.x, p.y - 9, 8, 3, 0, Math.PI, 0); ctx.fill();
      });
    }
  }

  function drawBubble(b, st, t) {
    const p = bubblePos(b);
    const y = p.y + Math.sin(t * 2 + b.x) * 2, r = 15;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.25)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
    circle(p.x, y, r, st.locked ? '#d9dde0' : '#ffffff');
    ctx.restore();
    ctx.lineWidth = 3; ctx.strokeStyle = st.locked ? '#aab4ba' : (st.done ? '#3f9a55' : b.accent);
    ctx.beginPath(); ctx.arc(p.x, y, r, 0, 7); ctx.stroke();
    if (st.progress != null) {
      ctx.strokeStyle = '#ef7b5c'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(p.x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * st.progress); ctx.stroke();
    }
    ctx.font = '16px ' + EMOJI_FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000';
    ctx.fillText(st.locked ? '🔒' : b.emoji, p.x, y + 1);
    if (st.done) {
      circle(p.x + 12, y + 11, 7, '#3f9a55');
      ctx.font = 'bold 10px sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText('✓', p.x + 12, y + 11.5);
    }
    if (st.boost && !st.locked) {
      pill(p.x + 8, y - 26, 30, 15, '#ef7b5c');
      ctx.font = 'bold 10px sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText('×' + st.boost, p.x + 23, y - 18);
    }
    return { x: p.x, y };
  }

  function drawLabel(b, st, p) {
    const text = b.name + (st.locked ? ' · 尚未解鎖' : '');
    ctx.font = '600 13px "PingFang TC","Microsoft JhengHei",sans-serif';
    const w = ctx.measureText(text).width + 20;
    pill(p.x - w / 2, p.y - 48, w, 22, 'rgba(31,59,77,.92)');
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, p.x, p.y - 37);
  }

  function ring(b, color, lw, dash, t) {
    const e = 0.08, x = b.x - e, y = b.y - e, n = 1 + e * 2;
    poly([iso(x, y), iso(x + n, y), iso(x + n, y + n), iso(x, y + n)], null);
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineJoin = 'round';
    ctx.setLineDash(dash ? [8, 6] : []); ctx.lineDashOffset = -t * 18;
    ctx.beginPath();
    [iso(x, y), iso(x + n, y), iso(x + n, y + n), iso(x, y + n)].forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
  }

  function drawSim(sim, mood, t) {
    const p = iso(sim.fx + 0.5, sim.fy + 0.5, 0);
    const bob = sim.moving ? Math.abs(Math.sin(t * 12)) * 2.5 : Math.sin(t * 2) * 0.6;
    const step = sim.moving ? Math.sin(t * 12) * 3 : 0;
    ctx.fillStyle = 'rgba(0,0,0,.24)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y, 8, 4, 0, 0, 7); ctx.fill();
    const y = p.y - bob;
    ctx.fillStyle = '#3b4a63';
    ctx.fillRect(p.x - 4, y - 8, 3, 8 + step * 0.3); ctx.fillRect(p.x + 1, y - 8, 3, 8 - step * 0.3);
    ctx.fillStyle = '#ef7b5c';
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(p.x - 6, y - 21, 12, 14, 4); else ctx.rect(p.x - 6, y - 21, 12, 14); ctx.fill();
    circle(p.x, y - 26, 6, '#f2c9a0');
    ctx.fillStyle = '#4a3425';
    ctx.beginPath(); ctx.arc(p.x, y - 27, 6.2, Math.PI, 0); ctx.fill();
    // 心情菱形：依精力顏色變化
    const col = mood > 50 ? '#5fd068' : mood > 25 ? '#f2c53d' : '#ef5350';
    const my = y - 42 + Math.sin(t * 3) * 2, sx = Math.abs(Math.cos(t * 2)) * 4 + 2;
    poly([{ x: p.x, y: my - 6 }, { x: p.x + sx, y: my }, { x: p.x, y: my + 6 }, { x: p.x - sx, y: my }], col, 'rgba(0,0,0,.25)');
    if (sim.sleeping) {
      ctx.font = 'bold 14px sans-serif'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      ctx.fillText('Z', p.x + 10, y - 48 - (t * 10) % 10);
    }
  }

  /* ---------- 主繪製 ---------- */
  function nightAlpha(minutes) {
    const h = (minutes / 60) % 24;
    if (h >= 7 && h < 18) return 0;
    if (h >= 18 && h < 21) return ((h - 18) / 3) * 0.42;
    if (h >= 5 && h < 7) return ((7 - h) / 2) * 0.42;
    return 0.42;
  }

  function render(t, v) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
    g.addColorStop(0, '#5cbad4'); g.addColorStop(1, '#2f8fb0');
    ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);

    const z = zoom() * dpr;
    ctx.setTransform(z, 0, 0, z, (W / 2 - cam.cx * zoom()) * dpr, (H / 2 - cam.cy * zoom()) * dpr);

    drawWater(t);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const type = tileAt(x, y);
      if (type !== '.') drawTile(x, y, type);
    }

    // 依深度排序後繪製立體物件
    const items = [];
    buildings.forEach((b) => items.push({ d: b.x + b.y + 1, f: () => drawBuilding(b, t, v.status(b), b.id === v.hoverId) }));
    trees.forEach(([x, y]) => items.push({ d: x + y + 1.05, f: () => drawTree(x, y) }));
    palms.forEach(([x, y]) => items.push({ d: x + y + 1.05, f: () => drawPalm(x, y, t) }));
    if (v.sim.visible) items.push({ d: v.sim.fx + v.sim.fy + 1.02, f: () => drawSim(v.sim, v.mood, t) });
    (v.decor || []).forEach((d) => items.push({ d: d.x + d.y + 1.01, f: () => drawDecor(d, t) }));
    items.push({ d: 999, f: () => drawBoat(t) });
    items.sort((a, b) => a.d - b.d);
    items.forEach((it) => it.f());

    // 選取 / 滑過標記（貼在建築腳下，放在物件之後才不會被貼圖蓋住）
    const sel = buildings.find((b) => b.id === v.selectedId);
    const hov = buildings.find((b) => b.id === v.hoverId);
    if (hov && hov !== sel) ring(hov, 'rgba(255,255,255,.9)', 2, false, t);
    if (sel) ring(sel, '#ffd24a', 3, true, t);

    // 氣泡與標籤永遠在最上層
    buildings.forEach((b) => {
      const st = v.status(b);
      const p = drawBubble(b, st, t);
      if (b.id === v.hoverId || b.id === v.selectedId) drawLabel(b, st, p);
    });

    // 飄字
    v.fx.forEach((f) => {
      const age = t - f.born; if (age < 0 || age > 1.8) return;
      ctx.globalAlpha = Math.max(0, 1 - age / 1.8);
      ctx.font = 'bold 18px "PingFang TC","Microsoft JhengHei",sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.strokeText(f.text, f.wx, f.wy - age * 34);
      ctx.fillStyle = f.color; ctx.fillText(f.text, f.wx, f.wy - age * 34);
      ctx.globalAlpha = 1;
    });

    // 日夜色調
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const na = nightAlpha(v.minutes);
    if (na > 0) { ctx.fillStyle = 'rgba(14,24,70,' + na.toFixed(3) + ')'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  }

  global.World = { init, resize, render, pick, findPath, panBy, zoomBy, resetView, bubblePos, iso };
})(window);
