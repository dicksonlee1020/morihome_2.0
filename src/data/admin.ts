import { useSyncExternalStore } from 'react';
import { DEMO_TODAY } from '../domain/clock';
import { can, canSee, ROLES } from '../config/permissions';
import type { FieldClass, StaffRole } from '../config/permissions';
import * as auth from '../auth/mockAuthService';
import type { AccountStatus, StaffUser } from '../auth/types';
import type { Locale } from '../i18n';
import { nowIso } from './ops';

/**
 * 設定 → 帳號管理／審批規則／權限／審計紀錄 嘅 mock store。
 * SPEC REF rbac-spec.md §9.1（帳號）、§9.3 註⁹（唔可以自升權限）、
 * §9.6（ApprovalRule 係設定唔係 code）、§9.7（AuditLog append-only）、
 * §9.8（sysadmin：臨時授權限時、自動過期、落 audit）。
 *
 * 帳號本身喺 auth/mockAuthService（登入用同一份）；呢度負責「邊個可以改乜」
 * 同每一步嘅 audit。接後台時每個 action 對應一條 route。
 */

/* ------------------------------------------------------------- types */

export type ApprovalType = 'purchase' | 'writeOff' | 'stocktake' | 'refund' | 'pettyCash' | 'leave' | 'payroll';
export const APPROVAL_TYPES: ApprovalType[] = ['purchase', 'writeOff', 'stocktake', 'refund', 'leave', 'payroll', 'pettyCash'];

/** §9.6 schema。threshold 嘅單位由 approvalType 決定（金額或件數）。 */
export interface ApprovalRule {
  id: string;
  approvalType: ApprovalType;
  threshold: number | null;
  thresholdUnit: 'hkd' | 'pcs' | null;
  approverRole: StaffRole | null;
  approverUserId: string | null;
  active: boolean;
  /** 業務類（Ocean）定內務類（Jenny）——只係顯示分組 */
  group: 'business' | 'internal';
}

/** §9.8.3：owner 臨時開 COST / PII 畀 sysadmin（或其他人）debug，限時。 */
export interface FieldGrant {
  id: string;
  userId: string;
  fieldClass: FieldClass;
  grantedBy: string;
  grantedAt: string;
  expiresAt: string;
  reason: string;
  revokedAt: string | null;
}

/** §9.3 註⁹：owner 改自己角色要另一位 owner 確認。 */
export interface RoleChangeRequest {
  id: string;
  userId: string;
  from: StaffRole;
  to: StaffRole;
  requestedBy: string;
  requestedAt: string;
  status: 'pending' | 'confirmed' | 'rejected';
  decidedBy: string | null;
  decidedAt: string | null;
}

export type AdminAuditEvent =
  | 'login'
  | 'logout'
  | 'accountCreated'
  | 'roleChange'
  | 'roleChangeRequested'
  | 'roleChangeConfirmed'
  | 'roleChangeRejected'
  | 'statusChange'
  | 'passwordReset'
  | 'ruleChange'
  | 'grantIssued'
  | 'grantRevoked'
  | 'approval'
  | 'exportSensitive';

/** §9.7：{ ts, userId, event, targetModel/Id, before, after, reason? } */
export interface AdminAuditEntry {
  id: string;
  ts: string;
  userId: string;
  event: AdminAuditEvent;
  targetModel: 'user' | 'approvalRule' | 'fieldGrant' | 'leaveRequest' | 'payrollRun' | 'export' | 'session';
  targetId: string;
  before: string | null;
  after: string | null;
  reason: string | null;
}

interface AdminState {
  rules: ApprovalRule[];
  grants: FieldGrant[];
  roleRequests: RoleChangeRequest[];
  audit: AdminAuditEntry[];
  seq: number;
}

export type AdminError = 'forbidden' | 'selfRole' | 'selfStatus' | 'duplicate' | 'notFound' | 'notOwner' | 'sameActor';
export type AdminResult<T = void> = { ok: true; value: T } | { ok: false; error: AdminError };

/* ---------------------------------------------------------- fixtures */

