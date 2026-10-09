# v13 source sync — 功能、驗收及交接

日期：2026-10-08。範圍：將已接受的 `Morihome-ERP-Prototype-v13-package-receiving.html` 同步到現有 React / TypeScript project，再由源碼生成單一 HTML。這不是新 visual design 或 production ERP 重寫。

原 source branch：`claude/sleepy-feynman-x1xsoj`，起點 `047cfce6622623a676593b54872b0ce76750165d`。Review branch：`codex/v13-source-sync`。交付 HTML：`Morihome-ERP-Prototype-v13-source-sync.html`。

## 已完成的 prototype 範圍

「已做」指前端可實際操作並更新共用示範資料，不代表已接後端。

| 模組／業務場景 | v13 覆蓋 | 邊界／未做 |
|---|---|---|
| 工作台 saved views | 待處理、逾期、今日到期、需要關注可篩列表；到期／負責人篩選；completed 可查 | 四卡可重疊，不是四個 workflow status |
| 工作台資料與搜尋 | controlled task type；Order No.、客戶、電話、SKU、商品 canonical fields；時間/SLA 與狀態分開 | 公司待辦示範；未接通知平台 |
| 預約及聯絡 | 預約更新 delivery record 再完成 task；未接通記 contact attempt 並重排；延期保留同一 task；預約／其他待辦完成提供 Undo | 完整收款及非收貨類採購異常結案未閉環 |
| 手動待辦 | 手動選 task type；只有「其他」填描述；系統產生的 task 不需重新選類型 | 重複檢查限目前示範資料 |
| 客戶訂單 | 查詢、篩選、詳情、貨品／包件、時間線、留言及預約 | Shopify 為未來 SSoT；目前使用 seed，未有真同步或修改／取消影響處理 |
| 採購需求 | 客單需求及無客單採購（備貨、陳列、售後、其他）；香港／大陸現貨；用現貨並補貨 | 完整變更、已確認後取消及正式審批未做 |
| 採購批次 | 按供應商建批；PR / PB 標準編號；Excel／圖片採購表輸出 | 不會自動 send 給供應商 |
| 供應商確認 | 每行 confirmed qty、實際採購價（保留 cents）、供應商 reference；全部／部分／零確認；未確認餘量產生獨立 PR，保留 parent／batch 關係 | 已確認批次再修正及完整 revision workflow 未做 |
| 檔案 matching | Excel／CSV 等結構化檔可解析及核對；unmatched review 保留原因、負責人、follow-up；PDF／圖片可作憑證並手動確認 | PDF／圖片 OCR、持久附件儲存、跨批次自動匹配未做 |
| 庫存及分配 | 香港倉、大陸倉、在途、陳列；完整商品單位由包件組成；分配客單／備貨／陳列；保留採購來源及分配歷史 | 任意實體調倉、盤點、報廢及倉位管理未做 |
| 庫存一致性 | 同一共用 store 驅動庫存、產品、備貨、需求及工作台；不完整／已分配／隔離包件不會算成可用整套 | 補貨策略仍是安全存量示範，沒有預測／MOQ／完整估值 |
| 供應商發貨 | 手動及清單配對後進入 supplier transit；發貨不等於大陸收貨；追蹤在 package level | 真物流商 API、掃碼及標籤列印未接 |
| 包件點貨 | CN / HK 分階段、逐包已收／短少／錯件／破損；只更新本次選取包件；防重複收貨與重複列 | 不提供跨人同時操作的交易鎖 |
| 收貨異常 | 短少保留在途；錯件另記實收未知貨品；破損實收但隔離；原因／負責人／跟進；工作台可回到原包件 | 正式退貨、索償、RMA case management 未做 |
| 補收／解除異常 | 補收、驗收通過更新來源；錯件須記退回 disposition；保留 receipt history；自動完成原 task；匯出 CSV 核對清單 | 更正已入帳收貨／取消收貨未建正式 reversal 流程 |
| Direct-to-HK | 供應商直送香港例外路線，香港點貨後才增加可用庫存 | 不是所有一般倉務流程的替代 |
| Direct-to-customer | 發貨為 customer transit；逐包簽收需簽收人與憑據；部分簽收保留部分送達；全齊才完成 | 憑據是文字記錄；未有真簽名板／相片上傳；普通車隊 delivery app 未做 |
| 設定、權限、人事 | 保留既有示範帳號、角色矩陣、審批、排班／請假／簡化薪資等畫面及局部操作 | 人事政策仍待確認；客戶管理、獨立送貨調度仍為預留頁 |
| 財務及整合 | 付款摘要、追尾數待辦、採購成本等局部資料 | 完整 AP/AR、流水對數、付款、退款、Shopify／WMS／通訊整合未做 |

