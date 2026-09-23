# Morihome ERP

Morihome ERP 前端，React + TypeScript + Vite + Ant Design 5/6，全套 UI 跟 `src/theme.ts` 嘅設計系統。

畫面：**登入**、**我的跟進**（主入口）、**訂單**、**採購**、**庫存等候**、**庫存**、**備貨表**、**產品**。
採購 → 庫存等候 → 庫存 呢條線係照 Ocean 2026-09-23 嘅原型 feedback 改（`docs/backlog.md` B-01 至 B-07）。
全部預設舒適模式（密集嘅 13px 字太細，Dickson 2026-09-22 決定）；右上角可以切密集。

側邊欄可以收成 icon rail（header 左上角掣，記喺 localStorage）。舒適／密集掣已收起（2026-09-23），全部畫面舒適模式。

每個有 table 嘅頁同一個結構（`components/DataTableCard.tsx`）：上面 filter chip（多選、有全部選擇）+ 搜尋 + 動作掣，
跟住一行「篩選後幾多項」（有揀行就變批量操作列），然後 table + pagination（每頁 15 / 50 / 100，全站記住）。
手機版換卡片列表。

設計 spec 喺 `docs/design/erp-redesign-spec.md`（v0.2，2026-09-23）、角色權限喺 `docs/design/rbac-spec.md`，
工作守則喺 `CLAUDE.md` —— 做 feature 之前先讀相關章節。

## 2026-09-23 跟三份 spec 改咗嘅嘢

- **訂單「狀態」= 推導 bucket**（未採購 / 備貨中 / 待約 / 已約 / 部分送達 / 已完成，`domain/derive.ts` `orderBucket`），
  同「我的跟進」用同一套（`data/buckets.ts` 一個 mapping）。舊嘅 待確認 / 已確認 人手狀態鏈已刪。
- **發貨表對數 match key = HB 單號 + 廠商型號/品名 + 數量**（`ops.matchShipment`）；包件編碼係對到之後系統先派，
  廠未發貨嘅包件顯示「未派碼」。對唔到分四種原因交人手；廠報多咗件數會標「少發 n 件」。
- **RBAC**：`src/config/permissions.ts` 一份 registry（MODULES × ACTIONS × ROLES，§9.3 矩陣），導覽用 `view`、
  掣用 `edit / execute / export`；FIELD_CLASS `COST`（成本、毛利只有 owner / finance 見）、`CUSTOMER_PII`。
  七個角色：owner（Ocean、Jenny）、ops（Alex）、finance（雯雯）、sales（Wilson、Steve）、driver（阿桁）、content（Yumi）、sysadmin（Kengi）。
  司機只見今日已約嘅單（TODO Q14：未有派車資料，「派畀本人」暫用「今日已約」代替）。
- **UI 規範**：一個日期 formatter（`utils/date.ts`：列表 MM-DD、詳情 YYYY年M月D日）；電話獨立一欄；
  「逾期未送」「在港 ≥ 14 日未約」係行級 chip；首欄 fixed left、操作 fixed right；數字欄 tabular-nums；每個 table 有 loading skeleton。
- **品牌 token** 改為 CLAUDE.md 嘅森林綠 #3D5C3A、金 #B8943F（theme.ts 有註明三個來源唔同，等 Ocean 確認）。
- **Mock data 跟 Alex 份營運 Excel**：`scripts/build-fixtures.mjs` 由 Excel 抽 681 件廠家目錄（源氏型號 + 廠家品名 + 規格 +
  人民幣價 + 包件拆法、永偉 / 小敏 訂造款、床褥品牌）出 `src/data/fixtures/items.json`；出街名 = 簡轉繁去型號。
  訂單 `PO3562` + 地區（地區分布跟 Excel）、批次 `0903单`、`HB…` / `JH…` 單號、`中通快递 3023…` 物流、
  包件 `Y09BB0025150-3562` + `PF150200001-3562`。Excel 本身唔入 repo；客人一律化名 + 化名電話。

## 行起佢

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # tsc -b + vite build
npm run lint
```

## 設計系統

顏色、字體、尺寸、圓角、組件 token 全部喺 `src/theme.ts`（由設計系統原封不動搬入嚟，未改過）。
畫面唔好寫死 hex：要用色就 `import { colors } from './theme'`。

```tsx
import { ConfigProvider } from 'antd';
import { useMoriTheme } from './theme';

