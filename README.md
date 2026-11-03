# 精油島 · 一步一步熟悉精油

登入會員編號後，跟著小人走遍一座等角小島：認識精油 → 稀釋與安全 → 30 天打卡 → 配方 → 手作 → 查詢 → 分享。
純前端、無建置步驟。地形與建築使用 Kenney 的 CC0 貼圖（`assets/`），樹、小人、小船與海面由 Canvas 2D 程式繪製，
背景音樂由 Web Audio 即時產生（不需要音檔）。素材來源與授權見 `assets/LICENSE-kenney.txt`。

線上玩：https://cornming.github.io/essence-island/

## 執行

`index.html` 不能直接雙擊開啟（瀏覽器會擋掉部分功能），請用任一靜態伺服器，在這個資料夾內執行：

```bash
python -m http.server 5173
```

再開 http://localhost:5173/

## 結構

| 檔案 | 內容 |
|---|---|
| `js/data.js` | 地圖、7 個學習站與課程內容、精油資料庫、30 天計畫、配方、手作、安全須知、設定。改教材只動這裡 |
| `js/app.js` | 會員編號登入、小人走訪、課程視窗（資訊 / 小測驗 / 清單 / 工具）、進度存檔 |
| `js/world.js` | 等角投影、地形與建築繪製、鏡頭、點選、道路尋路 |
| `js/audio.js` | 背景音樂與完成鈴聲 |
| `assets/` | Kenney 貼圖與授權說明 |

## 重點設定（`data.js` 的 `config`）

- **會員編號驗證**：`verifyMember` 預設只檢查格式（5–12 位數字），進度依編號存在這台裝置的 `localStorage`。
  要驗證名單時，在這裡呼叫你自己的 API，回傳 true / false。
- **背景音樂**：`bgm.src` 留空 = 即時產生舒緩的環境音樂；填音檔路徑 = 改播該檔並循環。右下角 🎵 可開關，偏好會記住。
- **品牌名稱與免責聲明**：`brand`、`disclaimer`。

## 新增學習站

在 `buildings` 加一筆 `kind: 'station'`：`x, y` 放在草地 `g`、`door` 放在相鄰道路 `p`，
`after` 指定要先完成哪一站，`pages` 放課程頁（`info` / `quiz` / `checklist` / `favorite` / `tool`）。
改完用 `node --check js/data.js` 檢查語法。

## 內容說明

課程與精油資料是一般芳香常識的原創整理，不是醫療建議，也沒有使用任何品牌的專有內容。
換成自己團隊的教材前，請確認內容與用語（特別是功效宣稱）符合規範。
