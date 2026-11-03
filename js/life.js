/* 精油島 · 島上生活
 * 居民散步與聊天、蝴蝶 / 海鷗 / 跳躍的魚 / 螢火蟲、天氣（晴 / 多雲 / 雨 / 花瓣）、玩家擺放的植物與小動物、夜裡的燈光。
 * 全部用 Canvas 2D 程式繪製，透過 world.js 的 items / over / glow / screen 四個掛勾畫進場景。 */
(function (global) {
  'use strict';

  const EMOJI_FONT = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
  const TEXT_FONT = '"PingFang TC","Microsoft JhengHei",sans-serif';
  const WEATHERS = {
    clear: { icon: '☀️', name: '晴天' }, cloud: { icon: '⛅', name: '多雲' },
    rain: { icon: '🌧️', name: '雨天' }, petal: { icon: '🌸', name: '花瓣飄飄' },
  };
  const ORDER = ['clear', 'cloud', 'rain', 'petal'];
  const BUG_COLORS = ['#f6a6c1', '#ffd166', '#a0d8ef', '#c3a6ff'];

  let D = null, hook = {}, rnd = Math.random;
  let roads = [], grass = [], npcs = [], bugs = [], gulls = [], fish = [], flies = [], clouds = [], rain = [], petals = [];
  let night = 0;
  const wx = { kind: 'clear', until: 0 };
  const pops = new Map();   // 小動物被摸時的跳動 { "x,y": 開始時間 }
  const born = new Map();   // 剛放下的東西的彈出動畫 { "x,y": 開始時間 }
  const iso = (x, y, z) => World.iso(x, y, z);
  const ctx = () => World.ctx();

  function circle(c, x, y, r, fill) { c.beginPath(); c.arc(x, y, r, 0, 7); c.fillStyle = fill; c.fill(); }
  function shadow(c, x, y, rx, ry) { c.fillStyle = 'rgba(0,0,0,.2)'; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, 7); c.fill(); }

  // 小貼圖快取：光暈與雲都是半透明大圓，每幀重畫很貴
  const sprites = {};
  function glowSprite(rgb, r) {
    const key = 'g' + rgb + r;
    if (!sprites[key]) {
      const c = document.createElement('canvas'); c.width = c.height = Math.ceil(r * 2);
      const g = c.getContext('2d'), gr = g.createRadialGradient(r, r, 0, r, r, r);
      gr.addColorStop(0, 'rgba(' + rgb + ',1)'); gr.addColorStop(1, 'rgba(' + rgb + ',0)');
      g.fillStyle = gr; g.fillRect(0, 0, r * 2, r * 2);
      sprites[key] = c;
    }
    return sprites[key];
  }
  function cloudSprite(s, col, a) { // s：以裝置像素計的大小；回傳以雲心為 (cx, cy) 的貼圖
    const key = 'c' + Math.round(s) + col + a;
    if (!sprites[key]) {
      const w = Math.ceil(s * 3), h = Math.ceil(s * 1.9), cx = s * 1.5, cy = s * 1.1;
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d');
      [[0, 0, 1], [-0.8, 0.2, 0.75], [0.85, 0.15, 0.8], [0.2, -0.45, 0.7]].forEach(([dx, dy, r]) => circle(g, cx + dx * s, cy + dy * s, r * s * 0.75, 'rgba(' + col + ',' + a + ')'));
      sprites[key] = { c, cx, cy };
    }
    return sprites[key];
  }

  /* ---------- 初始化 ---------- */
  function init(data, h) {
    D = data; hook = h || {};
    const sz = World.size();
    roads = []; grass = [];
    for (let y = 0; y < sz.rows; y++) for (let x = 0; x < sz.cols; x++) {
      const t = World.tileAt(x, y);
      if (t === 'p') roads.push({ x, y });
      if (t === 'g') grass.push({ x, y });
    }
    npcs = (D.villagers || []).map((v, i) => ({ id: v.id, name: v.name, role: v.role, hair: v.hair, shirt: v.shirt, fx: v.start.x, fy: v.start.y, path: [], pi: 0, wait: 1 + i * 1.7, say: null, moving: false, lastSaid: -1 }));
    bugs = BUG_COLORS.map((col, i) => { const g = grass[(i * 17 + 5) % grass.length]; return { x: g.x + .5, y: g.y + .5, tx: g.x + .5, ty: g.y + .5, ph: i * 2.1, col, wait: i }; });
    gulls = [0, 0.5].map((o, i) => ({ off: o, lane: i }));
    fish = [0, 1, 2].map((i) => ({ wait: 1 + i * 2.5, x: 0, y: 0, u: -1 }));
    flies = Array.from({ length: 14 }, (_, i) => { const g = grass[(i * 7 + 3) % grass.length]; return { x: g.x + .5, y: g.y + .5, ph: i * 1.3 }; });
    clouds = Array.from({ length: 6 }, (_, i) => ({ x: i / 6 + 0.05, y: 0.08 + ((i * 37) % 60) / 100, s: 0.7 + (i % 3) * 0.35, v: 0.004 + (i % 4) * 0.0015 }));
    rain = Array.from({ length: 170 }, (_, i) => ({ x: ((i * 61) % 100) / 100, y: ((i * 37) % 100) / 100, v: 0.9 + (i % 5) * 0.12 }));
    petals = Array.from({ length: 36 }, (_, i) => ({ x: ((i * 53) % 100) / 100, y: ((i * 29) % 100) / 100, v: 0.35 + (i % 4) * 0.1, ph: i * 1.7 }));
    wx.kind = 'clear'; wx.until = 90 + rnd() * 60;
  }

  /* ---------- 天氣 ---------- */
  function setWeather(kind, t) { if (WEATHERS[kind]) { wx.kind = kind; wx.until = (t || 0) + 90 + rnd() * 90; } }
  function cycleWeather(t) { setWeather(ORDER[(ORDER.indexOf(wx.kind) + 1) % ORDER.length], t); return wx.kind; }
  function rollWeather(t) {
    const r = rnd();
    wx.kind = r < 0.5 ? 'clear' : r < 0.72 ? 'cloud' : r < 0.9 ? 'rain' : 'petal';
    wx.until = t + 90 + rnd() * 90;
  }

  /* ---------- 更新 ---------- */
  function pickTarget(from) {
    for (let k = 0; k < 6; k++) {
      const r = roads[Math.floor(rnd() * roads.length)];
      if (r.x !== from.x || r.y !== from.y) return r;
    }
    return from;
  }

  function update(dt, t, nightAlpha) {
    night = nightAlpha || 0;
    if (t > wx.until && !wx.locked) rollWeather(t);

    npcs.forEach((n) => {
      if (n.say && t > n.say.until) n.say = null;
      if (n.path.length && n.pi < n.path.length) {
        if (n.say) { n.moving = false; return; } // 說話時停下來
        const to = n.path[n.pi], dx = to.x - n.fx, dy = to.y - n.fy, d = Math.hypot(dx, dy), s = 1.05 * dt;
        n.moving = true;
        if (d <= s) { n.fx = to.x; n.fy = to.y; n.pi++; } else { n.fx += dx / d * s; n.fy += dy / d * s; }
        if (n.pi >= n.path.length) { n.path = []; n.moving = false; n.wait = 2 + rnd() * 5; }
      } else if ((n.wait -= dt) <= 0) {
        const p = World.findPath({ x: Math.round(n.fx), y: Math.round(n.fy) }, pickTarget({ x: Math.round(n.fx), y: Math.round(n.fy) }));
        if (p.length > 1) { n.path = p; n.pi = 1; } else n.wait = 1;
      }
    });

    bugs.forEach((b) => {
      const dx = b.tx - b.x, dy = b.ty - b.y, d = Math.hypot(dx, dy);
      if (d < 0.08) {
        if ((b.wait -= dt) <= 0) { const g = grass[Math.floor(rnd() * grass.length)]; b.tx = g.x + 0.2 + rnd() * 0.6; b.ty = g.y + 0.2 + rnd() * 0.6; b.wait = rnd() * 2.5; }
      } else { const s = 0.5 * dt; b.x += dx / d * s; b.y += dy / d * s; }
    });

    flies.forEach((f, i) => { f.x += Math.sin(t * 0.7 + f.ph) * 0.12 * dt; f.y += Math.cos(t * 0.55 + f.ph * 1.3) * 0.12 * dt; });

    const sz = World.size();
    fish.forEach((f) => {
      if (f.u >= 0) { f.u += dt / 1.3; if (f.u > 1.6) { f.u = -1; f.wait = 3 + rnd() * 6; } return; }
      if ((f.wait -= dt) <= 0) {
        for (let k = 0; k < 12; k++) {
          const x = -1.5 + rnd() * (sz.cols + 3), y = -1.5 + rnd() * (sz.rows + 3);
          if (World.tileAt(Math.floor(x), Math.floor(y)) === '.') { f.x = x; f.y = y; f.u = 0; break; }
        }
        if (f.u < 0) f.wait = 1;
      }
    });
  }

  /* ---------- 居民與擺設的位置（繪製與點選共用） ---------- */
  function petPos(p, t) {
    const ph = p.x * 7 + p.y * 13, it = hook.item && hook.item(p.id);
    if (!it || it.kind !== 'pet') return { x: p.x + 0.5, y: p.y + 0.55, dir: 1 };
    return { x: p.x + 0.5 + Math.sin(t * 0.45 + ph) * 0.26, y: p.y + 0.55 + Math.cos(t * 0.33 + ph * 1.7) * 0.2, dir: Math.cos(t * 0.45 + ph) > 0 ? 1 : -1 };
  }

  /* ---------- 繪製：擺設 / 居民 / 預覽 ---------- */
  function drawLamp(c, p, on) {
    shadow(c, p.x, p.y, 8, 4);
    c.fillStyle = '#4a4f57'; c.fillRect(p.x - 1.6, p.y - 34, 3.2, 34);
    c.fillStyle = '#3a3f46'; c.fillRect(p.x - 4, p.y - 3, 8, 3);
    c.beginPath(); c.moveTo(p.x - 7, p.y - 34); c.lineTo(p.x + 7, p.y - 34); c.lineTo(p.x + 4.5, p.y - 42); c.lineTo(p.x - 4.5, p.y - 42); c.closePath();
    c.fillStyle = '#4a4f57'; c.fill();
    circle(c, p.x, p.y - 37, 3.4, on ? '#ffe08a' : '#e7e2cc');
  }

  // 剛放下時的彈性縮放：從 0 彈到略大於 1 再回到 1
  const elastic = (age) => (age >= 0.6 ? 1 : age <= 0 ? 0 : 1 - Math.exp(-7 * (age / 0.6)) * Math.cos((age / 0.6) * 15));

  function drawItem(c, it, p, t, alpha, pop, born0) {
    c.save();
    if (alpha != null) c.globalAlpha = alpha;
    const sc = born0 != null ? elastic(t - born0) : 1; // 彈出動畫以腳下為中心
    c.translate(p.x, p.y); c.scale(sc, sc);
    if (p.flip) c.scale(-1, 1); // 擺放時可以翻轉左右
    if (it.id === 'lamp') { drawLamp(c, { x: 0, y: 0 }, night > 0.1); c.restore(); return; }
    shadow(c, 0, 0, it.size * 0.42, it.size * 0.17);
    const pet = it.kind === 'pet';
    const hop = pop ? Math.abs(Math.sin((t - pop) * 11)) * 9 * Math.max(0, 1 - (t - pop) / 0.7) : 0;
    const bob = pet ? Math.abs(Math.sin(t * 3 + p.x)) * 1.2 : 0;
    c.translate(0, -hop - bob);
    if (!pet && it.kind === 'plant' && it.size < 40) c.rotate(Math.sin(t * 1.6 + p.x * 0.1) * 0.05);
    if (pet && p.dir < 0) c.scale(-1, 1);
    const sp = World.emoji(it.emoji, it.size); // emoji 先畫成貼圖，每幀只貼圖（fillText 很貴）
    c.drawImage(sp.img, -sp.w / 2, it.size * 0.12 - sp.by, sp.w, sp.h);
    c.restore();
  }

  function drawNpc(n, t) {
    const c = ctx(), p = iso(n.fx + 0.5, n.fy + 0.5, 0);
    const bob = n.moving ? Math.abs(Math.sin(t * 9 + n.fx)) * 2 : Math.sin(t * 2 + n.fy) * 0.5;
    const step = n.moving ? Math.sin(t * 9 + n.fx) * 3 : 0, y = p.y - bob;
    shadow(c, p.x, p.y, 8, 4);
    c.fillStyle = '#3b4a63';
    c.fillRect(p.x - 4, y - 8, 3, 8 + step * 0.3); c.fillRect(p.x + 1, y - 8, 3, 8 - step * 0.3);
    c.fillStyle = n.shirt; c.beginPath(); if (c.roundRect) c.roundRect(p.x - 6, y - 21, 12, 14, 4); else c.rect(p.x - 6, y - 21, 12, 14); c.fill();
    circle(c, p.x, y - 26, 6, '#f2c9a0');
    c.fillStyle = n.hair; c.beginPath(); c.arc(p.x, y - 27, 6.2, Math.PI, 0); c.fill();
  }

  function drawGhost(g, t) {
    const c = ctx(), it = hook.item && hook.item(g.id);
    const a = iso(g.x, g.y), b = iso(g.x + 1, g.y), d = iso(g.x + 1, g.y + 1), e = iso(g.x, g.y + 1);
    c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.lineTo(d.x, d.y); c.lineTo(e.x, e.y); c.closePath();
    c.fillStyle = g.valid ? 'rgba(80,200,120,.35)' : 'rgba(235,90,70,.35)'; c.fill();
    c.lineWidth = 2; c.strokeStyle = g.valid ? '#3f9a55' : '#d4573a'; c.stroke();
    if (it && !g.tidy) drawItem(c, it, { ...iso(g.x + 0.5, g.y + 0.55, 0), dir: 1, flip: g.flip }, t, 0.7);
  }

  function items(t) {
    const out = [], c = ctx();
    (hook.placed ? hook.placed() : []).forEach((pl) => {
      const it = hook.item(pl.id); if (!it) return;
      const pp = petPos(pl, t), p = iso(pp.x, pp.y, 0);
      const key = pl.x + ',' + pl.y, b0 = born.get(key);
      if (b0 != null && t - b0 > 0.7) born.delete(key);
      out.push({ d: pp.x + pp.y + 1.03, f: () => drawItem(c, it, { x: p.x, y: p.y, dir: pp.dir, flip: !!pl.f && it.kind !== 'pet' }, t, null, pops.get(key), b0) });
    });
    npcs.forEach((n) => out.push({ d: n.fx + n.fy + 1.02, f: () => drawNpc(n, t) }));
    const g = hook.ghost && hook.ghost();
    if (g) out.push({ d: 998, f: () => drawGhost(g, t) });
    return out;
  }

  /* ---------- 繪製：空中與水面（不參與深度排序） ---------- */
  function bubble(c, text, x, y, title) {
    c.font = '600 12px ' + TEXT_FONT; c.textAlign = 'center'; c.textBaseline = 'middle';
    const lines = []; for (let i = 0; i < text.length; i += 13) lines.push(text.slice(i, i + 13));
    const th = title ? 16 : 0;
    const w = Math.max.apply(null, lines.map((l) => c.measureText(l).width).concat(title ? [c.measureText(title).width] : [])) + 18, h = lines.length * 16 + 12 + th, top = y - h - 10;
    c.save(); c.shadowColor = 'rgba(0,0,0,.2)'; c.shadowBlur = 6; c.shadowOffsetY = 2;
    c.fillStyle = '#fff'; c.beginPath(); if (c.roundRect) c.roundRect(x - w / 2, top, w, h, 10); else c.rect(x - w / 2, top, w, h); c.fill();
    c.beginPath(); c.moveTo(x - 5, top + h - 1); c.lineTo(x, top + h + 8); c.lineTo(x + 5, top + h - 1); c.closePath(); c.fill();
    c.restore();
    if (title) { c.fillStyle = '#2b8aa8'; c.font = '700 11px ' + TEXT_FONT; c.fillText(title, x, top + 6 + 8); c.font = '600 12px ' + TEXT_FONT; }
    c.fillStyle = '#1f3b4d'; lines.forEach((l, i) => c.fillText(l, x, top + 6 + 8 + th + i * 16));
  }

  function over(t) {
    const c = ctx();
    // 魚：躍出水面再落下，留下水圈
    fish.forEach((f) => {
      if (f.u < 0) return;
      const p = iso(f.x, f.y, 0);
      const ring = (u, a) => { c.strokeStyle = 'rgba(255,255,255,' + a.toFixed(2) + ')'; c.lineWidth = 1.5; c.beginPath(); c.ellipse(p.x, p.y, 4 + u * 16, 2 + u * 8, 0, 0, 7); c.stroke(); };
      if (f.u <= 1) {
        const h = Math.sin(f.u * Math.PI) * 20, ang = Math.cos(f.u * Math.PI) * 0.9;
        c.save(); c.translate(p.x + (f.u - 0.5) * 16, p.y - h); c.rotate(-ang);
        c.fillStyle = '#e9f2f6'; c.beginPath(); c.ellipse(0, 0, 6, 2.6, 0, 0, 7); c.fill();
        c.beginPath(); c.moveTo(-5, 0); c.lineTo(-10, -3); c.lineTo(-10, 3); c.closePath(); c.fill();
        circle(c, 3, -0.6, 0.7, '#2b4a5a');
        c.restore();
        if (f.u < 0.2) ring(f.u * 5, 0.6 - f.u * 2);
      }
      if (f.u > 0.9) ring((f.u - 0.9) / 0.7, Math.max(0, 0.6 * (1 - (f.u - 0.9) / 0.7)));
    });

    // 蝴蝶
    bugs.forEach((b) => {
      const p = iso(b.x, b.y, 18 + Math.sin(t * 2.6 + b.ph) * 5), fl = Math.abs(Math.sin(t * 13 + b.ph));
      c.fillStyle = b.col;
      c.beginPath(); c.ellipse(p.x - 3.2 * fl - 1, p.y - 1, 3.4 * fl + 0.6, 4, -0.4, 0, 7); c.fill();
      c.beginPath(); c.ellipse(p.x + 3.2 * fl + 1, p.y - 1, 3.4 * fl + 0.6, 4, 0.4, 0, 7); c.fill();
      c.fillStyle = '#4a3425'; c.fillRect(p.x - 0.6, p.y - 4, 1.2, 8);
    });

    // 海鷗：從左上飛到右下
    gulls.forEach((g) => {
      const u = ((t * 0.028 + g.off) % 1), x = -5 + u * 22, y = 1 + g.lane * 5 + u * 6 + Math.sin(u * 9) * 0.5;
      const p = iso(x, y, 96 + Math.sin(t * 1.7 + g.off * 9) * 7), fl = Math.sin(t * 7 + g.off * 5) * 3.5;
      c.strokeStyle = '#ffffff'; c.lineWidth = 2.2; c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(p.x - 10, p.y - 3 + fl); c.quadraticCurveTo(p.x - 4, p.y - 7, p.x, p.y); c.quadraticCurveTo(p.x + 4, p.y - 7, p.x + 10, p.y - 3 + fl); c.stroke();
    });

    // 居民的對話泡泡
    npcs.forEach((n) => {
      if (!n.say) return;
      const p = iso(n.fx + 0.5, n.fy + 0.5, 0);
      bubble(c, n.say.text, p.x, p.y - 36, n.name + ' · ' + n.role);
    });

    // 摸小動物冒出的愛心
    pops.forEach((t0, key) => {
      const age = t - t0; if (age > 1.1) { pops.delete(key); return; }
      const [x, y] = key.split(',').map(Number), p = iso(x + 0.5, y + 0.4, 0);
      c.globalAlpha = Math.max(0, 1 - age / 1.1); c.font = '16px ' + EMOJI_FONT; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('❤️', p.x + Math.sin(age * 6) * 4, p.y - 30 - age * 26); c.globalAlpha = 1;
    });
  }

  /* ---------- 夜裡的燈光（在色調之後畫） ---------- */
  function glow(t, na) {
    const c = ctx(), k = Math.min(1, na / 0.4);
    c.save(); c.globalCompositeOperation = 'lighter';
    (hook.placed ? hook.placed() : []).forEach((pl) => {
      const it = hook.item(pl.id); if (!it || !it.glow) return;
      const p = iso(pl.x + 0.5, pl.y + 0.55, it.id === 'lamp' ? 37 : 16), r = 58;
      c.globalAlpha = (0.6 + Math.sin(t * 2.2 + pl.x) * 0.04) * k;
      c.drawImage(glowSprite('255,214,120', r), p.x - r, p.y - r, r * 2, r * 2);
    });
    // 螢火蟲
    flies.forEach((f, i) => {
      const a = (0.5 + 0.5 * Math.sin(t * 2 + f.ph)) * k, p = iso(f.x + Math.sin(t * 0.6 + f.ph) * 0.3, f.y, 10 + Math.sin(t + f.ph) * 6);
      c.globalAlpha = a; c.drawImage(glowSprite('230,255,150', 7), p.x - 7, p.y - 7, 14, 14);
    });
    c.restore();
  }

  /* ---------- 天氣（螢幕座標） ---------- */
  function screen(t, W, H, dpr) {
    const c = ctx(), k = wx.kind;
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
    const n = k === 'clear' ? 2 : k === 'petal' ? 3 : 6, a = k === 'rain' ? 0.4 : k === 'cloud' ? 0.4 : 0.2;
    clouds.slice(0, n).forEach((cl) => {
      const x = (((cl.x + t * cl.v) % 1.5) - 0.25) * W, y = cl.y * H * 0.6, s = cl.s * 46 * dpr;
      const sp = cloudSprite(s, k === 'rain' ? '170,182,196' : '255,255,255', a);
      c.drawImage(sp.c, x - sp.cx, y - sp.cy);
    });
    if (k === 'rain') {
      c.fillStyle = 'rgba(40,62,92,.14)'; c.fillRect(0, 0, W, H);
      c.strokeStyle = 'rgba(205,225,245,.55)'; c.lineWidth = 1.2 * dpr; c.beginPath();
      rain.forEach((d) => { const y = ((d.y + t * d.v * 0.9) % 1) * H, x = (d.x * W + y * 0.22) % W; c.moveTo(x, y); c.lineTo(x - 3.5 * dpr, y + 15 * dpr); });
      c.stroke();
    } else if (k === 'petal') {
      petals.forEach((d) => {
        const y = ((d.y + t * d.v * 0.08) % 1) * H, x = ((d.x + Math.sin(t * 0.8 + d.ph) * 0.03 + t * 0.01) % 1) * W;
        c.save(); c.translate(x, y); c.rotate(t * 0.9 + d.ph);
        c.fillStyle = 'rgba(250,176,200,.9)'; c.beginPath(); c.ellipse(0, 0, 5 * dpr, 2.6 * dpr, 0, 0, 7); c.fill(); c.restore();
      });
    }
    c.restore();
  }

  /* ---------- 點選 ---------- */
  function pickNpc(w) {
    for (const n of npcs) {
      const p = iso(n.fx + 0.5, n.fy + 0.5, 0);
      if (Math.abs(w.x - p.x) < 13 && w.y > p.y - 40 && w.y < p.y + 8) return n;
    }
    return null;
  }
  function pickPet(w, t) {
    const list = hook.placed ? hook.placed() : [];
    for (let i = list.length - 1; i >= 0; i--) {
      const it = hook.item(list[i].id); if (!it || it.kind !== 'pet') continue;
      const pp = petPos(list[i], t), p = iso(pp.x, pp.y, 0);
      if (Math.abs(w.x - p.x) < 15 && w.y > p.y - 28 && w.y < p.y + 8) return list[i];
    }
    return null;
  }
  function say(n, text, t) { n.say = { text, until: t + 4.5 }; n.moving = false; }
  function pop(pl, t) { pops.set(pl.x + ',' + pl.y, t); }
  function popIn(x, y, t) { born.set(x + ',' + y, t); }
  const scaleAt = (x, y, t) => { const b0 = born.get(x + ',' + y); return b0 == null ? 1 : elastic(t - b0); }; // 目前的彈出縮放（沒有動畫時為 1）

  global.Life = {
    init, update, items, over, glow, screen, pickNpc, pickPet, say, pop, popIn, scaleAt, setWeather, cycleWeather,
    lockWeather(on) { wx.locked = !!on; },
    weather: () => wx.kind, info: (k) => WEATHERS[k || wx.kind], WEATHERS, npcs: () => npcs, night: () => night,
  };
})(window);
