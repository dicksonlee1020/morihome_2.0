# Backlog

CLAUDE.md 規定：新需求唔准直接加落 code，先記入呢度，等 scope 會決定。
每條寫明：來源、對應 spec 章節、同設計規則有冇衝突、最簡單嘅做法、等邊個。

狀態：`待 scope 會` / `已排入` / `已做` / `擱置`

## 來自 Ocean 原型 feedback（2026-09-23，原文見 `docs/feedback/2026-09-23-ocean-prototype-feedback.md`）

| # | 事項 | 類型 | spec 對應 | 同設計嘅關係 | 狀態 |
|---|---|---|---|---|---|
| B-01 | 採購需求按供應商 filter / group，每個供應商出一份採購表；揀咗供應商就落單 | UI / 流程 | §2.3 `ProcurementRequirement` → `PurchaseOrder`；§2.2 `SupplierProduct` 已經知每件貨邊個供應商 | 冇衝突。採購畫面（§6 查閱層）本身就係咁行，只係 prototype 未畫到咁 detail | 待 scope 會 |
| B-02 | 供應商回嘅**訂貨確認**文件 upload 上系統 → 呢幾張單自動變「已訂」 | 新功能 | §2.3 `PurchaseOrder.supplierOrderNo`（HB…）、`orderedAt`；§2.1 `procureStatus` 係推導 | 「已訂」唔可以係人手剔嘅狀態（Invariant 2）：upload 事件寫 `orderedAt` + `supplierOrderNo` + 附件，「已訂」由此推導。最簡單做法：upload 檔案 + 人手 key `supplierOrderNo`，自動讀檔（OCR）留後。附件一律行帶 auth 嘅 endpoint | 待 scope 會 |
| B-03 | 供應商**發貨表**（未發貨 / 已發貨兩份）upload → 系統自動對數 → 狀態「自動著燈」 | 新功能 | §2.3 `SupplierShipment`（JH…、`shippedAt`）；§2.4 StockMove 採購收貨 / 過境；§2.6 規則層（規則係資料） | 「著燈」= 由 `PackageUnit.location` 推導（Invariant 1），所以匯入唔係改狀態，而係按發貨表逐件開 StockMove `供應商 → 大陸倉`（或過境）並 done。**呢個直接答緊 Q12（包件級資料邊個入、幾時入）**：如果供應商發貨表有包件編碼，包件資料就係喺呢一步自動入。要 Alex 畀一份真發貨表睇欄位先定得配對規則 | 待 scope 會 · 要 Alex 畀 sample |
| B-04 | 「庫存等候」列表按訂單收埋，撳掣爆開先見件貨；最右邊顯示「幾件發咗」進度 | UI | §4 `lineStatus` / `orderDeliveryStatus`（幾件發咗 = 已離開 supplier 嘅 PackageUnit 數） | 冇衝突，純顯示。Ocean 會自己畫圖示意（Excel），畫好先做 | 等 Ocean 圖 |
| B-05 | 庫存頁簡化：「實有 / 預留 / 可售 / 安全存量」唔啱 Morihome（見貨賣貨、好少存貨）。三數字同補貨提醒抽出嚟做**備貨表**，只入需要備貨嘅款 | UI 重構 | §2.2 `Variant.sourcingType`（儲定貨 / 落單訂 / 訂造）、`safetyStock`（儲定貨適用）；§6 倉庫「在庫包件 / 庫存三數字」 | spec 本身已經預咗 safetyStock 只屬儲定貨款，係而家庫存畫面（`src/pages/InventoryPage.tsx`）對 5,241 個 SKU 全部顯示三數字唔啱。改法：庫存頁 = 在庫包件（按 location），備貨表 = `sourcingType = 儲定貨` 嘅款 + 安全存量 + 補貨提醒（推導：可售 < 安全存量）。`可售` 仍然要對全部 variant 計，因為 §2.3 sourcing 建議（用存貨 / 訂新貨）同 Shopify 可售數靠佢，只係唔喺主畫面顯示 | 待 scope 會 |
| B-06 | 貨物移動記錄：要睇嘅資訊 OK；介面點 group、自動識位、爆開，Alex 夾緊 | 待輸入 | §2.4 移動流水帳 | 冇衝突。等 Alex；同 Q1（觀塘倉 / 17 室）、Q8（收貨邊個做）一齊傾 | 等 Alex |
| B-07 | 商品雙名制：廠商名 ↔ 出街名對照、產品圖、一個掣 switch 顯示邊個名 | 資料模型 + UI | §2.2 `SupplierProduct`（供應商編號 + 曾用編號）；Invariant 5（內部編號永不變） | 冇衝突，係 `SupplierProduct` 加 `supplierName`（供應商叫嘅名），出街名同產品圖直接用 Shopify 同步層已有嘅 title / image（只讀，唔郁同步層）。「switch」做 per-user 設定，同語言 / 密度一樣。供應商嗰邊嘅圖（1688 / 源氏）係咪要另存：問 Ocean | 待 scope 會 |

### 面對面要傾嘅嘢（Ocean 話好多嘢面對面講好啲）

1. B-03：攞一份真嘅供應商發貨表，逐欄對 —— 有冇包件編碼？一行係一件定一個型號？（決定 Q12）
2. B-05：邊啲款算「備貨款」？大約幾多個 SKU？補貨提醒想幾時響（跌穿安全存量即刻，定計埋廠期）？
3. B-04：Ocean 畫嘅等候列表示意圖
4. B-07：供應商產品圖要唔要另存
5. B-02：訂貨確認文件係咩格式（PDF / 圖 / Excel）？先做人手 key 單號得唔得？