const theme = useMoriTheme();   // 舒適模式；手機自動覆寫成 48px 觸控高度
<ConfigProvider theme={theme} locale={zhHK}>…</ConfigProvider>
```

- 而家全部畫面預設 `useMoriTheme()`（舒適）；`App.tsx` 嘅 `DENSE_BY_DEFAULT` 係空
- theme.ts 原本建議產品 / 庫存用密集，但實際字太細，先擱置；要用返就將 key 加返入去
- 768px 以下一律強制舒適，`dense` 會被忽略

密度喺 `App.tsx` 揀：`DENSE_BY_DEFAULT` 列住邊幾頁預設密集，撳左上角
「舒適 / 密集」可以即場試另一邊。頁面自己唔會 hardcode 密度 ——
要知而家咩密度就用 `useDensity()`（問返 theme token，唔靠 props）。

## 檔案

```
src/
  theme.ts                    設計系統（唯一改顏色尺寸嘅地方）
  auth/                       登入狀態、角色權限 map、mock auth API + 測試
  pages/auth/                 登入 / 唔記得密碼 / 設定新密碼
  i18n/                       string key（zh-Hant base + zh-Hans）+ per-user 語言
  domain/types.ts             Location / PackageUnit / StockMove / Activity（spec §2.4、§2.5）
  domain/derive.ts            推導規則（spec §4），無 setter
  domain/derive.test.ts       22 個測試
  data/followups.ts           跟進 fixture（化名 + 地區，冇真實客戶資料）
  pages/MyFollowupsPage.tsx   我的跟進（spec §6）
  types.ts                    Order / Product / Stock 型別同計算
  data/catalog.ts             由 fixtures/items.json 砌產品（681 件，廠家型號 / 品名 / 包件拆法）
  data/fixtures/items.json    Alex Excel 抽出嘅廠家目錄（scripts/build-fixtures.mjs 生成）
  data/buckets.ts             訂單 bucket → 顏色 / 文字（全 app 唯一 mapping）
  config/permissions.ts       RBAC registry（§9.2–9.5）
  utils/date.ts               全 app 唯一日期 formatter
  data/ops.ts                 採購需求 / 採購單 / 包件 / StockMove 嘅示範資料 + store（唯一寫 location 嘅地方係 completeMove）
  data/ops.test.ts            採購、訂貨確認、發貨表對數嘅測試（7 個）
  components/ItemName.tsx     雙名顯示（出街名 ↔ 廠商名）+ 縮圖 + 切換掣
  components/FilterChip.tsx   表格上面嘅多選篩選 chip（Popover + checkbox + 全選）
  components/DataTableCard.tsx 所有 table 頁共用嘅卡片結構
  utils/useTablePagination.ts  統一 pagination（page size 記喺 localStorage）
  utils/purchaseSheet.ts      採購表 Excel（SheetJS，只寫唔讀）
  utils/nameDisplay.ts        per-user 名稱顯示設定（localStorage 頂住）
  components/Pill.tsx         狀態藥丸（顏色只收 theme 傳入）
  components/CardList.tsx     手機版卡片列表 + 分頁
  pages/OrdersPage.tsx        訂單（舒適）
  pages/PurchasingPage.tsx    採購：需求按供應商 group、生成採購表、上載訂貨確認
  pages/WaitingPage.tsx       庫存等候：按訂單收埋、發貨進度、上載發貨表自動對數
  pages/InventoryPage.tsx     庫存：在港包件（按位置）
  pages/RestockPage.tsx       備貨表：只入儲定貨款，三數字 + 補貨提醒
  pages/ProductsPage.tsx      產品（虛擬捲動，雙名 + 縮圖）
  utils/format.ts             金額 / 百分比格式
  utils/tones.ts              功能色配對
  utils/useDensity.ts         問返 theme 而家係邊個密度
  App.tsx                     ConfigProvider + Layout + 導覽
