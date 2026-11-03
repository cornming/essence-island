/* 精油島 · 每日任務與成就徽章
 * 只放規則與畫面：任務每天依日期固定抽出（今日精油一定在內），徽章由存檔裡的統計判斷。
 * 狀態都在 app.js 的 S 裡，這裡透過 api 讀寫。 */
(function (global) {
  'use strict';

  const REWARD = 8, BONUS = 10, ACH_REWARD = 10, GAME_CAP = 24;

  const POOL = [
    { id: 'oil', text: '認識今日精油', need: 1, fixed: true },
    { id: 'visit', text: '走進任一個學習站（複習也算）', need: 1 },
    { id: 'game', text: '在遊樂亭玩一場小遊戲', need: 1 },
    { id: 'place', text: '在島上擺放一件東西', need: 1 },
    { id: 'talk', text: '跟居民或小動物互動 2 次', need: 2 },
    { id: 'buy', text: '在水滴市集買一件東西', need: 1 },
    { id: 'checkin', text: '完成今天的 30 天打卡', need: 1 },
  ];

  // test(S, x)：x = { done 完成站數, total 學習站總數, pets 島上小動物數, plants 植物數, kinds 擁有幾種商品, hour 現在幾點 }
  const ACH = [
    { id: 'first', icon: '🌱', name: '踏出第一步', desc: '完成第一個學習站', test: (S, x) => x.done >= 1 },
    { id: 'half', icon: '🌿', name: '走了一半', desc: '完成 5 個學習站', test: (S, x) => x.done >= 5 },
    { id: 'all', icon: '🏝️', name: '走遍全島', desc: '完成所有學習站', test: (S, x) => x.done >= x.total },
    { id: 'note', icon: '📒', name: '寫下第一則筆記', desc: '在筆記小屋留下文字', test: (S) => !!S.note },
    { id: 'fav', icon: '💜', name: '有了最愛', desc: '選出最愛的精油', test: (S) => !!S.fav },
    { id: 'd7', icon: '📅', name: '打卡一週', desc: '30 天打卡累積 7 天', test: (S) => S.days.n >= 7 },
    { id: 'd30', icon: '🏮', name: '三十天達成', desc: '完成 30 天打卡', test: (S) => S.days.n >= 30 },
    { id: 'streak3', icon: '🔥', name: '連續三天', desc: '連續 3 天登入島上', test: (S) => S.streak.n >= 3 },
    { id: 'streak7', icon: '🌟', name: '連續一週', desc: '連續 7 天登入島上', test: (S) => S.streak.n >= 7 },
    { id: 'earn100', icon: '💧', name: '水滴小富翁', desc: '累積賺到 100 水滴', test: (S) => S.stats.earned >= 100 },
    { id: 'earn500', icon: '🌊', name: '水滴大富翁', desc: '累積賺到 500 水滴', test: (S) => S.stats.earned >= 500 },
    { id: 'buy1', icon: '🛒', name: '第一次逛市集', desc: '買下第一件商品', test: (S) => S.stats.bought >= 1 },
    { id: 'place5', icon: '🏡', name: '佈置小達人', desc: '在島上擺放 5 件東西', test: (S) => S.placed.length >= 5 },
    { id: 'garden', icon: '🌳', name: '綠手指', desc: '島上種了 5 株植物', test: (S, x) => x.plants >= 5 },
    { id: 'pets', icon: '🐾', name: '動物之友', desc: '島上養了 2 隻小動物', test: (S, x) => x.pets >= 2 },
    { id: 'collect', icon: '🎁', name: '蒐集家', desc: '擁有 10 種不同的商品', test: (S, x) => x.kinds >= 10 },
    { id: 'talk5', icon: '💬', name: '島上人緣王', desc: '累積互動 5 次', test: (S) => S.stats.talks >= 5 },
    { id: 'game3', icon: '🎮', name: '遊樂亭常客', desc: '完成 3 場小遊戲', test: (S) => S.stats.games >= 3 },
    { id: 'champ', icon: '🏆', name: '全能玩家', desc: '三款小遊戲都玩過', test: (S) => Object.keys(S.best).length >= 3 },
    { id: 'owl', icon: '🌙', name: '夜貓子', desc: '深夜（晚上 9 點到清晨 5 點）還在島上', test: (S, x) => x.hour >= 21 || x.hour < 5 },
  ];

  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { let a = seed || 1; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  // 每天固定：今日精油 + 另外隨機 2 個
  function pick(date) {
    const r = rng(hash(date)), rest = POOL.filter((q) => !q.fixed);
    for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = rest[i]; rest[i] = rest[j]; rest[j] = t; }
    return [POOL[0]].concat(rest.slice(0, 2));
  }
  const oilOf = (date, oils) => oils[hash('oil' + date) % oils.length];

  function evaluate(S, x) { return ACH.filter((a) => !S.ach[a.id] && a.test(S, x)); }

  function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }

  /* ---------- 畫面：今日任務 / 徽章牆（放在筆記小屋的分頁裡） ---------- */
  function dailyHtml(api) {
    const S = api.S(), D = api.D, qs = pick(api.today()), oil = oilOf(api.today(), D.oils);
    const prog = (q) => Math.min(q.need, S.daily.prog[q.id] || 0);
    const rows = qs.map((q) => {
      const p = prog(q), ok = p >= q.need, got = !!S.daily.claimed[q.id];
      return '<li class="qrow' + (got ? ' is-got' : ok ? ' is-ok' : '') + '"><div class="qmain"><b>' + esc(q.text) + '</b>' +
        '<span class="qbar"><i style="width:' + Math.round(p / q.need * 100) + '%"></i></span><small>' + p + ' / ' + q.need + '</small></div>' +
        '<button type="button" class="btn ' + (ok && !got ? 'btn-coral' : '') + '" data-q="claim" data-id="' + q.id + '"' + (ok && !got ? '' : ' disabled') + '>' + (got ? '已領取' : '+' + REWARD + ' 💧') + '</button></li>';
    }).join('');
    const allGot = qs.every((q) => S.daily.claimed[q.id]);
    const seen = (S.daily.prog.oil || 0) >= 1;
    return '<div class="oilday"><small>今日精油</small><h4>' + esc(oil.name) + ' <em>' + esc(oil.en) + '</em></h4><p>' + esc(oil.aroma) + '</p>' +
      '<div>' + oil.needs.map((n) => '<span class="tag">' + esc(n) + '</span>').join('') + '</div><p class="caution">⚠️ ' + esc(oil.note) + '</p>' +
      '<button type="button" class="btn ' + (seen ? '' : 'btn-primary') + '" data-q="oil"' + (seen ? ' disabled' : '') + '>' + (seen ? '今天已認識 ✓' : '我記住了') + '</button></div>' +
      '<h4 class="qh">今日任務 <small>每天更新 · 全部完成再 +' + BONUS + ' 💧</small></h4><ul class="qlist">' + rows + '</ul>' +
      '<div class="qbonus' + (S.daily.bonus ? ' is-got' : '') + '"><span>🎁 三項全部領取的額外獎勵</span><button type="button" class="btn ' + (allGot && !S.daily.bonus ? 'btn-coral' : '') + '" data-q="bonus"' + (allGot && !S.daily.bonus ? '' : ' disabled') + '>' + (S.daily.bonus ? '已領取' : '+' + BONUS + ' 💧') + '</button></div>' +
      '<p class="note">連續登入 <b>' + S.streak.n + '</b> 天。每天登入會多一點水滴，斷掉就從 1 天重新算。</p>';
  }

  function badgesHtml(api) {
    const S = api.S(), got = ACH.filter((a) => S.ach[a.id]).length;
    return '<h4 class="qh">徽章 <small>' + got + ' / ' + ACH.length + ' · 每個 +' + ACH_REWARD + ' 💧</small></h4><div class="achs">' + ACH.map((a) => {
      const on = !!S.ach[a.id];
      return '<div class="ach' + (on ? ' is-on' : '') + '" title="' + esc(a.desc) + '"><span class="ach-ico">' + (on ? a.icon : '🔒') + '</span><b>' + esc(a.name) + '</b><small>' + esc(a.desc) + '</small></div>';
    }).join('') + '</div>';
  }

  // 點擊處理：回傳 true 代表有處理（呼叫端要重繪）
  function onClick(api, el) {
    const S = api.S(), a = el.dataset.q, qs = pick(api.today());
    if (a === 'oil') { if (!(S.daily.prog.oil >= 1)) { api.track('oil'); api.sfx('click'); } return true; }
    if (a === 'claim') {
      const q = qs.find((x) => x.id === el.dataset.id);
      if (q && (S.daily.prog[q.id] || 0) >= q.need && !S.daily.claimed[q.id]) {
        S.daily.claimed[q.id] = true; api.earn(REWARD); api.sfx('coin'); api.toast('任務完成 +' + REWARD + ' 💧', true); api.save(); api.refresh();
      }
      return true;
    }
    if (a === 'bonus') {
      if (qs.every((q) => S.daily.claimed[q.id]) && !S.daily.bonus) {
        S.daily.bonus = true; api.earn(BONUS); api.sfx('win'); api.toast('今日任務全部完成 +' + BONUS + ' 💧', true); api.save(); api.refresh();
      }
      return true;
    }
    return false;
  }

  global.Quest = { POOL, ACH, REWARD, BONUS, ACH_REWARD, GAME_CAP, pick, oilOf, evaluate, dailyHtml, badgesHtml, onClick, hash, rng };
})(window);
