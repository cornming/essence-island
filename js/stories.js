/* 夥伴的故事：讀取團隊工具站 /api/content 裡的 sharers，一次顯示 10 則，捲到底再載入下一批。
 *
 * 資料來源（依序）：
 *   1. 即時連線 config.stories.endpoint（要與該 API 同網域、且已登入才讀得到；跨網域會被瀏覽器擋下）
 *   2. 你自己匯入的 JSON（在團隊工具站登入後複製出來，只存在這個瀏覽器的 localStorage）
 *   3. 範例資料（假資料，示範用）
 * 程式碼與 repo 裡不放任何真實故事。 */
(function () {
  'use strict';

  var KEY = 'essence-island:stories:v1:';
  var MAX_ITEMS = 5000;
  var MAX_CHARS = 8e6;
  var SNIPPET = "copy(JSON.stringify((await (await fetch('/api/content')).json()).sharers))";
  var HOSTS = { 'youtu.be': 1, 'www.youtube.com': 1, 'youtube.com': 1, 'm.youtube.com': 1 };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function str(v) { return v == null ? '' : String(v).trim(); }
  function arr(v) {
    if (Array.isArray(v)) return v.map(str).filter(Boolean);
    return str(v) ? [str(v)] : [];
  }
  function safeLink(v) {
    try {
      var u = new URL(str(v));
      return u.protocol === 'https:' && HOSTS[u.host] ? u.href : '';
    } catch (e) { return ''; }
  }

  /* ---------- 資料整理 ---------- */
  // 只留畫面用得到的欄位：存得下、也不會多帶別的東西
  function normalize(raw, i) {
    var cs = raw && raw.card_summary && typeof raw.card_summary === 'object' ? raw.card_summary : {};
    var it = {
      id: str(raw.sharer_id) || 's' + i,
      name: str(raw['分享者姓名']) || '匿名夥伴',
      rank: str(raw['聘階']),
      title: str(raw.video_title), date: str(raw.video_date), type: str(raw.video_type),
      ord: typeof raw.order_in_video === 'number' ? raw.order_in_video : i,
      ts: str(raw['時間戳']), len: str(raw['分享長度']), link: safeLink(raw['直達連結']),
      hook: str(cs.hook),
      fit: arr(cs['適合你如果'] || cs.suitable_if),
      learn: arr(cs['教你什麼'] || cs.what_to_learn),
      quote: str(raw['核心金句'] || cs['核心金句'] || cs.core_quote),
      why: str(raw['為什麼想經營']), how: str(raw['如何完成升聘']), tips: str(raw['可複製的做法']), note: str(raw['備註']),
      tags: [
        ['pain', arr(raw['痛點標籤'])], ['skill', arr(raw['技能標籤'])], ['stage', arr(raw['階段標籤'])],
        ['group', arr(raw['族群標籤'])], ['prod', arr(raw['產品標籤'])],
      ].reduce(function (a, p) { p[1].forEach(function (t) { a.push({ k: p[0], t: t }); }); return a; }, []),
    };
    return it;
  }

  function hay(it) {
    return [it.name, it.rank, it.title, it.type, it.hook, it.quote, it.why, it.how, it.tips, it.note]
      .concat(it.fit, it.learn, it.tags.map(function (t) { return t.t; })).join('\n').toLowerCase();
  }

  // 新的在前；沒有日期的排最後；同一支影片依出場順序
  function sortItems(list) {
    return list.map(function (it, i) { return [it, i]; }).sort(function (a, b) {
      var x = a[0], y = b[0];
      if (x.date !== y.date) return !x.date ? 1 : !y.date ? -1 : x.date < y.date ? 1 : -1;
      return x.ord - y.ord || a[1] - b[1];
    }).map(function (p) { return p[0]; });
  }

  // 接受：整包 content 物件、{sharers:[…]}、或直接是 sharers 陣列（可為 JSON 字串）
  function parse(input) {
    var d = input;
    if (typeof d === 'string') {
      if (d.length > MAX_CHARS) return { error: '內容太大（超過 8 MB），請只複製 sharers。' };
      try { d = JSON.parse(d.trim()); } catch (e) { return { error: 'JSON 格式有誤：' + e.message }; }
    }
    var list = Array.isArray(d) ? d : d && Array.isArray(d.sharers) ? d.sharers : null;
    if (!list) return { error: '找不到 sharers 陣列。請確認貼的是 /api/content 的內容或其中的 sharers。' };
    var skipped = 0, items = [];
    list.slice(0, MAX_ITEMS).forEach(function (r, i) {
      if (!r || typeof r !== 'object' || (!str(r['分享者姓名']) && !str(r['核心金句']) && !(r.card_summary && r.card_summary.hook))) { skipped++; return; }
      items.push(normalize(r, i));
    });
    if (!items.length) return { error: '沒有可顯示的故事（sharers 是空的，或欄位對不上）。' };
    items.forEach(function (it) { it.hay = hay(it); });
    return { items: sortItems(items), skipped: skipped };
  }

  /* ---------- 範例（假資料） ---------- */
  function sample() {
    var tags = { pain: ['怕被拒絕', '內向不敢開口', '時間不自由'], skill: ['說見證故事', '開分享會', '列名單'], stage: ['新人第一個月', '入會一年'], group: ['上班族兼職', '全職媽媽'], prod: ['薰衣草', '萬用膏'] };
    var out = [];
    for (var i = 1; i <= 25; i++) {
      var n = String(i).padStart(2, '0');
      out.push({
        sharer_id: 'SAMPLE-' + n, video_id: 'SAMPLE', video_title: '範例分享影片 ' + (1 + Math.floor((i - 1) / 5)),
        video_date: '2000-01-' + String(30 - Math.floor((i - 1) / 5)).padStart(2, '0'), video_type: '範例',
        order_in_video: (i - 1) % 5, '分享者姓名': '範例夥伴 ' + n, '聘階': i % 3 ? '範例聘階' : '',
        '時間戳': '0' + (i % 9) + ':' + String((i * 7) % 60).padStart(2, '0'), '分享長度': '約 ' + (3 + i % 5) + ' 分鐘', '直達連結': 'https://youtu.be/SAMPLE?t=' + i,
        card_summary: {
          hook: '這是第 ' + i + ' 則範例故事（假資料，只用來示範版面）。',
          '適合你如果': ['範例情境 A（' + n + '）', '範例情境 B（' + n + '）'], '教你什麼': ['範例重點 1', '範例重點 2', '範例重點 3'],
        },
        '核心金句': '「這是範例金句 ' + n + '，不是任何真人說的話。」',
        '為什麼想經營': '範例：為什麼開始的原因 ' + n + '。', '如何完成升聘': '範例：做了哪些事 ' + n + '。', '可複製的做法': '範例：你也可以試試 ' + n + '。', '備註': '',
        '痛點標籤': [tags.pain[i % 3]], '技能標籤': [tags.skill[i % 3]], '階段標籤': [tags.stage[i % 2]], '族群標籤': [tags.group[i % 2]], '產品標籤': i % 4 ? [tags.prod[i % 2]] : [],
      });
    }
    return out;
  }

  /* ---------- 存取 ---------- */
  function load(member) {
    try {
      var o = JSON.parse(localStorage.getItem(KEY + member) || 'null');
      if (o && Array.isArray(o.items) && o.items.length) { o.items.forEach(function (it) { it.hay = hay(it); }); return o; }
    } catch (e) { /* ignore */ }
    return null;
  }
  function save(member, items, source) {
    try {
      localStorage.setItem(KEY + member, JSON.stringify({ t: Date.now(), source: source, items: items.map(function (it) { var c = {}; for (var k in it) if (k !== 'hay') c[k] = it[k]; return c; }) }));
      return true;
    } catch (e) { return false; }
  }
  function wipe(member) { try { localStorage.removeItem(KEY + member); } catch (e) { /* ignore */ } }

  function fetchLive(url, ms) {
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, ms || 8000);
    return fetch(url, { credentials: 'include', mode: 'cors', signal: ctl ? ctl.signal : undefined })
      .then(function (r) {
        if (r.status === 401 || r.status === 403) throw new Error('尚未登入團隊工具站');
        if (!r.ok) throw new Error('伺服器回應 ' + r.status);
        return r.json();
      })
      .then(function (j) { clearTimeout(timer); return j; }, function (e) { clearTimeout(timer); throw e; });
  }

  /* ---------- 畫面 ---------- */
  var TAGNAME = { pain: '痛點', skill: '技能', stage: '階段', group: '族群', prod: '產品' };
  var io = null, scrollOff = null;

  function list(title, items) {
    return items.length ? '<div class="st-col"><h5>' + title + '</h5><ul>' + items.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>' : '';
  }
  function full(label, text) { return text ? '<dt>' + label + '</dt><dd>' + esc(text) + '</dd>' : ''; }

  function cardHtml(it) {
    var rank = it.rank && !/^[（(]?本影片未明確[）)]?$/.test(it.rank) ? '<span class="st-rank">' + esc(it.rank) + '</span>' : '';
    var meta = [it.date, it.type].filter(Boolean).map(esc).join(' · ');
    var cols = list('適合你如果', it.fit) + list('教你什麼', it.learn);
    var more = full('為什麼想經營', it.why) + full('如何完成升聘', it.how) + full('可複製的做法', it.tips) + full('備註', it.note);
    var foot = it.link
      ? '<a class="st-play" href="' + esc(it.link) + '" target="_blank" rel="noopener noreferrer">▶ 看影片' + (it.ts ? ' ' + esc(it.ts) : '') + '</a>'
      : (it.ts ? '<span class="st-play is-off">影片時間 ' + esc(it.ts) + '</span>' : '');
    return '<article class="st-card"><header class="st-head"><span class="st-av" aria-hidden="true">' + esc(Array.from(it.name)[0] || '?') + '</span>' +
      '<div class="st-who"><b class="st-name">' + esc(it.name) + '</b>' + rank + '</div></header>' +
      (meta || it.title ? '<p class="st-meta">' + (it.title ? esc(it.title) + (meta ? ' · ' : '') : '') + meta + (it.len ? ' · ' + esc(it.len) : '') + '</p>' : '') +
      (it.hook ? '<p class="st-hook">' + esc(it.hook) + '</p>' : '') +
      (it.quote ? '<blockquote class="st-quote">' + esc(it.quote) + '</blockquote>' : '') +
      (cols ? '<div class="st-cols">' + cols + '</div>' : '') +
      (it.tags.length ? '<div class="st-tags">' + it.tags.map(function (t) { return '<button type="button" class="st-tag is-' + t.k + '" data-st="tag" data-v="' + esc(t.t) + '" title="' + TAGNAME[t.k] + '：點一下找出相同標籤">' + esc(t.t) + '</button>'; }).join('') + '</div>' : '') +
      (more ? '<details class="st-full"><summary>看完整故事</summary><dl>' + more + '</dl></details>' : '') +
      (foot ? '<footer class="st-foot">' + foot + '</footer>' : '') + '</article>';
  }

  function importHtml(note) {
    return '<div class="st-import">' + (note ? '<div class="pl-status is-err">' + esc(note) + '</div>' : '') +
      '<p><b>方法 A：匯入你自己的資料</b>（只存在這個瀏覽器，不會上傳）</p>' +
      '<ol class="st-steps"><li>在瀏覽器開啟團隊工具站並登入。</li><li>按 F12 開啟「主控台」，貼上下面這行、按 Enter（第一次可能要先輸入「allow pasting」）。</li>' +
      '<li>資料已複製到剪貼簿，貼到下面的方框，按「匯入」。也可以直接選檔案。</li></ol>' +
      '<div class="st-code"><code id="stSnip">' + esc(SNIPPET) + '</code><button type="button" class="btn" data-st="copy">複製這行</button></div>' +
      '<textarea id="stText" class="st-text" rows="5" placeholder="把複製到的內容貼在這裡（整包 /api/content 或只有 sharers 都可以）" aria-label="貼上 JSON"></textarea>' +
      '<div class="st-actions"><button type="button" class="btn btn-primary" data-st="import">匯入</button>' +
      '<label class="btn st-file">選擇檔案<input type="file" id="stFile" accept=".json,application/json,text/plain" hidden></label>' +
      '<button type="button" class="btn" data-st="sample">先看範例（假資料）</button></div>' +
      '<p class="st-note">方法 B：把這個網站放在與團隊工具站<b>同一個網域</b>底下，並在 <code>config.stories.endpoint</code> 填 <code>/api/content</code>，就會自動即時連線。</p></div>';
  }

  function mount(root, member, cfg) {
    cfg = cfg || {};
    if (!root) return;
    if (io) { io.disconnect(); io = null; }
    if (scrollOff) { scrollOff(); scrollOff = null; }
    var PAGE = Math.max(1, cfg.pageSize | 0 || 10);
    var S = { items: [], view: [], shown: 0, q: '', source: '', t: 0, busy: false };
    var gen = 0;

    function el(id) { return root.querySelector(id); }
    function alive() { return root.isConnected; }

    function showImport(note) {
      S.items = []; S.source = '';
      root.innerHTML = '<div class="tool st"><h3>夥伴的故事</h3>' + importHtml(note) + '</div>';
    }

    function setData(items, source, t) {
      S.items = items; S.source = source; S.t = t || Date.now(); S.q = '';
      var srcTxt = source === 'live' ? '即時連線：' + esc(cfg.endpoint || '') : source === 'sample' ? '範例資料（假資料）' : '你匯入的資料（存在這個瀏覽器）';
      root.innerHTML = '<div class="tool st"><h3>夥伴的故事</h3>' +
        '<div class="st-bar"><input id="stQ" class="st-q" type="search" placeholder="搜尋姓名、關鍵字、標籤…" aria-label="搜尋故事" autocomplete="off"><span class="st-count" id="stCount" aria-live="polite"></span></div>' +
        '<div class="st-src">資料來源：' + srcTxt + (source === 'import' ? ' · <button type="button" class="st-link" data-st="reimport">重新匯入</button> · <button type="button" class="st-link" data-st="clear">清除</button>' : source === 'sample' ? ' · <button type="button" class="st-link" data-st="reimport">匯入我的資料</button>' : '') + '</div>' +
        '<div class="st-list" id="stList"></div>' +
        '<div class="st-sentinel" id="stSent"><span id="stStatus" class="st-status"></span><button type="button" class="btn st-morebtn" data-st="more">載入更多</button></div>' +
        '<p class="st-note">' + esc(cfg.disclaimer || '') + '</p></div>';
      applyFilter();
      watch();
    }

    function applyFilter() {
      var q = S.q.trim().toLowerCase();
      S.view = q ? S.items.filter(function (it) { return q.split(/\s+/).every(function (w) { return it.hay.indexOf(w) >= 0; }); }) : S.items;
      S.shown = 0;
      el('#stList').innerHTML = '';
      if (!S.view.length) el('#stList').innerHTML = '<p class="st-empty">沒有符合「' + esc(S.q) + '」的故事。</p>';
      more();
    }

    function more() {
      var list = el('#stList'); if (!list) return;
      var next = S.view.slice(S.shown, S.shown + PAGE);
      if (next.length) list.insertAdjacentHTML('beforeend', next.map(cardHtml).join(''));
      S.shown += next.length;
      var left = S.view.length - S.shown;
      el('#stCount').textContent = S.q.trim() ? '符合 ' + S.view.length + ' 則，已顯示 ' + S.shown : '已顯示 ' + S.shown + ' / ' + S.items.length + ' 則';
      el('#stStatus').textContent = !S.view.length ? '' : left > 0 ? '往下捲動載入更多（還有 ' + left + ' 則）' : '已經到底了 ✓';
      el('.st-morebtn').hidden = left <= 0;
      S.busy = false;
      if (io) { var s = el('#stSent'); io.unobserve(s); io.observe(s); } // 還在畫面內就會再觸發一次，直到填滿
    }

    function scroller() {
      for (var n = root.parentElement; n; n = n.parentElement) {
        var o = getComputedStyle(n).overflowY;
        if (o === 'auto' || o === 'scroll') return n;
      }
      return null;
    }

    function watch() {
      var sent = el('#stSent'), box = scroller();
      function next() { if (alive() && !S.busy && S.shown < S.view.length) { S.busy = true; setTimeout(function () { if (alive()) more(); else S.busy = false; }, 120); } }
      if (typeof IntersectionObserver === 'function') {
        io = new IntersectionObserver(function (es) { if (es.some(function (e) { return e.isIntersecting; })) next(); }, { root: box, rootMargin: '0px 0px 240px 0px' });
        io.observe(sent);
      } else if (box) {
        var fn = function () { if (box.scrollHeight - box.scrollTop - box.clientHeight < 240) next(); };
        box.addEventListener('scroll', fn); scrollOff = function () { box.removeEventListener('scroll', fn); };
      }
    }

    function doImport(text) {
      var r = parse(text);
      if (r.error) { showImport(r.error); return; }
      var ok = save(member, r.items, 'import');
      setData(r.items, 'import');
      if (!ok) el('.st-src').insertAdjacentHTML('afterend', '<div class="pl-status is-err">資料太大，沒辦法存進瀏覽器；關掉視窗後需要重新匯入。</div>');
      else if (r.skipped) el('.st-src').insertAdjacentHTML('afterend', '<div class="pl-status">已略過 ' + r.skipped + ' 筆沒有內容的資料。</div>');
    }

    root.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-st]') : null; if (!b || !root.contains(b)) return;
      var a = b.getAttribute('data-st');
      if (a === 'more') more();
      else if (a === 'tag') { var q = el('#stQ'); q.value = b.getAttribute('data-v'); S.q = q.value; applyFilter(); q.scrollIntoView({ block: 'nearest' }); }
      else if (a === 'import') doImport((el('#stText') || {}).value || '');
      else if (a === 'sample') { var r = parse(sample()); setData(r.items, 'sample'); }
      else if (a === 'clear') { wipe(member); showImport(''); }
      else if (a === 'reimport') showImport('');
      else if (a === 'copy') {
        var done = function () { b.textContent = '已複製 ✓'; setTimeout(function () { if (alive()) b.textContent = '複製這行'; }, 1500); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(SNIPPET).then(done, function () { selectSnip(); });
        else selectSnip();
      }
    });
    function selectSnip() { var c = el('#stSnip'); if (c && window.getSelection) { var r = document.createRange(); r.selectNodeContents(c); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); } }

    var timer = null;
    root.addEventListener('input', function (e) {
      if (e.target.id !== 'stQ') return;
      clearTimeout(timer);
      timer = setTimeout(function () { if (!alive()) return; S.q = e.target.value; applyFilter(); }, 200);
    });
    root.addEventListener('change', function (e) {
      if (e.target.id !== 'stFile' || !e.target.files || !e.target.files[0]) return;
      var f = e.target.files[0];
      if (f.size > MAX_CHARS) { showImport('檔案太大（超過 8 MB）。'); return; }
      var fr = new FileReader();
      fr.onload = function () { if (alive()) doImport(String(fr.result)); };
      fr.onerror = function () { if (alive()) showImport('讀取檔案失敗。'); };
      fr.readAsText(f);
    });

    // 進場：先試即時連線，失敗再用已存的資料，最後才是匯入頁
    var mine = ++gen;
    var saved = load(member);
    function fallback(why) {
      if (!alive() || mine !== gen) return;
      if (saved) setData(saved.items, saved.source === 'sample' ? 'sample' : 'import', saved.t);
      else showImport(why);
    }
    if (cfg.endpoint) {
      root.innerHTML = '<div class="tool st"><h3>夥伴的故事</h3><p class="st-loading">連線到團隊工具站…</p></div>';
      fetchLive(cfg.endpoint).then(function (j) {
        if (!alive() || mine !== gen) return;
        var r = parse(j);
        if (r.error) throw new Error(r.error);
        setData(r.items, 'live');
      }).catch(function (e) {
        var msg = e && e.name === 'AbortError' ? '連線逾時' : e instanceof TypeError ?'這個網址連不到團隊工具站（它需要登入，且只接受自己網域的頁面讀取）' : (e && e.message) || '連線失敗';
        fallback('即時連線失敗：' + msg + '。改用匯入的方式。');
      });
    } else fallback('');
  }

  window.Stories = { mount: mount, parse: parse, sample: sample, _normalize: normalize };
})();
