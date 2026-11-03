/* 精油島 · 資料層
 * 所有內容（地圖、學習站、課程、精油資料庫、配方）都集中在這裡。
 * 結構參考「新手路線 → 認識產品 / 學會使用 / 開始分享」的學習順序，文字為原創的一般芳香常識，
 * 不是醫療建議；要換成自己團隊的教材，只要改這個檔。
 *
 * 地圖字元：  . 海   s 沙灘   g 草地   p 道路   d 碼頭
 * 座標一律是 (x 欄, y 列)，從左上角 0 開始。
 */
window.ISLAND_DATA = {
  config: {
    brand: '精油島',
    reward: 30,          // 每完成一站得到的水滴
    dailyReward: 5,      // 30 天每日打卡得到的水滴
    memberPattern: /^\d{5,12}$/,
    // 會員編號驗證：預設只檢查格式，進度存在這台裝置的 localStorage。
    // 想改成真正驗證名單時，在這裡呼叫你自己的 API，回傳 true / false 即可，例如：
    //   verifyMember: async (id) => (await fetch('/api/login', { method: 'POST', body: JSON.stringify({ id }) })).ok
    verifyMember: async () => true,
    // 背景音樂：src 留空 = 即時產生的舒緩環境音樂；填音檔路徑（如 'assets/audio/bgm.mp3'）= 改播該檔並循環
    bgm: { src: '', volume: 0.35 },
    // 方案工坊：網站不內建任何真實的價格或 PV。使用者在頁面上匯入自己的價目表，資料只存在他的瀏覽器。
    // 下面的 sample 是「假資料」，只用來示範格式與試玩，數字都不是真實價格。
    plan: {
      defaultTiers: [100, 200],
      disclaimer: '非官方工具。價格與 PV 以官方公告為準，本方案表僅供個人整理與分享參考，不代表任何收入或獎金的承諾。',
      sample: {
        currency: 'NT$', source: '範例資料（假資料，不是真實價格）', updated: '2000-01-01',
        items: [
          { sku: 'SAMPLE-01', name: '範例商品 A', ws: 450, pv: 9, rt: 590, cat: '範例' },
          { sku: 'SAMPLE-02', name: '範例商品 B', ws: 500, pv: 10, rt: 650, cat: '範例' },
          { sku: 'SAMPLE-03', name: '範例商品 C', ws: 800, pv: 16, rt: 1050, cat: '範例' },
          { sku: 'SAMPLE-04', name: '範例商品 D', ws: 900, pv: 18, rt: 1180, cat: '範例' },
          { sku: 'SAMPLE-05', name: '範例商品 E', ws: 1200, pv: 25, rt: 1560, cat: '範例' },
          { sku: 'SAMPLE-06', name: '範例商品 F', ws: 1500, pv: 30, rt: 1950, cat: '範例' },
          { sku: 'SAMPLE-07', name: '範例商品 G', ws: 2000, pv: 40, rt: 2600, cat: '範例' },
          { sku: 'SAMPLE-08', name: '範例商品 H', ws: 2500, pv: 50, rt: 3250, cat: '範例' },
          { sku: 'SAMPLE-09', name: '範例商品 I', ws: 3000, pv: 60, rt: 3900, cat: '範例' },
          { sku: 'SAMPLE-10', name: '範例贈品 J（無 PV）', ws: 100, pv: 0, rt: 130, cat: '範例' },
        ],
      },
    },
    // 夥伴的故事：串接團隊工具站的 /api/content（取 sharers），一次顯示 pageSize 則，捲到底再載入。
    // 這個 API 需要登入，而且不允許其他網域讀取：從別的網址（例如 github.io）連會失敗，頁面會改成讓使用者匯入自己的資料。
    // 要即時連線，就把本站放在同一個網域下，並把 endpoint 改成 '/api/content'。repo 裡不放任何真實故事。
    stories: {
      endpoint: 'https://jennyteam-toolbox.netlify.app/api/content',
      pageSize: 10,
      disclaimer: '故事是夥伴個人的經驗整理，不代表一定會有相同結果，也不構成任何收入、獎金或功效的承諾。內容屬於團隊內部學習資料，請勿外流或轉貼公開。',
    },
    disclaimer: '本站內容為一般芳香知識與使用情境分享，不是醫療建議，也不能取代醫師或合格芳療師的意見。',
  },

  map: [
    '..............',
    '.....sssss....',
    '...ssggggggs..',
    '..sggggpggggs.',
    '..sggggpggggs.',
    '.sgggggpgggggs',
    '.sgpppppppppgs',
    '.sgggggpgggggs',
    '..sggggpggggs.',
    '..sggggpggggs.',
    '...sgggpgggs..',
    '.....sspss....',
    '.......d......',
    '.......d......',
  ],

  start: { x: 7, y: 6 },

  // 地形貼圖（Kenney Isometric Landscape，CC0）。缺圖時該格會退回程式繪製。
  tiles: {
    g: 'assets/tiles/grass.png',
    s: 'assets/tiles/sand.png',
    p: 'assets/tiles/path.png',
    d: 'assets/tiles/dock.png',
  },

  // 草地上的樹（不在草地或被建築 / 花圃佔用的會自動略過）
  trees: [
    [3, 3], [5, 3], [10, 3], [11, 4], [3, 4], [10, 4], [2, 6], [12, 6],
    [12, 5], [3, 8], [5, 8], [10, 8], [11, 9], [4, 9], [4, 10], [9, 10],
  ],

  groups: [
    { id: 'know', name: '認識精油', en: 'KNOW THE OILS' },
    { id: 'use', name: '學會使用', en: 'USE THEM DAILY' },
    { id: 'share', name: '開始分享', en: 'SHARE & GROW' },
  ],

  needs: ['放鬆', '提神', '清新', '睡前', '專注', '居家', '按摩', '保養'],

  /* ---------- 精油資料庫（香氣查詢用） ---------- */
  oils: [
    { id: 'lavender', name: '薰衣草', en: 'Lavender', aroma: '花香帶清爽草本味', needs: ['放鬆', '睡前', '按摩', '保養'], uses: ['擴香', '稀釋塗抹'],
      note: '入門最容易上手的一款。皮膚敏感的人先做貼膚測試。' },
    { id: 'peppermint', name: '胡椒薄荷', en: 'Peppermint', aroma: '清涼、明亮的薄荷香', needs: ['提神', '專注', '清新'], uses: ['擴香', '嗅吸', '稀釋塗抹'],
      note: '氣味很強，從 1 滴開始。避開眼周與臉部，嬰幼兒不建議使用。' },
    { id: 'lemon', name: '檸檬', en: 'Lemon', aroma: '明亮清新的柑橘香', needs: ['清新', '提神', '居家'], uses: ['擴香', '居家'],
      note: '柑橘類塗抹在皮膚後，數小時內避免陽光直曬。可能影響部分塑膠，請用玻璃容器。' },
    { id: 'orange', name: '甜橙', en: 'Sweet Orange', aroma: '甜甜的柑橘香', needs: ['放鬆', '清新', '居家'], uses: ['擴香', '居家'],
      note: '同樣屬於柑橘類，塗抹後要注意避免日曬。很適合和花香、木質香搭配。' },
    { id: 'teatree', name: '茶樹', en: 'Tea Tree', aroma: '乾淨俐落的草本味', needs: ['居家', '清新'], uses: ['擴香', '居家', '稀釋塗抹'],
      note: '家中有貓、狗時要特別謹慎，擴香時留出口讓牠離開。' },
    { id: 'eucalyptus', name: '尤加利', en: 'Eucalyptus', aroma: '清涼帶樟腦感的香氣', needs: ['清新', '提神'], uses: ['擴香', '嗅吸'],
      note: '嬰幼兒與寵物周圍請謹慎，保持空氣流通。' },
    { id: 'rosemary', name: '迷迭香', en: 'Rosemary', aroma: '清透的草本香', needs: ['專注', '提神'], uses: ['擴香', '嗅吸'],
      note: '懷孕或有特殊健康狀況時，先諮詢專業人員。' },
    { id: 'frankincense', name: '乳香', en: 'Frankincense', aroma: '溫潤的木質樹脂香', needs: ['放鬆', '保養', '按摩'], uses: ['擴香', '稀釋塗抹'],
      note: '香氣沉穩，常和柑橘或花香搭配，讓氣味更有層次。' },
    { id: 'chamomile', name: '羅馬洋甘菊', en: 'Roman Chamomile', aroma: '帶蘋果甜感的草本花香', needs: ['放鬆', '睡前'], uses: ['擴香', '稀釋塗抹'],
      note: '對菊科植物（如豚草、菊花）過敏的人請避免。' },
    { id: 'geranium', name: '天竺葵', en: 'Geranium', aroma: '偏玫瑰感的花香', needs: ['保養', '放鬆', '居家'], uses: ['擴香', '稀釋塗抹'],
      note: '香氣濃郁，從少量開始。用在保養配方時請維持低濃度。' },
    { id: 'cedarwood', name: '雪松', en: 'Cedarwood', aroma: '乾爽沉穩的木質香', needs: ['睡前', '放鬆', '專注'], uses: ['擴香', '稀釋塗抹'],
      note: '懷孕期間先諮詢專業人員再使用。' },
    { id: 'bergamot', name: '佛手柑', en: 'Bergamot', aroma: '柑橘中帶著花香', needs: ['放鬆', '清新'], uses: ['擴香'],
      note: '光敏性比較明顯，建議以擴香為主，不要塗在會曬到太陽的皮膚上。' },
  ],

  /* ---------- 30 天新手計畫（5 個階段 × 6 天） ---------- */
  plan30: {
    stages: [
      { name: '擴香', from: 1, to: 6, desc: '先讓空間有味道，最輕鬆也最不容易出錯。' },
      { name: '嗅吸', from: 7, to: 12, desc: '用鼻子認識每一瓶，找出自己的偏好。' },
      { name: '按摩', from: 13, to: 18, desc: '學會稀釋，第一次接觸皮膚。' },
      { name: '保養', from: 19, to: 24, desc: '低濃度、慢慢加，做出自己的保養小物。' },
      { name: '居家', from: 25, to: 30, desc: '把精油帶進生活每個角落。' },
    ],
    days: [
      '選一瓶最喜歡的味道，單純聞聞看',
      '在客廳擴香 30 分鐘，感受空間的變化',
      '睡前在臥室擴香，記得保持通風',
      '換一瓶不同氣味，比較兩天的差異',
      '試試兩種精油的小複方（各 2 滴）',
      '記下這週最喜歡的擴香組合',
      '掌心滴 1 滴，合掌輕嗅，注意心情變化',
      '出門前聞一次喜歡的味道，開啟一天',
      '午後昏沉時，用面紙滴 1 滴聞一聞',
      '睡前嗅吸一款讓你放鬆的氣味',
      '找出一款「專注」氣味，工作前聞一下',
      '整理：哪些氣味讓你放鬆、哪些讓你提神',
      '認識基底油，挑一瓶容易買到的植物油',
      '做一支 1% 滾珠瓶（10 ml 約 2 滴）',
      '在手臂內側做貼膚測試，等 24 小時',
      '測試沒問題，輕輕按摩肩頸 1–2 分鐘',
      '睡前按摩雙手或雙腳',
      '調整香氣與濃度，寫下專屬比例',
      '認識臉部更低的濃度（約 0.5%）',
      '做一瓶 30 ml 身體保養油（約 1%）',
      '洗澡後使用，感受香氣與保濕',
      '做一小罐萬用膏',
      '只用在乾燥處，觀察皮膚反應',
      '整理保養配方，寫下比例與感受',
      '做一瓶空間噴霧，先小範圍測試表面',
      '在烘衣球上滴 2 滴，替衣物增添香氣',
      '廚房或浴室做一次清新擴香',
      '車用香氛：棉片放在通風處，不要直接滴',
      '依季節替換一組配方',
      '回顧 30 天，寫下最愛的 3 種用法',
    ],
  },

  /* ---------- 生活配方（水氧機以 100 ml 水量計） ---------- */
  recipes: [
    { kind: '擴香', title: '睡前放鬆', oils: [['薰衣草', 3], ['羅馬洋甘菊', 1], ['甜橙', 1]],
      how: '睡前 30–60 分鐘開始擴香，入睡前關機，臥室保持通風。' },
    { kind: '擴香', title: '專注工作', oils: [['迷迭香', 2], ['檸檬', 2], ['胡椒薄荷', 1]],
      how: '開始工作前擴香 30 分鐘，每次不要超過一小時。' },
    { kind: '擴香', title: '清新居家', oils: [['檸檬', 3], ['茶樹', 1], ['尤加利', 1]],
      how: '客廳間歇擴香。有貓狗時留出口，不要連續使用。' },
    { kind: '按摩', title: '肩頸放鬆油（30 ml 基底油）', oils: [['薰衣草', 5], ['乳香', 3]],
      how: '共 8 滴，約 1.3%。先做貼膚測試，再輕輕按摩肩頸。' },
    { kind: '按摩', title: '睡前足部油（30 ml 基底油）', oils: [['雪松', 3], ['薰衣草', 4]],
      how: '共 7 滴，約 1.2%。睡前塗抹雙腳，懷孕期間請先諮詢專業人員。' },
    { kind: '保養', title: '身體保養油（30 ml 基底油）', oils: [['天竺葵', 3], ['薰衣草', 3]],
      how: '共 6 滴，約 1%。洗澡後塗抹在乾燥處。' },
    { kind: '保養', title: '臉部低濃度油（30 ml 基底油）', oils: [['薰衣草', 2], ['乳香', 1]],
      how: '共 3 滴，約 0.5%。臉部更細緻，先在耳後或手臂內側測試。' },
    { kind: '噴霧', title: '清新空間噴霧（30 ml）', oils: [['檸檬', 6], ['茶樹', 3], ['尤加利', 3]],
      how: '共 12 滴。先和 1 小匙高濃度酒精混合，再加純水；使用前搖勻，不要直接噴向人、寵物或食物。' },
    { kind: '噴霧', title: '枕邊安眠噴霧（30 ml）', oils: [['薰衣草', 8], ['羅馬洋甘菊', 4]],
      how: '共 12 滴。噴在枕頭旁的空氣中，離臉遠一點，噴後等味道散開再躺下。' },
  ],

  /* ---------- DIY 手作 ---------- */
  diy: [
    { id: 'roller', title: '滾珠瓶（10 ml）', time: '5 分鐘',
      materials: ['10 ml 玻璃滾珠瓶', '基底油（荷荷芭油、甜杏仁油或分餾椰子油）', '精油 2–4 滴（約 1–2%）'],
      steps: ['先把精油滴入空瓶（例：薰衣草 2 滴＋乳香 2 滴）', '再倒入基底油，裝到約九分滿', '裝上滾珠與瓶蓋，輕輕搖勻', '貼上標籤：名稱、日期、濃度', '先在手臂內側做貼膚測試，24 小時沒問題再使用'],
      note: '基底油開封後建議半年到一年內用完，放在陰涼處。' },
    { id: 'balm', title: '萬用膏（約 30 g）', time: '15 分鐘',
      materials: ['植物油 20 ml', '蜜蠟 5 g（約 4 : 1，可依軟硬度微調）', '精油 6–10 滴', '耐熱量杯、玻璃罐、乾淨攪拌棒'],
      steps: ['隔水加熱，讓蜜蠟和植物油一起融化', '離火，稍微降溫（約 60°C 以下）', '滴入精油，快速攪拌均勻', '倒入罐中，靜置到完全凝固再蓋上蓋子', '用在乾燥粗糙處，避開傷口與眼周'],
      note: '溫度太高精油會很快揮發，所以一定要降溫後才加。' },
    { id: 'spray', title: '空間噴霧（30 ml）', time: '3 分鐘',
      materials: ['30 ml 玻璃噴瓶', '高濃度酒精 1 小匙（約 5 ml）', '純水約 25 ml', '精油共 12 滴'],
      steps: ['先把精油滴進酒精裡，搖勻', '加入純水到約九分滿', '鎖緊噴頭，使用前搖勻', '噴在空氣中，避免直接噴在人、寵物、食物或精緻木質表面'],
      note: '柑橘類精油可能影響部分塑膠，建議使用玻璃瓶。' },
  ],

  /* ---------- 安全須知 ---------- */
  tips: [
    '精油是高度濃縮的植物萃取物，要用在皮膚上，一定先用基底油稀釋。',
    '第一次使用新的精油，先做貼膚測試：稀釋後塗在手臂內側，等 24 小時。',
    '避開眼睛、耳內和黏膜。不小心沾到時，用基底油擦拭，不要直接用水沖。',
    '懷孕、哺乳、嬰幼兒、長者、慢性疾病或服藥中，請先諮詢醫師或合格芳療師。',
    '寵物（尤其是貓）對精油特別敏感。擴香時留出口，讓牠可以離開。',
    '柑橘類精油塗在皮膚後，數小時內（常見建議是 12 小時）避免陽光直曬。',
    '不建議自行內服精油。',
    '精油放在陰涼避光處、蓋緊，遠離孩子。',
    '身體不舒服請就醫，精油不能取代醫療。',
  ],

  /* ---------- 建築（學習站） ----------
   * order：新手路線順序；after：要先完成哪一站才會解鎖；decor：完成後在島上開出的花圃
   * style：貼圖載入失敗時，退回程式繪製的外觀 */
  buildings: [
    {
      id: 'home', kind: 'home', sprite: 'assets/buildings/home.png', name: '筆記小屋', emoji: '📒',
      x: 4, y: 7, door: { x: 4, y: 6 }, accent: '#7a8fb8',
      summary: '看看你走到哪了：進度、最愛的精油，還有自己的筆記。',
      style: { w: 0.7, d: 0.7, h: 40, wall: '#f7ead2', roof: '#c4604a', roofType: 'hip', roofH: 20,
        win: { cols: 2, rows: 1, color: '#9fd6ef' }, chimney: true, door: '#8a5a3a' },
    },
    {
      id: 'kit', kind: 'station', order: 1, group: 'know', sprite: 'assets/buildings/kit.png', name: '入門小舖', emoji: '🎁',
      x: 6, y: 5, door: { x: 7, y: 5 }, after: null, accent: '#3d9bd0', decor: { x: 6, y: 4, color: '#9b7fd6' },
      summary: '拿到第一批精油後，先學會看瓶身、聞香氣、安全收好。',
      learn: ['看懂瓶身標示，分清單方與複方', '開箱檢查與正確的存放方式', '挑出你最想先用的一瓶'],
      style: { w: 0.72, d: 0.72, h: 40, wall: '#f3d9a6', roof: '#e9c88a', roofType: 'flat',
        win: { cols: 2, rows: 1, color: '#9fd6ef' }, awning: ['#3d9bd0', '#ffffff'], door: '#8a5a3a', extra: 'crates' },
      pages: [
        { type: 'info', title: '打開你的第一瓶', items: [
          { icon: '🔖', h: '先看標籤', p: '瓶身會寫名稱、容量與使用注意事項，拿到新精油先讀一遍。' },
          { icon: '🌿', h: '單方與複方', p: '單方只有一種植物；複方是把幾種精油調和在一起，味道更有層次。' },
          { icon: '👃', h: '先聞再用', p: '打開瓶蓋，離鼻子約一個手掌的距離，用手輕輕搧向鼻子，不要貼著鼻孔猛吸。' },
        ] },
        { type: 'checklist', title: '開箱檢查', lead: '把這四件事做完，再往下一步。', items: [
          '每一瓶都蓋緊，沒有滲漏', '逐瓶聞過一次，找出最喜歡的一瓶', '放在陰涼避光的地方，遠離孩子與寵物', '準備一本筆記，開始記錄今天的感受',
        ] },
        { type: 'favorite', title: '選一瓶你想先認識的精油', lead: '先選一款就好，之後可以隨時在筆記小屋換掉。' },
        { type: 'quiz', q: '精油瓶最適合怎麼存放？', options: ['放在窗邊曬太陽，比較香', '蓋緊、放在陰涼避光處', '打開瓶蓋放著，讓味道散出來'], answer: 1,
          explain: '光線、高溫和空氣都會讓精油變質，蓋緊並放在陰涼避光處最安全。' },
      ],
    },
    {
      id: 'academy', kind: 'station', order: 2, group: 'use', sprite: 'assets/buildings/academy.png', name: '精油學院', emoji: '🎓',
      x: 8, y: 4, door: { x: 7, y: 4 }, after: 'kit', accent: '#5b7f95', decor: { x: 9, y: 4, color: '#f2d34d' },
      summary: '精油是什麼、三種基本用法，還有最重要的稀釋與安全。',
      learn: ['精油是什麼、為什麼要「少量」', '擴香、局部、居家三種用法', '用計算器算出該滴幾滴', '安全小守則'],
      style: { w: 0.72, d: 0.72, h: 78, wall: '#cfd8e6', roof: '#aebccd', roofType: 'flat',
        win: { cols: 3, rows: 3, color: '#8ec7ea' }, antenna: true, door: '#4c6378' },
      pages: [
        { type: 'info', title: '精油是什麼', items: [
          { icon: '🌸', h: '來自植物', p: '從花、葉、果皮、樹脂等部位萃取出的芳香物質。' },
          { icon: '💧', h: '高度濃縮', p: '一滴就很有存在感，所以原則是「少量、慢慢加」。' },
          { icon: '🧴', h: '不是一般的油', p: '精油不等於基底油，兩者不能互相取代；基底油是用來稀釋精油的。' },
        ] },
        { type: 'info', title: '三種基本用法', items: [
          { icon: '🌬️', h: '香氣', p: '擴香、嗅吸。最溫和、最容易上手，新手從這裡開始。' },
          { icon: '🤲', h: '局部塗抹', p: '一定要先用基底油稀釋，並先做貼膚測試。' },
          { icon: '🏠', h: '居家', p: '做成噴霧、滴在香氛石或烘衣球上，讓空間和衣物有淡淡香氣。' },
        ] },
        { type: 'tool', tool: 'dilution', title: '稀釋計算器' },
        { type: 'info', title: '安全小守則', items: [
          { icon: '🧪', h: '貼膚測試', p: '稀釋後塗在手臂內側，等 24 小時，沒有紅癢再使用。' },
          { icon: '👶', h: '特別族群', p: '懷孕、哺乳、嬰幼兒、慢性疾病或服藥中，請先諮詢專業人員。' },
          { icon: '🐈', h: '寵物與通風', p: '擴香時保持通風，讓寵物可以離開房間，貓咪尤其要小心。' },
        ], tip: '完整清單隨時可以在右邊的「安全須知」查看。' },
        { type: 'quiz', q: '精油要塗在皮膚上，通常需要？', options: ['直接塗，效果最好', '先用基底油稀釋', '加熱後再塗'], answer: 1,
          explain: '精油高度濃縮，直接塗抹容易刺激皮膚，要先用基底油稀釋。' },
        { type: 'quiz', q: '10 ml 滾珠瓶要做 1% 濃度，大約幾滴？', options: ['2 滴', '10 滴', '20 滴'], answer: 0,
          explain: '1 滴約 0.05 ml，10 ml 約 200 滴，1% 就是約 2 滴。' },
      ],
    },
    {
      id: 'day30', kind: 'station', order: 3, group: 'use', sprite: 'assets/buildings/day30.png', name: '30 天燈塔', emoji: '🏮',
      x: 4, y: 5, door: { x: 4, y: 6 }, after: 'academy', accent: '#c9a23a', decor: { x: 3, y: 5, color: '#f09ac0' },
      summary: '跟著 30 天計畫，每天花 2–3 分鐘，從擴香一路走到居家應用。',
      learn: ['5 個階段：擴香、嗅吸、按摩、保養、居家', '每天一個小任務，打卡累積水滴'],
      style: { w: 0.8, d: 0.8, h: 36, wall: '#c9573f', roof: '#8c3b2c', roofType: 'hip', roofH: 22,
        win: { cols: 1, rows: 1, color: '#f6e7cf' }, door: '#f6e7cf', extra: 'hay' },
      pages: [
        { type: 'info', title: '30 天怎麼走', items: [
          { icon: '🌬️', h: '第 1–6 天　擴香', p: '先讓空間有味道，最輕鬆。' },
          { icon: '👃', h: '第 7–12 天　嗅吸', p: '用鼻子認識每一瓶。' },
          { icon: '🤲', h: '第 13–18 天　按摩', p: '學會稀釋，第一次接觸皮膚。' },
          { icon: '🧴', h: '第 19–24 天　保養', p: '低濃度、慢慢加。' },
          { icon: '🏠', h: '第 25–30 天　居家', p: '把精油帶進生活。' },
        ], tip: '每天只要 2–3 分鐘。漏掉一天沒關係，接著往下做就好。' },
        { type: 'tool', tool: 'daily30', title: '30 天打卡' },
      ],
    },
    {
      id: 'workshop', kind: 'station', order: 4, group: 'use', sprite: 'assets/buildings/workshop.png', name: '配方工坊', emoji: '⚗️',
      x: 8, y: 8, door: { x: 7, y: 8 }, after: 'day30', accent: '#8a6fd0', decor: { x: 9, y: 8, color: '#ffffff' },
      summary: '依用途找擴香、按摩、保養與噴霧配方，並學會自己換算滴數。',
      learn: ['配方的三個步驟', '9 款生活配方（擴香、按摩、保養、噴霧）', '自己換算濃度'],
      style: { w: 0.72, d: 0.72, h: 58, wall: '#e3d9f6', roof: '#8a6fd0', roofType: 'flat',
        win: { cols: 2, rows: 2, color: '#ffd7f0' }, door: '#5d4a9c' },
      pages: [
        { type: 'info', title: '配方三步驟', items: [
          { icon: '🎯', h: '1. 先決定用途', p: '放鬆、專注、清新、保養……用途決定要用擴香、按摩還是噴霧。' },
          { icon: '🌿', h: '2. 選 2–3 款精油', p: '一款當主角，一款柔和味道，一款帶出層次，不用貪多。' },
          { icon: '🧮', h: '3. 算好滴數', p: '擴香看水量，皮膚用的看濃度。先少一點，不夠再加。' },
        ] },
        { type: 'tool', tool: 'recipes', title: '生活配方' },
        { type: 'tool', tool: 'dilution', title: '想改配方？用計算器換算' },
        { type: 'quiz', q: '100 ml 水量的水氧機，擴香常見大約幾滴？', options: ['3–5 滴', '30 滴', '把整瓶倒進去'], answer: 0,
          explain: '擴香的香氣不需要很濃，3–5 滴通常就夠，空間小可以更少。' },
      ],
    },
    {
      id: 'diy', kind: 'station', order: 5, group: 'use', sprite: 'assets/buildings/diy.png', name: '手作坊', emoji: '🫙',
      x: 10, y: 5, door: { x: 10, y: 6 }, after: 'workshop', accent: '#e08a5b', decor: { x: 11, y: 5, color: '#7fd6a0' },
      summary: '動手做滾珠瓶、萬用膏和空間噴霧，把配方變成真正能用的東西。',
      learn: ['滾珠瓶、萬用膏、空間噴霧的材料與步驟', '手作時的溫度與衛生重點'],
      style: { w: 0.7, d: 0.7, h: 44, wall: '#fff1dc', roof: '#e08a5b', roofType: 'hip', roofH: 18,
        win: { cols: 2, rows: 1, color: '#9fd6ef' }, awning: ['#e8604c', '#ffffff'], door: '#8a5a3a', extra: 'tables' },
      pages: [
        { type: 'info', title: '開工前的準備', items: [
          { icon: '🧼', h: '器具要乾淨', p: '瓶子、量杯、攪拌棒先洗淨擦乾，避免雜菌讓成品變質。' },
          { icon: '🫙', h: '用玻璃容器', p: '精油可能影響部分塑膠，玻璃瓶最穩。' },
          { icon: '🏷️', h: '貼標籤', p: '寫上名稱、日期、濃度，之後才知道什麼時候該用完。' },
        ] },
        { type: 'tool', tool: 'diy', title: '三款入門手作' },
        { type: 'quiz', q: '做萬用膏時，精油什麼時候加？', options: ['材料一開始就一起加熱', '離火、稍微降溫後再加', '凝固之後再塗在表面'], answer: 1,
          explain: '高溫會讓精油很快揮發，離火降溫後再加，香氣才留得住。' },
      ],
    },
    {
      id: 'library', kind: 'station', order: 6, group: 'know', sprite: 'assets/buildings/library.png', name: '香氣圖書館', emoji: '📖',
      x: 10, y: 7, door: { x: 10, y: 6 }, after: 'academy', accent: '#3f9a55', decor: { x: 11, y: 7, color: '#6fb3f0' },
      summary: '依需求或名稱查精油：香氣、常見用法與注意事項。',
      learn: ['12 款常見精油的香氣與用法', '依「放鬆、提神、清新……」找精油'],
      style: { w: 0.7, d: 0.7, h: 34, wall: '#d9b98a', roof: '#2f7f9a', roofType: 'hip', roofH: 18,
        win: { cols: 1, rows: 1, color: '#f6e7cf' }, door: '#6f4f2f', extra: 'crates' },
      pages: [
        { type: 'tool', tool: 'lookup', title: '精油查詢' },
        { type: 'quiz', q: '柑橘類精油（如檸檬）塗抹在皮膚後，要注意什麼？', options: ['沒有特別要注意的', '數小時內避免陽光直曬', '一定要馬上用冷水沖'], answer: 1,
          explain: '柑橘類精油可能有光敏性，塗抹後曬太陽容易造成皮膚不適。' },
      ],
    },
    {
      id: 'share', kind: 'station', order: 7, group: 'share', sprite: 'assets/buildings/share.png', name: '分享小站', emoji: '💬',
      x: 6, y: 10, door: { x: 7, y: 10 }, after: 'diy', accent: '#ef7b5c', decor: { x: 5, y: 10, color: '#ff8e72' },
      summary: '用得開心，就分享出去。學會用安心、不誇大的方式說出你的體驗。',
      learn: ['分享的三個原則', '分享前的檢查清單'],
      style: { w: 0.72, d: 0.72, h: 40, wall: '#f3d9a6', roof: '#e9c88a', roofType: 'flat',
        win: { cols: 2, rows: 1, color: '#9fd6ef' }, awning: ['#ef7b5c', '#ffffff'], door: '#8a5a3a', extra: 'crates' },
      pages: [
        { type: 'info', title: '分享三原則', items: [
          { icon: '🗣️', h: '說自己的體驗', p: '「我用起來覺得放鬆」比「這個一定有效」更真實，也更容易被相信。' },
          { icon: '🚫', h: '不誇大、不談療效', p: '不要宣稱能治療或改善疾病，身體不舒服請對方就醫。' },
          { icon: '🛡️', h: '一定附上安全提醒', p: '稀釋、貼膚測試、寵物與孕期，這些比香味更重要。' },
        ] },
        { type: 'checklist', title: '分享前檢查', lead: '準備好要分享前，逐項確認。', items: [
          '我說的是自己的使用感受', '沒有使用「治療、治癒、保證有效」這類字眼', '有提醒要稀釋、先做貼膚測試', '對方有懷孕、寵物或特殊狀況時，有建議先諮詢專業人員',
        ] },
        { type: 'quiz', q: '哪一種分享說法比較合適？', options: ['「睡前擴香讓我覺得很放鬆。」', '「這瓶可以治好失眠，保證有效！」', '「不用稀釋，直接擦最快。」'], answer: 0,
          explain: '分享個人感受就好，不誇大療效，也不教人跳過安全步驟。' },
      ],
    },
    {
      id: 'plan', kind: 'station', order: 8, group: 'share', sprite: 'assets/buildings/plan.png', name: '方案工坊', emoji: '🧾',
      x: 8, y: 10, door: { x: 7, y: 10 }, after: 'share', accent: '#c9573f', decor: { x: 9, y: 10, color: '#f2b84b' },
      summary: '匯入你自己的價目表，設定 PV 級距與產品組合，產生可以分享的客製方案表。',
      learn: ['匯入自己的價目資料（只留在你的瀏覽器）', '設定 PV 級距、組合商品，並自動調整數量', '輸出成圖片、Excel 或 HTML'],
      style: { w: 0.72, d: 0.72, h: 58, wall: '#e3d9f6', roof: '#c9573f', roofType: 'flat',
        win: { cols: 2, rows: 2, color: '#ffd7f0' }, door: '#5d4a9c' },
      pages: [
        { type: 'info', title: '方案表怎麼做', items: [
          { icon: '📥', h: '1. 匯入價目', p: '把你手上的官方價目表（品名、批發價、PV、零售價）貼上或選檔匯入。網站沒有內建任何真實價格或 PV。' },
          { icon: '🎯', h: '2. 設定級距與組合', p: '決定要做哪幾個 PV 級距，替每個級距挑商品；可以讓系統自動調整數量，剛好湊到目標 PV。' },
          { icon: '🧾', h: '3. 產生方案表', p: '預覽後輸出成圖片、Excel 或 HTML，分享給想了解的人。' },
        ], tip: '資料只存在這個瀏覽器，不會上傳。方案表會附上「價格與 PV 以官方公告為準」的聲明，也請不要加入收入或獎金的承諾。' },
        { type: 'tool', tool: 'plan', title: '方案表產生器' },
      ],
    },
    {
      id: 'stories', kind: 'station', order: 9, group: 'share', sprite: 'assets/buildings/stories.png', name: '夥伴的故事', emoji: '📣',
      x: 6, y: 8, door: { x: 7, y: 8 }, after: 'share', accent: '#2f9e8f', decor: { x: 5, y: 8, color: '#5cc2b3' },
      summary: '讀讀其他夥伴怎麼開始、遇到什麼卡關、怎麼走過來。一次 10 則，往下捲就載入更多。',
      learn: ['看看跟你情況相似的夥伴怎麼做', '用標籤與關鍵字找到想看的故事', '點進影片，直接跳到那位夥伴的段落'],
      style: { w: 0.72, d: 0.72, h: 46, wall: '#d8efe9', roof: '#2f9e8f', roofType: 'flat',
        win: { cols: 2, rows: 1, color: '#bfe8ff' }, awning: ['#2f9e8f', '#ffffff'], door: '#3b6f66' },
      pages: [
        { type: 'info', title: '怎麼讀別人的故事', items: [
          { icon: '🔎', h: '找像你的人', p: '用上方搜尋或點標籤（族群、痛點、技能），先看跟你處境相近的夥伴。' },
          { icon: '📖', h: '先看重點，再看全文', p: '每則故事先給一句開場、金句與「教你什麼」，有興趣再展開完整故事。' },
          { icon: '▶️', h: '回到影片原段', p: '「看影片」會直接跳到那位夥伴開始分享的時間點。' },
        ], tip: '故事是夥伴自己的經驗，不是每個人都會一樣；請學做法與心態，不要拿來向別人承諾收入或功效。內容屬於團隊內部學習，請勿外流。' },
        { type: 'tool', tool: 'stories', title: '夥伴的故事' },
      ],
    },
  ],
};
