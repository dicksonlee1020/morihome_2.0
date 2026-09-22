# Morihome ERP 重構 — 實作 Spec（v0.2 草案）

> 來源：設計文件（一）架構分層與資料模型 v0.2、（二）狀態推導與畫面結構 v0.2。
> 狀態：**草案** —— scope 未同 Ocean freeze（2026-09 底會議），第 9 節未決問題未答晒。
> 行為基準：`docs/prototype/morihome-erp-prototype.html`（可點擊原型 v0.2）。

## 1. 架構分層

| 層 | 處置 | 內容 |
|---|---|---|
| Shopify 同步層 | 保留，唔改 | webhook、10 分鐘輪詢、商品雙向、payout |
| 主檔（Order / Customer / Product） | 保留 + 加欄位 | 2,600+ 訂單、2,200+ 客戶、~650 商品 live data |
| 營運核心（採購/物流/倉庫/配送） | **重寫（本 repo）** | 舊系統零使用，無 migration 包袱 |
| 財務對數 | 優化 | 保留 BankTransaction 結構，加規則層 |
| HR / 排班 / 薪資 / 報銷 / 佣金 | 凍結 | 設計預留接點，Phase 1 唔起 |

## 2. Data Model（重寫範圍）

### 2.1 銷售擴充（喺現有 Order 上加）
- `SalesOrder`: + `purpose`（客單/陳列/存貨/自取/售後補件/贈品）、+ `customerRequestedDate`（date，可空）、+ `customerRequestedNote`（自由文字，如「星期六日先收」）、+ `deliveryStatus`（推導）、+ `procureStatus`（推導）
- `Payment`: 每筆收款一行 —— `kind`（訂金/尾數/附加費）、`amount`、`method`（FK PaymentMethod）、`paidAt`、`reconStatus`（推導）
- `PaymentMethod`（設定表）: `name`（ypay/FPS/現金/支票/PayMe/Shopify Payments）、`statementSource`、`feeRate`
- `Surcharge`: `kind`（樓梯/偏遠/棄置/回倉/上牆）、`amount`

### 2.2 商品主檔擴充
- `Variant`: + `sourcingType`（儲定貨/落單訂/訂造）、+ `safetyStock`（儲定貨適用）
- **內部編號永不變**；`SupplierProduct` 存供應商編號 + `formerCodes[]` 歷史
- `PackageSpec`（沿用現有 packagingBreakdown）: `packageCode`、L/W/H、weight、`volume`（推導）
- `CustomItem`（訂造品）: `internalCode` = `C-{訂單號}-{序號}`、`spec`（尺寸/木材/飾面）、永不上架 Shopify、FK OrderLine
- `CostPrice`: `supplierPrice_CNY`、`fxRate`、`effectiveFrom`

### 2.3 採購
- `ProcurementRequirement`: 由訂單行自動產生；`sourcing`（用存貨/訂新貨，系統按可售建議）、`status`
- `PurchaseOrder`: `batchNo`（如 0908單）、`supplierOrderNo`（HB…）、`orderedAt`、`estimatedReady`
- `SupplierShipment`: `deliveryNoteNo`（JH…）、`shippedAt`

### 2.4 庫存移動（核心）
- `Location`: usage（supplier/internal/transit/customer/loss）；seed：供應商、大陸倉、過境中、香港倉、陳列室、客人、退貨區、盤虧
- `PackageUnit`（追蹤單位）: `packageCode`、FK PackageSpec、FK OrderLine（可空 = 存貨）、FK PurchaseLine、`location`、`arrivedAt`
- `StockMove`: `type`（採購收貨/過境/到港驗貨/送客/調撥/盤點調整/報廢/開帳）、`state`（見 §3）、`from`、`to`、`scheduledDate`、`doneDate`、`qcResult`（通過/部分拒收/全數拒收）
- `StockMoveLine`: FK StockMove、FK PackageUnit、驗貨結果、相片
- `LandedCost`: `kind`（中港運費/清關/內地快遞）、`amount`、`method`（按體積/重量/數量/平均）、掛喺 StockMove
- **移動流水帳** = 已完成 StockMoveLine 嘅事件流。結餘唔儲（可 cache）；差異、報廢、拒收全部係事件，只可沖、唔可改。

