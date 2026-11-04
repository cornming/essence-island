/* 精油島 · 在線感
 * 看到其他夥伴的匿名小人在島上的道路走動，並顯示「現在有 N 位夥伴在線」。
 *
 * 隱私：只傳「暱稱、島上位置、時間」，不傳會員編號，也不傳學習進度。每個分頁有自己隨機的臨時 id。
 * 傳輸層（依設定自動選）：
 *   - firebase：config.presence.firebaseUrl 有填時，用 Firebase Realtime Database 的 REST API（不需要 SDK）。
 *   - local：沒設定時，用 BroadcastChannel，只能看到「同一個瀏覽器的其他分頁」，用來示範與測試。
 * 別人傳來的資料一律當作不可信：檢查格式、截斷長度、限制座標範圍，畫面上只用 canvas 文字與 textContent。 */
(function (global) {
  'use strict';

  const ID_RE = /^[a-z0-9]{6,12}$/;
  const MSG_RE = /^[epf]:./; // 聊天訊息代碼：e:表情 id / p:短語 id / f:自由輸入的文字（只有 e、p 的 id 對得上自己的設定才會顯示）
  const cleanText = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>&"'`\\]/g, '').trim().slice(0, max);
  const clean = (s) => cleanText(s, 10);
  const num = (v, lo, hi) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null);
  const rid = () => { let s = ''; while (s.length < 8) s += Math.random().toString(36).slice(2); return s.slice(0, 8); };

  const self = { id: rid(), n: '', x: 0, y: 0, c: '', k: 0 }; // c：剛說的話（約 8 秒後清掉），k：第幾句（讓同一句重複說也看得出來）
  const peers = new Map(); // id → { id, n, x, y, ox, oy, t, seenAt, firstSeen, moving, k, msg: { c, at } | null, msgAt }
  let sayTimer = null;
  let cfg = {}, dims = { cols: 14, rows: 14 }, tp = null, mode = 'off', visible = false, started = false;
  let lastSent = { x: -99, y: -99, at: 0 }, tickAt = 0, hiddenStop = false;
  const COLORS = [['#6b4a2b', '#e8836b'], ['#2f2a3b', '#7fb7e6'], ['#c79a4b', '#9bd48a'], ['#3d2b1f', '#f0c05a'], ['#8a5a44', '#b79be0'], ['#1f3b4d', '#f29bb5']];

  const staleMs = () => (mode === 'firebase' ? 28000 : 10000);
  const gapMs = () => (mode === 'firebase' ? 1800 : 300);
  const beatMs = () => (mode === 'firebase' ? 8000 : 4000);

  // 收到一筆別人的資料：驗證後更新；不合格就丟掉
  const MSG_GAP = 1500; // 同一個人兩句話至少隔這麼久（毫秒），更快的當作洗版丟掉
  function ingest(id, d, now, ageMs) {
    if (!ID_RE.test(id) || id === self.id || !d || typeof d !== 'object') return;
    const x = num(d.x, 0, dims.cols), y = num(d.y, 0, dims.rows), t = typeof d.t === 'number' ? d.t : null;
    if (x == null || y == null || t == null) return;
    const code = typeof d.c === 'string' && d.c.length <= 40 && MSG_RE.test(d.c) ? d.c : '', k = num(d.k, 0, 1000000);
    const e = peers.get(id);
    if (!e) {
      if (peers.size >= 60) return; // 上限，避免被灌爆
      const c = COLORS[parseInt(id.slice(0, 2), 36) % COLORS.length];
      // 剛加入時，只有「剛剛才說的」那句才顯示；資料庫裡留著的舊話不理它
      const first = !!code && k != null && (ageMs || 0) <= 6000;
      peers.set(id, { id, n: clean(d.n) || '夥伴', x, y, ox: x, oy: y, t, seenAt: now, firstSeen: now, moving: false, hair: c[0], shirt: c[1], k, msg: first ? { c: code, at: now } : null, msgAt: first ? now : -Infinity });
      return;
    }
    e.n = clean(d.n) || e.n; e.x = x; e.y = y;
    if (t !== e.t) { e.t = t; e.seenAt = now; }
    if (code && k != null && k !== e.k && now - e.msgAt >= MSG_GAP) { e.msg = { c: code, at: now }; e.msgAt = now; }
    e.k = k;
  }

  /* ---------- 傳輸層：同一個瀏覽器的分頁 ---------- */
  function localTransport(room) {
    const ch = new BroadcastChannel('essence-island:presence:' + room);
    const msg = (type) => Object.assign({ type, id: self.id, n: self.n, x: self.x, y: self.y, t: Date.now() }, self.c ? { c: self.c, k: self.k } : {});
    ch.onmessage = (e) => {
      const m = e.data; if (!m || typeof m !== 'object' || typeof m.id !== 'string') return;
      if (m.type === 'bye') peers.delete(m.id);
      else if (m.type === 'pos' || m.type === 'hi') { ingest(m.id, m, performance.now(), 0); if (m.type === 'hi') ch.postMessage(msg('pos')); }
    };
    return {
      start() { ch.postMessage(msg('hi')); },
      push() { ch.postMessage(msg('pos')); },
      stop() { try { ch.postMessage({ type: 'bye', id: self.id }); } catch (e) { /* ignore */ } ch.close(); },
    };
  }

  /* ---------- 傳輸層：Firebase Realtime Database（REST） ---------- */
  // 誰在線上，看的是紀錄裡「伺服器時間」的 t 有多舊，不是「我什麼時候第一次看到它」：
  // 對方沒來得及登出（關機、斷網）時，資料庫裡的紀錄會一直留著，第一次看到就算在線的話，這些殭屍紀錄會永遠被算進去。
  // 伺服器時間 ≈ 本機時間 + 偏移；偏移從自己每次 PUT 的回應（伺服器填好的 t）推算，所以不用信任本機時鐘。
  const REAP_MS = 300000; // 紀錄超過 5 分鐘沒更新：不是在線，順手從資料庫刪掉
  function firebaseTransport(base, room) {
    const url = (id) => base.replace(/\/+$/, '') + '/essence-island/presence/' + encodeURIComponent(room) + (id ? '/' + id : '') + '.json';
    let timer = null, busy = false, off = 0, synced = false;
    const t0 = performance.now(), reaped = new Set();
    const del = (id) => fetch(url(id), { method: 'DELETE' }).catch(() => {});
    const poll = () => {
      if (busy) return;
      if (!synced && performance.now() - t0 < 6000) return; // 還不知道伺服器時間：先等自己的第一次寫入回來（最多 6 秒，之後用本機時鐘）
      busy = true;
      fetch(url(), { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then((d) => { // 伺服器出錯時保持原樣，不要讓人全部「離線」
        busy = false;
        const now = performance.now(), sNow = Date.now() + off, ids = new Set();
        let nDel = 0;
        if (d && typeof d === 'object') {
          Object.keys(d).forEach((id) => {
            const v = d[id], age = v && typeof v.t === 'number' ? sNow - v.t : 0;
            if (age > REAP_MS && ID_RE.test(id) && id !== self.id && !reaped.has(id) && nDel < 5) { // 每次最多清 5 筆，慢慢來
              nDel++; if (reaped.size > 500) reaped.clear(); reaped.add(id); del(id);
            }
            if (age > staleMs()) return; // 太久沒更新 → 不算在線
            ids.add(id); ingest(id, v, now, age);
          });
        } else if (d !== null) return;
        peers.forEach((_, id) => { if (!ids.has(id)) peers.delete(id); }); // 資料庫裡已經沒有、或已經過期 → 離線
      }).catch(() => { busy = false; });
    };
    return {
      start() { poll(); timer = setInterval(poll, 3000); },
      push() {
        const sent = Date.now();
        const body = { n: self.n, x: Math.round(self.x * 100) / 100, y: Math.round(self.y * 100) / 100, t: { '.sv': 'timestamp' } };
        if (self.c) { body.c = self.c; body.k = self.k; }
        fetch(url(self.id), { method: 'PUT', body: JSON.stringify(body) })
          .then((r) => (r.ok ? r.json() : null)).then((b) => {
            if (!b || typeof b.t !== 'number') return;
            off = b.t - (sent + Date.now()) / 2; // 假設請求與回應花的時間一樣長
            if (!synced) { synced = true; poll(); }
          }).catch(() => {});
      },
      stop() { clearInterval(timer); fetch(url(self.id), { method: 'DELETE', keepalive: true }).catch(() => {}); },
    };
  }

  /* ---------- 啟停 ---------- */
  function begin() {
    if (started || !visible || !cfg.enabled || hiddenStop) return;
    try {
      if (cfg.firebaseUrl && /^https:\/\//.test(cfg.firebaseUrl)) { tp = firebaseTransport(cfg.firebaseUrl, cfg.room || 'main'); mode = 'firebase'; }
      else if (typeof BroadcastChannel === 'function') { tp = localTransport(cfg.room || 'main'); mode = 'local'; }
      else return;
    } catch (e) { tp = null; mode = 'off'; return; }
    started = true; lastSent = { x: -99, y: -99, at: 0 };
    tp.start(); tp.push(); lastSent = { x: self.x, y: self.y, at: performance.now() };
  }
  function end() {
    if (!started) return;
    started = false;
    try { tp.stop(); } catch (e) { /* ignore */ }
    tp = null; peers.clear();
    clearTimeout(sayTimer); self.c = '';
  }

  function init(opts) {
    cfg = Object.assign({ enabled: true, firebaseUrl: '', room: 'main' }, opts.config || {});
    dims = opts.dims || dims;
    self.n = clean(opts.nick) || '夥伴'; self.x = opts.x || 0; self.y = opts.y || 0;
    visible = opts.visible !== false;
    document.addEventListener('visibilitychange', () => { // 分頁在背景就先離線，回來再接上（省電、也不佔名額）
      if (document.hidden) { hiddenStop = true; end(); } else { hiddenStop = false; begin(); }
    });
    addEventListener('pagehide', end);
    begin();
  }

  function setVisible(v) { visible = !!v; if (visible) begin(); else end(); }

  // 說一句話：立刻送出一次（之後每次心跳都會帶著，約 8 秒後清掉，對方靠 k 判斷是不是新的一句）
  function say(code) {
    if (!started || typeof code !== 'string' || code.length > 40 || !MSG_RE.test(code)) return false;
    self.c = code; self.k = (self.k + 1) % 1000000;
    clearTimeout(sayTimer);
    sayTimer = setTimeout(() => { self.c = ''; if (started) { tp.push(); lastSent = { x: self.x, y: self.y, at: performance.now() }; } }, 8000); // 8 秒後把這句從資料庫裡拿掉
    tp.push(); lastSent = { x: self.x, y: self.y, at: performance.now() };
    return true;
  }
  function setNick(n) { self.n = clean(n) || '夥伴'; if (started) { tp.push(); lastSent.at = performance.now(); } }

  // 每幀呼叫：自己的位置、平滑別人的位置、定期送出與清理
  function update(dt, x, y) {
    self.x = x; self.y = y;
    const now = performance.now();
    peers.forEach((p) => {
      const dx = p.x - p.ox, dy = p.y - p.oy, d = Math.hypot(dx, dy);
      if (d > 4) { p.ox = p.x; p.oy = p.y; p.moving = false; return; } // 離太遠（剛進來或換了位置）直接過去
      const k = 1 - Math.exp(-dt * 3.2);
      p.ox += dx * k; p.oy += dy * k; p.moving = d > 0.06;
    });
    if (!started) return;
    const moved = Math.hypot(self.x - lastSent.x, self.y - lastSent.y) > 0.2;
    if ((moved && now - lastSent.at > gapMs()) || now - lastSent.at > beatMs()) { tp.push(); lastSent = { x: self.x, y: self.y, at: now }; }
    if (now - tickAt > 2000) {
      tickAt = now;
      peers.forEach((p, id) => { // 太久沒更新 → 離線
        if (now - p.seenAt > staleMs()) peers.delete(id);
      });
    }
  }

  global.Presence = {
    init, update, setVisible, setNick, say,
    peers: () => Array.from(peers.values()),
    count: () => (started ? peers.size + 1 : 0),
    names: () => Array.from(peers.values()).map((p) => p.n),
    mode: () => (started ? mode : 'off'),
    isOn: () => started,
    clean, cleanText, selfId: () => self.id,
  };
})(window);
