/**
 * SPEC REF docs/design/rbac-spec.md §9.2–9.5.
 *
 * ONE registry for front and back end: MODULES × ACTIONS × ROLES. The server
 * runs requirePermission(module, action) on every route; this copy only
 * decides what the navigation and the buttons show. Default deny: anything
 * not listed here is refused. `approve` is deliberately absent — approvals
 * come from ApprovalRule (§9.6), never from this table.
 */

export type StaffRole = 'owner' | 'ops' | 'finance' | 'sales' | 'driver' | 'content' | 'sysadmin';

export const ROLES: StaffRole[] = ['owner', 'ops', 'finance', 'sales', 'driver', 'content', 'sysadmin'];

export type Action = 'view' | 'edit' | 'execute' | 'export';

export type Module =
  | 'orders'
  | 'followups'
  | 'pipeline'
  | 'purchasing'
  | 'warehouse'
  | 'restock'
  | 'delivery'
  | 'reconciliation'
  | 'finance'
  | 'products'
  | 'customers'
  | 'settings'
  | 'accounts'
  | 'audit'
  // HR was frozen in spec v0.2 §1 (Phase 1). Dickson lifted the freeze on
  // 2026-09-24 ("唔分 phase"); the two rows below are ASSUMPTIONS until the
  // spec's matrix gains them (backlog A-06).
  | 'hr'
  | 'payroll';

const V: Action[] = ['view'];
const VE: Action[] = ['view', 'export'];
const FULL: Action[] = ['view', 'edit', 'execute', 'export'];
const NONE: Action[] = [];

/**
 * §9.3 ROLE_MATRIX. ● = FULL, ◔ = view (+export where the role reports),
 * ◐ = view/edit under a SCOPE_RULE or FIELD_CLASS (noted per cell), ○ = NONE.
 */
export const ROLE_MATRIX: Record<Module, Record<StaffRole, Action[]>> = {
  //                 owner   ops     finance sales                  driver                 content sysadmin
  orders: {
    owner: FULL, ops: VE, finance: VE,
    sales: ['view', 'edit', 'export'], // ¹ remark / requested date / channel only (field-level, server side)
    driver: V, // ² own + today (SCOPE_RULES.driver.own_today)
    content: NONE, sysadmin: NONE,
  },
  followups: { owner: V, ops: FULL, finance: NONE, sales: V, driver: NONE, content: NONE, sysadmin: NONE },
  pipeline: { owner: V, ops: V, finance: V, sales: V, driver: NONE, content: NONE, sysadmin: NONE },
  purchasing: { owner: VE, ops: FULL, finance: VE, sales: NONE, driver: NONE, content: NONE, sysadmin: NONE },
  warehouse: { owner: VE, ops: FULL, finance: V, sales: V /* ³ lead-time lookup */, driver: NONE, content: NONE, sysadmin: NONE },
  restock: { owner: FULL, ops: FULL, finance: V, sales: V /* ⁴ sellable only */, driver: NONE, content: NONE, sysadmin: NONE },
  delivery: { owner: V, ops: FULL, finance: NONE, sales: V, driver: ['view', 'execute'] /* ² */, content: NONE, sysadmin: NONE },
  reconciliation: { owner: V, ops: NONE, finance: FULL, sales: NONE, driver: NONE, content: NONE, sysadmin: NONE },
  finance: { owner: FULL, ops: NONE, finance: FULL, sales: NONE, driver: NONE, content: NONE, sysadmin: NONE },
  products: { owner: FULL, ops: V, finance: V, sales: V, driver: NONE, content: FULL /* ⁵ no COST */, sysadmin: NONE },
  customers: { owner: FULL, ops: V /* ⁶ contact for booking */, finance: V, sales: FULL, driver: V /* ² */, content: NONE, sysadmin: NONE },
  settings: { owner: FULL, ops: V, finance: ['view', 'edit'] /* ⁷ rules, payment methods */, sales: NONE, driver: NONE, content: NONE, sysadmin: ['view', 'edit'] /* ⁸ technical only */ },
  accounts: { owner: FULL, ops: NONE, finance: NONE, sales: NONE, driver: NONE, content: NONE, sysadmin: FULL /* ⁹ never own role */ },
  audit: { owner: V, ops: NONE, finance: V, sales: NONE, driver: NONE, content: NONE, sysadmin: V },
  // 員工／排班／請假／佣金：everyone sees their own rows (SCOPE_RULES['hr.self']);
  // ops edits the roster; owner sees and edits all. sysadmin stripped (§9.8).
  hr: { owner: FULL, ops: ['view', 'edit'], finance: V, sales: V, driver: V, content: V, sysadmin: NONE },
  // 薪資：owner (Jenny handles 內務) and finance only; approval by ApprovalRule.
  payroll: { owner: FULL, ops: NONE, finance: ['view', 'edit', 'export'], sales: NONE, driver: NONE, content: NONE, sysadmin: NONE },
};

export const can = (role: StaffRole, module: Module, action: Action): boolean =>
  ROLE_MATRIX[module]?.[role]?.includes(action) ?? false;

/**
 * §9.5 FIELD_CLASSES — stripped in the serialisation layer server side;
 * the client only hides the columns so the screens read right.
 */
export type FieldClass = 'COST' | 'CUSTOMER_PII' | 'FINANCE_DETAIL' | 'HR';

export const FIELD_CLASS_ROLES: Record<FieldClass, StaffRole[]> = {
  COST: ['owner', 'finance'],
  // driver only inside their own same-day deliveries (SCOPE ∩ FIELD, §9.4)
  CUSTOMER_PII: ['owner', 'sales', 'ops', 'finance', 'driver'],
  FINANCE_DETAIL: ['owner', 'finance'],
  // spec §9.5 leaves this blank (frozen module). ASSUMPTION A-06: salary,
  // leave balance and commission of OTHER people are owner/finance only; a
  // person's own row is always theirs (SCOPE_RULES['hr.self']).
  HR: ['owner', 'finance'],
};

export const canSee = (role: StaffRole, cls: FieldClass): boolean =>
  FIELD_CLASS_ROLES[cls].includes(role);

/** §9.4 SCOPE_RULES, named so the code can point at them. */
export const SCOPE_RULES = {
  'driver.own_today': 'assignee = self AND runDate = today',
  'followup.assignee_default': 'my follow-ups open on the signed-in person; ops may switch to all',
  company: 'companyId reserved on every entity; filtering is OFF in Phase 1 (Q24)',
  'hr.self': 'roster / leave / commission rows: employee = self unless the role has hr.edit or payroll.view',
} as const;