### 2.5 交付
- `DeliveryOrder`（= 送貨 StockMove 嘅業務包裝）: `customerRequestedDate`、`scheduledDate`（**可空** —— 未約都存在）、`timeSlot`（上午/下午/晚上/彈性）、`completedDate`、`storageDeadline`
- `DeliveryBatch`（一車）: `runDate`、`vehicle`、`driver`、`totalVolume`（推導）、`driverFee`（按單攤分）
- `Activity`（跟進待辦）: `kind`、`dueDate`、`feedback`、`state`（推導）、`nextActivityId`（鏈式接續）
- `DeliveryAttempt`: `seq`、`result`（成功/失敗/改期）、`failReason`、`signaturePhoto`

### 2.6 財務對數
- `ReconciliationRule`（**資料，唔係 code**，財務自行調）: `statementSource`、`amountTolerance`、`dateToleranceDays`、`descPattern`、`enabled`
- `BankTransaction`（四條流水：銀行/ypay/PayMe/Shopify payout）、`ReconciliationMatch`
- `SupplierInvoice`: OCR `parsed`（唯讀）+ `items`（可改）+ `editHistory`；`Remittance`（XTransfer，一筆匯款勾多張 expense）

## 3. StockMove 狀態機（全系統唯一狀態機）

`draft → waiting → confirmed(等貨) → assigned(準備好) → done`，任何未 done 可 `cancel`。

- `waiting`：前序 move 未完成（系統自動）
- `confirmed`：前序完成但包件未齊喺 from location（系統自動）
- `assigned`：所有 line 嘅 PackageUnit.location == from（系統自動重算，**唔准人手設**）
- `done`：人手確認（收貨/驗貨/簽收）→ 呢一下先更新 PackageUnit.location
- 五條標準鏈：供應商→大陸倉（lead 9日）→過境→香港倉（lead 4日）→客人；香港倉↔陳列室。床褥（品牌商直送）：供應商→香港倉。
- 到港驗貨帶 QC 分支：部分拒收 → 拒收件轉盤虧 + 自動產生補發 ProcurementRequirement。

## 4. 推導規則（全部係計算，唔係欄位）

```
lineStatus(orderLine):
  無 PackageUnit               → 未採購
  任何一件喺 supplier/CN/transit → 在途
  全部喺 HK/陳列室              → 可安排送貨   # 「三件齊晒先約得客」
  部分喺客人                    → 部分送達
  全部喺客人                    → 已送達

orderDeliveryStatus = min(lineStatus)；有已送達又有未送 → 部分送達
activityState: doneAt→已完成; due<today→逾期; due=today→今日; else→計劃中
可售(variant) = 在港(HK/陳列室) 且 orderLine 為空 嘅 PackageUnit 數
escalation: 可安排送貨 且 未約 且 在港日數 ≥ 門檻(預設14, 設定值) → 通知老闆 + 全景標紅
```

**送貨單冇獨立狀態。** 「已到港未約」=（move assigned, scheduledDate null）；「打唔通」= Activity feedback + 自動下次；「已約」= scheduledDate 有值；「改期」= 清 scheduledDate + DeliveryAttempt(改期) + 重開 Activity。舊系統 41 個人手狀態 → 6 move states + 1 location 欄。

## 5. 例外情況

| 情況 | 處理 |
|---|---|
| 分批送貨 | 一單多張送貨 move；訂單自動「部分送達」 |
| 送貨失敗 | DeliveryAttempt(失敗) + 回倉 move + Activity 重開 |
| 陳列品賣走 | 陳列室→客人 一張 move |
| 退貨 | 客人→退貨區；訂單退返部分送達 |
| 售後補件 | 新需求 + 新 PackageUnit，連返原訂單，走同一套鏈 |
| 驗貨損毀 | 拒收件→盤虧 + 自動補發需求 + 流水帳留據 |
| 盤點差異 | 盤點調整 move（事件，唔係改結餘） |

