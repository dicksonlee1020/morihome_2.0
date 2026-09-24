# Backlog

CLAUDE.md 規定：新需求唔准直接加落 code，先記入呢度，等 scope 會決定。
每條寫明：來源、對應 spec 章節、同設計規則有冇衝突、最簡單嘅做法、等邊個。

狀態：`待 scope 會` / `已排入` / `已做` / `擱置`

## 來自 Ocean 原型 feedback（2026-09-23，原文見 `docs/feedback/2026-09-23-ocean-prototype-feedback.md`）

| # | 事項 | 類型 | spec 對應 | 同設計嘅關係 | 狀態 |
|---|---|---|---|---|---|
| B-01 | 採購需求按供應商 filter / group，每個供應商出一份採購表；揀咗供應商就落單 | UI / 流程 | §2.3 `ProcurementRequirement` → `PurchaseOrder`；§2.2 `SupplierProduct` 已經知每件貨邊個供應商 | 冇衝突。採購畫面（§6 查閱層）本身就係咁行，只係 prototype 未畫到咁 detail | 已做（採購頁，2026-09-23） |
| B-02 | 供應商回嘅**訂貨確認**文件 upload 上系統 → 呢幾張單自動變「已訂」 | 新功能 | §2.3 `PurchaseOrder.supplierOrderNo`（HB…）、`orderedAt`；§2.1 `procureStatus` 係推導 | 「已訂」唔可以係人手剔嘅狀態（Invariant 2）：upload 事件寫 `orderedAt` + `supplierOrderNo` + 附件，「已訂」由此推導。最簡單做法：upload 檔案 + 人手 key `supplierOrderNo`，自動讀檔（OCR）留後。附件一律行帶 auth 嘅 endpoint | 已做（人手 key 單號 + 附件名；OCR 未做） |
| B-03 | 供應商**發貨表**（未發貨 / 已發貨兩份）upload → 系統自動對數 → 狀態「自動著燈」 | 新功能 | §2.3 `SupplierShipment`（JH…、`shippedAt`）；§2.4 StockMove 採購收貨 / 過境；§2.6 規則層（規則係資料） | 「著燈」= 由 `PackageUnit.location` 推導（Invariant 1），所以匯入唔係改狀態，而係按發貨表逐件開 StockMove `供應商 → 大陸倉`（或過境）並 done。**呢個直接答緊 Q12（包件級資料邊個入、幾時入）**：如果供應商發貨表有包件編碼，包件資料就係喺呢一步自動入。要 Alex 畀一份真發貨表睇欄位先定得配對規則 | 已做（CSV 對數 → move；等 Alex sample 定真欄位） |
| B-04 | 「庫存等候」列表按訂單收埋，撳掣爆開先見件貨；最右邊顯示「幾件發咗」進度 | UI | §4 `lineStatus` / `orderDeliveryStatus`（幾件發咗 = 已離開 supplier 嘅 PackageUnit 數） | 冇衝突，純顯示。Ocean 會自己畫圖示意（Excel），畫好先做 | 已做（等 Ocean 圖再對） |
| B-05 | 庫存頁簡化：「實有 / 預留 / 可售 / 安全存量」唔啱 Morihome（見貨賣貨、好少存貨）。三數字同補貨提醒抽出嚟做**備貨表**，只入需要備貨嘅款 | UI 重構 | §2.2 `Variant.sourcingType`（儲定貨 / 落單訂 / 訂造）、`safetyStock`（儲定貨適用）；§6 倉庫「在庫包件 / 庫存三數字」 | spec 本身已經預咗 safetyStock 只屬儲定貨款，係而家庫存畫面（`src/pages/InventoryPage.tsx`）對 5,241 個 SKU 全部顯示三數字唔啱。改法：庫存頁 = 在庫包件（按 location），備貨表 = `sourcingType = 儲定貨` 嘅款 + 安全存量 + 補貨提醒（推導：可售 < 安全存量）。`可售` 仍然要對全部 variant 計，因為 §2.3 sourcing 建議（用存貨 / 訂新貨）同 Shopify 可售數靠佢，只係唔喺主畫面顯示 | 已做（庫存 = 在港包件；備貨表另開頁） |
| B-06 | 貨物移動記錄：要睇嘅資訊 OK；介面點 group、自動識位、爆開，Alex 夾緊 | 待輸入 | §2.4 移動流水帳 | 冇衝突。等 Alex；同 Q1（觀塘倉 / 17 室）、Q8（收貨邊個做）一齊傾 | 等 Alex |
| B-07 | 商品雙名制：廠商名 ↔ 出街名對照、產品圖、一個掣 switch 顯示邊個名 | 資料模型 + UI | §2.2 `SupplierProduct`（供應商編號 + 曾用編號）；Invariant 5（內部編號永不變） | 冇衝突，係 `SupplierProduct` 加 `supplierName`（供應商叫嘅名），出街名同產品圖直接用 Shopify 同步層已有嘅 title / image（只讀，唔郁同步層）。「switch」做 per-user 設定，同語言 / 密度一樣。供應商嗰邊嘅圖（1688 / 源氏）係咪要另存：問 Ocean | 已做（雙名 + 切換 + 縮圖；廠商圖未定） |

