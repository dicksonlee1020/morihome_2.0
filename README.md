# Morihome ERP

Morihome ERP 前端，React + TypeScript + Vite + Ant Design 5/6，全套 UI 跟 `src/theme.ts` 嘅設計系統。

第一個畫面：**訂單表**。

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

## 檔案

```
src/
  theme.ts                  設計系統（唯一改顏色尺寸嘅地方）
  types.ts                  Order / OrderItem 型別同金額計算
  data/orders.ts            示範訂單資料 + 狀態→顏色對照表
  components/Pill.tsx        狀態藥丸（顏色只收 theme 傳入）
  components/OrderCards.tsx  手機版訂單卡片列表
  pages/OrdersPage.tsx       訂單畫面（統計卡、篩選、表格）
  App.tsx                   ConfigProvider + Layout 外殼
```

## 訂單畫面做咗啲乜

- 四張統計卡：昨日新訂單、待處理、待送貨、訂單總額
- 狀態分頁（帶張數）、關鍵字搜尋（編號／客戶／電話／貨品）、付款狀態、落單日期範圍
- 表格：排序、多選 + 批量操作列、展開睇貨品明細、篩選後合計、分頁
- 逾期未送嘅訂單，送貨日期會用 `colors.error` 標紅
- 桌面用表格；**768px 以下改用卡片列表** —— 390px 闊擺唔落十欄表格，掃到第三欄就已經見唔到金額同狀態

## 未接嘅嘢

資料喺 `src/data/orders.ts` 寫死，操作（新增訂單、安排送貨、匯出、列印送貨單）只彈提示，未接後台 API。
