# Morihome ERP

Morihome ERP 前端，React + TypeScript + Vite + Ant Design 5/6，全套 UI 跟 `src/theme.ts` 嘅設計系統。

畫面：**訂單**（舒適模式）、**產品** 同 **庫存**（密集模式）。

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

- 訂單 / 客戶 / 採購 / 送貨 → `useMoriTheme()`（舒適）
- 產品 / 庫存 / 上架 backlog → `useMoriTheme(true)`（密集）
- 768px 以下一律強制舒適，`dense` 會被忽略

密度喺 `App.tsx` 揀：`DENSE_BY_DEFAULT` 列住邊幾頁預設密集，撳左上角
「舒適 / 密集」可以即場試另一邊。頁面自己唔會 hardcode 密度 ——
要知而家咩密度就用 `useDensity()`（問返 theme token，唔靠 props）。

## 檔案

```
src/
  theme.ts                    設計系統（唯一改顏色尺寸嘅地方）
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

## 未接嘅嘢

訂單資料喺 `src/data/orders.ts` 寫死；產品同庫存由 `src/data/catalog.ts`
用固定 seed 生成，每次開都係同一批貨。除咗庫存調整之外，其餘操作
（新增訂單、安排送貨、批量上架、匯入匯出、盤點）只彈提示，未接後台 API。
