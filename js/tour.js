/* 精油島 · 新手導覽
 * 第一次進島時，用聚光燈和氣泡一站一站指給你看：水滴、第一個學習站、面板、市集、筆記小屋。
 * 目標可以是頁面上的元素（選擇器），也可以是島上的建築（換算成畫面位置）。之後隨時可從右上角「導覽」重看。 */
(function (global) {
  'use strict';

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  let api = null, list = [], i = 0, on = false, bound = false;
  const $ = (s) => document.querySelector(s);

  function steps() {
    const next = api.nextStation();
    return [
      { title: '歡迎來到精油島 🌿', text: '這是一座會長大的小島。跟著小人一站一站學精油，學完會得到水滴，再用水滴把島布置成你喜歡的樣子。大約 1 分鐘，帶你看一圈。' },
      { title: '水滴是學習的獎勵 💧', text: '完成學習站、每日任務、小遊戲都會得到水滴，數量顯示在左上角。', target: '#hudDrops' },
      { title: '點建築，小人帶你走進去', text: '亮著的圓圈是現在可以去的地方。先點「' + esc(next.name) + '」開始下一步，完成後才會解鎖後面的站。', building: next.id },
      { title: '右邊是你的學習中心', text: '「學習站」看每一站要學什麼；「新手路線」是技能樹，亮著的節點就是下一步；「安全須知」建議先讀一遍。', target: '#panel .tabs' },
      { title: '島上還有好多好玩的', text: '市集用水滴買植物和小動物，遊樂亭有三個小遊戲。點島上的居民可以聊天，點左上角的天氣可以換天氣。', building: 'market' },
      { title: '每天回來看看', text: '筆記小屋有今日任務、徽章和你的筆記。連續登入還有登入獎勵。', building: 'home' },
      { title: '準備好了！', text: '從「' + esc(next.name) + '」開始吧。想再看一次導覽，按右上角的「導覽」。', cta: '開始' },
    ];
  }

  // 目標在畫面上的矩形（fixed 座標）；沒有目標就回 null
  function rectOf(st) {
    if (st.target) {
      const el = $(st.target); if (!el) return null;
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
      const r = el.getBoundingClientRect();
      return { l: r.left, t: r.top, w: r.width, h: r.height };
    }
    if (st.building) {
      $('#stage').scrollIntoView({ block: 'nearest' });
      const b = api.building(st.building); if (!b) return null;
      const bp = World.bubblePos(b), p = World.toScreen(bp.x, bp.y), c = $('#island').getBoundingClientRect();
      return { l: c.left + p.x - 26, t: c.top + p.y - 26, w: 52, h: 52 };
    }
    return null;
  }

  function layout() {
    if (!on) return;
    const st = list[i], r = rectOf(st), spot = $('#tourSpot'), card = $('#tourCard'), vw = innerWidth, vh = innerHeight;
    $('#tour').classList.toggle('is-center', !r);
    if (r) {
      const pad = 8;
      Object.assign(spot.style, { display: 'block', left: r.l - pad + 'px', top: r.t - pad + 'px', width: r.w + pad * 2 + 'px', height: r.h + pad * 2 + 'px' });
    } else spot.style.display = 'none';
    const cw = Math.min(340, vw - 24); card.style.width = cw + 'px';
    const ch = card.offsetHeight;
    let left, top;
    if (!r) { left = (vw - cw) / 2; top = Math.max(12, (vh - ch) / 2); }
    else {
      left = Math.min(vw - cw - 12, Math.max(12, r.l + r.w / 2 - cw / 2));
      top = r.t + r.h + 18 + ch < vh ? r.t + r.h + 18 : r.t - 18 - ch > 0 ? r.t - 18 - ch : Math.max(12, vh - ch - 12);
    }
    card.style.left = left + 'px'; card.style.top = top + 'px';
  }

  function show() {
    const st = list[i], last = i === list.length - 1;
    $('#tourStep').textContent = '第 ' + (i + 1) + ' / ' + list.length + ' 步';
    $('#tourTitle').textContent = st.title;
    $('#tourText').innerHTML = st.text;
    $('#tourPrev').hidden = i === 0;
    $('#tourSkip').hidden = last;
    $('#tourNext').textContent = last ? (st.cta || '完成') : '下一步';
    layout();
    $('#tourNext').focus({ preventScroll: true });
  }

  function end(finished) {
    if (!on) return;
    on = false; $('#tour').hidden = true;
    removeEventListener('resize', layout); removeEventListener('scroll', layout, true); removeEventListener('keydown', onKey, true);
    api.done(finished);
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.stopPropagation(); end(false); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
  }

  function go(d) {
    const n = i + d;
    if (n < 0) return;
    if (n >= list.length) return end(true);
    i = n; api.sfx('click'); show();
  }

  function start(a) {
    api = a; list = steps(); i = 0; on = true;
    if (!bound) {
      bound = true;
      $('#tourNext').addEventListener('click', () => go(1));
      $('#tourPrev').addEventListener('click', () => go(-1));
      $('#tourSkip').addEventListener('click', () => end(false));
    }
    World.resetView();
    $('#tour').hidden = false;
    addEventListener('resize', layout); addEventListener('scroll', layout, true); addEventListener('keydown', onKey, true);
    show();
  }

  global.Tour = { start, isOn: () => on, stop: () => end(false) };
})(window);
