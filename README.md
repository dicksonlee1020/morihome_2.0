# Morihome ERP — v13 functional prototype

v13 把工作台、供應商確認／部分確認、庫存分配、包件點貨及異常跟進同步到 React / TypeScript 源碼。沿用 Ocean / Kengi 已熟悉的 v9 → v13 design system、navigation 和 desktop/mobile 排版。

這是 **hi-fi functional prototype**：可操作的業務流程使用共用 in-memory store；refresh 會重置營運資料。未連接 Shopify、正式驗證、資料庫或物流 API。

## 開始

使用 Node.js 22.12+（或 Node.js 24 LTS）及 npm：

```bash
npm ci
npm run dev
```

登入頁可展開示範帳號。常用：`ocean@morihome.example`（owner）、`alex@morihome.example`（物流／營運）；示範密碼皆為 `morihome2026`。這些是 mock accounts。

## Build / 驗證

```bash
npm test                   # 75 unit tests
npm run build              # TypeScript check + production Vite build
npm run build:single       # 上述檢查 + dist-single/morihome-erp.html
npx playwright install chromium
npm run test:browser       # 39 business checks + 46 desktop/mobile checks
```

`test:browser` 建立獨立 `test-browser` mode，加入測試 fixture 操作入口；**交付前必須重新 `npm run build:single`**。Production build 不含 `window.__qa`。

Browser 測試包含 1440 / 768 / 390 px、11 個導航入口、部分確認、分配、點貨例外、工作台連動及直接送客戶簽收。客戶及送貨獨立頁仍是預留頁，通過導航檢查不代表該模組已完成。測試記錄與截圖輸出至 `test-results/browser/`。

可用 `MORI_CHROMIUM_PATH` 指定本機 Chromium；`MORI_CHROMIUM_ARGS` 可提供 JSON arguments；`MORI_FONT_DIR` 可選擇本地 `@fontsource/noto-sans-tc` 目錄。一般開發環境毋須設定。

## 下載及文件

- [可直接開啟的 v13 HTML](docs/prototype/Morihome-ERP-Prototype-v13-source-sync.html) — JS、CSS、品牌圖片內嵌；字型由 Google Fonts 載入，離線用系統字型。
- [v13 functional scope、驗收與已知缺口](docs/prototype/v13-handoff.md)
- [原有規格及設計文件](docs/design/) — 屬歷史參考；如有衝突，以 `AGENTS.md` 及 v13 已確認規則為準。

## 源碼入口

| 檔案 | 職責 |
|---|---|
| `src/theme.ts`、`src/index.css` | 既有 design system；本次沒有重設 |
| `src/data/ops.ts` | 需求、採購批次、包件、分配、收貨、canonical activities 與共用 store |
| `src/domain/types.ts`、`src/domain/derive.ts` | 地點／活動型別及營運進度推導 |
| `src/pages/MyFollowupsPage.tsx` | 工作台 saved views、canonical search、contextual actions、Undo |
| `src/pages/PurchasingPage.tsx`、`src/utils/purchaseSheet.ts` | 需求、供應商確認、檔案 review、Excel／圖片輸出 |
| `src/pages/InventoryPage.tsx` | 庫存來源、實際位置與分配 |
| `src/pages/WaitingPage.tsx` | 在途、包件點貨、異常、直送簽收 |
| `src/pages/ProductsPage.tsx`、`src/pages/RestockPage.tsx` | 共用即時庫存與補貨 |
| `src/peek/`、`src/data/timeline.ts` | 記錄詳情及時間線 |
| `src/auth/`、`src/config/permissions.ts` | 示範登入及角色畫面權限；不是安全邊界 |
| `tests/browser/` | 可重跑的 v13 browser regression |

往後應修改源碼，再生成 HTML。不要再直接修改 minified bundle，避免源碼與展示檔分岔。
