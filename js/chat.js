/* 精油島 · 在線名單與聊天
 * 點左上角的「N 位夥伴在線」會展開面板：看誰在線（只有暱稱）、送出表情或短語、（自己打開後）自由輸入一句話。
 * 說的話會變成小人頭上的泡泡，約 6 秒後消失，不留紀錄、也不寫進任何存檔。
 *
 * 安全：
 *   - 表情與短語在線路上只傳 id（e:wave、p:hi），對方畫面上顯示的是「他自己設定檔裡的文字」，所以沒辦法被改成別的話。
 *   - 自由輸入預設關閉；打開的人才能送、也才看得到別人的。送出與接收都會擋連結、帳號、電話，以及 blockWords 裡的字。
 *   - 別人傳來的字只用 canvas 畫與 textContent 顯示，不會變成 HTML。
 *   - 可以把某位夥伴靜音（只在你這邊，不會通知對方）。
 *   - 公開的資料庫沒有登入，擋不住有心人直接寫入；規則只限制長度與格式（見 docs/presence-rules.json）。 */
(function (global) {
  'use strict';

  const URL_RE = /https?:|www\.|[a-z0-9-]+\.(com|tw|net|org|io|cc|me|co|app|link|ly)\b|\bline\b|@\w{3,}/i;
  const FLAT_RE = /[\s·.。,，、_\-]/g; // 把空白與常見分隔符去掉再比對：擋「0912-345-678」「收 入」這種拆開寫的

  let cfg = null, ui = null, free = () => false, ready = false, open = false, sig = '';
  const muted = new Set(); // 只存在這次開啟頁面期間（暫時 id 每次都會變，記下來也沒用）
  let lastSend = -Infinity, mine = null, coolTimer = null, emoteBy = {}, phraseBy = {};

  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  // 一句自由輸入能不能用（送出前、收到後都用同一套）
  function check(text) {
    if (!text) return { ok: false, why: '還沒有內容' };
    const flat = text.replace(FLAT_RE, '');
    if (URL_RE.test(text) || /\d{8,}/.test(flat)) return { ok: false, why: '不能放連結、帳號或電話' };
    if (cfg.blockWords.some((w) => flat.indexOf(w) >= 0)) return { ok: false, why: '訊息不能提到收入、獎金或功效（團隊規範）' };
    return { ok: true };
  }

  // 線路上的代碼 → 要顯示的內容；對不上、不被允許的一律回 null
  function decode(code) {
    if (typeof code !== 'string' || code.length < 3 || code.charAt(1) !== ':') return null;
    const kind = code.charAt(0), body = code.slice(2);
    if (kind === 'e') { const e = emoteBy[body]; return e ? { kind: 'emote', text: e.e } : null; }
    if (kind === 'p') { const p = phraseBy[body]; return p ? { kind: 'phrase', text: p.t } : null; }
    if (kind === 'f') {
      if (!free()) return null;
      const t = global.Presence.cleanText(body, cfg.freeMax);
      return t && check(t).ok ? { kind: 'free', text: t } : null;
    }
    return null;
  }

  // 別人頭上現在該不該有泡泡：回傳 { text, kind, left（還剩幾毫秒） } 或 null
  function say(p) {
    const m = p && p.msg;
    if (!m || muted.has(p.id)) return null;
    const left = cfg.bubbleMs - (performance.now() - m.at);
    if (left <= 0) return null;
    if (m.free !== free()) { m.dec = decode(m.c); m.free = free(); } // 解碼結果存起來，設定改變時才重算
    return m.dec ? { text: m.dec.text, kind: m.dec.kind, left } : null;
  }
  function self() {
    if (!mine) return null;
    const left = cfg.bubbleMs - (performance.now() - mine.at);
    if (left <= 0) { mine = null; return null; }
    return { text: mine.text, kind: mine.kind, left };
  }

  function send(code) {
    const dec = decode(code);
    if (!dec) return false;
    const now = performance.now();
    if (now - lastSend < cfg.gapMs) return false;
    if (!global.Presence.say(code)) return false;
    lastSend = now; mine = { text: dec.text, kind: dec.kind, at: now };
    ui.panel.classList.add('is-cool'); clearTimeout(coolTimer);
    coolTimer = setTimeout(() => ui.panel.classList.remove('is-cool'), cfg.gapMs);
    if (global.Sound && global.Sound.sfx) global.Sound.sfx('click');
    return true;
  }

  /* ---------- 面板 ---------- */
  function build() {
    const p = ui.panel;
    p.textContent = '';
    const head = el('div', 'op-head'); head.appendChild(el('b', 'op-title', '在線的夥伴'));
    const x = el('button', 'op-x', '✕'); x.type = 'button'; x.setAttribute('aria-label', '關閉'); x.dataset.op = 'close'; head.appendChild(x);
    const list = el('ul', 'op-list'); list.id = 'opList';
    const chat = el('div', 'op-chat');
    const emo = el('div', 'op-emotes');
    cfg.emotes.forEach((e) => { const b = el('button', 'op-emote', e.e); b.type = 'button'; b.dataset.send = 'e:' + e.id; b.setAttribute('aria-label', '送出表情 ' + e.e); emo.appendChild(b); });
    const ph = el('div', 'op-phrases');
    cfg.phrases.forEach((s) => { const b = el('button', 'op-phrase', s.t); b.type = 'button'; b.dataset.send = 'p:' + s.id; ph.appendChild(b); });
    const form = el('form', 'op-free'); form.autocomplete = 'off';
    const inp = el('input'); inp.type = 'text'; inp.id = 'opInput'; inp.maxLength = cfg.freeMax; inp.placeholder = '打一句話（' + cfg.freeMax + ' 字內）'; inp.setAttribute('aria-label', '自由輸入聊天'); inp.enterKeyHint = 'send';
    const go = el('button', 'btn btn-primary', '送出'); go.type = 'submit';
    form.appendChild(inp); form.appendChild(go);
    const err = el('p', 'op-err'); err.id = 'opErr'; err.setAttribute('role', 'alert');
    const note = el('p', 'op-note'); note.id = 'opNote';
    chat.appendChild(emo); chat.appendChild(ph); chat.appendChild(form); chat.appendChild(err); chat.appendChild(note);
    p.appendChild(head); p.appendChild(list); p.appendChild(chat);
    ui.list = list; ui.form = form; ui.input = inp; ui.err = err; ui.note = note; ui.title = head.firstChild; ui.chat = chat;
  }

  function render(force) {
    if (!ui || !open) return;
    const P = global.Presence, on = P.isOn(), me = ui.nick(), ps = P.peers().slice().sort((a, b) => (a.n < b.n ? -1 : a.n > b.n ? 1 : a.id < b.id ? -1 : 1));
    const key = [on, free(), me, ps.map((q) => q.id + ':' + q.n + ':' + (muted.has(q.id) ? 1 : 0)).join('|')].join('#');
    if (!force && key === sig) return;
    sig = key;
    ui.title.textContent = '在線的夥伴（' + P.count() + '）';
    ui.list.textContent = '';
    const row = (name, isMe, q) => {
      const li = el('li', 'op-row' + (muted.has(q && q.id) ? ' is-muted' : ''));
      li.appendChild(el('span', 'op-dot', '●'));
      li.appendChild(el('span', 'op-name', name + (isMe ? '（我）' : '')));
      if (!isMe) {
        const b = el('button', 'op-mute', muted.has(q.id) ? '🔇' : '🔈'); b.type = 'button'; b.dataset.mute = q.id;
        b.setAttribute('aria-pressed', muted.has(q.id) ? 'true' : 'false');
        b.setAttribute('aria-label', (muted.has(q.id) ? '取消靜音 ' : '靜音 ') + name); b.title = muted.has(q.id) ? '取消靜音' : '靜音（只在你這邊，對方不會知道）';
        li.appendChild(b);
      }
      ui.list.appendChild(li);
    };
    if (on) row(me, true, null);
    ps.forEach((q) => row(q.n, false, q));
    if (!on) ui.list.appendChild(el('li', 'op-empty', '你目前是隱身狀態。'));
    ui.chat.classList.toggle('is-off', !on);
    ui.chat.querySelectorAll('button, input').forEach((b) => { b.disabled = !on; });
    ui.form.hidden = !free();
    ui.note.textContent = !on ? '到「筆記小屋」打開「讓其他夥伴看到我在線上」，才能聊天。'
      : free() ? '請不要放連結，也不談收入、獎金或功效。想關掉自由輸入，到「筆記小屋」。'
      : '表情與短語大家都看得到。想打字聊天，到「筆記小屋」打開自由輸入。';
  }

  function setOpen(v, focus) {
    if (!ui) return;
    open = !!v;
    ui.panel.hidden = !open; ui.chip.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) { sig = ''; ui.err.textContent = ''; render(true); } else if (focus) ui.chip.focus();
  }

  function init(opts) {
    cfg = Object.assign({ bubbleMs: 6000, gapMs: 2500, freeMax: 30, allowFree: true, emotes: [], phrases: [], blockWords: [] }, opts.config || {});
    emoteBy = {}; cfg.emotes.forEach((e) => { emoteBy[e.id] = e; });
    phraseBy = {}; cfg.phrases.forEach((s) => { phraseBy[s.id] = s; });
    // allowFree: false = 整站關掉自由輸入（不管使用者怎麼設定，輸入框不出現，收到的 f: 訊息也一律不顯示）
    const want = opts.free || (() => false);
    free = () => cfg.allowFree !== false && !!want();
    if (ready) { ui.nick = opts.nick; return; }
    ready = true;
    ui = { panel: opts.panel, chip: opts.chip, nick: opts.nick };
    build();
    ui.panel.hidden = true;
    const toggle = () => setOpen(!open);
    ui.chip.addEventListener('click', toggle);
    ui.chip.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    ui.panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false, true); } });
    ui.panel.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.op === 'close') setOpen(false, true);
      else if (b.dataset.mute) { const id = b.dataset.mute; if (muted.has(id)) muted.delete(id); else muted.add(id); render(true); }
      else if (b.dataset.send) { ui.err.textContent = ''; if (!send(b.dataset.send)) ui.err.textContent = '慢一點～稍等一下再說。'; }
    });
    ui.form.addEventListener('submit', (e) => {
      e.preventDefault();
      const t = global.Presence.cleanText(ui.input.value, cfg.freeMax), r = check(t);
      if (!r.ok) { ui.err.textContent = r.why; return; }
      if (!send('f:' + t)) { ui.err.textContent = '慢一點～稍等一下再說。'; return; }
      ui.err.textContent = ''; ui.input.value = '';
    });
  }

  global.Chat = {
    init, say, self, check, decode,
    refresh: (force) => render(force), // 每 0.5 秒由主迴圈呼叫：面板開著才會重畫
    close: () => setOpen(false),
    isOpen: () => open,
    mute: (id) => muted.add(id), unmute: (id) => muted.delete(id),
  };
})(window);
