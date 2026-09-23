# 第 9 章：角色與權限（RBAC）v0.1

> 放喺 `docs/design/rbac-spec.md`，同主 spec（erp-redesign-spec.md）並讀；章節編號 9.x 供 prompt 引用。
> 現狀：舊系統 9 個角色、63–73 個 module.action 權限點、RolePermission 表 + user 層 permissions override；約 130 個介面只查登入唔查權限，任何帳號（包括外部供應商角色）叫得到財務功能。新設計原則：**預設拒絕、逐個開放、冇 user 層例外**。

## 9.1 帳戶與身份

1. `User` ↔ `Employee` 一對一（內部員工）；冇 Employee 對應嘅 User 只可以係 `sysadmin` 或外部帳號
2. 登入方式待定（**Q19**，Ocean 拍板）：現階段 Google ＋ 電郵密碼雙軌並存
3. `User` 加欄：`companyIds[]`（預設 `["morihome"]`，見 9.4）、`expiresAt`（外部／臨時帳號自動失效）、`mfaEnabled`（保留欄位，政策併入 Q19 一齊傾）
4. **取消 user 層 permissions override**。要例外 → 開新角色。10 人公司角色成本低，override 混亂成本高 —— 舊系統嘅教訓
5. 離職：停 User 即時生效；歷史記錄嘅 `createdBy` 等關聯保留唔改

## 9.2 權限模型原則

- 前後端共用**一份 registry**（`src/config/permissions.ts`）：`MODULES × ACTIONS × ROLES`
- Actions 只有四個：`view`／`edit`／`execute`（確認搬運單、簽收、配對等改變事實嘅動作）／`export`
- **`approve` 唔喺矩陣入面** —— 所有審批由 ApprovalRule（9.6）決定
- 後端每條 route 行 `requirePermission(module, action)`；前端用同一 registry 決定選單同掣嘅顯示 —— 顯示邏輯永遠唔可以係唯一防線
- Default deny：registry 冇列明 = 拒絕

## 9.3 角色與矩陣

| code | 中文 | 現任 |
|---|---|---|
| `owner` | 老闆 | Ocean、Jenny |
| `ops` | 採購物流 | Alex |
| `finance` | 財務 | 雯雯 |
| `sales` | 銷售客服 | Wilson、Steve |
| `driver` | 司機 | 阿桁 |
| `content` | 上架美術 | Yumi |
| `sysadmin` | 系統管理 | Kengi |

唔設 `viewer`（Phase 1 冇呢類用戶）；唔設 `ops_head`（10 人冇分層）。舊 9 角色 → 呢 7 個嘅對照，由 9.9 migration 報告產出後人手確認。

**ROLE_MATRIX**（● 全權 view+edit+execute　◐ 受 scope／範圍限制　◔ 只讀　○ 冇　— 不適用）

| 模組 | owner | ops | finance | sales | driver | content | sysadmin |
|---|---|---|---|---|---|---|---|
| 訂單 | ● | ◔ | ◔ | ◐¹ | ◐² | ○ | ○ |
| 我的跟進 | ◔ | ● | ○ | ◔ | ○ | ○ | ○ |
| 流程全景 | ◔ | ◔ | ◔ | ◔ | ○ | ○ | ○ |
| 採購（需求／採購表／訂貨確認／發貨對數） | ◔ | ● | ◔ | ○ | ○ | ○ | ○ |
| 倉庫（收貨驗貨／在港包件／移動紀錄） | ◔ | ● | ◔ | ◔³ | ○ | ○ | ○ |
| 備貨表 | ● | ● | ◔ | ◔⁴ | ○ | ○ | ○ |
| 送貨排程 | ◔ | ● | ○ | ◔ | ◐² | ○ | ○ |
| 對數（未對數／配對規則） | ◔ | ○ | ● | ○ | ○ | ○ | ○ |
| 收支／月結 | ● | ○ | ● | ○ | ○ | ○ | ○ |
| 商品 | ● | ◔ | ◔ | ◔ | ○ | ●⁵ | ○ |
| 客戶 | ● | ◐⁶ | ◔ | ● | ◐² | ○ | ○ |
| 設定（位置／前置時間／收款方式） | ● | ◔ | ◐⁷ | ○ | ○ | ○ | ◐⁸ |
| 帳號與權限 | ● | ○ | ○ | ○ | ○ | ○ | ●⁹ |
| 審計記錄 | ◔ | ○ | ◔ | ○ | ○ | ○ | ◔ |