const at = (day: string, hm: string) => `${day}T${hm}:00+08:00`;
const daysAgo = (n: number) => {
  const d = new Date(Date.parse(DEMO_TODAY) - n * 86_400_000);
  return d.toISOString().slice(0, 10);
};
const daysAhead = (n: number) => daysAgo(-n);

function buildFixtures(): AdminState {
  const rules: ApprovalRule[] = [
    { id: 'AR-01', approvalType: 'purchase', threshold: 0, thresholdUnit: 'hkd', approverRole: 'owner', approverUserId: 'u-ocean', active: true, group: 'business' },
    { id: 'AR-02', approvalType: 'writeOff', threshold: null, thresholdUnit: null, approverRole: 'owner', approverUserId: 'u-ocean', active: true, group: 'business' },
    { id: 'AR-03', approvalType: 'stocktake', threshold: 3, thresholdUnit: 'pcs', approverRole: 'owner', approverUserId: 'u-ocean', active: true, group: 'business' },
    { id: 'AR-04', approvalType: 'refund', threshold: null, thresholdUnit: null, approverRole: 'owner', approverUserId: 'u-ocean', active: true, group: 'business' },
    { id: 'AR-05', approvalType: 'leave', threshold: null, thresholdUnit: null, approverRole: 'owner', approverUserId: 'u-jenny', active: true, group: 'internal' },
    { id: 'AR-06', approvalType: 'payroll', threshold: null, thresholdUnit: null, approverRole: 'owner', approverUserId: 'u-jenny', active: true, group: 'internal' },
    { id: 'AR-07', approvalType: 'pettyCash', threshold: 500, thresholdUnit: 'hkd', approverRole: 'owner', approverUserId: 'u-jenny', active: false, group: 'internal' },
  ];

  const grants: FieldGrant[] = [
    // Kengi debugging a landed-cost sync: cost visible for 48 hours, then gone.
    { id: 'FG-01', userId: 'u-kengi', fieldClass: 'COST', grantedBy: 'u-ocean', grantedAt: at(daysAgo(0), '09:20'), expiresAt: at(daysAhead(2), '09:20'), reason: 'Landed cost 同步數字對唔上，要睇原價 debug', revokedAt: null },
    { id: 'FG-02', userId: 'u-kengi', fieldClass: 'CUSTOMER_PII', grantedBy: 'u-jenny', grantedAt: at(daysAgo(12), '14:00'), expiresAt: at(daysAgo(11), '14:00'), reason: '匯入舊系統客戶資料', revokedAt: null },
  ];

  const roleRequests: RoleChangeRequest[] = [];

  let n = 0;
  const audit: AdminAuditEntry[] = [];
  const log = (ts: string, userId: string, event: AdminAuditEvent, targetModel: AdminAuditEntry['targetModel'], targetId: string, before: string | null, after: string | null, reason: string | null = null) =>
    audit.push({ id: `AU-${String(++n).padStart(4, '0')}`, ts, userId, event, targetModel, targetId, before, after, reason });

  log(at(daysAgo(20), '10:05'), 'u-ocean', 'accountCreated', 'user', 'u-steve', null, 'sales', null);
  log(at(daysAgo(20), '10:06'), 'u-ocean', 'passwordReset', 'user', 'u-steve', null, null, '新同事首次登入');
  log(at(daysAgo(15), '17:40'), 'u-ocean', 'statusChange', 'user', 'u-former', 'active', 'inactive', '離職');
  log(at(daysAgo(12), '14:00'), 'u-jenny', 'grantIssued', 'fieldGrant', 'FG-02', null, 'CUSTOMER_PII · 24h', '匯入舊系統客戶資料');
  log(at(daysAgo(9), '11:30'), 'u-jenny', 'ruleChange', 'approvalRule', 'AR-07', 'active', 'inactive', 'Petty Cash 未啟用');
  log(at(daysAgo(6), '09:15'), 'u-ocean', 'ruleChange', 'approvalRule', 'AR-03', 'threshold 5', 'threshold 3', null);
  log(at(daysAgo(3), '16:20'), 'u-manman', 'exportSensitive', 'export', 'orders-2026-09', null, 'CUSTOMER_PII', '月結對數');
  log(at(daysAgo(2), '10:15'), 'u-jenny', 'approval', 'leaveRequest', 'LV-03', 'pending', 'approved', null);
  log(at(daysAgo(0), '09:20'), 'u-ocean', 'grantIssued', 'fieldGrant', 'FG-01', null, 'COST · 48h', 'Landed cost 同步數字對唔上，要睇原價 debug');
  for (const [d, hm, who] of [[1, '09:05', 'u-alex'], [1, '09:30', 'u-manman'], [0, '08:40', 'u-kengi'], [0, '09:12', 'u-ocean'], [0, '10:02', 'u-wilson']] as const) {
    log(at(daysAgo(d), hm), who, 'login', 'session', who, null, null);
  }

  return { rules, grants, roleRequests, audit, seq: n + 1 };
}

