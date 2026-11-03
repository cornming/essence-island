# 接上 Firebase：讓所有夥伴互相看到在線

只要一個免費的 Firebase Realtime Database（Spark 方案，不用綁信用卡）。大約 5 分鐘。

## 步驟

1. 開 <https://console.firebase.google.com>，用 Google 帳號登入。
2. **建立專案**：名稱隨意（例如 `essence-island`），「Google Analytics」可以關掉，按建立。
3. 左側選單 **Build（建構）→ Realtime Database → 建立資料庫**。
   - 位置選離台灣近的 `asia-southeast1（新加坡）`。
   - 安全性規則選「**以鎖定模式啟動**」，按啟用。
4. 進 **規則（Rules）** 分頁：全選刪掉，貼上 [`presence-rules.json`](presence-rules.json) 的**全部內容**，按**發布（Publish）**。
5. 回 **資料（Data）** 分頁，最上方有資料庫網址，長得像
   `https://essence-island-xxxxx-default-rtdb.asia-southeast1.firebasedatabase.app/`，複製起來。
   非美國區的網址一定帶區域（`asia-southeast1`），要整串複製。
6. 打開 `js/data.js`，把網址填到 `config.presence.firebaseUrl`：

   ```js
   presence: { enabled: true, firebaseUrl: 'https://你的網址.firebasedatabase.app', room: 'main' },
   ```

   再把 `index.html` 裡 `js/data.js?v=…` 的版本號加 1（避免瀏覽器用舊檔），commit 並 push。
7. **驗證**：用兩個不同的瀏覽器（或一般視窗 + 無痕視窗）開網站，登入不同的會員編號。
   兩邊左上角都會出現「👥 2 位夥伴在線」，並看到對方的小人；Firebase 的「資料」分頁會出現
   `essence-island / presence / main / <隨機 id>`，裡面只有 `n`（暱稱）、`x`、`y`、`t`。

## 怎麼調整

| 想做的事 | 作法 |
|---|---|
| 分隊伍（不同隊互相看不到） | 改 `room`（英數、`-`、`_`，最多 20 字） |
| 暫時關掉 | 把 `firebaseUrl` 清空（回到只有同瀏覽器分頁互通） |
| 看用量 | Firebase 的 Realtime Database →「使用情形（Usage）」分頁 |

## 用量與費用

- Spark 方案超過額度會**停止服務**，不會自動收費；除非你自己升級到 Blaze，否則不會有帳單。
- 額度：同時連線 100、儲存 1 GB、每月下載 10 GB。
- 每位在線的人每小時下載約 2 MB（20 人同時在線時），所以 20 位夥伴每天各用 1 小時，一個月約 1.2 GB，遠低於上限。
- 公開網站的規則擋不住有心人灌垃圾資料；規則已限制欄位、長度與座標範圍，但若看到異常用量，把 `firebaseUrl` 清空即可停用。

## 常見問題

打開瀏覽器 F12 →「Network（網路）」，找結尾是 `.json` 的請求：

| 看到 | 原因 |
|---|---|
| `401` / `Permission denied` | 規則沒發布，或貼的內容不完整。重貼 `presence-rules.json` 並按發布 |
| 請求打不出去 / DNS 錯誤 / `404` | 網址打錯（少了區域、多了空白），或根本不是 Realtime Database 的網址 |
| 完全沒有 `.json` 請求，也沒有晶片 | `firebaseUrl` 還是空的、不是 `https://` 開頭，或瀏覽器還在用舊的 `data.js`（版本號沒加） |
| 有請求且 `200`，但看不到人 | 兩邊的 `room` 不同；或另一位在「筆記小屋」把「讓其他夥伴看到我在線上」關掉了 |
| 晶片只顯示自己 | 對方的分頁在背景（會先離線省電），切回去就會出現 |

## 規則怎麼運作

`presence-rules.json` 只開放 `essence-island/presence/<room>/<id>` 這一個位置：任何人都能讀整個 room，
只能寫自己的 id（6–12 碼小寫英數），欄位必須剛好是 `n`（≤12 字）、`x`、`y`（0–20）、`t`（必須等於伺服器時間），
多一個欄位就拒絕；不能讀整個資料庫，也不能一次刪掉整個 room。
這份規則已用 Firebase 官方的 Database Emulator 驗證過：17 個合法與非法的寫入、讀取、刪除情境都符合預期。