## 6. IA 與角色

主入口 = 任務畫面（唔係模組選單）：
- **流程全景**（全公司）：五欄 pipeline，卡幾多日、邊個負責、斷點標紅；全部推導
- **我的跟進**（採購/物流）：逾期/今日/本週；行內完成「已約/打唔通/客延後」
- **送貨排程**（車 × 時段 × m³ 載量，點選排單，超載轉紅）
- **今日送貨**（司機，mobile-first）：致電/導航/到咗→完成(簽收相)/送唔到
- **未對數**（財務）：自動配對剩低嘅 + 規則自調
- **儀表板**（老闆）：數字可點入，唔要趨勢圖
- 查閱層：訂單（詳情一頁睇晒）、待送貨報表、採購、倉庫（收貨驗貨/在庫包件/庫存三數字/移動紀錄）、商品、設定

角色六個，預設拒絕：老闆(全部)、採購物流、財務(含成本毛利)、銷售客服、司機(**只限當日自己嘅單，冇客人全名**)、上架美術。

## 7. 非功能要求

- 全部畫面手機用得到；司機畫面 mobile-first
- i18n：string key（zh-Hant base + zh-Hans），per-user 語言設定；資料唔翻譯
- 深淺色：跟系統 + 手動鎖定
- 列表效能：100+ 行 inline edit 唔卡（rule #6 驗收）
- Google Workspace SSO 登入；離職停帳戶即停晒

## 8. 上線前置（安全）

uploads 加 auth、輪換 repo 內憑證、.env 出 repo、admin 改離預設密碼 —— 已交 Kengi 四項清單，重構工作唔依賴但上線依賴。

## 9. 未決問題（唔准自行作答）

| # | 問題 | 等邊個 |
|---|---|---|
| Q1 | 觀塘倉同 17 室係咪兩個獨立 location | Alex |
| Q2 | 床褥平均存倉 60 日嘅原因、要唔要提示 | Alex/銷售 |
| Q3 | 陳列品賣走算唔算一次搬運（陳列室係咪 location） | Ocean |
| Q4 | 售後補件走同一套定另開 | Alex |
| Q5 | priceMultiplier（2.75/3）用途 | Kengi |
| Q6 | 正式環境 DB 喺雲定 NAS | Kengi |
| Q7 | 舊物流 9,341 行搬唔搬（建議只搬未完成） | Dickson/Alex |
| Q8 | 香港倉收貨/驗貨實際邊個做 | Alex/Ocean |
| Q9 | 大陸倉係第三方定自租；肯唔肯喺系統確認 | Alex |
| Q10 | 司機用自己機定公司機；app 定網頁 | Ocean/司機 |
| Q11 | 舊系統 20 個物流狀態值完整清單 | Kengi |
| Q12 | 包件級資料邊個入、幾時入（**④成立與否**） | Alex |
| Q13 | 訂造品佔訂單比例 | Ocean/銷售 |
| Q14 | 車隊實況（幾多車/司機/時段/載量單位） | Alex/Ocean |
| Q15 | 「旺角門市」真定假 | Dickson |

## 10. 舊 → 新 對照（migration 參考）

| 現有 | 處置 |
|---|---|
| Order/Customer/Product | 保留 + 加欄位 |
| Order.items[].stockStatus（4） | 刪，改推導 |
| LogisticsTracking（20 狀態） | 刪 → PackageUnit + StockMove + Location |
| WarehouseOperation | 併入 StockMove |
| DeliverySchedule（10 狀態，日期必填） | 重寫做 DeliveryOrder（日期可空） |
| ProcurementContract | 重寫做 PurchaseOrder |
| FollowupReminder | 併入 Activity |
| SKU 當唯一識別 | 內部編號制 + 曾用編號歷史 |
| BankTransaction/Expense | 保留 + 規則層 |
| FinanceManagement 重複頁 | 刪一 |