/* ------------------------------------------------------------- store */

let state: AdminState = buildFixtures();
const listeners = new Set<() => void>();

function commit(next: AdminState) {
  state = next;
  listeners.forEach((l) => l());
}

export function useAdmin(): AdminState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state
  );
}

export const getAdmin = () => state;

export function _resetAdmin() {
  commit(buildFixtures());
  auth._resetMockState();
}

/** 示範時鐘：同 data/ops 一樣（今日 + 香港時分） */
export { nowIso };

function nextId(prefix: string) {
  const id = `${prefix}-${String(state.seq).padStart(4, '0')}`;
  state = { ...state, seq: state.seq + 1 };
  return id;
}

function appendAudit(entry: Omit<AdminAuditEntry, 'id' | 'ts'> & { ts?: string }) {
  const id = nextId('AU');
  commit({ ...state, audit: [...state.audit, { id, ts: entry.ts ?? nowIso(), ...entry }] });
}

/* ------------------------------------------------------------ accounts */

export function useAccounts(): StaffUser[] {
  return useSyncExternalStore(auth.subscribeAccounts, auth.listAccounts, auth.listAccounts);
}

const accountOf = (id: string) => auth.listAccounts().find((u) => u.id === id) ?? null;

const isOwner = (actor: StaffUser) => actor.role === 'owner';

/**
 * 改角色（§9.3 註⁹、§9.8.4）：
 *   - sysadmin 唔可以改自己角色，冇例外
 *   - owner 改自己角色 → 開一張 request，另一位 owner 確認先生效
 *   - 其他人 → 即時生效 + audit
 */
export function changeRole(userId: string, to: StaffRole, actor: StaffUser): AdminResult<'applied' | 'pending'> {
  if (!can(actor.role, 'accounts', 'edit')) return { ok: false, error: 'forbidden' };
  const target = accountOf(userId);
  if (!target) return { ok: false, error: 'notFound' };
  if (target.role === to) return { ok: true, value: 'applied' };
  if (target.id === actor.id) {
    if (!isOwner(actor)) return { ok: false, error: 'selfRole' };
    const req: RoleChangeRequest = {
      id: nextId('RR'),
      userId,
      from: target.role,
      to,
      requestedBy: actor.id,
      requestedAt: nowIso(),
      status: 'pending',
      decidedBy: null,
      decidedAt: null,
    };
    commit({ ...state, roleRequests: [...state.roleRequests.filter((r) => !(r.userId === userId && r.status === 'pending')), req] });
    appendAudit({ userId: actor.id, event: 'roleChangeRequested', targetModel: 'user', targetId: userId, before: target.role, after: to, reason: null });
    return { ok: true, value: 'pending' };
  }
  auth.updateAccount(userId, { role: to });
  appendAudit({ userId: actor.id, event: 'roleChange', targetModel: 'user', targetId: userId, before: target.role, after: to, reason: null });
  return { ok: true, value: 'applied' };
}