```

## 登入

冇登入就淨係見到登入頁；登入後 nav 按角色過濾（spec §6 六個角色，`src/auth/permissions.ts`
預設拒絕）。司機登入得見「送貨」。

- 電郵 + 密碼；「保持登入 30 日」（唔剔就關 tab 即登出）—— 對應痛點「後台每日要重新認證」
- Google 帳號登入（示範用模擬帳號選擇器；真 SSO 要等公司 Google Workspace 開咗先做到 domain 限制）
- 唔記得密碼 → 寄重設連結（30 分鐘有效）→ 設定新密碼
- 管理員開嘅帳號用臨時密碼，首次登入強制改密碼
- 錯誤全部統一「電郵或密碼唔啱」，唔會透露邊個電郵存在；錯 5 次鎖 15 分鐘；已停用帳號登入即攔
- 唔設自行註冊；角色永遠喺伺服器決定
- 登入嗰刻套用該用戶嘅語言（雯雯係簡體）
- 示範帳號喺登入頁底部可以摺開，密碼一律 `morihome2026`；`LoginPage.tsx` 嘅
  `SHOW_DEMO_ACCOUNTS` 改做 false 就冇

`src/auth/mockAuthService.ts` 係後台 API 嘅替身，每個 function 對應一個 endpoint，
16 個測試覆蓋鎖定、停用、重設連結過期、首次登入改密碼。

## 我的跟進（spec §6）

採購／物流嘅任務畫面，亦係 app 嘅預設入口（spec §6：主入口係任務畫面，唔係模組選單）。

- 分頁：逾期 / 今日 / 本週 / 之後 / 已完成 / 全部，數字即時跟住郁
- 行內三個動作，全部唔跳頁：
  - **已約** —— popover 揀日期＋時段（上午/下午/晚上/彈性），寫入
    `DeliveryOrder.scheduledDate`，跟住收檔張 Activity
  - **打唔通** —— 一撳收檔，同時開返下一張 Activity（chain via
    `nextActivityId`），舊嗰張永遠唔會被改
  - **客延後** —— 揀客講嘅日期 + 備註，同樣係開新一張
- 批量順延一日
- 「在港 N 日」跌穿 escalation 門檻（預設 14 日，spec §4）會標紅
- 124 行 fixture，虛擬捲動，對住「一頁載 100+ 行唔卡」嗰條驗收
- 手機轉卡片，三個動作變 48px 觸控掣，popover 改做 modal

推導邏輯全部喺 `src/domain/derive.ts`，冇 setter（invariant 2），有 22 個測試
（`npm test`）覆蓋 §4 每條規則，包括「三件齊晒先約得客」——
一件已送到客人、一件仲喺過境，條 line 仍然讀作「在途」。

## 訂單（舒適模式）

- 四張統計卡：昨日新訂單、待處理、待送貨、訂單總額
- 狀態分頁（帶張數）、關鍵字搜尋（編號／客戶／電話／貨品）、付款狀態、落單日期範圍
- 表格：排序、多選 + 批量操作列、展開睇貨品明細、篩選後合計、分頁
- 逾期未送嘅訂單，送貨日期會用 `colors.error` 標紅
- 桌面用表格；**768px 以下改用卡片列表** —— 390px 闊擺唔落十欄表格，掃到第三欄就已經見唔到金額同狀態

## 採購（Ocean B-01 / B-02）

- 訂單一落，需求自動出現。表格佔全闊，上面係 filter chip（供應商多選 + 狀態，參考 Ocean 畀嘅圖），
  訂單號 / 訂單日期 / 數量 / 供應商 / 狀態 都可以排序
- Ocean 嘅流程：篩供應商 → 「下載採購表」→ 每個供應商即刻出一份 Excel（`Morihome-PO-0923.xlsx`，
  用廠家型號 + 廠家品名，附訂單號畀廠家對數）同一張 draft PurchaseOrder（批次號 0923單）；
  冇剔行就用篩選後所有未採購嘅行，有剔就只出剔咗嘅
- 採購單 tab：「上載訂貨確認」→ 記附件名 + 人手 key 供應商單號（HB…）→ `orderedAt` 有值
  → 需求狀態推導為「已訂」，同時為每件貨建立包件（位置 = 供應商）
- 「已訂」冇 setter；自動讀檔（OCR）留後。附件真上傳要行帶 auth 嘅 endpoint
- 備貨表揀款「生成採購需求」會出 purpose = 存貨嘅需求（訂單欄顯示「存貨」）

## 庫存等候（Ocean B-03 / B-04）

- 已落單、廠未發齊嘅訂單。一行一張訂單，右邊「3 / 5 件已發貨」+ 進度條；撳行先爆開貨品同包件
- 「上載發貨表」收 CSV（欄名認 包件编码 / 包件編碼 / packageCode 等）；「試用示範發貨表」扮廠家 send 嚟一份，
  夾埋兩行對唔到嘅（打錯編碼、早已發貨）
- 對數結果先俾你睇：對到幾件、對唔到幾件同原因；「套用」先寫
- 套用 = 每張物流單開一張 採購收貨 move（供應商 → 大陸倉）assigned → done。
  燈自動著係因為包件位置變咗（Invariant 1），唔係改咗狀態值

## 庫存（Ocean B-05）

- 庫存 = 而家喺香港嘅每一件包件：包件編碼、貨品、位置（香港倉 / 陳列室）、屬於邊張客單或者存貨、在港幾多日、物流單號
- 客單包件在港 ≥ 14 日未約會標紅 + 「已升級」（spec §4 escalation）
- 冇任何改狀態嘅掣：調撥、盤點調整都係開 move（示範只彈提示）
- 「實有 / 預留 / 可售 / 安全存量」唔喺呢頁 —— Ocean 話呢套唔啱見貨賣貨嘅做法，搬咗去備貨表

## 備貨表（Ocean B-05）

- 只列儲定貨款（`sourcingType = stocked`，spec §2.2），目前 fixture 佔目錄 2%
- 實有、預留、可售、在途、安全存量（可以 inline 改）、補貨提醒、建議補貨
- 補貨提醒係推導：現在補（可售 ≤ 安全存量而在途補唔返）/ 快要補（< 1.5 倍）/ 在途補緊 / 足夠
  —— TODO：接埋銷售速度同廠期先準

## 產品（Ocean B-07）

- 5,241 個 SKU，分頁（15 / 50 / 100）
- 每件貨兩個名：出街名（我哋賣嘅）同廠商名（廠家型號 + 發貨表叫法）。
  主顯示邊個係 per-user 設定（工具列「出街名 / 廠商名」，暫時 localStorage），另一個名細字跟住；搜尋兩個名都搵到
- 縮圖：暫時係分類配色方塊，真相片由 Shopify 同步層嚟（只讀）；廠家嗰邊有冇圖要問 Ocean
- 來源類型：儲定貨 / 落單訂 / 訂造；「可售」只對儲定貨款有意思，其餘顯示 —
- 毛利低過 40% 會標色；多選 + 批量上架 / 下架 / 改價

## 密集模式（已收起）

- `moriThemeCompact` 仍然喺 theme.ts，`useDensity()` 嘅 `w()` / `wc()` 欄闊縮放都留住，但 header 切換掣已收起，
  全部畫面舒適模式。要再開就喺 `App.tsx` 加返個 Segmented。
- 表格入面唔用 Button 做連結：`controlHeight` 會撐高每一行

## 未做 / 待對

- **原型未入 repo**：`docs/prototype/morihome-erp-prototype.html` 係 CLAUDE.md
  指定嘅行為基準，但檔案唔喺度。我的跟進係照 spec §2.4/§3/§4/§6 砌，
  code 入面有 `TODO(prototype)` 標住要對返。
- **深淺色**：CLAUDE.md 要求跟系統 + 手動鎖定，但 `theme.ts` 只有淺色 token，
  冇 dark 算法或 dark 色值。要 Ocean 定咗暗色調色板先做得，唔應該由 code 自己作。
- **Q12（包件資料邊個入）**：而家假設落單（上載訂貨確認）時就建立包件，編碼 = 廠家型號 + 訂單號 + 件序；
  真正答案好可能係供應商發貨表本身有包件編碼，等 Alex 畀一份真表先定。
- **備貨款清單**：邊啲款算儲定貨、比例幾多，fixture 假設 2%，要 Ocean 定。
- **Excel 發貨表**：而家淨係讀 CSV，xlsx 要後台先做。
- **登入未接後台**：session 係 mock token 放喺 storage；真 API 要簽 JWT、
  server 端鎖定、重設連結經電郵。Google SSO 要等 Workspace tenant。
- 未決假設（CLAUDE.md 要求寫低）：
  - 「打唔通」之後幾時再跟 —— spec 冇寫，暫定 +1 日
    （`UNREACHABLE_RETRY_DAYS`，有 TODO）
  - `Activity.kind` 清單 spec 冇列舉，暫用四個（約送貨/確認到貨/追供應商/追尾數）
  - escalation 門檻 14 日寫死喺 `derive.ts`，spec 講明係設定值，等設定表

## 未接嘅嘢

訂單資料喺 `src/data/orders.ts` 寫死；產品由 `src/data/catalog.ts`、採購 / 包件 / move 由 `src/data/ops.ts`
用固定 seed 生成，每次開都係同一批貨。生成採購表、上載訂貨確認、套用發貨表、生成存貨需求會即時改 in-memory store
（refresh 就重置）；其餘操作（新增訂單、安排送貨、批量上架、匯入匯出、盤點、調撥）只彈提示，未接後台 API。
