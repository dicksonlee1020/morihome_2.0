# Morihome prototype working agreement (v13)

This repository is a hi-fi functional prototype, not a production ERP rewrite.

## Baseline and design
- Continue the accepted v9 → v13 prototype. Current source and `docs/prototype/Morihome-ERP-Prototype-v13-source-sync.html` represent v13.
- Preserve the existing typography, colours, spacing, components, navigation and responsive patterns. Do not redesign for aesthetics.
- Read relevant code and `docs/prototype/v13-handoff.md` before edits. `CLAUDE.md` and older specs are historical; the rules below supersede conflicting status, formatting and feature claims.

## Confirmed business rules
- Shopify is the customer-order source of truth; ERP handles fulfilment, procurement, stock and delivery operations. Current data is demo data, not a live integration.
- Keep order, demand, purchase, physical location and allocation separate.
- Permit procurement without a customer order (restock, display, aftersales, other). Existing stock and replenishment are independent decisions.
- Supplier shipped ≠ warehouse received. Track at package level, retain procurement origin when allocation changes, count only complete unblocked units as available.
- Keep confirmed quantity, actual cost and supplier reference; partial confirmation preserves residual demand. Unmatched lines require human review.
- The workbench is an Action Inbox. Its four cards are overlapping saved views, not workflow states. Due/SLA and task status are separate.
- Controlled task types; manual "other" needs a description. Unreachable/postponed updates the existing task and follow-up history. Completion retains the task and offers Undo where implemented; business actions update source records first.
- Search canonical order/customer/phone/SKU/product fields, not display strings.

## Data display
Order `PO3579`; requirement `PR-YYYYMMDD-###`; purchase batch `PB-YYYYMMDD-##`; revision `Rev N`; dates `YYYY-MM-DD`; date-times `YYYY-MM-DD HH:mm`; timeline may show relative dates. HKD preserves cents (two decimal places only when needed). Phone `+852 6451 1020`; missing value `—`; use 客戶 and 供應商.

## Delivery
- Edit React/TypeScript source, regenerate the downloadable HTML, retain confirmed interactions.
- Run TypeScript/build, unit tests, business/browser regression and desktop/mobile checks proportional to the change. Preserve demo-data consistency across pages.
- Test-mode fixture hooks must not appear in production output.
- Version feature releases incrementally. This source-sync release remains v13 because it ports the accepted v13 behaviour.
- Clearly document incomplete workflows and assumptions. Do not claim mock auth, local role checks or in-memory audit as production controls.
- Do not add private transcripts, operational spreadsheets, real customer details, credentials or confidential project materials to this public repository.

## v14 settings branch
- See `docs/prototype/v14-handoff.md` for the accepted settings increment and limits.
- Work on `codex/v14-settings`; preserve the v13 handoff branch and PR.
- Multi-role accounts grant a union. System administration alone does not grant sensitive business access.
- All expense/reimbursement scenarios require Ocean, including recorded self-confirmation; approval is not payment. No automatic substitute approver.
- Preserve historical master-data snapshots and expense-policy versions. Do not enable unconfirmed bank/channel mappings or mainland warehouse identities.
