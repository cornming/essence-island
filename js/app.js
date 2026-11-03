/* 精油島 · 遊戲規則與介面
 * 會員編號登入、小人走訪學習站、課程視窗（資訊 / 小測驗 / 清單 / 互動工具）、進度存檔。
 * 渲染交給 world.js，內容在 data.js。 */
(function () {
  'use strict';

  const D = window.ISLAND_DATA, C = D.config;
  const KEY = (id) => 'essence-island:v1:' + id;
  const LAST = 'essence-island:last';
  const SPEED = 2.6; // 小人走路速度（格 / 秒）
  const TITLES = [[0, '精油新芽'], [2, '香氣探險家'], [4, '使用小達人'], [6, '配方職人'], [8, '精油好夥伴']];

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const byId = (id) => D.buildings.find((b) => b.id === id);
  const stations = D.buildings.filter((b) => b.kind === 'station').sort((a, b) => a.order - b.order);
  const oilByName = (n) => D.oils.find((o) => o.name === n);
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const today = () => ymd(new Date());
  const shopById = (id) => D.shop.find((x) => x.id === id);
  const params = new URLSearchParams(location.search); // ?hour=21 &weather=rain：固定時間或天氣（測試、截圖用）

  /* ---------- 存檔 ---------- */
  const fresh = () => ({
    drops: 0, done: {}, days: { n: 0, last: '' }, fav: '', note: '', selectedOnce: false,
    inv: {}, placed: [], ach: {}, best: {}, streak: { n: 0, last: '' },
    daily: { date: '', prog: {}, claimed: {}, bonus: false, played: {}, gameDrops: 0, talked: {} },
    stats: { earned: 0, bought: 0, games: 0, talks: 0 },
  });
  let member = '', S = fresh();

  function load(id) {
    try {
      const raw = localStorage.getItem(KEY(id));
      if (raw) {
        const o = JSON.parse(raw), s = Object.assign(fresh(), o);
        // 舊存檔沒有的欄位補上預設值（巢狀物件逐欄合併）
        ['inv', 'ach', 'best', 'streak', 'daily', 'stats'].forEach((k) => { s[k] = Object.assign(fresh()[k], o[k] || {}); });
        s.placed = Array.isArray(o.placed) ? o.placed.filter((p) => p && shopById(p.id) && Number.isInteger(p.x) && Number.isInteger(p.y)) : [];
        if (!o.stats) s.stats.earned = o.drops || 0;
        return s;
      }
    } catch (e) { /* 私密模式或被封鎖時略過 */ }
    return fresh();
  }
  function save() {
    if (!member) return;
    try { localStorage.setItem(KEY(member), JSON.stringify(S)); } catch (e) { /* ignore */ }
  }

  const doneCount = () => stations.filter((b) => S.done[b.id]).length;
  const unlocked = (b) => b.kind === 'home' || !b.after || !!S.done[b.after];
  const titleOf = () => TITLES.reduce((t, [n, name]) => (doneCount() >= n ? name : t), TITLES[0][1]);

  /* ---------- 水滴、每日任務、徽章 ---------- */
  function earn(n) { S.drops += n; S.stats.earned += n; updateHud(); }
  function spend(n) { S.drops -= n; updateHud(); }

  function rollDaily() {
    const t = today();
    if (S.daily.date !== t) S.daily = { date: t, prog: {}, claimed: {}, bonus: false, played: {}, gameDrops: 0, talked: {} };
  }

  // 任務事件：visit / game / place / talk / buy / checkin / oil
  function track(ev, n) {
    rollDaily();
    S.daily.prog[ev] = (S.daily.prog[ev] || 0) + (n || 1);
    checkAch(); save();
    if (L && L.notes) renderNotes();
  }

  function achCtx() {
    const kind = (p) => (shopById(p.id) || {}).kind;
    const have = new Set(Object.keys(S.inv).filter((k) => S.inv[k] > 0).concat(S.placed.map((p) => p.id)));
    return {
      done: doneCount(), total: stations.length, hour: new Date().getHours(), kinds: have.size,
      plants: S.placed.filter((p) => kind(p) === 'plant').length, pets: S.placed.filter((p) => kind(p) === 'pet').length,
    };
  }

  function checkAch() {
    const all = [];
    for (let got = Quest.evaluate(S, achCtx()); got.length; got = Quest.evaluate(S, achCtx())) { // 賺到水滴可能又解鎖下一個
      got.forEach((a) => { S.ach[a.id] = today(); earn(Quest.ACH_REWARD); all.push(a); });
    }
    if (!all.length) return;
    toast(all.length === 1 ? '🏅 解鎖徽章「' + all[0].name + '」 +' + Quest.ACH_REWARD + ' 💧'
      : '🏅 一次解鎖 ' + all.length + ' 個徽章（' + all.slice(0, 3).map((a) => a.name).join('、') + (all.length > 3 ? '…' : '') + '） +' + all.length * Quest.ACH_REWARD + ' 💧', true);
    Sound.sfx('win'); save();
  }

  // 今天可以領的任務數（用來在筆記小屋旁提醒）
  function claimable() {
    rollDaily();
    const qs = Quest.pick(today());
    const n = qs.filter((q) => (S.daily.prog[q.id] || 0) >= q.need && !S.daily.claimed[q.id]).length;
    return n + (qs.every((q) => S.daily.claimed[q.id]) && !S.daily.bonus ? 1 : 0);
  }

  // 登入時：連續登入天數與登入獎勵
  function dailyLogin() {
    rollDaily();
    const t = today();
    if (S.streak.last === t) return;
    const y = new Date(); y.setDate(y.getDate() - 1);
    S.streak.n = S.streak.last === ymd(y) ? S.streak.n + 1 : 1; S.streak.last = t;
    const bonus = Math.min(S.streak.n, 7);
    earn(bonus);
    setTimeout(() => toast('每日登入 +' + bonus + ' 💧（連續 ' + S.streak.n + ' 天）', true), 900);
  }

  /* ---------- 小人 ---------- */
  const sim = { fx: D.start.x, fy: D.start.y, path: [], pi: 0, moving: false, visible: true, sleeping: false, mode: 'idle', target: null };
  let selectedId = null, hoverId = null, fx = [], now = 0;

  function toast(msg, good) {
    const el = document.createElement('div');
    el.className = 'toast' + (good ? ' is-good' : '');
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), 2800);
  }

  function addFx(b, text, color, dy) {
    const p = World.bubblePos(b);
    fx.push({ wx: p.x, wy: p.y - 20 - (dy || 0), text, color, born: now });
  }

  function visit(b) {
    if (sim.mode !== 'idle') return toast('小人還在路上，等一下～');
    if (!unlocked(b)) return toast('先完成「' + byId(b.after).name + '」才會解鎖');
    const path = World.findPath({ x: Math.round(sim.fx), y: Math.round(sim.fy) }, b.door);
    if (!path.length) return toast('找不到前往的路');
    sim.path = path; sim.pi = 1; sim.target = b;
    if (path.length === 1) return arrive();
    sim.mode = 'walking'; sim.moving = true;
  }

  function arrive() {
    const b = sim.target;
    sim.moving = false; sim.mode = 'idle'; sim.target = null;
    if (b.kind === 'home') openNotes();
    else if (b.kind === 'market') openShop();
    else if (b.kind === 'arcade') openArcade();
    else openLesson(b);
  }

  function update(dt) {
    if (sim.mode !== 'walking') return;
    const to = sim.path[sim.pi];
    const dx = to.x - sim.fx, dy = to.y - sim.fy, dist = Math.hypot(dx, dy), step = SPEED * dt;
    if (dist <= step) {
      sim.fx = to.x; sim.fy = to.y; sim.pi++;
      if (sim.pi >= sim.path.length) arrive();
    } else { sim.fx += (dx / dist) * step; sim.fy += (dy / dist) * step; }
  }

  function statusOf(b) {
    return { locked: !unlocked(b), done: !!S.done[b.id], progress: null, boost: 0 };
  }

  /* ---------- 面板 ---------- */
  const SPECIAL = {
    home: { sub: '進度、任務與徽章', head: '我的進度', go: '走進筆記小屋' },
    market: { sub: '買植物、裝飾、小動物', head: '島嶼生活', go: '逛逛市集' },
    arcade: { sub: '三款精油小遊戲', head: '島嶼生活', go: '去玩遊戲' },
  };

  function stationRow(b) {
    const locked = !unlocked(b), done = !!S.done[b.id], sp = SPECIAL[b.kind];
    const n = b.kind === 'home' ? claimable() : 0;
    const side = sp ? (b.kind === 'home' ? (n ? '🎁 ' + n : '筆記') : '前往') : (done ? '✓ 完成' : (locked ? '🔒' : '+' + C.reward + ' 💧'));
    return '<li><button type="button" class="brow' + (b.id === selectedId ? ' is-selected' : '') + (locked ? ' is-locked' : '') + (done ? ' is-done' : '') +
      '" data-act="select" data-id="' + b.id + '"><span class="brow-ico">' + b.emoji + '</span>' +
      '<span class="brow-main"><b>' + b.name + '</b><small>' + (sp ? sp.sub : '第 ' + b.order + ' 步') + '</small></span>' +
      '<span class="brow-side">' + side + '</span></button></li>';
  }

  function detailHtml(b) {
    if (!b) return '<div class="empty">點選島上的建築，查看這一站要學什麼。</div>';
    const locked = !unlocked(b), done = !!S.done[b.id], sp = SPECIAL[b.kind];
    let btn, extra = '';
    if (sp) btn = '<button type="button" class="btn btn-primary btn-block" data-act="go" data-id="' + b.id + '">' + sp.go + '</button>';
    else if (locked) {
      btn = '<button type="button" class="btn btn-coral btn-block" disabled>尚未解鎖</button>';
      extra = '<p class="lock-note">先完成「' + byId(b.after).name + '」就會解鎖。</p>';
    } else btn = '<button type="button" class="btn btn-coral btn-block" data-act="go" data-id="' + b.id + '">' + (done ? '再複習一次' : '前往學習') + '</button>';
    const learn = b.learn ? '<ul class="learn">' + b.learn.map((t) => '<li>' + t + '</li>').join('') + '</ul>' : '';
    const reward = b.kind === 'station' ? '<span class="reward">' + (done ? '✓ 已完成' : '完成可得 +' + C.reward + ' 💧') + '</span>' : '';
    return '<div class="detail"><div class="detail-head"><div class="detail-ico">' + b.emoji + '</div>' +
      '<div><h2>' + b.name + '</h2><small>' + (sp ? sp.head : '第 ' + b.order + ' 步') + '</small></div></div>' +
      '<p>' + b.summary + '</p>' + learn + reward + '<div style="height:12px"></div>' + btn + extra + '</div>';
  }

  function renderStations() {
    const groups = D.groups.map((g) => {
      const list = g.id === 'life' ? D.buildings.filter((b) => b.group === 'life') : stations.filter((b) => b.group === g.id);
      return '<section class="group"><span class="group-en">' + g.en + '</span><h3 class="group-name">' + g.name + '</h3>' +
        '<ul class="blist">' + list.map(stationRow).join('') + '</ul></section>';
    }).join('');
    $('#pane-stations').innerHTML = detailHtml(byId(selectedId)) +
      '<section class="group"><h3 class="group-name">我的筆記</h3><ul class="blist">' + stationRow(byId('home')) + '</ul></section>' + groups;
  }

  function renderRoute() {
    const next = stations.find((b) => !S.done[b.id]);
    $('#pane-route').innerHTML = '<ol class="steps">' + stations.map((b) => {
      const done = S.done[b.id], cls = done ? ' is-done' : (b === next ? ' is-next' : '');
      return '<li class="step' + cls + '"><span class="step-no">' + pad(b.order) + '</span>' +
        '<div class="step-body"><b>' + b.emoji + ' ' + b.name + '</b><small>' + b.summary + '</small></div>' +
        '<span class="step-reward">' + (done ? '✓ 完成' : '+' + C.reward + ' 💧') + '</span></li>';
    }).join('') + '</ol>';
  }

  function renderSafety() {
    $('#pane-safety').innerHTML = '<ul class="tips">' + D.tips.map((t) => '<li>' + t + '</li>').join('') + '</ul>' +
      '<p class="disclaimer">' + C.disclaimer + '</p>';
  }

  function renderAll() { renderStations(); renderRoute(); renderSafety(); updateHud(true); }

  function showTab(name) {
    $$('.tab').forEach((t) => t.classList.toggle('is-active', t.dataset.tab === name));
    $$('.nav-link').forEach((t) => t.classList.toggle('is-active', t.dataset.go === name));
    ['stations', 'route', 'safety'].forEach((n) => { $('#pane-' + n).hidden = n !== name; });
  }

  function select(id) {
    selectedId = id;
    if (id && !S.selectedOnce) { S.selectedOnce = true; save(); }
    showTab('stations'); renderStations();
  }

  /* ---------- HUD ---------- */
  const hud = {};
  function updateHud(force) {
    const v = {
      drops: String(S.drops), title: titleOf(), days: S.days.n + ' / 30 天',
      prog: (doneCount() / stations.length * 100).toFixed(0) + '%',
    };
    if (force || v.drops !== hud.drops) $('#hudDrops').textContent = v.drops;
    if (force || v.title !== hud.title) $('#hudTitle').textContent = v.title;
    if (force || v.days !== hud.days) $('#hudDays').textContent = v.days;
    if (force || v.prog !== hud.prog) $('#hudProg').style.width = v.prog;
    Object.assign(hud, v);
  }

  /* ---------- 課程視窗 ---------- */
  let L = null; // 目前課程狀態

  function openModal() { $('#modal').hidden = false; document.body.style.overflow = 'hidden'; }
  function closeModal() {
    $('#modal').hidden = true; document.body.style.overflow = ''; $('.modal-card').classList.remove('is-wide');
    $('#mBody').innerHTML = ''; // 清掉內容，遊戲的計時器看到畫面不在了就會停
    L = null;
  }

  function openLesson(b) {
    L = { b, page: 0, quiz: {}, checks: {}, look: { need: '全部', q: '' }, rtab: 0, dtab: 0 };
    openModal(); renderLesson();
    track('visit');
  }

  function pageOk(p, i) {
    if (p.type === 'quiz') return L.quiz[i] === p.answer;
    if (p.type === 'checklist') return (L.checks[i] || []).length === p.items.length;
    if (p.type === 'favorite') return !!S.fav;
    return true;
  }

  function renderLesson() {
    const b = L.b, p = b.pages[L.page], last = L.page === b.pages.length - 1;
    $('#mIco').textContent = b.emoji;
    $('#mTitle').textContent = b.name;
    $('#mSub').textContent = '第 ' + (L.page + 1) + ' / ' + b.pages.length + ' 頁';
    $('#mDots').innerHTML = b.pages.map((_, i) => '<i class="' + (i < L.page ? 'is-done' : i === L.page ? 'is-now' : '') + '"></i>').join('');
    $('#mBody').innerHTML = pageHtml(p);
    $('#mBody').scrollTop = 0;
    if (p.type === 'tool' && p.tool === 'dilution') dilutionCalc();
    const isPlan = p.type === 'tool' && p.tool === 'plan';
    const isStories = p.type === 'tool' && p.tool === 'stories';
    $('.modal-card').classList.toggle('is-wide', isPlan || isStories);
    if (isPlan) Plan.mount($('#planRoot'), member, C.plan);
    if (isStories) Stories.mount($('#storiesRoot'), member, C.stories);
    $('#mPrev').hidden = false; $('#mPrev').disabled = L.page === 0;
    $('#mNext').textContent = last ? (S.done[b.id] ? '完成複習' : '完成學習 +' + C.reward + ' 💧') : '下一步';
    $('#mNext').disabled = !pageOk(p, L.page);
  }

  function pageHtml(p) {
    switch (p.type) {
      case 'info': return infoHtml(p);
      case 'quiz': return quizHtml(p);
      case 'checklist': return checklistHtml(p);
      case 'favorite': return favoriteHtml(p);
      case 'tool': return toolHtml(p.tool);
      default: return '';
    }
  }

  function infoHtml(p) {
    return '<h3 class="lp-title">' + p.title + '</h3>' + (p.lead ? '<p class="lp-lead">' + p.lead + '</p>' : '') +
      '<div class="lp-cards">' + p.items.map((it) => '<div class="lp-card"><span class="ico">' + it.icon + '</span><div><b>' + it.h + '</b><p>' + it.p + '</p></div></div>').join('') + '</div>' +
      (p.tip ? '<p class="lp-tip">💡 ' + p.tip + '</p>' : '');
  }

  function quizHtml(p) {
    const got = L.quiz[L.page];
    const opts = p.options.map((o, i) => {
      const cls = got === i ? (i === p.answer ? ' is-right' : ' is-wrong') : '';
      return '<button type="button" class="opt' + cls + '" data-act="opt" data-i="' + i + '">' + o + '</button>';
    }).join('');
    const fb = got == null ? '' : (got === p.answer
      ? '<p class="feedback is-ok">✅ 答對了！' + p.explain + '</p>'
      : '<p class="feedback is-no">再想想看～可以回頭看看前面的內容。</p>');
    return '<h3 class="lp-title">小測驗</h3><p class="lp-lead">' + p.q + '</p><div class="opts">' + opts + '</div>' + fb;
  }

  function checklistHtml(p) {
    const on = L.checks[L.page] || [];
    return '<h3 class="lp-title">' + p.title + '</h3>' + (p.lead ? '<p class="lp-lead">' + p.lead + '</p>' : '') +
      p.items.map((t, i) => '<label class="check' + (on.indexOf(i) >= 0 ? ' is-on' : '') + '"><input type="checkbox" data-act="chk" data-i="' + i + '"' +
        (on.indexOf(i) >= 0 ? ' checked' : '') + '><span>' + t + '</span></label>').join('');
  }

  function favoriteHtml(p) {
    return '<h3 class="lp-title">' + p.title + '</h3>' + (p.lead ? '<p class="lp-lead">' + p.lead + '</p>' : '') +
      '<div class="oil-grid">' + D.oils.map((o) => '<button type="button" class="oil-pick' + (S.fav === o.id ? ' is-on' : '') + '" data-act="fav" data-id="' + o.id + '">' +
        o.name + '<small>' + o.en + '</small></button>').join('') + '</div>';
  }

  /* --- 工具 --- */
  function toolHtml(t) {
    if (t === 'dilution') return dilutionHtml();
    if (t === 'lookup') return lookupHtml();
    if (t === 'daily30') return daily30Html();
    if (t === 'recipes') return recipesHtml();
    if (t === 'diy') return diyHtml();
    if (t === 'plan') return '<div id="planRoot"></div>';
    if (t === 'stories') return '<div id="storiesRoot"></div>';
    return '';
  }

  function dilutionHtml() {
    return '<div class="tool"><h3>稀釋計算器</h3><div class="tool-row">' +
      '<label>瓶子容量<select id="dlMl"><option value="5">5 ml 小滾珠</option><option value="10" selected>10 ml 滾珠瓶</option>' +
      '<option value="30">30 ml 按摩油 / 噴霧</option><option value="50">50 ml</option><option value="100">100 ml 身體油</option></select></label>' +
      '<label>使用情境<select id="dlPct"><option value="0.5">臉部、敏感肌（0.5%）</option><option value="1" selected>身體日常、新手建議（1%）</option>' +
      '<option value="2">局部、短時間使用（2%）</option></select></label></div>' +
      '<div class="result" id="dlOut"></div>' +
      '<p class="note">1 滴約 0.05 ml。懷孕、嬰幼兒或有特殊健康狀況時，請先諮詢專業人員，不要直接套用這張表。</p></div>';
  }

  function dilutionCalc() {
    const ml = +$('#dlMl').value, pct = +$('#dlPct').value;
    const n = Math.max(1, Math.round(ml * 20 * pct / 100)), real = n * 0.05 / ml * 100;
    $('#dlOut').innerHTML = '<b>' + n + '</b> 滴精油<small>加到 ' + ml + ' ml 基底油，約 ' + real.toFixed(1) + '% 濃度</small>';
  }

  function lookupCards() {
    const q = L.look.q.toLowerCase(), need = L.look.need;
    const list = D.oils.filter((o) => (need === '全部' || o.needs.indexOf(need) >= 0) &&
      (!q || (o.name + o.en + o.aroma).toLowerCase().indexOf(q) >= 0));
    if (!list.length) return '<p class="empty-list">找不到符合的精油，換個關鍵字試試。</p>';
    return list.map((o) => '<article class="oil-card"><header><h4>' + o.name + '</h4><small>' + o.en + '</small></header>' +
      '<p>' + o.aroma + '</p><div>' + o.needs.map((n) => '<span class="tag">' + n + '</span>').join('') +
      o.uses.map((u) => '<span class="tag use">' + u + '</span>').join('') + '</div><p class="caution">⚠️ ' + o.note + '</p></article>').join('');
  }

  function lookupHtml() {
    return '<div class="tool"><h3>精油查詢</h3><input type="search" id="lkQ" placeholder="輸入名稱或香氣，例如：薄荷、花香" aria-label="搜尋精油" value="">' +
      '<div class="chips" id="lkChips">' + ['全部'].concat(D.needs).map((n) => '<button type="button" class="chip-btn' + (L.look.need === n ? ' is-on' : '') + '" data-act="need" data-n="' + n + '">' + n + '</button>').join('') + '</div>' +
      '<div id="lkList">' + lookupCards() + '</div><p class="note">' + C.disclaimer + '</p></div>';
  }

  function daily30Html() {
    const n = S.days.n, doneToday = S.days.last === today(), p = D.plan30;
    const stage = p.stages.find((s) => (n + 1) >= s.from && (n + 1) <= s.to);
    const cells = Array.from({ length: 30 }, (_, i) => '<div class="d30-cell' + (i < n ? ' is-done' : (i === n && !doneToday ? ' is-next' : '')) + '">' + (i < n ? '✓' : i + 1) + '</div>').join('');
    const head = n >= 30
      ? '<div class="d30-today"><small>COMPLETE</small><p>🎉 30 天全部完成！</p></div>'
      : '<div class="d30-today"><small>第 ' + (n + 1) + ' 天 · ' + stage.name + '階段</small><p>' + p.days[n] + '</p>' +
        '<button type="button" class="btn btn-coral" data-act="d30"' + (doneToday ? ' disabled' : '') + '>' + (doneToday ? '今天已打卡，明天再來' : '完成今天 +' + C.dailyReward + ' 💧') + '</button></div>';
    return '<div class="tool"><h3>30 天打卡</h3>' + head + '<div class="d30-grid">' + cells + '</div>' +
      '<div class="d30-stages">' + p.stages.map((s) => '<span>第 ' + s.from + '–' + s.to + ' 天 ' + s.name + '</span>').join('·') + '</div>' +
      '<p class="note">一天只能打卡一次；隔天再回來繼續，進度會保留。</p></div>';
  }

  function recipesHtml() {
    const kinds = Array.from(new Set(D.recipes.map((r) => r.kind)));
    const k = kinds[L.rtab] || kinds[0];
    return '<div class="tool"><h3>生活配方</h3><div class="chips">' + kinds.map((x, i) => '<button type="button" class="chip-btn' + (i === L.rtab ? ' is-on' : '') + '" data-act="rtab" data-i="' + i + '">' + x + '</button>').join('') + '</div>' +
      D.recipes.filter((r) => r.kind === k).map((r) => '<article class="rcard"><h4>' + r.title + '</h4>' +
        r.oils.map(([n, d]) => '<span class="pill">' + n + '<b>' + d + ' 滴</b></span>').join('') + '<p>' + r.how + '</p></article>').join('') +
      '<p class="note">滴數為入門參考。第一次使用請先少量測試，皮膚用的配方記得做貼膚測試。</p></div>';
  }

  function diyHtml() {
    const d = D.diy[L.dtab] || D.diy[0];
    return '<div class="tool"><h3>三款入門手作</h3><div class="chips">' + D.diy.map((x, i) => '<button type="button" class="chip-btn' + (i === L.dtab ? ' is-on' : '') + '" data-act="dtab" data-i="' + i + '">' + x.title.split('（')[0] + '</button>').join('') + '</div>' +
      '<article class="rcard"><h4>' + d.title + ' · ' + d.time + '</h4><b>材料</b><ul class="mat-list">' + d.materials.map((m) => '<li>' + m + '</li>').join('') + '</ul>' +
      '<b>步驟</b><ol class="steps-list">' + d.steps.map((s) => '<li>' + s + '</li>').join('') + '</ol><p class="lp-tip">💡 ' + d.note + '</p></article></div>';
  }

  /* --- 課程視窗事件 --- */
  function bindModal() {
    $('#mBody').addEventListener('click', (e) => {
      const el = e.target.closest('[data-act]'); if (!el || !L) return;
      const a = el.dataset.act;
      if (a === 'opt') { L.quiz[L.page] = +el.dataset.i; renderLesson(); }
      else if (a === 'fav') { S.fav = el.dataset.id; save(); renderLesson(); }
      else if (a === 'need') { L.look.need = el.dataset.n; $$('#lkChips .chip-btn').forEach((c) => c.classList.toggle('is-on', c.dataset.n === L.look.need)); $('#lkList').innerHTML = lookupCards(); }
      else if (a === 'rtab') { L.rtab = +el.dataset.i; renderLesson(); }
      else if (a === 'dtab') { L.dtab = +el.dataset.i; renderLesson(); }
      else if (a === 'd30') { checkIn(); }
      else if (a === 'reset') { resetProgress(); }
      else if (a === 'nt') { L.ntab = el.dataset.k; Sound.sfx('click'); renderNotes(); }
    });
    // 任務與徽章（筆記小屋）
    $('#mBody').addEventListener('click', (e) => {
      const el = e.target.closest('[data-q]');
      if (el && L && L.notes && Quest.onClick(api, el)) renderNotes();
    });
    $('#mBody').addEventListener('change', (e) => {
      if (!L) return;
      if (e.target.dataset.act === 'chk') {
        const on = new Set(L.checks[L.page] || []), i = +e.target.dataset.i;
        if (e.target.checked) on.add(i); else on.delete(i);
        L.checks[L.page] = Array.from(on); renderLesson();
      } else if (e.target.id === 'dlMl' || e.target.id === 'dlPct') dilutionCalc();
    });
    $('#mBody').addEventListener('input', (e) => {
      if (!L) return;
      if (e.target.id === 'lkQ') { L.look.q = e.target.value.trim(); $('#lkList').innerHTML = lookupCards(); }
      else if (e.target.id === 'dlMl' || e.target.id === 'dlPct') dilutionCalc();
      else if (e.target.id === 'noteArea') { S.note = e.target.value; save(); checkAch(); }
    });
    $('#mPrev').addEventListener('click', () => { if (L && L.page > 0) { L.page--; renderLesson(); } });
    $('#mNext').addEventListener('click', () => {
      if (!L) return;
      if (L.notes || L.single) return closeModal();
      if (L.page < L.b.pages.length - 1) { L.page++; renderLesson(); } else complete(L.b);
    });
    $('#mClose').addEventListener('click', closeModal);
    $('#modal').addEventListener('mousedown', (e) => { if (e.target === $('#modal')) closeModal(); });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!$('#modal').hidden) closeModal(); else if (placing) stopPlacing();
    });
  }

  function checkIn() {
    if (S.days.last === today() || S.days.n >= 30) return;
    S.days.n++; S.days.last = today(); earn(C.dailyReward);
    toast('第 ' + S.days.n + ' 天打卡完成 +' + C.dailyReward + ' 💧', true);
    if (S.days.n === 30) toast('🎉 30 天全部完成！', true);
    track('checkin'); save(); renderLesson(); updateHud();
  }

  function complete(b) {
    if (!S.done[b.id]) {
      S.done[b.id] = true; earn(C.reward);
      addFx(b, '+' + C.reward + ' 💧', '#2b8aa8');
      Sound.chime();
      toast('完成「' + b.name + '」 +' + C.reward + ' 💧', true);
      stations.filter((x) => x.after === b.id).forEach((x) => toast('解鎖：' + x.name, true));
      if (stations.every((x) => S.done[x.id])) setTimeout(() => toast('🎉 你已經走遍精油島了！', true), 600);
      checkAch(); save(); renderAll();
    }
    closeModal();
  }

  /* --- 筆記小屋 --- */
  function openNotes(tab) {
    L = { b: byId('home'), notes: true, ntab: tab || 'me' };
    $('#mIco').textContent = L.b.emoji; $('#mTitle').textContent = L.b.name; $('#mSub').textContent = '我的進度、任務與徽章';
    $('#mDots').innerHTML = '';
    renderNotes();
    $('#mPrev').hidden = true;
    $('#mNext').textContent = '關閉'; $('#mNext').disabled = false;
    openModal();
  }

  function renderNotes() {
    if (!L || !L.notes) return;
    const n = claimable();
    const tabs = [['me', '我的進度'], ['daily', '今日任務' + (n ? '（' + n + ' 可領）' : '')], ['badge', '徽章（' + Object.keys(S.ach).length + '/' + Quest.ACH.length + '）']]
      .map(([k, t]) => '<button type="button" class="pl-step' + (L.ntab === k ? ' is-on' : '') + '" data-act="nt" data-k="' + k + '">' + t + '</button>').join('');
    let body;
    if (L.ntab === 'daily') body = Quest.dailyHtml(api);
    else if (L.ntab === 'badge') body = Quest.badgesHtml(api);
    else {
      const fav = D.oils.find((o) => o.id === S.fav);
      body = '<div class="stats3">' +
        '<div class="stat"><small>水滴</small><b>' + S.drops + ' 💧</b></div>' +
        '<div class="stat"><small>稱號</small><b>' + titleOf() + '</b></div>' +
        '<div class="stat"><small>30 天打卡</small><b>' + S.days.n + ' / 30</b></div></div>' +
        '<h3>學習進度</h3><div class="badges">' + stations.map((b) => '<span class="badge' + (S.done[b.id] ? ' is-on' : '') + '">' + b.emoji + ' ' + b.name + '</span>').join('') + '</div>' +
        '<h3>我最愛的精油</h3><p>' + (fav ? '<span class="tag">' + fav.name + '</span> ' + fav.aroma : '還沒選，到入門小舖選一款吧。') + '</p>' +
        '<h3>我的筆記</h3><textarea id="noteArea" placeholder="記下喜歡的配方、使用感受、下次想試的組合……" aria-label="我的筆記"></textarea>' +
        '<button type="button" class="danger-link" data-act="reset">清除我的學習進度</button>';
    }
    $('#mBody').innerHTML = '<div class="tool"><div class="pl-steps">' + tabs + '</div>' + body + '</div>';
    if (L.ntab === 'me') $('#noteArea').value = S.note;
  }

  /* --- 水滴市集 / 遊樂亭 --- */
  function openSingle(b, sub, rootId) {
    L = { b, single: true };
    $('#mIco').textContent = b.emoji; $('#mTitle').textContent = b.name; $('#mSub').textContent = sub;
    $('#mDots').innerHTML = '';
    $('#mBody').innerHTML = '<div id="' + rootId + '"></div>';
    $('.modal-card').classList.add('is-wide');
    $('#mPrev').hidden = true; $('#mNext').textContent = '關閉'; $('#mNext').disabled = false;
    openModal();
  }
  function openShop() { openSingle(byId('market'), '用水滴布置你的島', 'shopRoot'); Shop.mount($('#shopRoot'), api); Sound.sfx('click'); }
  function openArcade() { openSingle(byId('arcade'), '小遊戲 · 玩一玩順便複習', 'arcadeRoot'); Play.mount($('#arcadeRoot'), api); Sound.sfx('click'); }

  /* --- 擺放模式：點草地放下背包裡的東西 --- */
  let placing = null, ghost = null;

  function tileFree(x, y) {
    return World.tileAt(x, y) === 'g' && !World.occupied(x, y) && !S.placed.some((p) => p.x === x && p.y === y);
  }
  function paintPlaceBar() {
    const it = placing && shopById(placing.id);
    $('#placeBar').hidden = !it;
    if (it) $('#placeTxt').textContent = '擺放「' + (it.emoji || '💡') + ' ' + it.name + '」（背包還有 ' + (S.inv[it.id] || 0) + ' 個）：點島上的空草地，綠色格子可以放。';
  }
  function startPlacing(id) {
    if (!(S.inv[id] > 0)) return;
    closeModal(); placing = { id }; ghost = null; paintPlaceBar();
    $('#stage').scrollIntoView({ block: 'nearest' }); Sound.sfx('click'); // 手機上島在面板上方，確保看得到要擺的地方
  }
  function stopPlacing() { placing = null; ghost = null; paintPlaceBar(); }
  function placeAt(x, y) {
    if (!placing) return;
    if (!tileFree(x, y)) { Sound.sfx('miss'); return toast('這格不能擺，換一塊空的草地'); }
    const id = placing.id;
    S.inv[id]--; S.placed.push({ id, x, y });
    const p = World.iso(x + 0.5, y + 0.5, 30);
    fx.push({ wx: p.x, wy: p.y, text: '✨', color: '#e5b341', born: now });
    Sound.sfx('place'); track('place'); save(); afterChange();
    if (S.inv[id] > 0) paintPlaceBar(); else { stopPlacing(); toast('擺好了！到市集的「島上」分頁可以收回', true); }
  }

  // 更新水滴、徽章與面板（買賣、擺放、遊戲結算後呼叫）
  function afterChange() { checkAch(); updateHud(); renderStations(); }

  const api = {
    S: () => S, D, C, today, earn, spend, toast, save, track, afterChange, startPlacing,
    sfx: (n) => Sound.sfx(n), catalog: D.shop,
    refresh: () => { if (L && L.notes) renderNotes(); renderStations(); updateHud(); },
  };

  /* --- 居民聊天與小動物 --- */
  function addFxAt(wx, wy, text, color) { fx.push({ wx, wy, text, color, born: now }); }

  function talk(n) {
    const line = D.chat[Math.floor(Math.random() * D.chat.length)];
    Life.say(n, line, now); Sound.sfx('pop');
    rollDaily();
    if (!S.daily.talked[n.id]) {
      S.daily.talked[n.id] = true; earn(1);
      const p = World.iso(n.fx + 0.5, n.fy + 0.5, 56); addFxAt(p.x, p.y, '+1 💧', '#2b8aa8');
    }
    S.stats.talks++; track('talk');
  }
  function petPlay(pl) {
    Life.pop(pl, now); Sound.sfx('pop');
    S.stats.talks++; track('talk');
  }

  function resetProgress() {
    if (!confirm('要清除這個會員編號的學習進度並重新開始嗎？')) return;
    try { localStorage.removeItem(KEY(member)); } catch (e) { /* ignore */ }
    location.reload();
  }

  /* ---------- 登入 ---------- */
  function enter(id) {
    member = id; S = load(id);
    try { localStorage.setItem(LAST, id); } catch (e) { /* ignore */ }
    $('#gate').hidden = true;
    $('#playerName').textContent = id;
    const first = doneCount() === 0 && !S.selectedOnce;
    selectedId = first ? 'kit' : null;
    dailyLogin(); checkAch(); save();
    renderAll();
    if (first) toast('歡迎來到精油島！先從「入門小舖」開始第一步', true);
    else toast('歡迎回來，' + titleOf() + '！');
  }

  function bindGate() {
    $('#gateForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = $('#memberInput').value.trim(), err = $('#gateErr'), btn = $('#gateBtn');
      err.textContent = '';
      if (!C.memberPattern.test(id)) { err.textContent = '請輸入 5–12 位數字的會員編號'; return; }
      btn.disabled = true; btn.textContent = '登入中…';
      try {
        const ok = await C.verifyMember(id);
        if (!ok) { err.textContent = '找不到這個會員編號'; return; }
        enter(id);
      } catch (er) { err.textContent = '暫時無法驗證，請稍後再試'; }
      finally { btn.disabled = false; btn.textContent = '登入'; }
    });
    $('#logoutBtn').addEventListener('click', () => {
      try { localStorage.removeItem(LAST); } catch (e) { /* ignore */ }
      location.reload();
    });
  }

  /* ---------- 畫布輸入 ---------- */
  // 滑鼠與觸控共用 pointer events：一指拖曳平移、輕點選取 / 聊天 / 擺放、雙指縮放並平移、滾輪縮放
  function bindCanvas(canvas) {
    const ptrs = new Map();   // 目前按著的手指（或滑鼠）：pointerId → 畫布內座標
    let drag = null, pinch = null;
    const pos = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const aim = (p) => { // 擺放模式：預覽格子
      const t = World.toTile(p.x, p.y);
      ghost = placing ? { x: t.x, y: t.y, id: placing.id, valid: tileFree(t.x, t.y) } : null;
    };
    const two = () => { // 前兩根手指的中點與距離
      const [a, b] = Array.from(ptrs.values());
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) };
    };

    canvas.addEventListener('pointerdown', (e) => {
      const p = pos(e); ptrs.set(e.pointerId, p);
      try { canvas.setPointerCapture(e.pointerId); } catch (er) { /* 某些瀏覽器在合成事件上會丟錯 */ }
      if (ptrs.size === 1) {
        drag = { x: p.x, y: p.y, moved: false, slop: e.pointerType === 'mouse' ? 4 : 10 }; // 手指比滑鼠抖，容許位移大一點
        if (placing) aim(p);
      } else if (ptrs.size === 2) { drag = null; pinch = two(); canvas.classList.add('is-drag'); ghost = null; }
    });

    canvas.addEventListener('pointermove', (e) => {
      const p = pos(e);
      if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, p);
      if (pinch && ptrs.size >= 2) { // 雙指：以中點為中心縮放，中點移動則平移
        const m = two();
        if (pinch.d > 0 && m.d > 0) World.zoomBy(m.d / pinch.d, m.x, m.y);
        World.panBy(m.x - pinch.x, m.y - pinch.y);
        pinch = m; return;
      }
      if (drag) {
        const dx = p.x - drag.x, dy = p.y - drag.y;
        if (drag.moved || Math.hypot(dx, dy) > drag.slop) {
          drag.moved = true; canvas.classList.add('is-drag'); ghost = null;
          World.panBy(dx, dy); drag.x = p.x; drag.y = p.y;
        }
      } else if (e.pointerType === 'mouse') { // 只有滑鼠有「滑過」
        if (placing) { aim(p); canvas.classList.add('is-pointer'); return; }
        const b = World.pick(p.x, p.y), w = World.toWorld(p.x, p.y);
        hoverId = b ? b.id : null;
        canvas.classList.toggle('is-pointer', !!b || !!Life.pickNpc(w) || !!Life.pickPet(w, now));
      }
    });

    const end = (e) => {
      ptrs.delete(e.pointerId);
      if (pinch) { // 雙指放掉其中一指：剩下的那一指繼續平移，不算輕點
        if (ptrs.size >= 2) { pinch = two(); return; }
        pinch = null;
        const r = ptrs.values().next().value;
        drag = r ? { x: r.x, y: r.y, moved: true, slop: 10 } : null;
        if (!r) canvas.classList.remove('is-drag');
        return;
      }
      if (!drag) return;
      const moved = drag.moved; drag = null; canvas.classList.remove('is-drag');
      if (moved || e.type !== 'pointerup') { if (placing && e.pointerType !== 'mouse') ghost = null; return; }
      const p = pos(e);
      if (placing) { const t = World.toTile(p.x, p.y); aim(p); placeAt(t.x, t.y); if (e.pointerType !== 'mouse') ghost = null; return; }
      const w = World.toWorld(p.x, p.y), npc = Life.pickNpc(w), pet = npc ? null : Life.pickPet(w, now);
      if (npc) return talk(npc);
      if (pet) return petPlay(pet);
      const b = World.pick(p.x, p.y); select(b ? b.id : null);
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !drag) { hoverId = null; if (placing) ghost = null; } });
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); const p = pos(e); World.zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12, p.x, p.y); }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault()); // 手機長按不要跳出選單
    ['gesturestart', 'gesturechange'].forEach((n) => canvas.addEventListener(n, (e) => e.preventDefault())); // iOS Safari 的整頁縮放
  }

  function bindUi() {
    $('#panel').addEventListener('click', (e) => {
      const el = e.target.closest('[data-act],[data-tab]'); if (!el) return;
      if (el.dataset.tab) return showTab(el.dataset.tab);
      const b = byId(el.dataset.id);
      if (el.dataset.act === 'select') select(b.id);
      else if (el.dataset.act === 'go') visit(b);
    });
    $$('.nav-link').forEach((t) => t.addEventListener('click', () => { showTab(t.dataset.go); $('#panel').scrollIntoView({ block: 'nearest' }); }));
    $('#zoomIn').addEventListener('click', () => World.zoomBy(1.2));
    $('#zoomOut').addEventListener('click', () => World.zoomBy(1 / 1.2));
    $('#zoomReset').addEventListener('click', () => World.resetView());
    $('#placeDone').addEventListener('click', stopPlacing);
    const flip = () => { Life.lockWeather(false); Life.cycleWeather(now); Sound.sfx('click'); paintWeather(true); };
    $('#hudWeather').addEventListener('click', flip);
    $('#hudWeather').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } });

    // 背景音樂：瀏覽器要求使用者互動後才能出聲，所以第一次點擊 / 按鍵才開始
    Sound.configure(C.bgm);
    const mb = $('#musicBtn');
    const paintMusic = () => {
      const on = Sound.isOn();
      mb.textContent = on ? '🎵' : '🔇';
      mb.setAttribute('aria-pressed', String(on));
      mb.title = on ? '關閉音樂與音效' : '開啟音樂與音效';
      mb.classList.toggle('is-off', !on);
    };
    mb.addEventListener('click', () => { Sound.toggle(); paintMusic(); });
    paintMusic();
    ['pointerdown', 'keydown'].forEach((ev) => document.addEventListener(ev, () => Sound.unlock()));

    window.addEventListener('beforeunload', save);
  }

  /* ---------- 時間與天氣 ---------- */
  const hourParam = params.get('hour');
  const gameMinutes = () => {
    if (hourParam !== null && hourParam !== '' && !isNaN(+hourParam)) return (+hourParam % 24) * 60;
    const d = new Date(); return d.getHours() * 60 + d.getMinutes(); // 跟著使用者現在的時間：晚上島上就是晚上
  };
  const period = (m) => { const h = m / 60; return h >= 5 && h < 7 ? '清晨' : h >= 7 && h < 17 ? '白天' : h >= 17 && h < 19 ? '黃昏' : '夜晚'; };
  let weatherTxt = '';
  function paintWeather(force) {
    const w = Life.info(), txt = w.icon + ' ' + w.name + ' · ' + period(gameMinutes());
    if (force || txt !== weatherTxt) { weatherTxt = txt; $('#hudWeatherTxt').textContent = txt; }
  }

  /* ---------- 啟動 ---------- */
  function boot() {
    const canvas = $('#island');
    World.init(canvas, D);
    Life.init(D, { placed: () => S.placed, ghost: () => ghost, item: shopById });
    const wp = params.get('weather');
    if (wp && Life.info(wp)) { Life.setWeather(wp, 0); Life.lockWeather(true); }
    bindCanvas(canvas); bindUi(); bindGate(); bindModal();
    new ResizeObserver(() => World.resize()).observe($('#stage'));
    renderAll();

    let last = null;
    try { last = localStorage.getItem(LAST); } catch (e) { /* ignore */ }
    if (last && C.memberPattern.test(last)) enter(last);
    else { $('#gate').hidden = false; $('#memberInput').focus(); }

    const view = {
      sim, fx,
      get selectedId() { return selectedId; }, get hoverId() { return hoverId; },
      get minutes() { return gameMinutes(); }, mood: 100, status: statusOf,
      get decor() { return stations.filter((b) => S.done[b.id] && b.decor).map((b) => b.decor); },
      items: (t) => Life.items(t), over: (t) => Life.over(t), glow: (t, na) => Life.glow(t, na),
      screen: (t, w, h, dpr) => Life.screen(t, w, h, dpr),
    };

    // 效能：島不在畫面上（捲到下面的面板）或被視窗蓋住時不重畫；畫面卡頓時自動降低解析度
    let stageVisible = true;
    if ('IntersectionObserver' in window) new IntersectionObserver((es) => { stageVisible = es[es.length - 1].isIntersecting; }).observe($('#stage'));
    const dprParam = +params.get('dpr');
    if (dprParam > 0) World.setDprCap(dprParam);
    World.prof.on = params.has('perf');
    const QUALITY = [2, 1.5, 1]; // 解析度上限（裝置像素比）依序往下
    const slow = { ema: 0, n: 0 };
    function adapt(gap) {
      if (dprParam > 0 || gap > 250) return; // 固定解析度，或切分頁回來的長間隔：不算
      slow.ema = slow.n ? slow.ema * 0.95 + gap * 0.05 : gap; slow.n++;
      if (slow.n < 90 || slow.ema < 26) return; // 約 1.5 秒內平均低於 38 fps 才降
      const next = QUALITY.find((q) => q < World.dprCap());
      slow.n = 0;
      if (next && (window.devicePixelRatio || 1) > next) { World.setDprCap(next); console.info('[精油島] 畫面偏慢，解析度上限降到 ' + next); }
    }

    let prev = performance.now(), wTick = 0;
    function frame(ts) {
      const gap = ts - prev, dt = Math.min(0.25, gap / 1000); prev = ts; now = ts / 1000;
      update(dt);
      Life.update(dt, now, World.nightAlpha(view.minutes));
      if (now - wTick > 0.5) { wTick = now; paintWeather(); }
      fx = fx.filter((f) => now - f.born < 1.8); view.fx = fx;
      if (stageVisible && $('#modal').hidden && !document.hidden) { World.render(now, view); adapt(gap); }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  boot();
})();
