# Morihome ERP

Morihome ERP 前端，React + TypeScript + Vite + Ant Design 5/6，全套 UI 跟 `src/theme.ts` 嘅設計系統。

畫面：**登入**、**我的跟進**（主入口）、**訂單**、**產品**、**庫存**。
全部預設舒適模式（密集嘅 13px 字太細，Dickson 2026-09-22 決定）；右上角可以切密集。

設計 spec 喺 `docs/design/erp-redesign-spec.md`，工作守則喺 `CLAUDE.md` ——
做 feature 之前先讀相關章節。

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
  data/orders.ts              示範訂單 + 狀態→顏色對照表
  data/catalog.ts             5,241 個 SKU 生成器（固定 seed）
  components/Pill.tsx         狀態藥丸（顏色只收 theme 傳入）
  components/CardList.tsx     手機版卡片列表 + 分頁
  components/OrderCards.tsx   手機版訂單卡
  pages/OrdersPage.tsx        訂單（舒適）
  pages/ProductsPage.tsx      產品（密集，虛擬捲動）
  pages/InventoryPage.tsx     庫存（密集，可調整數量）
  utils/format.ts             金額 / 百分比格式
  utils/tones.ts              功能色配對
  utils/useDensity.ts         問返 theme 而家係邊個密度
  utils/useTableHeight.ts     表格高度跟視窗走
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

## 產品（密集模式）

- 5,241 個 SKU，用 antd Table 嘅 `virtual` 虛擬捲動：實際只 render 十幾行，
  由撳入去到出到表大約 0.8 秒
- 統計卡：已上架、草稿、已上架但缺貨、庫存成本值
- 篩選：狀態分頁、關鍵字、分類、系列、只睇缺貨
- 毛利低過 40% 會標色，提你覆返個成本價
- 多選 + 批量上架 / 下架 / 改價

## 庫存（密集模式）

- 每個 SKU 見到葵涌倉、門市、已預留、可售、在途、安全存量
- 可售 = 在倉 − 已預留。落單睇嘅係呢個數，唔係在倉數
- 跌穿安全存量先會出「建議補貨」＝ 安全存量 × 2 − 可售 − 在途
- 狀態分頁：缺貨 / 偏低 / 正常；撳「調整」可以改在倉數，要揀原因
  （呢個改動會即時反映落統計卡同篩選，未寫入後台）

## 密集模式點樣做到密

- 行高：密集 41px、舒適 67px，同一屏 14 行 vs 9 行
- 欄闊跟密度走（`useDensity()` 嘅 `w()`）—— 唔咁做嘅話舒適模式啲欄頭會直行
- 表格入面唔用 Button 做連結：`controlHeight` 會撐高每一行，密集就白做
- 狀態藥丸喺表格用短文案（「偏低」），長文案（「低於安全存量」）留畀篩選列同 tooltip

## 未做 / 待對

- **原型未入 repo**：`docs/prototype/morihome-erp-prototype.html` 係 CLAUDE.md
  指定嘅行為基準，但檔案唔喺度。我的跟進係照 spec §2.4/§3/§4/§6 砌，
  code 入面有 `TODO(prototype)` 標住要對返。
- **深淺色**：CLAUDE.md 要求跟系統 + 手動鎖定，但 `theme.ts` 只有淺色 token，
  冇 dark 算法或 dark 色值。要 Ocean 定咗暗色調色板先做得，唔應該由 code 自己作。
- **舊三個畫面未行 string key**：訂單／產品／庫存仲係 hardcode 中文，
  違反 CLAUDE.md 嘅 i18n 規則，要補遷。
- **登入未接後台**：session 係 mock token 放喺 storage；真 API 要簽 JWT、
  server 端鎖定、重設連結經電郵。Google SSO 要等 Workspace tenant。
- 未決假設（CLAUDE.md 要求寫低）：
  - 「打唔通」之後幾時再跟 —— spec 冇寫，暫定 +1 日
    （`UNREACHABLE_RETRY_DAYS`，有 TODO）
  - `Activity.kind` 清單 spec 冇列舉，暫用四個（約送貨/確認到貨/追供應商/追尾數）
  - escalation 門檻 14 日寫死喺 `derive.ts`，spec 講明係設定值，等設定表

## 未接嘅嘢

訂單資料喺 `src/data/orders.ts` 寫死；產品同庫存由 `src/data/catalog.ts`
用固定 seed 生成，每次開都係同一批貨。除咗庫存調整之外，其餘操作
（新增訂單、安排送貨、批量上架、匯入匯出、盤點）只彈提示，未接後台 API。
