# Morihome ERP 重構 — Claude Code 工作守則

呢個 repo 係 Morihome（香港實木傢俬零售，10 人 SME）ERP 營運核心嘅重寫。
設計已定案（v0.2），詳細 spec 喺 `docs/design/erp-redesign-spec.md` —— **做任何 feature 之前先讀相關章節**。
可點擊原型（行為基準）喺 `docs/prototype/morihome-erp-prototype.html`。

## 五條 Invariant（任何情況下唔准違反）

1. `PackageUnit.location` 係唯一真相。改變佢嘅**唯一**途徑係一張 StockMove 由 `assigned` → `done`。冇任何其他 API / mutation 可以直接寫呢個欄位。
2. 推導欄位（訂單送貨狀態、採購狀態、可售數、待辦逾期）**冇 setter**。唔准為佢哋開寫入 API、唔准喺 DB 加可寫欄位。要 cache 可以，但 cache 只係 cache，事件先係真相。
3. StockMove 一旦 `done` 唔可以改。修正 = 開反向 move。
4. Shopify 出貨狀態單向同步：本系統 → Shopify。永不接受反向覆蓋。
5. 內部編號（SKU / C-編號）永不更改。供應商編號係屬性，改動時保留「曾用編號」歷史。

## 六條設計規則

1. 貨嘅去向用 location 表示，唔加狀態值（六個位置 + 六個 move 狀態，取代舊系統 41 個人手狀態）
2. 訂單進度由包件位置推導，唔准人手改
3. 約客係 Activity（待辦），唔係狀態；送貨單可以無 scheduledDate 存在
4. 三個日期分開：customerRequestedDate / scheduledDate / completedDate
5. Landed cost 按體積攤分落每件貨
6. **每個畫面要贏得過 Google Sheet** —— 呢條係驗收標準（見下）

## 畫面驗收標準（Definition of Done）

- **訂單列表嘅「狀態」欄 = 推導 bucket（未採購／備貨中／待約／已約／部分送達／已完成），同「我的跟進」用同一套。「待確認／已確認」等人手狀態鏈唔准出現喺任何畫面**（Q16 有答案之前連人手單概念都唔存在）
- **供應商發貨表對數嘅 match key = 供應商訂單號（HB…）＋廠商品名／型號＋數量。唔准假設供應商文件會有我哋嘅內部包件編碼** —— 包件編碼係 match 成功後系統派嘅
- 列表：inline edit、批量操作、一頁載 100+ 行唔卡
- 「已約」揀日期時段唔跳頁；「打唔通」一撳自動排下次跟進
- 司機畫面 mobile-first；所有畫面手機用得到（Ocean 硬性要求）
- UI 文字一律行 string key（zh-Hant / zh-Hans），唔准 hardcode 中文喺 component 入面；語言係 per-user 設定
- 深淺色兩套都要行（跟系統 + 手動鎖定）

## UI 規範（Ocean 重視，逐條係硬規則）

- 資料表：所有日期／金額／數量欄必須 sortable；每頁講明預設排序（訂單＝落單日期降序）
- 日期格式全 app 一個 formatter：列表 `MM-DD`（跨年先 `YYYY-MM-DD`）、詳情 `YYYY年M月D日`；唔准 inline format
- 一個 column 一件事：電話唔准同姓名夾欄；「逾期未送」等警示做行級紅點／chip，唔准塞入日期欄
- scroll-x table：首欄 fixed left、操作 fixed right
- 長文字欄一律 ellipsis + Tooltip；數字欄右對齊 + `font-variant-numeric: tabular-nums`
- 高頻動作（安排送貨）做 row 直接掣；「⋮」只放低頻動作
- status → colour 係單一 theme mapping，全 app 引用，唔准逐頁自己配色
- 每個 table 有 loading skeleton 同 empty state
- 手機（<768px）：主列表轉卡片式；密集模式喺手機停用；觸控目標 ≥48px
- 品牌 token（森林綠 #3D5C3A、金 #B8943F）經 ConfigProvider theme 入，唔准散落 inline style

## Scope 界線

- **保留唔郁**：Shopify 同步層（webhook、10 分鐘輪詢、雙向商品、payout）。唔准改。
- **重寫（呢個 repo 嘅工作）**：採購 → 物流 → 倉庫 → 配送 + 對數規則層。
- **凍結**：HR、排班、薪資、Petty Cash、佣金 —— 設計有位，Phase 1 唔准起。
- 新需求唔准直接加：記入 backlog，等 scope 會決定。

## 資料同保密

- 任何 fixture / mock / seed data **唔准**用真實客戶資料（姓名、電話、地址）。用化名 + 地區。
- 司機角色只可以查到當日自己嘅單，唔畀客人全名。
- 權限預設拒絕，逐個介面開放（舊系統 130 個介面唔查權限係已知漏洞，唔准重複）。
- uploads 一律行帶 auth 嘅 endpoint 供檔，永不擺入 public static。
- 憑證只行環境變數，`.env*` 永不 commit。

## 未決問題唔准自己作答案

`docs/design/erp-redesign-spec.md` 第 9 節有 Q1–Q15 未決問題（例：香港倉收貨邊個確認、包件資料邊個入、車隊實況）。
撞到呢啲位：**用 TODO 標明 + 揀最簡單嘅假設 + 喺 PR 描述度寫低個假設**，唔准靜靜哋作一個答案落 code。

## 語言

- Code、commit message：英文
- UI 文字：string key，zh-Hant 為 base
- 同 Dickson 溝通：廣東話 + 英文術語
