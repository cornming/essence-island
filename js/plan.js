/* 精油島 · 方案工坊
 * 價目內建在 js/catalog.js（來自悠樂芳產品訂購單）→ 設定 PV 級距與產品組合 → 產生方案表並輸出。
 * 方案設定（級距、組合、標題）只存在這個瀏覽器的 localStorage，不會上傳。
 * 只有按下「下載圖片 / Excel」時，才會從 cdnjs 載入 html2canvas 與 SheetJS（資料不會被送出）。 */
(function (global) {
  'use strict';

  const KEY = (id) => 'essence-island:plan:v1:' + id;
  const LIBS = {
    h2c: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
    xlsx: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  };
  const CAP = 6; // 自動調整數量時，每項最多幾個
  const PRICES = ['ws', 'rt', 'sp'];
  const LABEL = { ws: '批發價', rt: '零售價', sp: '優惠價' }, SHORT = { ws: '批發', rt: '零售', sp: '優惠價' };

  let root = null, member = '', cfg = {}, st = null, data = null, idx = {};
  const ui = { step: 1, flash: null, cat: '' };
  const libs = {};

  /* ---------- 小工具 ---------- */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => {
    if (typeof v === 'number') return isFinite(v) ? v : NaN;
    const n = parseFloat(String(v == null ? '' : v).replace(/[^\d.\-]/g, ''));
    return isFinite(n) ? n : NaN;
  };
  const fmtPV = (n) => String(Math.round(n * 100) / 100);
  const fmtMoney = (n) => Math.round(n).toLocaleString('en-US');
  const $ = (s) => root.querySelector(s);
  const todayStr = () => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); };
  const price = (it, k, q) => (it[k] > 0 ? fmtMoney(it[k] * q) : '—');

  /* ---------- 價目 ---------- */
  function loadCatalog() {
    const src = global.PRICE_CATALOG || cfg.catalog;
    if (!src || !Array.isArray(src.items) || !src.items.length) return null;
    const seen = new Set(), items = [];
    src.items.forEach((r) => {
      const sku = String(r.sku == null ? '' : r.sku).trim(), name = String(r.name == null ? '' : r.name).trim();
      if (!sku || !name || seen.has(sku)) return;
      seen.add(sku);
      const n = (v) => { const x = num(v); return isNaN(x) ? 0 : x; };
      items.push({ sku, name, en: String(r.en || ''), unit: String(r.unit || ''), cat: String(r.cat || ''), tag: String(r.tag || ''), note: String(r.note || ''), ws: n(r.ws), rt: n(r.rt), sp: n(r.sp), pv: n(r.pv) });
    });
    const cats = (src.cats || []).filter((c) => items.some((i) => i.cat === c));
    items.forEach((i) => { if (i.cat && cats.indexOf(i.cat) < 0) cats.push(i.cat); });
    return { currency: String(src.currency || 'NT$').slice(0, 8), source: String(src.source || ''), updated: String(src.updated || ''), cats, items };
  }

  const defaultTiers = () => (cfg.defaultTiers || [100]).map((pv) => ({ pv, combo: [] }));
  const blank = () => ({ tiers: defaultTiers(), title: '', note: '', show: { ws: true, rt: true, sp: true } });

  // localStorage 的內容不可信：只取需要的欄位，並丟掉價目裡已經不存在的商品
  function load() {
    const s = blank();
    try {
      const raw = JSON.parse(localStorage.getItem(KEY(member)) || 'null');
      if (raw && typeof raw === 'object') {
        if (Array.isArray(raw.tiers)) {
          const tiers = raw.tiers.slice(0, 20).map((t) => ({
            pv: num(t && t.pv) > 0 ? num(t.pv) : 100,
            combo: (t && Array.isArray(t.combo) ? t.combo : []).filter((c) => c && idx[c.sku]).map((c) => ({ sku: c.sku, qty: Math.max(1, Math.min(99, Math.floor(+c.qty) || 1)) })),
          }));
          if (tiers.length) s.tiers = tiers;
        }
        s.title = String(raw.title || '').slice(0, 40);
        s.note = String(raw.note || '').slice(0, 300);
        if (raw.show && typeof raw.show === 'object') PRICES.forEach((k) => { if (raw.show[k] === false) s.show[k] = false; });
      }
    } catch (e) { /* 讀不到就用預設 */ }
    return s;
  }
  function save() { try { localStorage.setItem(KEY(member), JSON.stringify(st)); } catch (e) { /* 空間不足或被封鎖 */ } }

  /* ---------- 計算 ---------- */
  const lines = (t) => t.combo.map((c) => (idx[c.sku] ? { it: idx[c.sku], qty: c.qty } : null)).filter(Boolean);
  const hasSp = (t) => lines(t).some((l) => l.it.sp > 0);
  // lack：有幾項原表沒有這個價格，合計只算有標價的，畫面上會加 ＊ 提醒
  function totals(t) {
    const r = { pv: 0, ws: 0, rt: 0, sp: 0, qty: 0, lack: { ws: false, rt: false, sp: false } };
    lines(t).forEach(({ it, qty }) => {
      r.pv += it.pv * qty; r.qty += qty;
      PRICES.forEach((k) => { if (it[k] > 0) r[k] += it[k] * qty; else r.lack[k] = true; });
    });
    return r;
  }
  const totalCell = (tot, k) => (tot[k] > 0 ? fmtMoney(tot[k]) + (tot.lack[k] ? '＊' : '') : '—');
  const starred = (tot, cols) => cols.some((k) => tot[k] > 0 && tot.lack[k]); // 有沒有真的印出 ＊
  const colsOf = (t, sheet) => PRICES.filter((k) => (k === 'sp' ? hasSp(t) : true) && (!sheet || st.show[k]));
  const sub = (it, withEn) => [withEn ? it.en : '', it.sku, it.unit, it.tag].filter(Boolean).join(' · ');

  // 在目前選的商品裡調整數量（每項 0～6），找出「達到目標 PV 且超出最少」的組合
  function autoAdjust(i) {
    const t = st.tiers[i];
    const pool = t.combo.map((c) => ({ c, v: Math.round(idx[c.sku].pv * 100) })).filter((p) => p.v > 0);
    if (!pool.length) return flash('先加入幾樣有 PV 的商品，再按「自動調整數量」', false);
    const target = Math.round(t.pv * 100), maxV = Math.max.apply(null, pool.map((p) => p.v)), limit = target + maxV;
    if (limit > 300000) return flash('目標 PV 太大，無法自動調整', false);
    let dp = new Map([[0, { q: [], d: 0, u: 0 }]]);
    pool.forEach((p) => {
      const nd = new Map();
      dp.forEach((cur, s) => {
        for (let q = 0; q <= CAP; q++) {
          const ns = s + q * p.v;
          if (ns > limit) break;
          const cand = { q: cur.q.concat(q), d: cur.d + (q > 0 ? 1 : 0), u: cur.u + q }, old = nd.get(ns);
          if (!old || cand.d > old.d || (cand.d === old.d && cand.u < old.u)) nd.set(ns, cand);
        }
      });
      dp = nd;
    });
    let best = null;
    dp.forEach((v, s) => {
      if (s < target) return;
      if (!best || s < best.s || (s === best.s && (v.d > best.v.d || (v.d === best.v.d && v.u < best.v.u)))) best = { s, v };
    });
    if (!best) return flash('用目前這幾樣商品湊不到 ' + fmtPV(t.pv) + ' PV（每項最多 ' + CAP + ' 個），請再多加幾樣', false);
    pool.forEach((p, k) => { p.c.qty = best.v.q[k]; });
    t.combo = t.combo.filter((c) => c.qty > 0);
    save();
    flash('已調整數量：合計 ' + fmtPV(best.s / 100) + ' PV', true);
  }

  function flash(text, ok) { ui.flash = { text, ok }; render(); }

  /* ---------- 畫面 ---------- */
  function stepper() {
    return '<div class="pl-steps">' + ['① 級距與組合', '② 方案表'].map((s, i) =>
      '<button type="button" class="pl-step' + (ui.step === i + 1 ? ' is-on' : '') + '" data-pl="step" data-n="' + (i + 1) + '">' + s + '</button>').join('') + '</div>';
  }

  function flashBox() {
    const f = ui.flash ? '<div class="pl-status ' + (ui.flash.ok ? 'is-ok' : 'is-err') + '">' + esc(ui.flash.text) + '</div>' : '';
    ui.flash = null;
    return f;
  }

  function tierCard(t, i) {
    const tot = totals(t), diff = tot.pv - t.pv, ls = t.combo, cols = colsOf(t, false);
    const rows = ls.map((c, j) => {
      const it = idx[c.sku];
      return '<tr><td>' + esc(it.name) + '<small>' + esc(sub(it, true)) + '</small>' + (it.note ? '<small class="pl-warn">⚠ ' + esc(it.note) + '</small>' : '') + '</td>' +
        '<td><input type="number" class="pl-qty" min="1" max="99" value="' + c.qty + '" data-i="' + i + '" data-j="' + j + '" aria-label="數量"></td>' +
        '<td>' + fmtPV(it.pv * c.qty) + '</td>' + cols.map((k) => '<td>' + price(it, k, c.qty) + '</td>').join('') +
        '<td><button type="button" class="pl-x" data-pl="row-del" data-i="' + i + '" data-j="' + j + '" aria-label="移除">✕</button></td></tr>';
    }).join('');
    const badge = !ls.length ? '' : (diff >= 0
      ? '<span class="pl-badge ok">已達標' + (diff > 0.004 ? ' +' + fmtPV(diff) : '') + '</span>'
      : '<span class="pl-badge warn">還差 ' + fmtPV(-diff) + ' PV</span>');
    return '<section class="pl-tier"><header><label>PV 目標 <input type="number" class="pl-tierpv" min="1" step="any" value="' + esc(t.pv) + '" data-i="' + i + '"></label>' +
      '<button type="button" class="btn btn-ghost" data-pl="tier-del" data-i="' + i + '">刪除這個級距</button></header>' +
      (ls.length
        ? '<table class="pl-table"><thead><tr><th>品名</th><th>數量</th><th>PV</th>' + cols.map((k) => '<th>' + SHORT[k] + '</th>').join('') + '<th></th></tr></thead><tbody>' + rows + '</tbody>' +
          '<tfoot><tr><td>合計</td><td>' + tot.qty + '</td><td>' + fmtPV(tot.pv) + '</td>' + cols.map((k) => '<td>' + totalCell(tot, k) + '</td>').join('') + '<td></td></tr></tfoot></table>' +
          (starred(tot, cols) ? '<p class="pl-foot">＊ 部分品項在原表沒有這個價格，合計只計有標價的品項。</p>' : '')
        : '<p class="empty-list">還沒有商品，從下面加入。</p>') +
      '<div class="pl-add-row"><input class="pl-add" list="plItems" data-i="' + i + '" placeholder="輸入品名、英文或編號，選一項加入" aria-label="加入商品">' +
      '<button type="button" class="btn" data-pl="auto" data-i="' + i + '"' + (ls.length ? '' : ' disabled') + '>自動調整數量</button>' +
      '<button type="button" class="btn btn-ghost" data-pl="clear-tier" data-i="' + i + '"' + (ls.length ? '' : ' disabled') + '>清空</button>' + badge + '</div></section>';
  }

  function step1() {
    const opts = data.items.filter((it) => !ui.cat || it.cat === ui.cat).map((it) =>
      '<option value="' + esc(it.sku) + '｜' + esc(it.name) + '" label="' + esc([it.en, it.unit, 'PV ' + fmtPV(it.pv)].filter(Boolean).join(' · ')) + '"></option>').join('');
    return flashBox() +
      '<div class="pl-status is-ok">內建價目：<b>' + data.items.length + '</b> 項（' + data.items.filter((i) => i.pv > 0).length + ' 項有 PV）· ' + esc(data.source) + ' · ' + esc(data.updated) + '</div>' +
      '<p class="note">每個級距挑好商品後，按「自動調整數量」，系統會在這些商品裡找出「達到目標 PV、超出最少」的數量組合（每項最多 ' + CAP + ' 個）。</p>' +
      '<label class="pl-label">商品分類（縮小下面「加入商品」的選單）<select id="plCat"><option value="">全部分類</option>' +
      data.cats.map((c) => '<option value="' + esc(c) + '"' + (ui.cat === c ? ' selected' : '') + '>' + esc(c) + '</option>').join('') + '</select></label>' +
      '<datalist id="plItems">' + opts + '</datalist>' +
      st.tiers.map(tierCard).join('') +
      '<div class="pl-actions"><button type="button" class="btn" data-pl="tier-add">＋ 新增級距</button>' +
      '<button type="button" class="btn btn-coral" data-pl="step" data-n="2">下一步：產生方案表 →</button>' +
      '<button type="button" class="btn btn-ghost" data-pl="reset">重設全部方案</button></div>';
  }

  function step2() {
    const has = st.tiers.some((t) => lines(t).length);
    return flashBox() + '<div class="pl-opts"><label class="pl-label">方案表標題<input type="text" id="plTitle" maxlength="40" value="' + esc(st.title) + '" placeholder="例如：11 月精油方案"></label>' +
      '<label class="pl-label">備註（選填）<textarea id="plNote" rows="2" maxlength="300" placeholder="例如：活動日期、搭配說明">' + esc(st.note) + '</textarea></label>' +
      '<div class="pl-checks"><label><input type="checkbox" id="plShowWs"' + (st.show.ws ? ' checked' : '') + '> 顯示批發價</label>' +
      '<label><input type="checkbox" id="plShowRt"' + (st.show.rt ? ' checked' : '') + '> 顯示零售價</label>' +
      '<label><input type="checkbox" id="plShowSp"' + (st.show.sp ? ' checked' : '') + '> 顯示優惠價（忠誠獎勵套裝）</label></div></div>' +
      '<div class="pl-actions"><button type="button" class="btn btn-primary" data-pl="dl-img"' + (has ? '' : ' disabled') + '>下載圖片</button>' +
      '<button type="button" class="btn btn-primary" data-pl="dl-xlsx"' + (has ? '' : ' disabled') + '>下載 Excel</button>' +
      '<button type="button" class="btn" data-pl="dl-html"' + (has ? '' : ' disabled') + '>下載 HTML</button></div>' +
      '<div class="pl-sheetwrap"><div class="plan-sheet" id="plSheet">' + sheetHtml() + '</div></div>';
  }

  let rendering = false;
  function render() {
    if (!root) return;
    // 先讓正在輸入的欄位失焦（讓它的 change 先處理完），再整塊換掉；否則移除欄位時才觸發的 blur / change 會重複執行
    const a = document.activeElement;
    if (a && root.contains(a) && typeof a.blur === 'function') a.blur();
    if (rendering) return;
    rendering = true;
    try {
      const body = !data ? '<div class="pl-status is-err">找不到內建價目（js/catalog.js）。</div>' : ui.step === 1 ? step1() : step2();
      root.innerHTML = '<div class="tool"><h3>方案表產生器</h3>' + (data ? stepper() : '') + body + '</div>';
    } finally { rendering = false; }
  }

  /* ---------- 方案表 ---------- */
  const SHEET_CSS = '.plan-sheet{font-family:"PingFang TC","Microsoft JhengHei","Noto Sans TC",system-ui,sans-serif;color:#1f3b4d;background:#fff;padding:24px;max-width:760px;margin:0 auto;line-height:1.5}' +
    '.plan-sheet h2{font-size:26px;margin:0 0 4px;font-family:"Noto Serif TC",serif;font-weight:600}' +
    '.plan-sheet .ps-sub{color:#6b7f8b;font-size:13px;margin:0 0 18px}' +
    '.plan-sheet h3{margin:22px 0 8px;font-size:18px;color:#1d6a86;border-left:4px solid #2b8aa8;padding-left:10px}' +
    '.plan-sheet table{width:100%;border-collapse:collapse;font-size:14px}' +
    '.plan-sheet th,.plan-sheet td{padding:8px 10px;border-bottom:1px solid #e3dfd0;text-align:right}' +
    '.plan-sheet th:first-child,.plan-sheet td:first-child{text-align:left}' +
    '.plan-sheet th{background:#e3f1f5;color:#1d6a86;font-weight:600;white-space:nowrap}' +
    '.plan-sheet tfoot td{font-weight:700;background:#f7f4ec}' +
    '.plan-sheet td small{display:block;color:#6b7f8b;font-weight:400;font-size:11px}' +
    '.plan-sheet .ps-note{margin-top:18px;padding:10px 14px;background:#f7f4ec;border-radius:10px;font-size:14px}' +
    '.plan-sheet .ps-foot{margin-top:18px;font-size:12px;color:#6b7f8b}';

  function ensureCss() {
    if (document.getElementById('plSheetCss')) return;
    const s = document.createElement('style'); s.id = 'plSheetCss'; s.textContent = SHEET_CSS; document.head.appendChild(s);
  }

  function sheetHtml() {
    const cur = esc(data.currency);
    const tiers = st.tiers.filter((t) => lines(t).length);
    let star = false;
    let h = '<h2>' + esc(st.title.trim() || '方案表') + '</h2><p class="ps-sub">製作日期：' + todayStr().replace(/-/g, '/') + '　·　金額單位：' + cur + '</p>';
    if (!tiers.length) h += '<p class="ps-sub">還沒有任何方案，請先到「① 級距與組合」加入商品。</p>';
    tiers.forEach((t) => {
      const tot = totals(t), cols = colsOf(t, true);
      if (starred(tot, cols)) star = true;
      h += '<h3>' + esc(fmtPV(t.pv)) + ' PV 方案</h3><table><thead><tr><th>品名</th><th>數量</th><th>PV</th>' + cols.map((k) => '<th>' + LABEL[k] + '</th>').join('') + '</tr></thead><tbody>' +
        lines(t).map(({ it, qty }) => '<tr><td>' + esc(it.name) + '<small>' + esc(sub(it, false)) + '</small></td><td>' + qty + '</td><td>' + fmtPV(it.pv * qty) + '</td>' +
          cols.map((k) => '<td>' + price(it, k, qty) + '</td>').join('') + '</tr>').join('') +
        '</tbody><tfoot><tr><td>合計</td><td>' + tot.qty + '</td><td>' + fmtPV(tot.pv) + '</td>' + cols.map((k) => '<td>' + totalCell(tot, k) + '</td>').join('') + '</tr></tfoot></table>';
    });
    if (st.note.trim()) h += '<div class="ps-note">' + esc(st.note.trim()).replace(/\n/g, '<br>') + '</div>';
    h += '<p class="ps-foot">' + (star ? '＊ 部分品項在原表沒有這個價格，合計只計有標價的品項。<br>' : '') + esc(cfg.disclaimer || '') + '<br>價目資料：' + esc(data.source) + '（' + esc(data.updated) + '）</p>';
    return h;
  }

  function refreshSheet() { const el = $('#plSheet'); if (el) el.innerHTML = sheetHtml(); }

  /* ---------- 輸出 ---------- */
  const fileName = (ext) => (st.title.trim() || '方案表').replace(/[\\/:*?"<>|]/g, '_').slice(0, 40) + '.' + ext;

  function download(name, content, type) {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  }

  function loadLib(key) {
    if (libs[key]) return libs[key];
    libs[key] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = LIBS[key]; s.onload = resolve;
      s.onerror = () => { libs[key] = null; reject(new Error('無法載入匯出元件，請確認網路連線')); };
      document.head.appendChild(s);
    });
    return libs[key];
  }

  async function exportImage() {
    try {
      await loadLib('h2c');
      const canvas = await global.html2canvas($('#plSheet'), { scale: 2, backgroundColor: '#ffffff' });
      canvas.toBlob((b) => download(fileName('png'), b));
    } catch (e) { flash(e.message || '圖片輸出失敗', false); }
  }

  async function exportXlsx() {
    try {
      await loadLib('xlsx');
      const X = global.XLSX, wb = X.utils.book_new(), cur = data.currency, r2 = (n) => Math.round(n * 100) / 100;
      const tiers = st.tiers.filter((t) => lines(t).length);
      const sum = [['方案', 'PV 目標', '合計 PV', '批發價合計（' + cur + '）', '零售價合計（' + cur + '）', '優惠價合計（' + cur + '）']];
      tiers.forEach((t) => { const tt = totals(t); sum.push([fmtPV(t.pv) + ' PV 方案', t.pv, r2(tt.pv), tt.ws || '', tt.rt || '', tt.sp || '']); });
      X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(sum), '總覽');
      tiers.forEach((t, i) => {
        const rows = [['品名', '項目編號', '單位', '數量', '單品 PV', '批發價', '零售價', '優惠價', 'PV 小計', '批發小計', '零售小計', '優惠價小計']];
        lines(t).forEach(({ it, qty }) => rows.push([it.name, it.sku, it.unit, qty, it.pv, it.ws || '', it.rt || '', it.sp || '', r2(it.pv * qty), it.ws ? it.ws * qty : '', it.rt ? it.rt * qty : '', it.sp ? it.sp * qty : '']));
        const tt = totals(t); rows.push(['合計', '', '', tt.qty, '', '', '', '', r2(tt.pv), tt.ws || '', tt.rt || '', tt.sp || '']);
        X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(rows), (fmtPV(t.pv) + 'PV-' + (i + 1)).replace(/[\[\]:*?\/\\]/g, '_').slice(0, 31));
      });
      X.writeFile(wb, fileName('xlsx'));
    } catch (e) { flash(e.message || 'Excel 輸出失敗', false); }
  }

  function exportHtml() {
    const title = esc(st.title.trim() || '方案表');
    download(fileName('html'), '<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + title +
      '</title><style>body{margin:0;background:#f7f4ec}' + SHEET_CSS + '</style></head><body><div class="plan-sheet">' + sheetHtml() + '</div></body></html>', 'text/html;charset=utf-8');
  }

  /* ---------- 事件 ---------- */
  function skuFromLabel(v) {
    v = String(v || '').trim();
    if (!v) return { sku: null, n: 0 };
    const k = v.split('｜')[0].trim();
    if (idx[k]) return { sku: k, n: 1 };
    const q = v.toLowerCase(), items = data.items, has = (it, s) => (it.name + ' ' + it.en + ' ' + it.sku).toLowerCase().indexOf(s) >= 0;
    let m = items.filter((it) => it.name.toLowerCase() === q || it.en.toLowerCase() === q || it.sku.toLowerCase() === q);
    if (m.length !== 1) m = items.filter((it) => has(it, q));
    return { sku: m.length === 1 ? m[0].sku : null, n: m.length };
  }

  function onClick(e) {
    const el = e.target.closest('[data-pl]');
    if (!el) return;
    const a = el.dataset.pl, i = +el.dataset.i, j = +el.dataset.j;
    if (a === 'step') { ui.step = +el.dataset.n; render(); }
    else if (a === 'reset') { if (confirm('要清除所有級距、組合與標題，回到預設嗎？')) { st = blank(); ui.cat = ''; save(); render(); } }
    else if (a === 'tier-add') { st.tiers.push({ pv: 100, combo: [] }); save(); render(); }
    else if (a === 'tier-del') { if (!st.tiers[i].combo.length || confirm('這個級距已經有商品，確定要刪除嗎？')) { st.tiers.splice(i, 1); save(); render(); } }
    else if (a === 'row-del') { st.tiers[i].combo.splice(j, 1); save(); render(); }
    else if (a === 'clear-tier') { st.tiers[i].combo = []; save(); render(); }
    else if (a === 'auto') autoAdjust(i);
    else if (a === 'dl-img') exportImage();
    else if (a === 'dl-xlsx') exportXlsx();
    else if (a === 'dl-html') exportHtml();
  }

  function onChange(e) {
    const t = e.target, i = +t.dataset.i, j = +t.dataset.j;
    if (t.id === 'plCat') { ui.cat = t.value; render(); }
    else if (t.classList.contains('pl-qty')) {
      st.tiers[i].combo[j].qty = Math.max(1, Math.min(99, Math.floor(+t.value) || 1)); save(); render();
    } else if (t.classList.contains('pl-tierpv')) {
      const v = num(t.value);
      if (v > 0) { st.tiers[i].pv = v; save(); }
      render();
    } else if (t.classList.contains('pl-add')) {
      const raw = t.value.trim(), hit0 = skuFromLabel(raw), sku = hit0.sku;
      if (!raw) return;
      t.value = ''; // 清空後，換畫面時觸發的 blur 就不會再重複加一次
      if (!sku) return flash(hit0.n > 1 ? '「' + raw.slice(0, 30) + '」有 ' + hit0.n + ' 個符合，請從下拉選單選一項' : '找不到「' + raw.slice(0, 30) + '」，請從下拉選單選一項', false);
      const combo = st.tiers[i].combo, hit = combo.find((c) => c.sku === sku);
      if (hit) hit.qty = Math.min(99, hit.qty + 1); else combo.push({ sku, qty: 1 });
      save(); render();
    } else if (t.id === 'plShowWs') { st.show.ws = t.checked; save(); refreshSheet(); }
    else if (t.id === 'plShowRt') { st.show.rt = t.checked; save(); refreshSheet(); }
    else if (t.id === 'plShowSp') { st.show.sp = t.checked; save(); refreshSheet(); }
  }

  function onInput(e) {
    if (e.target.id === 'plTitle') { st.title = e.target.value; save(); refreshSheet(); }
    else if (e.target.id === 'plNote') { st.note = e.target.value; save(); refreshSheet(); }
  }

  function mount(el, memberId, config) {
    root = el; member = memberId; cfg = config || {};
    data = loadCatalog(); idx = {};
    if (data) data.items.forEach((it) => { idx[it.sku] = it; });
    st = load(); ensureCss();
    ui.step = 1; ui.flash = null; ui.cat = '';
    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    root.addEventListener('input', onInput);
    render();
  }

  global.Plan = { mount };
})(window);