註：¹ sales 只可以改備註、客要求收貨日、渠道；金額貨品唔郁　² driver 只限**派畀本人＋當日**（9.4）　³ 只為答交期查在港包件　⁴ 只見「可售」數　⁵ content 唔見成本（9.5）　⁶ ops 見聯絡資料為約客用　⁷ finance 可改配對規則、收款方式　⁸ sysadmin 只掂技術設定（備份、匯入、integration）　⁹ 管帳號但**唔可以自升權限**（改自己角色要另一個 owner 確認）

## 9.4 SCOPE_RULES（row-level）

| 規則 | 內容 |
|---|---|
| `driver.own_today` | 送貨單：`assignee = self AND runDate = today`；歷史單只可以睇自己嘅、7 日內【待確認】 |
| `followup.assignee_default` | 我的跟進預設 filter 自己；ops 可切「全部」 |
| `company` | 所有核心 entity 保留 `companyId`（預設常量 `morihome`）。**Phase 1 唔啟用 scope 過濾** —— 第二法人／品牌要唔要共用系統係 scope 會決定（**Q24**）。而家做嘅係 schema 預位，唔係功能 |

## 9.5 FIELD_CLASSES（field-level 剝除，序列化層做，唔係前端收埋）

| class | 欄位 | 邊個見到 |
|---|---|---|
| `COST` | 成本價、landed cost、毛利、供應商價、費率 | owner、finance |
| `CUSTOMER_PII` | 客人全名、電話、地址 | owner、sales、ops、finance；driver 只喺自己當日單（9.4 交集）；content、sysadmin 剝除 |
| `FINANCE_DETAIL` | 收款明細、流水、對數記錄 | owner、finance |
| `HR` | 薪資、假期、佣金 | 凍結模組；class 先定義，Phase 1 冇 route 用 |

`stripFields(doc, user)` 喺 response 序列化統一 apply；export 一樣行呢層。

## 9.6 ApprovalRule（審批係設定，唔係 code）

Schema：`{ approvalType, thresholdAmount?, approverRole?, approverUserId?, active }`。有 `approverUserId` 就指定人、冇就跌落 role。

Phase 1 啟用嘅 seed：

| type | 觸發 | 預設審批 | 備註 |
|---|---|---|---|
| 採購合同 | 全部（threshold 預設 0，可調） | Ocean | 業務類 |
| 報廢／盤虧 | 全部 | Ocean | ops 建、owner 批 |
| 盤點調整 | 差異 ≥ 設定件數 | Ocean | |
| 退款 | 全部 | Ocean | |
| Petty Cash／請假／薪資 | **凍結** | Jenny | schema 支援；「業務批 Ocean、內務批 Jenny」用 approverUserId 表達 |

規則：審批決定必落 AuditLog；審批人唔可以批自己建嘅嘢。

## 9.7 AuditLog

Append-only：`{ ts, userId, event, targetModel/Id, before, after, reason? }`。必記事件：登入／登出、權限或角色變更、審批決定、人手配對／unmatch、搬運單修正（反向單）、含 `COST` 或 `CUSTOMER_PII` 欄嘅 export、field-class 臨時授權（9.8）。

## 9.8 sysadmin 原則

1. 冇任何 approve；2. 預設被 `COST`、`CUSTOMER_PII` 剝除 —— debug 用 masked data；3. 要 full data → owner 喺系統內臨時授權（限時，自動過期，落 audit）；4. 唔可以改自己角色。

## 9.9 Migration（只讀報告，唔寫 DB）

腳本產出一份報告：① 舊 9 角色逐個 → 新 7 角色嘅建議對照；② 每個現有 User 新舊 effective permission diff（特別標**失去存取**嘅人）；③ 外部供應商帳號清單（建議：停用，發貨對數改行文件 upload，唔畀外部登入）；④ 冇 Employee 對應嘅 User 清單；⑤ 現有 route 用緊但新 registry 冇對應嘅 permission 字串清單。

## 9.10 未決問題

| # | 問題 | 等邊個 |
|---|---|---|
| Q24 | `companyId` scope 幾時啟用：第二法人／品牌共唔共用系統 | Ocean（scope 會） |
| Q25 | 舊 9 角色實際名單同每個角色而家邊啲人用緊 | Kengi |
| Q26 | 外部供應商帳號：停用，定係保留一個超受限角色 | Ocean / Alex |
| Q27 | driver 睇歷史自己單嘅日數（暫定 7 日） | 阿桁訪談 |