## 保留的架構決定

- Order、Requirement、Purchase Batch、Physical Location、Allocation 及 Activity 保持分開；訂單營運摘要由資料推導。
- Supplier shipped → 在途 → 點貨／exception → 收貨；不能靠改一個巨型 status 代替實際事件。
- 庫存按完整商品單位判斷可分配量。包件 `unitId`、採購來源與現時客單分配是不同欄位；重新分配不能洗走來源。
- 工作台直接讀 canonical activities。收貨 exception 解決後保留 task/history 並 complete，不刪除。
- 源碼版使用既有 React、Ant Design 及 theme；沒有包一層 iframe 或嵌入舊 minified HTML 假裝完成源碼同步。

## 給 Kengi 的驗收路徑

1. Owner 登入工作台：點四張卡、篩到期／負責人、搜 PO／電話／SKU，檢查待辦與到期／狀態分開。
2. 採購新增無客單備貨需求（數量 3），建供應商批次，確認 1 件及 `123.45` 採購價：應保留 2 件餘量 PR 及原批次 reference。
3. 在庫存等候記供應商發貨：貨品仍在途，大陸可用庫存不增加。
4. 以 Alex 開「包件點貨／簽收」：部分已收，部分短少／錯件／破損；exception 缺原因要擋住；不齊／隔離貨品不可分配或上港車。
5. 工作台點收貨異常 contextual action：回到原包件；補收／驗收後原 task 自動完成，receipt history 保留。
6. 全套 CN 收齊 → 上港車 → HK 收齊：庫存／產品／備貨共用數字；客單貨齊後才可約送貨。
7. 將完整現貨分配到陳列再回備貨：實際位置不變、allocation 改變、可用數跟住更新。
8. Direct customer route：發貨不等於送達；未填簽收人／憑據不能簽收；部分與全部簽收顯示不同進度。
9. 390 px 手機重做點貨／異常及簽收；跨頁導航不得撐闊 document。

## QA 記錄

- TypeScript 檢查及 production Vite build：通過。
- Repo 原有 unit tests：75 通過。更新舊採購編號、確認輸入與 supplier-transit 預期；凍結 auth 測試時鐘，避免執行日期／DST 造成 expiry 測試漂移。
- v13 business regression：39 通過，涵蓋原子拒絕、重複收貨、短少／錯件／隔離、補收、可用整套、工作台、直送與過期 import preview。
- v13 UI regression：46 通過；包含 1440 / 768 / 390 px、11 個導航入口、實際收貨與 CSV 下載、手機簽收，無 browser runtime error。
- Source parity：固定日期／時區下，與已接受 v13 的初始 canonical state 完全相同；7 頁 × desktop/mobile 共 14 個頁面文字一致；工作台、採購、庫存等候的 6 張 desktop/mobile 截圖逐 pixel 相同。
- 額外修正詳情 ActivityBar 的條件式 hook，令缺少對應 row 時亦維持固定 hook 次序。

這些是 prototype 的已測範圍，不等同全業務／production 安全／多瀏覽器 UAT。Browser automation 使用 Chromium，沒有聲稱 Safari／iOS 真機通過。

## 技術與營運限制

- 營運資料存在記憶體，reload 重置；session／偏好使用瀏覽器 storage。正式持久化、多人交易、後端驗證與審計不在本版。
- 本輪優先保持已接受 HTML 行為。部分 recovered prototype helper 仍使用寬鬆 `any`、短局部變數及集中式 store；TypeScript build 可通過，但後續 production 工程仍要拆分 domain service、收緊型別／API contract。
- Lint 沒有 error；仍有 prototype code style、Fast Refresh exports 和 hook dependency warnings，未視為 production code-quality gate 已完成。沒有關掉規則掩蓋警告。
- 單檔下載需要內嵌依賴，因此 bundle 較大；一般 Vite build 的大 chunk 警告仍在。保持這個交付方式符合當前展示用途。
- 只提交源碼、化名 demo 資料、build artifact 與此交接文件；沒有將私有 transcript／業務原始檔複製入 public repo。
