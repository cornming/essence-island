/* 精油島 · 水滴市集
 * 用水滴買植物、裝飾和小動物，放進背包，再到島上點草地擺放。
 * 狀態（水滴、背包、已擺放）都在 app.js 的 S 裡，這裡只負責畫面與購買。 */
(function (global) {
  'use strict';

  const KINDS = [['all', '全部'], ['plant', '植物'], ['deco', '裝飾'], ['pet', '小動物']];
  const KIND_NAME = { plant: '植物', deco: '裝飾', pet: '小動物' };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const icon = (it) => it.emoji || '💡';

  function mount(root, api) {
    if (!root) return;
    let tab = 'shop', kind = 'all';
    const S = () => api.S(), by = (id) => api.catalog.find((x) => x.id === id);
    const owned = (id) => S().inv[id] || 0;

    function card(it, mode, extra) {
      const n = owned(it.id), can = S().drops >= it.price;
      let foot;
      if (mode === 'shop') foot = '<span class="sh-price">' + it.price + ' 💧</span><button type="button" class="btn ' + (can ? 'btn-coral' : '') + '" data-sh="buy" data-id="' + it.id + '"' + (can ? '' : ' disabled') + '>購買</button>';
      else if (mode === 'bag') foot = '<span class="sh-price">× ' + n + '</span><button type="button" class="btn btn-primary" data-sh="place" data-id="' + it.id + '">擺到島上</button>';
      else foot = '<span class="sh-price">(' + extra.x + ', ' + extra.y + ')</span><button type="button" class="btn" data-sh="take" data-i="' + extra.i + '">收回背包</button>';
      return '<div class="sh-card"><div class="sh-ico">' + icon(it) + (mode === 'shop' && n ? '<em>已有 ' + n + '</em>' : '') + '</div><b>' + esc(it.name) + '</b><small>' + esc(mode === 'shop' ? it.desc : KIND_NAME[it.kind]) + '</small><div class="sh-foot">' + foot + '</div></div>';
    }

    function render() {
      const s = S(), bag = api.catalog.filter((it) => owned(it.id) > 0), placed = s.placed;
      const tabs = [['shop', '商品'], ['bag', '背包（' + bag.reduce((a, it) => a + owned(it.id), 0) + '）'], ['placed', '島上（' + placed.length + '）']]
        .map(([k, n]) => '<button type="button" class="pl-step' + (tab === k ? ' is-on' : '') + '" data-sh="tab" data-k="' + k + '">' + n + '</button>').join('');
      let body;
      if (tab === 'shop') {
        const chips = KINDS.map(([k, n]) => '<button type="button" class="chip-btn' + (kind === k ? ' is-on' : '') + '" data-sh="kind" data-k="' + k + '">' + n + '</button>').join('');
        body = '<div class="chips">' + chips + '</div><div class="sh-grid">' + api.catalog.filter((it) => kind === 'all' || it.kind === kind).map((it) => card(it, 'shop')).join('') + '</div>';
      } else if (tab === 'bag') {
        body = bag.length ? '<div class="sh-grid">' + bag.map((it) => card(it, 'bag')).join('') + '</div>' : '<p class="empty-list">背包是空的，先到「商品」逛逛吧。</p>';
      } else {
        body = placed.length ? '<div class="st-actions"><button type="button" class="btn btn-primary" data-sh="tidy">🧽 到島上整理（點東西收回）</button></div><div class="sh-grid">' + placed.map((p, i) => card(by(p.id), 'placed', { x: p.x, y: p.y, i })).join('') + '</div>' : '<p class="empty-list">島上還沒有擺設。買了東西就能到島上擺放。</p>';
      }
      root.innerHTML = '<div class="tool"><div class="sh-head"><h3>水滴市集</h3><span class="sh-wallet">你有 <b>' + s.drops + '</b> 💧</span></div>' +
        '<div class="pl-steps">' + tabs + '</div>' + body +
        '<p class="note">擺放：點「擺到島上」後，在島上的空草地點一下就會放下。花圃、樹和建築的位置不能擺。小動物可以點牠們玩。</p></div>';
    }

    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-sh]'); if (!b || !root.contains(b)) return;
      const a = b.dataset.sh;
      if (a === 'tab') { tab = b.dataset.k; api.sfx('click'); render(); }
      else if (a === 'kind') { kind = b.dataset.k; api.sfx('click'); render(); }
      else if (a === 'buy') {
        const it = by(b.dataset.id), s = S();
        if (!it || s.drops < it.price) { api.sfx('miss'); api.toast('水滴不夠囉'); return; }
        api.spend(it.price); s.inv[it.id] = owned(it.id) + 1; s.stats.bought++;
        api.sfx('coin'); api.toast('買了「' + it.name + '」，已放進背包', true);
        api.track('buy'); api.save(); render();
      } else if (a === 'place') { api.startPlacing(b.dataset.id); }
      else if (a === 'tidy') { api.startTidy(); }
      else if (a === 'take') {
        const s = S(), p = s.placed[+b.dataset.i]; if (!p) return;
        s.placed.splice(+b.dataset.i, 1); s.inv[p.id] = owned(p.id) + 1;
        api.sfx('click'); api.save(); api.afterChange(); render();
      }
    });
    render();
  }

  global.Shop = { mount };
})(window);
