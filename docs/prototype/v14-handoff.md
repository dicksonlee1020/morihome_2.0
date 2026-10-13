# v14 settings — first prototype increment

Date: 2026-10-13. Branch: `codex/v14-settings`.
Baseline: local v13 `bc0018b1eb52da839d73845b9178918cd79ebbd0`, identical tree to published v13 `8618af7965945a4073fc9143d219c5a10b9926c5` (`65558e24ff45351d9ffed266afa8e8c1064b11d5`).

This increment preserves the existing React / Ant Design theme. It is a separate branch; no changes are made to the v13 review branch, its PR, or main. An unrelated uncommitted logo change in the original worktree was not copied or reverted.

## Implemented

| Area | Working prototype behaviour |
| --- | --- |
| Accounts | Create accounts with multiple roles; role filters and labels show every assigned role; roles grant a union of navigation/action/field access. New HR role and Dickson admin demo account. |
| Sensitive access | Owner/finance can view cost, company finance and salary; HR can view salary without cost/company finance. Admin role alone does not expose business data. Separate module view/edit/execute/export permissions remain visible in the existing read-only matrix. Approvals are separate rules. |
| Live account state | The session reads the current account directory, so role removal and deactivation affect the open prototype. Existing self-role change safeguards remain. |
| Leavers | Open activities transfer to Ocean with original ownership/history retained; receiving exceptions transfer at the source, so reconciliation does not restore the former owner. Completed activities are unchanged. Named legacy approval recipients are redirected to Ocean. Ocean cannot be deactivated while he is the required fallback. |
| Locations | Active Kwun Tong shop and warehouse, 17-room warehouse alias on the same record, inactive MK618 and pending mainland warehouse. Create/edit/status controls; pending/inactive records cannot be selected in new settings scenarios. |
| Finance categories | 16 D01–D16 daily categories and 7 R01–R07 reserve categories, initially disabled, extracted from the supplied simplified-v1 workbook. Search, details, rename and activation; retain stable category IDs. Original caution/reporting definitions preserved. |
| Payments setup | Create/edit/disable named company accounts with HKD/RMB currency. Map receipt/payment methods to accounts. All customer receipts use HKD. Supplier RMB amounts can settle from an HKD account through a remittance company. Unmapped/unconfirmed methods cannot activate; disabling an account suspends its linked methods. No real account mappings invented. |
| Approval setup | Expense and employee-advance reimbursement both require Ocean at every amount. Approval precedes payment/reimbursement; absence does not delegate automatically. Ocean's own submissions can be confirmed with history. Editable review instructions have incrementing versions. |
| Settings validation sandbox | Explicitly labelled scenarios demonstrate historical category/location names, old rule versions, Ocean confirmation and approved-but-unpaid state. They do not create actual expenses, payroll, accounting entries or payments. |
| Workbench notice | Ocean sees pending settings-validation cases as a separate banner/count with navigation to Settings. Order task statistics are not mixed with validation cases. |
| Changes | In-memory before/after settings change records with expandable detail, alongside existing account audit records. Traditional/Simplified Chinese UI; source classification data remains as supplied. |

## Confirmed rules and boundaries

- Existing records retain category/location snapshots; inactive items are unavailable to new scenarios. Role changes affect access immediately. New approval-instruction versions affect only new scenarios.
- Company payment-account names, exact channel mappings and mainland warehouse identities remain unconfirmed. Configure them through the prototype; seeded placeholders stay disabled/pending.
- The imported classification source is `simplified-v1-2026-10-08`. It includes distinctions between sales and collections, supplier payment and inventory/COGS, remittance principal and fees, unknown and zero cost, and original-order-month management reporting versus cash/accounting periods.
- Only reusable configuration definitions were extracted. The uploaded workbook, private business source files, bank records and transcripts are not committed.
- Classification and location pickers currently feed the settings sandbox. They do not migrate v13 inventory routes, orders, historical records or live Shopify data.
- The permission matrix is inspectable, not an arbitrary editable permission designer. Multi-role assignment is implemented. Some inherited operations remain demo interactions, not production authorization.
- Full expense submission/return/payment, AP/AR, bank reconciliation, actual remittance, HR policy, payroll and updated commission calculations are outside this increment. Inherited HR examples remain assumptions, not newly approved business rules.
- Other legacy approval workflows retain their prior behaviour; approval snapshot versioning in this increment applies to expense/reimbursement settings scenarios only.
- Prototype state is in memory and resets on reload. All demo payloads are bundled in the browser; local field hiding is not data security. Real persistence, backend validation, session revocation, concurrent transactions and durable audit require implementation by the developer.

## Acceptance walkthrough

1. Open the standalone HTML. Sign in with `ocean@morihome.example`, demo password `morihome2026`. Open 設定.
2. Assign both sales and finance to a demo account. Confirm both roles are displayed; after signing in as that account, finance access is available. Removing finance removes that access.
3. Sign in as `dickson@morihome.example` or `kengi@morihome.example`: settings/account controls are available, salary/business finance is not automatically granted. `hr@morihome.example` demonstrates HR-only access.
4. Inspect 門店／倉庫: one active shop, one HK warehouse, inactive MK618, mainland pending. Edit a warehouse alias; no duplicate warehouse is created.
5. Inspect 財務分類: D01–D16; show reserve categories and enable one. Review D03/D04/D08/D15/D16 cautions and Ocean reporting definitions.
6. In 收付款設定, create a clearly labelled demo HKD account. Link 匯款公司付款 to it and activate. Supplier currency remains RMB; settlement account remains HKD. Disable the account: linked method becomes inactive.
7. Under 審批規則, create an expense validation scenario with an active category/location. Change the category name or status and revise review instructions. Old scenario keeps the old name/version; new scenarios use the active selections and latest version.
8. Create a scenario requested by Ocean. Confirm as Ocean: history states self-confirmation and status is approved/unpaid. Another owner/admin cannot substitute for Ocean.
9. Disable Alex. Open tasks move to Ocean and retain transfer history; re-reading the workbench does not restore Alex. Completed task ownership remains unchanged.
10. Review 設定變更 and account audit. Reload to reset demo data.

## Validation

- TypeScript and Vite production build: passed.
- Unit/domain/SSR smoke tests: **100 passed** (75 existing tests, with two expectations aligned to accepted v14 defaults; 20 new v14 domain tests; 5 new settings render smoke tests).
- SSR smoke verifies that the new settings sections render without exceptions. It is not browser interaction, screenshot or responsive visual evidence.
- Browser/desktop/mobile visual QA was **not run**: the managed environment did not expose the supported browser-control capability. The v13 39 business/46 UI results were not rerun or claimed for v14.
- Build retains the existing large-bundle warning. Standalone output is approximately 2.82 MiB, with scripts, styles and brand images embedded.

Build: `npm ci`, `npm test`, `npm run build:single`. Standalone output: `dist-single/morihome-erp.html` (delivered separately as `Morihome-ERP-Prototype-v14-settings.html`). The tracked v13 HTML remains unchanged.