export function decideRoleChange(requestId: string, decision: 'confirmed' | 'rejected', actor: StaffUser): AdminResult {
  const req = state.roleRequests.find((r) => r.id === requestId && r.status === 'pending');
  if (!req) return { ok: false, error: 'notFound' };
  if (!isOwner(actor)) return { ok: false, error: 'notOwner' };
  if (req.requestedBy === actor.id) return { ok: false, error: 'sameActor' };
  commit({
    ...state,
    roleRequests: state.roleRequests.map((r) => (r.id === requestId ? { ...r, status: decision, decidedBy: actor.id, decidedAt: nowIso() } : r)),
  });
  if (decision === 'confirmed') auth.updateAccount(req.userId, { role: req.to });
  appendAudit({
    userId: actor.id,
    event: decision === 'confirmed' ? 'roleChangeConfirmed' : 'roleChangeRejected',
    targetModel: 'user',
    targetId: req.userId,
    before: req.from,
    after: decision === 'confirmed' ? req.to : req.from,
    reason: null,
  });
  return { ok: true, value: undefined };
}

export function setAccountStatus(userId: string, status: AccountStatus, actor: StaffUser, reason: string | null = null): AdminResult {
  if (!can(actor.role, 'accounts', 'edit')) return { ok: false, error: 'forbidden' };
  if (userId === actor.id) return { ok: false, error: 'selfStatus' };
  const target = accountOf(userId);
  if (!target) return { ok: false, error: 'notFound' };
  if (target.status === status) return { ok: true, value: undefined };
  auth.updateAccount(userId, { status });
  appendAudit({ userId: actor.id, event: 'statusChange', targetModel: 'user', targetId: userId, before: target.status, after: status, reason });
  return { ok: true, value: undefined };
}

export function createAccount(
  input: { email: string; displayName: string; role: StaffRole; locale: Locale; expiresAt: string | null },
  actor: StaffUser
): AdminResult<StaffUser> {
  if (!can(actor.role, 'accounts', 'edit')) return { ok: false, error: 'forbidden' };
  const res = auth.createAccount(input);
  if ('error' in res) return { ok: false, error: 'duplicate' };
  appendAudit({ userId: actor.id, event: 'accountCreated', targetModel: 'user', targetId: res.id, before: null, after: res.role, reason: input.expiresAt ? `expires ${input.expiresAt}` : null });
  return { ok: true, value: res };
}

export function resetAccountPassword(userId: string, actor: StaffUser): AdminResult {
  if (!can(actor.role, 'accounts', 'edit')) return { ok: false, error: 'forbidden' };
  if (!auth.resetToTemporaryPassword(userId)) return { ok: false, error: 'notFound' };
  appendAudit({ userId: actor.id, event: 'passwordReset', targetModel: 'user', targetId: userId, before: null, after: null, reason: null });
  return { ok: true, value: undefined };
}

export function updateAccountLocale(userId: string, locale: Locale, actor: StaffUser): AdminResult {
  if (!can(actor.role, 'accounts', 'edit') && actor.id !== userId) return { ok: false, error: 'forbidden' };
  auth.updateAccount(userId, { locale });
  return { ok: true, value: undefined };
}

export const pendingRoleRequests = (s: AdminState = state) => s.roleRequests.filter((r) => r.status === 'pending');

/** 登入／登出必記（§9.7）。由 AuthProvider 叫。 */
export function logSession(userId: string, event: 'login' | 'logout') {
  appendAudit({ userId, event, targetModel: 'session', targetId: userId, before: null, after: null, reason: null });
}

/* -------------------------------------------------------- approval rules */

export function updateRule(
  id: string,
  patch: Partial<Pick<ApprovalRule, 'threshold' | 'approverRole' | 'approverUserId' | 'active'>>,
  actor: StaffUser
): AdminResult {
  if (!can(actor.role, 'settings', 'edit')) return { ok: false, error: 'forbidden' };
  const rule = state.rules.find((r) => r.id === id);
  if (!rule) return { ok: false, error: 'notFound' };
  const next = { ...rule, ...patch };
  commit({ ...state, rules: state.rules.map((r) => (r.id === id ? next : r)) });
  const diff = (Object.keys(patch) as (keyof typeof patch)[]).filter((k) => rule[k] !== next[k]);
  for (const k of diff) {
    appendAudit({ userId: actor.id, event: 'ruleChange', targetModel: 'approvalRule', targetId: id, before: `${k} ${String(rule[k])}`, after: `${k} ${String(next[k])}`, reason: null });
  }
  return { ok: true, value: undefined };
}

