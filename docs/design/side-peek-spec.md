# Side Peek 與時間線（Chatter）設計 v0.1

> 放 `docs/design/side-peek-spec.md`。參考 Odoo chatter，按 Morihome 設計原則改寫。
> 前置閱讀：主 spec §4（推導規則）、rbac-spec.md 9.5（field class）、9.7（AuditLog）。

## 1. 行為

- **列表任何一行 click → 右邊 side peek**（唔跳頁、唔蓋 list）。checkbox、行內掣、連結一律 `stopPropagation`
- Peek 開住時：該行高亮；`↑`/`↓`（或 `j`/`k`）切換上／下一行紀錄；`Esc` 閂；`Enter` 或「開全頁」按鈕 → 詳情全頁
- URL 同步：`?peek=<model>:<id>`，可以 copy link 分享、reload 保留、瀏覽器返回鍵閂 peek
- 寬度：桌面 520px（可拖 440–720，per-user 記住）；平板 ≥768px 蓋住 list 右半；**手機 <768px 變全螢幕 sheet**，頂部返回箭咀
- 同一時間只有一個 peek；喺 peek 入面撳關聯紀錄（例：訂單 → 採購單）→ 換 peek 內容，有「‹ 返回」麵包屑

## 2. 版面（由上至下）

1. **Header**：編號＋推導狀態 pill（同列表同一 colour mapping）＋最多 3 個主要動作（依角色＋狀態，例：訂單「安排送貨」「WhatsApp 客人」）＋「⋯」低頻動作＋「開全頁」
2. **待辦條**：呢張紀錄上未完成嘅 Activity（例：「WhatsApp 約時間 · 今日到期 · Alex」），可以即場完成／改期 —— 同「我的跟進」同一套操作
3. **摘要**：6–10 個關鍵欄位，兩欄 label/value；可編輯欄位 inline edit（受 RBAC）
4. **內容 tab**（按 model 設定）：例訂單＝「貨品與包件｜收款｜送貨」
5. **時間線**（見 §3），佔 peek 下半部，獨立 scroll

## 3. 時間線（History + Comment）

### 3.1 資料來源：即時 union，唔另起歷史表

| 來源 | 例子 | 圖示 |
|---|---|---|
| `Comment`（新） | 「@Alex 客話可能改地址，約之前問清楚」 | 💬 |
| `AuditLog`（9.7）欄位變更 | 「Wilson 將客要求收貨日 09-15 → 09-28」 | ✎ |
| `StockMove` 完成事件 ＋ 推導後果 | 「Alex 確認收貨 SM-2609 · 包件 3/3 在港 → 可安排送貨」 | 📦 |
| `Activity` 完成／改期 | 「Alex 打唔通 · 自動排 09-23 再跟」 | ☎ |
| 審批（9.6） | 「Ocean 批准 報廢 1 件」 | ✓ |
| 附件上載 | 「雯雯 上載 FPS 入數截圖」 | 📎 |
| Shopify 同步 | 「Shopify 同步：金額 $9,240 → $9,560（跨月修改）」 | ⟳ |

**推導狀態唔會以「某人改狀態」形式出現** —— 只以「事件 → 後果」出現（事件嘅 actor 就係責任人）。狀態變化嘅後果文字由推導引擎喺事件發生時計好寫入 event payload，唔係 render 時重算。

### 3.2 顯示

- 最新喺最頂；按日分組（今日／昨日／9月20日）；每頁 20 條，向下載入更多
- Filter chips：全部｜留言｜變更｜物流事件｜待辦
- 系統事件用細灰字單行；留言用卡片、顯示頭像；同一人 5 分鐘內連續欄位變更合併做一條（「Wilson 改咗 3 個欄位 ▾」）
- 時間：今日顯示 `14:32`，其餘跟全 app 日期 formatter

### 3.3 留言（Composer）

- 喺時間線頂；`@` 彈出同事名單（只列有該紀錄 view 權限嘅人）；可附相／PDF／Excel（沿用 9.x 附件規則，行 auth endpoint）
- `@mention` → 對方鈴鐺通知（舊 ERP `Notification` model 已存在但鈴冇顯示 —— 要接返）；通知 click 直接開該紀錄 peek 並捲到該留言
- 只可以改自己 15 分鐘內嘅留言；刪除 = soft delete（顯示「留言已刪除」），兩者落 AuditLog
- **留言係同事之間**；客人講嘅要求（收貨日、上樓指示）係訂單欄位，唔准用留言代替。Composer 下方提示：「客人要求請填入訂單欄位」

## 4. 權限

- 睇到紀錄（view）＝睇到佢嘅時間線同留言；可以留言＝ view 權限即可（留言唔等於改紀錄）
- **Field class 剝除套用到時間線**：含 `COST`／`FINANCE_DETAIL` 欄位嘅變更事件，冇權限嘅角色整條唔顯示（唔係顯示「已隱藏」）
- driver：只喺自己當日單有 peek（手機 sheet），只見物流事件同留言，唔見金額以外嘅財務事件
- sysadmin：跟 9.8，預設 masked

## 5. 資料模型（新增）

`Comment { model, recordId, authorId, body, mentions[userId], attachments[], createdAt, editedAt?, deletedAt? }`
Index：`(model, recordId, createdAt desc)`。時間線 API：`GET /api/timeline/:model/:id?types=&cursor=` —— 後端做 union + field-class strip + 分頁，前端唔准自己砌。

## 6. 套用範圍（一個通用組件）

`<RecordPeek model id />` ＋ 每個 model 一份 config（header 動作、摘要欄、tabs）。Phase 1 覆蓋：
訂單｜採購單／採購表｜送貨單｜包件（在港包件頁）｜流水／對數配對（財務）｜商品｜客戶

## 7. 同現有 UI 嘅關係（待 Dickson 確認）

- 訂單頁：行首「＋展開」由 peek 取代 → 建議移除
- 庫存等候頁：**保留 collapse**（Ocean 明確要求一眼睇多張單發貨進度），peek 做補充（click 行文字開 peek，click 展開箭咀先 collapse）

## 8. 未決

| # | 問題 | 等邊個 |
|---|---|---|
| Q28 | 留言要唔要「只限某角色可見」（例：財務內部備註）？Phase 1 建議唔做 | Ocean |
| Q29 | 客人 WhatsApp 對話要唔要記入時間線？建議 Phase 1 唔做（隱私＋整合成本），只記「已 WhatsApp 聯絡」事件 | Ocean |
