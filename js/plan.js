/* 精油島 · 方案工坊
 * 匯入自己的價目表（CSV / 貼上 Excel / JSON）→ 設定 PV 級距與產品組合 → 產生方案表並輸出。
 * 網站不內建任何真實價格或 PV；匯入的資料只存在這個瀏覽器的 localStorage，不會上傳。
 * 只有按下「下載圖片 / Excel」時，才會從 cdnjs 載入 html2canvas 與 SheetJS（資料不會被送出）。 */
(function (global) {
  'use strict';

  const KEY = (id) => 'essence-island:plan:v1:' + id;
  const LIBS = {
    h2c: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
    xlsx: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  };
  const MAX_ITEMS = 3000, MAX_CHARS = 1000000, CAP = 6;
  // 欄位名稱：中英文都認
  const COLS = {
    sku: ['sku', '項目編號', '編號', 'item', 'itemno', '品號'],
    name: ['name', '品名', '名稱', '商品', '產品', '商品名稱', '產品名稱'],
    ws: ['ws', '批發', '批發價', 'wholesale'],
    pv: ['pv'],
    rt: ['rt', '零售', '零售價', 'retail'],
    cat: ['cat', '分類', '類別', 'category'],
  };

  let root = null, member = '', cfg = {}, st = null, idx = {};
  const ui = { step: 1, msg: null, flash: null };
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

  const blank = () => ({ data: null, tiers: [], title: '', note: '', show: { ws: true, rt: true } });
  function load() {
    try {
      const raw = localStorage.getItem(KEY(member));
      if (raw) { const s = Object.assign(blank(), JSON.parse(raw)); s.show = Object.assign({ ws: true, rt: true }, s.show); return s; }
    } catch (e) { /* 讀不到就用空白 */ }
    return blank();
  }
  function save() { try { localStorage.setItem(KEY(member), JSON.stringify(st)); } catch (e) { /* 空間不足或被封鎖 */ } }
  function reindex() { idx = {}; if (st.data) st.data.items.forEach((it) => { idx[it.sku] = it; }); }

  /* ---------- 匯入 ---------- */
  function parseCSV(text, delim) {
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
      else if (c === '"') q = true;
      else if (c === delim) { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (c !== '\r') cell += c;
    }
    row.push(cell); rows.push(row);
    return rows.filter((r) => r.some((c) => c.trim() !== ''));
  }

  function mapHeader(cells) {
    const map = {};
    cells.forEach((c, i) => {
      const k = c.trim().toLowerCase().replace(/\s+/g, '');
      Object.keys(COLS).forEach((key) => { if (map[key] == null && COLS[key].indexOf(k) >= 0) map[key] = i; });
    });
    return map;
  }

  function normalize(raw) {
    const warnings = [], seen = new Set(), items = [];
    raw.forEach((r, i) => {
      if (!r || typeof r !== 'object') return;
      const name = String(r.name == null ? '' : r.name).trim();
      if (!name) { warnings.push('第 ' + (i + 1) + ' 筆沒有品名，已略過'); return; }
      const sku = String(r.sku == null ? '' : r.sku).trim() || 'ROW-' + (i + 1);
      if (seen.has(sku)) { warnings.push('項目編號重複：' + sku + '（只保留第一筆）'); return; }
      seen.add(sku);
      const pv = num(r.pv), ws = num(r.ws), rt = num(r.rt);
      if (isNaN(pv)) warnings.push(name + ' 的 PV 不是數字，視為 0');
      items.push({ sku, name: name.slice(0, 120), ws: isNaN(ws) ? 0 : ws, pv: isNaN(pv) ? 0 : pv, rt: isNaN(rt) ? 0 : rt, cat: String(r.cat == null ? '' : r.cat).trim().slice(0, 40) });
    });
    return { items, warnings };
  }

  function parseInput(text) {
    text = String(text || '').replace(/^﻿/, '').trim();
    if (!text) throw new Error('沒有內容可以匯入');
    if (text.length > MAX_CHARS) throw new Error('內容太大（超過 1 MB）');
    let meta = {}, raw = [];
    if (text[0] === '{' || text[0] === '[') {
      let j;
      try { j = JSON.parse(text); } catch (e) { throw new Error('JSON 格式有誤：' + e.message); }
      const list = Array.isArray(j) ? j : j.items;
      if (Array.isArray(list)) raw = list;
      else if (list && typeof list === 'object') raw = Object.keys(list).map((k) => Object.assign({ sku: k }, list[k]));
      else throw new Error('JSON 裡找不到 items');
      if (!Array.isArray(j)) meta = { currency: j.currency, source: j.source, updated: j.updated };
    } else {
      const first = text.split('\n', 1)[0];
      const rows = parseCSV(text, first.indexOf('\t') >= 0 ? '\t' : ',');
      const map = mapHeader(rows[0]);
      if (map.name == null || map.pv == null) throw new Error('第一列要有欄位名稱，至少需要「品名（name）」和「PV（pv）」');
      raw = rows.slice(1).map((r) => ({ sku: r[map.sku], name: r[map.name], ws: r[map.ws], pv: r[map.pv], rt: r[map.rt], cat: r[map.cat] }));
    }
    if (raw.length > MAX_ITEMS) throw new Error('品項太多（上限 ' + MAX_ITEMS + ' 項）');
    const res = normalize(raw);
    if (!res.items.length) throw new Error('沒有讀到任何有效品項');
    return {
      data: { currency: String(meta.currency || 'NT$').slice(0, 8), source: String(meta.source || '自行匯入').slice(0, 80), updated: String(meta.updated || todayStr()).slice(0, 20), items: res.items },
      warnings: res.warnings,
    };
  }

  function applyData(res, label) {
    st.data = res.data; reindex();
    st.tiers.forEach((t) => { t.combo = t.combo.filter((c) => idx[c.sku]); });
    if (!st.tiers.length) st.tiers = (cfg.defaultTiers || [100]).map((pv) => ({ pv, combo: [] }));
    save();
    const withPV = res.data.items.filter((i) => i.pv > 0).length;
    ui.msg = { ok: true, text: label + '：已匯入 ' + res.data.items.length + ' 項（其中 ' + withPV + ' 項有 PV）', warns: res.warnings.slice(0, 8) };
    render();
  }

  /* ---------- 計算 ---------- */
  const lines = (t) => t.combo.map((c) => (idx[c.sku] ? { it: idx[c.sku], qty: c.qty } : null)).filter(Boolean);
  function totals(t) {
    let pv = 0, ws = 0, rt = 0, qty = 0;
    lines(t).forEach(({ it, qty: q }) => { pv += it.pv * q; ws += it.ws * q; rt += it.rt * q; qty += q; });
    return { pv, ws, rt, qty };
  }

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
    return '<div class="pl-steps">' + ['① 匯入價目', '② 級距與組合', '③ 方案表'].map((s, i) =>
      '<button type="button" class="pl-step' + (ui.step === i + 1 ? ' is-on' : '') + '" data-pl="step" data-n="' + (i + 1) + '">' + s + '</button>').join('') + '</div>';
  }

  function msgBox(m) {
    if (!m) return '';
    return '<div class="pl-status ' + (m.ok ? 'is-ok' : 'is-err') + '">' + esc(m.text) +
      (m.warns && m.warns.length ? '<ul>' + m.warns.map((w) => '<li>' + esc(w) + '</li>').join('') + '</ul>' : '') + '</div>';
  }

  function step1() {
    const d = st.data;
    const status = d
      ? '<div class="pl-status is-ok">目前價目：<b>' + d.items.length + '</b> 項（' + d.items.filter((i) => i.pv > 0).length + ' 項有 PV）· 來源：' + esc(d.source) + ' · 更新：' + esc(d.updated) + '</div>'
      : '<div class="pl-status">還沒有價目資料。匯入你自己的價目表，或先載入範例資料試玩。</div>';
    return status + msgBox(ui.msg) +
      '<p class="note">網站沒有內建任何真實的價格或 PV。匯入的資料只存在這個瀏覽器，不會上傳。</p>' +
      '<div class="pl-actions"><label class="btn pl-file">選擇檔案（CSV / JSON）<input type="file" id="plFile" accept=".csv,.tsv,.txt,.json" hidden></label>' +
      '<button type="button" class="btn" data-pl="sample">載入範例資料（假資料）</button>' +
      '<button type="button" class="btn" data-pl="template">下載 CSV 範本</button>' +
      (d ? '<button type="button" class="btn btn-ghost" data-pl="clear">清除全部</button>' : '') + '</div>' +
      '<label class="pl-label">或直接貼上（從 Excel 複製的表格也可以）<textarea id="plText" rows="5" placeholder="sku,name,ws,pv,rt,cat\nA001,商品名稱,1000,20,1300,分類"></textarea></label>' +
      '<div class="pl-actions"><button type="button" class="btn btn-primary" data-pl="import-text">匯入貼上的內容</button>' +
      (d ? '<button type="button" class="btn btn-coral" data-pl="step" data-n="2">下一步：設定級距 →</button>' : '') + '</div>' +
      '<details class="pl-help"><summary>檔案格式說明</summary>' +
      '<p>第一列是欄位名稱，順序不拘，中英文都可以：</p>' +
      '<ul><li><b>name / 品名</b>（必填）</li><li><b>pv / PV</b>（必填，可以有小數）</li><li>sku / 項目編號（選填，沒有會自動編號）</li>' +
      '<li>ws / 批發價、rt / 零售價（選填）</li><li>cat / 分類（選填）</li></ul>' +
      '<p>也可以匯入 JSON：<code>{"currency":"NT$","source":"自己填","updated":"2026-01-01","items":[{"sku":"A1","name":"商品","ws":1000,"pv":20,"rt":1300}]}</code></p></details>';
  }

  function tierCard(t, i) {
    const tot = totals(t), diff = tot.pv - t.pv, ls = t.combo;
    const rows = ls.map((c, j) => {
      const it = idx[c.sku];
      return '<tr><td>' + esc(it.name) + '<small>' + esc(it.sku) + '</small></td>' +
        '<td><input type="number" class="pl-qty" min="1" max="99" value="' + c.qty + '" data-i="' + i + '" data-j="' + j + '" aria-label="數量"></td>' +
        '<td>' + fmtPV(it.pv * c.qty) + '</td><td>' + fmtMoney(it.ws * c.qty) + '</td><td>' + fmtMoney(it.rt * c.qty) + '</td>' +
        '<td><button type="button" class="pl-x" data-pl="row-del" data-i="' + i + '" data-j="' + j + '" aria-label="移除">✕</button></td></tr>';
    }).join('');
    const badge = !ls.length ? '' : (diff >= 0
      ? '<span class="pl-badge ok">已達標' + (diff > 0.004 ? ' +' + fmtPV(diff) : '') + '</span>'
      : '<span class="pl-badge warn">還差 ' + fmtPV(-diff) + ' PV</span>');
    return '<section class="pl-tier"><header><label>PV 目標 <input type="number" class="pl-tierpv" min="1" step="any" value="' + esc(t.pv) + '" data-i="' + i + '"></label>' +
      '<button type="button" class="btn btn-ghost" data-pl="tier-del" data-i="' + i + '">刪除這個級距</button></header>' +
      (ls.length
        ? '<table class="pl-table"><thead><tr><th>品名</th><th>數量</th><th>PV</th><th>批發</th><th>零售</th><th></th></tr></thead><tbody>' + rows + '</tbody>' +
          '<tfoot><tr><td>合計</td><td>' + tot.qty + '</td><td>' + fmtPV(tot.pv) + '</td><td>' + fmtMoney(tot.ws) + '</td><td>' + fmtMoney(tot.rt) + '</td><td></td></tr></tfoot></table>'
        : '<p class="empty-list">還沒有商品，從下面加入。</p>') +
      '<div class="pl-add-row"><input class="pl-add" list="plItems" data-i="' + i + '" placeholder="輸入品名或編號，選一項加入" aria-label="加入商品">' +
      '<button type="button" class="btn" data-pl="auto" data-i="' + i + '"' + (ls.length ? '' : ' disabled') + '>自動調整數量</button>' +
      '<button type="button" class="btn btn-ghost" data-pl="clear-tier" data-i="' + i + '"' + (ls.length ? '' : ' disabled') + '>清空</button>' + badge + '</div></section>';
  }

  function step2() {
    if (!st.data) return '<div class="pl-status">請先到「① 匯入價目」匯入資料。</div>';
    const f = ui.flash ? '<div class="pl-status ' + (ui.flash.ok ? 'is-ok' : 'is-err') + '">' + esc(ui.flash.text) + '</div>' : '';
    ui.flash = null;
    return f + '<p class="note">每個級距挑好商品後，按「自動調整數量」，系統會在這些商品裡找出「達到目標 PV、超出最少」的數量組合（每項最多 ' + CAP + ' 個）。</p>' +
      '<datalist id="plItems">' + st.data.items.map((it) => '<option value="' + esc(it.sku) + '｜' + esc(it.name) + '"></option>').join('') + '</datalist>' +
      st.tiers.map(tierCard).join('') +
      '<div class="pl-actions"><button type="button" class="btn" data-pl="tier-add">＋ 新增級距</button>' +
      '<button type="button" class="btn btn-coral" data-pl="step" data-n="3">下一步：產生方案表 →</button></div>';
  }

  function step3() {
    if (!st.data) return '<div class="pl-status">請先到「① 匯入價目」匯入資料。</div>';
    const f = ui.flash ? '<div class="pl-status ' + (ui.flash.ok ? 'is-ok' : 'is-err') + '">' + esc(ui.flash.text) + '</div>' : '';
    ui.flash = null;
    const has = st.tiers.some((t) => lines(t).length);
    return f + '<div class="pl-opts"><label class="pl-label">方案表標題<input type="text" id="plTitle" maxlength="40" value="' + esc(st.title) + '" placeholder="例如：11 月精油方案"></label>' +
      '<label class="pl-label">備註（選填）<textarea id="plNote" rows="2" maxlength="300" placeholder="例如：活動日期、搭配說明">' + esc(st.note) + '</textarea></label>' +
      '<div class="pl-checks"><label><input type="checkbox" id="plShowWs"' + (st.show.ws ? ' checked' : '') + '> 顯示批發價</label>' +
      '<label><input type="checkbox" id="plShowRt"' + (st.show.rt ? ' checked' : '') + '> 顯示零售價</label></div></div>' +
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
      const body = ui.step === 1 ? step1() : ui.step === 2 ? step2() : step3();
      root.innerHTML = '<div class="tool"><h3>方案表產生器</h3>' + stepper() + body + '</div>';
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
    '.plan-sheet th{background:#e3f1f5;color:#1d6a86;font-weight:600}' +
    '.plan-sheet tfoot td{font-weight:700;background:#f7f4ec}' +
    '.plan-sheet td small{display:block;color:#6b7f8b;font-weight:400;font-size:11px}' +
    '.plan-sheet .ps-note{margin-top:18px;padding:10px 14px;background:#f7f4ec;border-radius:10px;font-size:14px}' +
    '.plan-sheet .ps-foot{margin-top:18px;font-size:12px;color:#6b7f8b}';

  function ensureCss() {
    if (document.getElementById('plSheetCss')) return;
    const s = document.createElement('style'); s.id = 'plSheetCss'; s.textContent = SHEET_CSS; document.head.appendChild(s);
  }

  function sheetHtml() {
    const d = st.data, cur = esc(d.currency), ws = st.show.ws, rt = st.show.rt;
    const tiers = st.tiers.filter((t) => lines(t).length);
    let h = '<h2>' + esc(st.title.trim() || '方案表') + '</h2><p class="ps-sub">製作日期：' + todayStr().replace(/-/g, '/') + '　·　金額單位：' + cur + '</p>';
    if (!tiers.length) h += '<p class="ps-sub">還沒有任何方案，請先到「② 級距與組合」加入商品。</p>';
    tiers.forEach((t) => {
      const tot = totals(t);
      h += '<h3>' + esc(fmtPV(t.pv)) + ' PV 方案</h3><table><thead><tr><th>品名</th><th>數量</th><th>PV</th>' + (ws ? '<th>批發價</th>' : '') + (rt ? '<th>零售價</th>' : '') + '</tr></thead><tbody>' +
        lines(t).map(({ it, qty }) => '<tr><td>' + esc(it.name) + '<small>' + esc(it.sku) + '</small></td><td>' + qty + '</td><td>' + fmtPV(it.pv * qty) + '</td>' +
          (ws ? '<td>' + fmtMoney(it.ws * qty) + '</td>' : '') + (rt ? '<td>' + fmtMoney(it.rt * qty) + '</td>' : '') + '</tr>').join('') +
        '</tbody><tfoot><tr><td>合計</td><td>' + tot.qty + '</td><td>' + fmtPV(tot.pv) + '</td>' + (ws ? '<td>' + fmtMoney(tot.ws) + '</td>' : '') + (rt ? '<td>' + fmtMoney(tot.rt) + '</td>' : '') + '</tr></tfoot></table>';
    });
    if (st.note.trim()) h += '<div class="ps-note">' + esc(st.note.trim()).replace(/\n/g, '<br>') + '</div>';
    h += '<p class="ps-foot">' + esc(cfg.disclaimer || '') + '<br>價目資料：' + esc(d.source) + '（' + esc(d.updated) + '）</p>';
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
      const X = global.XLSX, wb = X.utils.book_new(), cur = st.data.currency;
      const tiers = st.tiers.filter((t) => lines(t).length);
      const sum = [['方案', 'PV 目標', '合計 PV', '批發價合計（' + cur + '）', '零售價合計（' + cur + '）']];
      tiers.forEach((t) => { const tt = totals(t); sum.push([fmtPV(t.pv) + ' PV 方案', t.pv, Math.round(tt.pv * 100) / 100, tt.ws, tt.rt]); });
      X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(sum), '總覽');
      tiers.forEach((t, i) => {
        const rows = [['品名', '項目編號', '數量', '單品 PV', '批發價', '零售價', 'PV 小計', '批發小計', '零售小計']];
        lines(t).forEach(({ it, qty }) => rows.push([it.name, it.sku, qty, it.pv, it.ws, it.rt, Math.round(it.pv * qty * 100) / 100, it.ws * qty, it.rt * qty]));
        const tt = totals(t); rows.push(['合計', '', tt.qty, '', '', '', Math.round(tt.pv * 100) / 100, tt.ws, tt.rt]);
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
    if (!v) return null;
    const k = v.split('｜')[0].trim();
    if (idx[k]) return k;
    const q = v.toLowerCase(), items = st.data.items;
    let m = items.filter((it) => it.name.toLowerCase() === q || it.sku.toLowerCase() === q);
    if (m.length !== 1) m = items.filter((it) => it.name.toLowerCase().indexOf(q) >= 0 || it.sku.toLowerCase().indexOf(q) >= 0);
    return m.length === 1 ? m[0].sku : null;
  }

  function csvTemplate() {
    const rows = (cfg.sample ? cfg.sample.items : []).slice(0, 3);
    return '﻿sku,name,ws,pv,rt,cat\r\n' + rows.map((r) => [r.sku, r.name, r.ws, r.pv, r.rt, r.cat].join(',')).join('\r\n') + '\r\n';
  }

  function onClick(e) {
    const el = e.target.closest('[data-pl]');
    if (!el) return;
    const a = el.dataset.pl, i = +el.dataset.i, j = +el.dataset.j;
    if (a === 'step') { ui.step = +el.dataset.n; render(); }
    else if (a === 'sample') applyData({ data: JSON.parse(JSON.stringify(cfg.sample)), warnings: [] }, '範例資料');
    else if (a === 'template') download('價目表範本.csv', csvTemplate(), 'text/csv;charset=utf-8');
    else if (a === 'clear') { if (confirm('要清除價目資料與所有方案設定嗎？')) { st = blank(); reindex(); save(); ui.msg = null; ui.step = 1; render(); } }
    else if (a === 'import-text') {
      try { applyData(parseInput($('#plText').value), '貼上的內容'); } catch (err) { ui.msg = { ok: false, text: err.message }; render(); }
    }
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
    if (t.id === 'plFile') {
      const f = t.files && t.files[0];
      if (!f) return;
      if (f.size > MAX_CHARS) { ui.msg = { ok: false, text: '檔案太大（超過 1 MB）' }; render(); return; }
      f.text().then((txt) => { try { applyData(parseInput(txt), '檔案「' + f.name + '」'); } catch (err) { ui.msg = { ok: false, text: err.message }; render(); } });
    } else if (t.classList.contains('pl-qty')) {
      st.tiers[i].combo[j].qty = Math.max(1, Math.min(99, Math.floor(+t.value) || 1)); save(); render();
    } else if (t.classList.contains('pl-tierpv')) {
      const v = num(t.value);
      if (v > 0) { st.tiers[i].pv = v; save(); }
      render();
    } else if (t.classList.contains('pl-add')) {
      const raw = t.value.trim(), sku = skuFromLabel(raw);
      if (!raw) return;
      t.value = ''; // 清空後，換畫面時觸發的 blur 就不會再重複加一次
      if (!sku) return flash('找不到「' + raw.slice(0, 30) + '」，請從下拉選單選一項', false);
      const combo = st.tiers[i].combo, hit = combo.find((c) => c.sku === sku);
      if (hit) hit.qty = Math.min(99, hit.qty + 1); else combo.push({ sku, qty: 1 });
      save(); render();
    } else if (t.id === 'plShowWs') { st.show.ws = t.checked; save(); refreshSheet(); }
    else if (t.id === 'plShowRt') { st.show.rt = t.checked; save(); refreshSheet(); }
  }

  function onInput(e) {
    if (e.target.id === 'plTitle') { st.title = e.target.value; save(); refreshSheet(); }
    else if (e.target.id === 'plNote') { st.note = e.target.value; save(); refreshSheet(); }
  }

  function mount(el, memberId, config) {
    root = el; member = memberId; cfg = config || {};
    st = load(); reindex(); ensureCss();
    ui.step = st.data ? 2 : 1; ui.msg = null; ui.flash = null;
    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    root.addEventListener('input', onInput);
    render();
  }

  global.Plan = { mount };
})(window);