export const ruleFor = (type: ApprovalType, s: AdminState = state) => s.rules.find((r) => r.approvalType === type) ?? null;

/**
 * §9.6：有 approverUserId 就指定人、冇就跌落 role；審批人唔可以批自己建嘅嘢。
 * amount 係觸發值（金額或件數）；未到 threshold 就唔使批。
 */
export function needsApproval(type: ApprovalType, amount: number | null = null, s: AdminState = state): boolean {
  const rule = ruleFor(type, s);
  if (!rule || !rule.active) return false;
  if (rule.threshold === null || amount === null) return true;
  return amount >= rule.threshold;
}

export function canApprove(type: ApprovalType, actor: StaffUser, requesterId: string, s: AdminState = state): boolean {
  const rule = ruleFor(type, s);
  if (!rule || !rule.active) return false;
  if (actor.id === requesterId) return false;
  // 指定審批人自己提交（例如 Jenny 自己請假）→ 跌落 role，另一位同 role 嘅人批
  if (rule.approverUserId && rule.approverUserId !== requesterId) return actor.id === rule.approverUserId;
  return rule.approverRole !== null && actor.role === rule.approverRole;
}

/** 記一次審批決定（其他 store 叫，例如請假、薪資） */
export function logApproval(actorId: string, targetModel: 'leaveRequest' | 'payrollRun', targetId: string, before: string, after: string, reason: string | null = null) {
  appendAudit({ userId: actorId, event: 'approval', targetModel, targetId, before, after, reason });
}

/* ----------------------------------------------------------- field grants */

export const grantActive = (g: FieldGrant, nowMs: number) => g.revokedAt === null && Date.parse(g.expiresAt) > nowMs;

export function hasGrant(userId: string, cls: FieldClass, nowMs = Date.parse(nowIso()), s: AdminState = state): boolean {
  return s.grants.some((g) => g.userId === userId && g.fieldClass === cls && grantActive(g, nowMs));
}

/** 角色本身見到，或者有未過期嘅臨時授權 */
export const canSeeWithGrants = (user: Pick<StaffUser, 'id' | 'role'>, cls: FieldClass, nowMs = Date.parse(nowIso()), s: AdminState = state) =>
  canSee(user.role, cls) || hasGrant(user.id, cls, nowMs, s);

export function issueGrant(input: { userId: string; fieldClass: FieldClass; hours: number; reason: string }, actor: StaffUser): AdminResult<FieldGrant> {
  if (!isOwner(actor)) return { ok: false, error: 'notOwner' };
  if (!accountOf(input.userId)) return { ok: false, error: 'notFound' };
  const grantedAt = nowIso();
  const expiresAt = new Date(Date.parse(grantedAt) + input.hours * 3_600_000).toISOString();
  const grant: FieldGrant = { id: nextId('FG'), userId: input.userId, fieldClass: input.fieldClass, grantedBy: actor.id, grantedAt, expiresAt, reason: input.reason.trim(), revokedAt: null };
  commit({ ...state, grants: [...state.grants, grant] });
  appendAudit({ userId: actor.id, event: 'grantIssued', targetModel: 'fieldGrant', targetId: grant.id, before: null, after: `${grant.fieldClass} · ${input.hours}h`, reason: grant.reason });
  return { ok: true, value: grant };
}

export function revokeGrant(id: string, actor: StaffUser): AdminResult {
  if (!isOwner(actor)) return { ok: false, error: 'notOwner' };
  const g = state.grants.find((x) => x.id === id);
  if (!g) return { ok: false, error: 'notFound' };
  commit({ ...state, grants: state.grants.map((x) => (x.id === id ? { ...x, revokedAt: nowIso() } : x)) });
  appendAudit({ userId: actor.id, event: 'grantRevoked', targetModel: 'fieldGrant', targetId: id, before: `${g.fieldClass}`, after: null, reason: null });
  return { ok: true, value: undefined };
}

/** 權限矩陣畫面用：每個 module 每個角色嘅 action 清單（只讀，registry 係 code） */
export const roleOptions = ROLES;
