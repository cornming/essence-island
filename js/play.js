/* 精油島 · 遊樂亭
 * 三個和精油有關的小遊戲：香氣配對（翻牌）、稀釋挑戰（算滴數）、香氣猜猜（限時選擇）。
 * 每款遊戲每天第一次完成拿全額水滴，之後每場 1 💧，每天遊戲獎勵有上限，避免一直刷。 */
(function (global) {
  'use strict';

  const CAP = 24;
  const GAMES = [
    { id: 'match', name: '香氣配對', icon: '🃏', desc: '12 張牌翻出 6 對：精油名稱配上它的香氣。步數越少越高分。', best: (v) => v + ' 步' },
    { id: 'dilute', name: '稀釋挑戰', icon: '🧪', desc: '5 題：給你瓶子容量和濃度，算出要滴幾滴精油。', best: (v) => v + ' / 5 題' },
    { id: 'guess', name: '香氣猜猜', icon: '👃', desc: '8 題：看香氣和用途的描述，在 12 秒內猜出是哪一款精油。', best: (v) => v + ' / 8 題' },
  ];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; };

  function mount(root, api) {
    if (!root) return;
    const S = () => api.S(), oils = api.D.oils;
    let token = 0, timers = [];
    const alive = (tk) => root.isConnected && tk === token;
    const later = (fn, ms) => { const id = setTimeout(fn, ms); timers.push(id); return id; };
    const reset = () => { timers.forEach(clearTimeout); timers = []; token++; return token; };

    function shell(inner, back) {
      root.innerHTML = '<div class="tool pg">' + (back ? '<button type="button" class="st-link" data-pg="menu">← 回遊樂亭</button>' : '') + inner + '</div>';
    }

    /* ---------- 選單 ---------- */
    function menu() {
      reset();
      const s = S(), left = Math.max(0, CAP - s.daily.gameDrops);
      shell('<h3>遊樂亭</h3><p class="pg-lead">玩一場，複習一點，順便賺水滴。每款遊戲<b>每天第一次完成</b>拿全額，之後每場只有 1 💧。今天遊戲獎勵還能拿 <b>' + left + '</b> 💧。</p>' +
        '<div class="pg-menu">' + GAMES.map((g) => {
          const b = s.best[g.id];
          return '<div class="pg-game"><div class="pg-ico">' + g.icon + '</div><div class="pg-main"><b>' + g.name + '</b><small>' + g.desc + '</small>' +
            '<em>' + (b != null ? '最佳：' + g.best(b) : '還沒玩過') + (s.daily.played[g.id] ? ' · 今天已玩 ' + s.daily.played[g.id] + ' 場' : '') + '</em></div>' +
            '<button type="button" class="btn btn-primary" data-pg="start" data-id="' + g.id + '">開始</button></div>';
        }).join('') + '</div>');
    }

    /* ---------- 結算 ---------- */
    function finish(id, score, reward, headline, detail) {
      const s = S(), first = !s.daily.played[id];
      let gain = first ? reward : 1;
      gain = Math.max(0, Math.min(gain, CAP - s.daily.gameDrops));
      s.daily.played[id] = (s.daily.played[id] || 0) + 1; s.daily.gameDrops += gain;
      if (gain) api.earn(gain);
      s.stats.games++;
      const prev = s.best[id];
      const better = prev == null || (id === 'match' ? score < prev : score > prev);
      if (better) s.best[id] = score;
      api.track('game'); api.sfx('win'); api.save(); api.afterChange();
      shell('<div class="pg-result"><div class="pg-big">' + headline + '</div><p>' + detail + '</p>' +
        '<p class="pg-gain">' + (gain ? '+' + gain + ' 💧' + (first ? '' : '（今天已玩過，每場 1 💧）') : (s.daily.gameDrops >= CAP ? '今天的遊戲獎勵已達上限，明天再來！' : '')) + (better && prev != null ? ' · 新紀錄！' : '') + '</p>' +
        '<div class="st-actions"><button type="button" class="btn btn-primary" data-pg="start" data-id="' + id + '">再玩一次</button><button type="button" class="btn" data-pg="menu">回遊樂亭</button></div></div>');
    }

    /* ---------- 1. 香氣配對 ---------- */
    function startMatch() {
      const tk = reset();
      const picks = shuffle(oils).slice(0, 6);
      const cards = shuffle(picks.reduce((a, o) => a.concat([{ k: o.id, t: o.name, type: 'name' }, { k: o.id, t: o.aroma, type: 'aroma' }]), []));
      const st = { open: [], done: new Set(), moves: 0, lock: false };
      const paint = () => {
        shell('<h3>🃏 香氣配對</h3><p class="pg-lead">步數：<b>' + st.moves + '</b> · 已配對 ' + st.done.size / 2 + ' / 6</p>' +
          '<div class="pg-grid">' + cards.map((c, i) => {
            const on = st.open.indexOf(i) >= 0 || st.done.has(i);
            return '<button type="button" class="pg-card' + (st.done.has(i) ? ' is-done' : on ? ' is-open' : '') + (c.type === 'name' ? ' is-name' : '') + '" data-pg="flip" data-i="' + i + '" aria-label="' + (on ? esc(c.t) : '蓋住的牌') + '">' + (on ? esc(c.t) : '🌿') + '</button>';
          }).join('') + '</div>', true);
      };
      root._flip = (i) => {
        if (st.lock || st.open.indexOf(i) >= 0 || st.done.has(i)) return;
        api.sfx('flip'); st.open.push(i);
        if (st.open.length === 2) {
          st.moves++;
          const [a, b] = st.open;
          if (cards[a].k === cards[b].k && cards[a].type !== cards[b].type) {
            st.done.add(a); st.done.add(b); st.open = []; api.sfx('match');
            if (st.done.size === cards.length) {
              paint();
              const stars = st.moves <= 9 ? 3 : st.moves <= 12 ? 2 : 1;
              later(() => { if (alive(tk)) finish('match', st.moves, 4 + stars * 3, '⭐'.repeat(stars) + '☆'.repeat(3 - stars), '用了 ' + st.moves + ' 步配完 6 對。' + (stars < 3 ? '9 步以內可以拿滿 3 顆星。' : '太厲害了！')); }, 700);
              return;
            }
          } else {
            st.lock = true; paint();
            later(() => { if (!alive(tk)) return; st.open = []; st.lock = false; api.sfx('miss'); paint(); }, 900);
            return;
          }
        }
        paint();
      };
      paint();
    }

    /* ---------- 2. 稀釋挑戰 ---------- */
    const MLS = [5, 10, 15, 30, 50, 100];
    const SCENES = [{ p: 0.5, t: '臉部、敏感肌' }, { p: 1, t: '身體日常、新手建議' }, { p: 2, t: '局部、短時間使用' }];
    function startDilute() {
      const tk = reset(), qs = [];
      for (let i = 0; i < 5; i++) {
        const ml = MLS[Math.floor(Math.random() * MLS.length)], sc = SCENES[Math.floor(Math.random() * SCENES.length)];
        const exact = ml * 20 * sc.p / 100, n = Math.max(1, Math.round(exact));
        const pool = [n + 1, n + 2, n * 2, Math.max(1, n - 1), n + 3, Math.round(n / 2), n * 3].filter((v, j, a) => v > 0 && v !== n && a.indexOf(v) === j);
        qs.push({ ml, sc, exact, n, opts: shuffle([n].concat(shuffle(pool).slice(0, 3))) });
      }
      let qi = 0, score = 0, answered = -1;
      const paint = () => {
        const q = qs[qi];
        const opts = q.opts.map((v, i) => {
          const cls = answered < 0 ? '' : v === q.n ? ' is-right' : (i === answered ? ' is-wrong' : '');
          return '<button type="button" class="opt' + cls + '" data-pg="ans" data-i="' + i + '"' + (answered >= 0 ? ' disabled' : '') + '>' + v + ' 滴</button>';
        }).join('');
        const fb = answered < 0 ? '' : '<p class="feedback ' + (q.opts[answered] === q.n ? 'is-ok">✅ 答對了！' : 'is-no">答案是 ' + q.n + ' 滴。') +
          ' ' + q.ml + ' ml × ' + q.sc.p + '% ÷ 0.05 ml ≈ ' + q.exact.toFixed(1) + '，取整數 ' + q.n + ' 滴。</p><div class="st-actions"><button type="button" class="btn btn-primary" data-pg="next">' + (qi === 4 ? '看結果' : '下一題') + '</button></div>';
        shell('<h3>🧪 稀釋挑戰 <small>第 ' + (qi + 1) + ' / 5 題 · 答對 ' + score + '</small></h3>' +
          '<p class="pg-q">情境：' + q.sc.t + '。要做 <b>' + q.ml + ' ml</b> 的基底油，調成 <b>' + q.sc.p + '%</b> 濃度，要滴幾滴精油？</p><p class="note">1 滴約 0.05 ml。</p><div class="opts pg-opts">' + opts + '</div>' + fb, true);
      };
      root._ans = (i) => {
        if (answered >= 0) return;
        answered = i; const ok = qs[qi].opts[i] === qs[qi].n;
        if (ok) score++; api.sfx(ok ? 'match' : 'miss'); paint();
      };
      root._next = () => {
        if (answered < 0) return;
        if (qi === 4) { finish('dilute', score, 3 + score * 2, score + ' / 5', score === 5 ? '全對！你已經很會算稀釋了。' : '記得公式：容量 ml × 濃度% ÷ 0.05。'); return; }
        qi++; answered = -1; paint();
      };
      paint(); void tk;
    }

    /* ---------- 3. 香氣猜猜 ---------- */
    const SECONDS = 12;
    function startGuess() {
      const tk = reset(), picks = shuffle(oils).slice(0, 8);
      const qs = picks.map((o) => ({ o, opts: shuffle([o].concat(shuffle(oils.filter((x) => x.id !== o.id)).slice(0, 3))) }));
      let qi = 0, score = 0, answered = -1, timedOut = false;
      const paint = () => {
        const q = qs[qi], o = q.o;
        const opts = q.opts.map((x, i) => {
          const cls = answered < 0 && !timedOut ? '' : x.id === o.id ? ' is-right' : (i === answered ? ' is-wrong' : '');
          return '<button type="button" class="opt' + cls + '" data-pg="ans" data-i="' + i + '"' + (answered >= 0 || timedOut ? ' disabled' : '') + '>' + esc(x.name) + '</button>';
        }).join('');
        const over = answered >= 0 || timedOut;
        const fb = !over ? '' : '<p class="feedback ' + (answered >= 0 && q.opts[answered].id === o.id ? 'is-ok">✅ 答對了！' : 'is-no">' + (timedOut ? '時間到！' : '差一點。') + '答案是' + esc(o.name) + '（' + esc(o.en) + '）。') +
          '</p><div class="st-actions"><button type="button" class="btn btn-primary" data-pg="next">' + (qi === 7 ? '看結果' : '下一題') + '</button></div>';
        shell('<h3>👃 香氣猜猜 <small>第 ' + (qi + 1) + ' / 8 題 · 答對 ' + score + '</small></h3>' +
          '<div class="pg-timer"><i id="pgBar"></i></div>' +
          '<p class="pg-q">香氣：<b>「' + esc(o.aroma) + '」</b></p><div class="pg-tags">' + o.needs.map((n) => '<span class="tag">' + esc(n) + '</span>').join('') + o.uses.map((u) => '<span class="tag use">' + esc(u) + '</span>').join('') + '</div>' +
          '<div class="opts pg-opts">' + opts + '</div>' + fb, true);
        const bar = root.querySelector('#pgBar');
        if (bar && !over) { bar.style.width = '100%'; requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.transition = 'width ' + SECONDS + 's linear'; bar.style.width = '0%'; })); }
        else if (bar) bar.style.width = '0%';
      };
      const arm = () => later(() => { if (!alive(tk) || answered >= 0) return; timedOut = true; api.sfx('miss'); paint(); }, SECONDS * 1000);
      root._ans = (i) => {
        if (answered >= 0 || timedOut) return;
        answered = i; const ok = qs[qi].opts[i].id === qs[qi].o.id;
        if (ok) score++; api.sfx(ok ? 'match' : 'miss'); paint();
      };
      root._next = () => {
        if (answered < 0 && !timedOut) return;
        if (qi === 7) { finish('guess', score, 3 + score, score + ' / 8', score >= 7 ? '香氣達人！' : score >= 4 ? '不錯喔，再多聞幾種就更熟了。' : '到香氣圖書館複習一下，再來挑戰吧。'); return; }
        qi++; answered = -1; timedOut = false; paint(); arm();
      };
      paint(); arm();
    }

    const START = { match: startMatch, dilute: startDilute, guess: startGuess };
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pg]'); if (!b || !root.contains(b)) return;
      const a = b.dataset.pg;
      if (a === 'menu') { api.sfx('click'); menu(); }
      else if (a === 'start') { api.sfx('click'); START[b.dataset.id](); }
      else if (a === 'flip' && root._flip) root._flip(+b.dataset.i);
      else if (a === 'ans' && root._ans) root._ans(+b.dataset.i);
      else if (a === 'next' && root._next) { api.sfx('click'); root._next(); }
    });
    menu();
  }

  global.Play = { mount, GAMES, CAP };
})(window);