### 面對面要傾嘅嘢（Ocean 話好多嘢面對面講好啲）

1. B-03：攞一份真嘅供應商發貨表，逐欄對 —— 有冇包件編碼？一行係一件定一個型號？（決定 Q12）
2. B-05：邊啲款算「備貨款」？大約幾多個 SKU？補貨提醒想幾時響（跌穿安全存量即刻，定計埋廠期）？
3. B-04：Ocean 畫嘅等候列表示意圖
4. B-07：供應商產品圖要唔要另存
5. B-02：訂貨確認文件係咩格式（PDF / 圖 / Excel）？先做人手 key 單號得唔得？

## 2026-09-23 spec v0.2 / rbac v0.1 落實後嘅假設（等答）

| # | 假設 | 等邊個 |
|---|---|---|
| A-01 | 司機「派畀本人」未有資料（Q14），訂單頁暫以「今日已約」代替 scope | Alex / Ocean |
| A-02 | 品牌 token 用 CLAUDE.md 嘅 #3D5C3A / #B8943F；theme.ts 舊值同 Logo 實色三者唔同 | Ocean |
| A-03 | 包件喺上載訂貨確認時建立（未派碼），發貨表對到先派碼；Q12 / Q17 / Q18 未答 | Alex |
| A-04 | 出街名暫用廠家品名簡轉繁，真名要由 Shopify 同步層嚟 | — |
| A-05 | 售價 = 人民幣成本 × 1.08 × 2.75（Q5 priceMultiplier 用途未確認） | Kengi |

## 2026-09-24 設定頁 + 人事（Dickson：「唔分 phase 起設定頁，做帳號管理、審批規則、權限設定；另外起定 HR 相關頁面」）

同 CLAUDE.md「HR / 排班 / 薪資 / 佣金 Phase 1 凍結」同 spec §1 有衝突 —— 當係 Dickson 嘅 scope 決定，CLAUDE.md 嗰行等佢改。以下係為咗起得到而作嘅假設：

| # | 假設 | 等邊個 |
|---|---|---|
| A-06 | registry 加 `hr`（owner 全部、ops 查改、其他查）同 `payroll`（owner 全部、finance 查改匯）兩個 module；SCOPE `hr.self`：冇 hr.edit / payroll.view 就只見自己；FIELD_CLASS `HR` = owner + finance | Ocean（rbac-spec §9.3 / §9.5 要補行） |
| A-07 | 請假由 ApprovalRule `leave` 批（seed Jenny，內務類）；指定審批人自己提交就跌落 role 由另一位 owner 批；假期日數唔計星期日（門市六天制） | Ocean / Jenny |
| A-08 | 佣金 = 當月「已完成」（completedDate）訂單金額 × 該同事佣金率（Wilson / Steve 2%），純推導；薪資月結 finance 起草、`payroll` 規則審批人確認後鎖 | Ocean / 雯雯 |
| A-09 | 排班：每人一個基本星期模式 + 逐格改；時段 全日 / 上午 / 下午 / 休息 / 請假，地點 門市 / 寫字樓 / 倉庫 / 送貨 | Alex / Ocean |
| A-10 | 設定頁未做「位置 / 前置時間 / 收款方式」（矩陣有呢行，Dickson 今次冇提）；Petty Cash 規則入咗但停用 | Dickson |
| A-11 | 臨時授權（§9.8.3）只喺設定頁 / 人事頁生效；訂單 / 商品 / 時間線嘅 COST / PII 仍純按角色，等後台 `stripFields()` 統一 | — |

## Side peek（2026-09-23）未做部分

| # | 事項 | 狀態 |
|---|---|---|
| P-01 | 其餘 model config：採購單／送貨單／包件／流水對數／商品／客戶（§6）；設定頁嘅帳號、人事頁嘅員工 / 請假申請都未有 peek | 等訂單頁 review 後逐個推 |
| P-02 | 庫存等候頁：保留 collapse，click 行文字開 peek（§7） | 等 review |
| P-03 | 留言改 / 刪（15 分鐘、soft delete、落 AuditLog）、@mention 鈴鐺通知（舊 Notification model 要接返） | 未做 |
| P-04 | 附件真上傳（auth endpoint）、留言附相 / PDF / Excel | 未做 |
| P-05 | Q28 留言只限某角色可見、Q29 WhatsApp 對話入時間線 | 等 Ocean |
