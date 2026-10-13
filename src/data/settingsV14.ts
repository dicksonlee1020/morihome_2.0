import { useSyncExternalStore } from 'react';
import type { StaffUser } from '../auth/types';
import { listAccounts } from '../auth/mockAuthService';
import { can, hasRole } from '../config/permissions';
import source from './financeCategories.json';

export type Currency = 'HKD' | 'RMB';
export type MasterStatus = 'active' | 'inactive' | 'pending';
export interface Location { id: string; name: string; kind: 'shop' | 'warehouse'; region: 'HK' | 'CN'; status: MasterStatus; aliases: string; }
export interface Category { id: string; name: string; examples: string; caution: string; report: string; reserve: boolean; active: boolean; }
export interface PaymentAccount { id: string; name: string; currency: Currency; active: boolean; }
export interface PaymentMethod { id: string; name: string; direction: 'receipt' | 'payment'; currency: Currency; accountId: string | null; active: boolean; }
export interface ExpensePolicy { version: number; type: 'expense' | 'claim'; instruction: string; approverId: string; updatedAt: string; }
export interface Scenario {
  id: string; requesterId: string; category: { id: string; name: string }; location: { id: string; name: string } | null;
  policy: ExpensePolicy; status: 'pending' | 'approved'; assigneeId: string;
  history: { at: string; actor: string; event: string }[];
}
export interface SettingChange { at: string; actor: string; target: string; before: string; after: string; }
interface SettingsState { locations: Location[]; categories: Category[]; accounts: PaymentAccount[]; methods: PaymentMethod[]; policies: ExpensePolicy[]; scenarios: Scenario[]; changes: SettingChange[]; seq: number; }
export type Result<T = void> = { ok: true; value: T } | { ok: false; error: string };
const fail = (error: string): Result<never> => ({ ok: false, error });
const now = () => new Date().toISOString();
const seed = (): SettingsState => ({
  locations: [
    { id: 'LOC-KT-SHOP', name: '觀塘門店', kind: 'shop', region: 'HK', status: 'active', aliases: '觀塘總店' },
    { id: 'LOC-KT-WH', name: '觀塘倉', kind: 'warehouse', region: 'HK', status: 'active', aliases: '觀塘倉庫17室' },
    { id: 'LOC-MK618', name: '旺角618', kind: 'shop', region: 'HK', status: 'inactive', aliases: '' },
    { id: 'LOC-CN-PENDING', name: '大陸倉（待確認）', kind: 'warehouse', region: 'CN', status: 'pending', aliases: '' },
  ],
  categories: source.categories,
  accounts: [],
  methods: [
    { id: 'PAY-RECEIPT', name: '客戶收款（渠道待確認）', direction: 'receipt', currency: 'HKD', accountId: null, active: false },
    { id: 'PAY-REMIT', name: '匯款公司付款', direction: 'payment', currency: 'RMB', accountId: null, active: false },
  ],
  policies: [
    { version: 1, type: 'expense', instruction: '未付款支出先由 Ocean 核對批准，再安排付款。', approverId: 'u-ocean', updatedAt: '2026-10-13T00:00:00+08:00' },
    { version: 1, type: 'claim', instruction: '員工已墊支，Ocean 核對批准後才可還款。', approverId: 'u-ocean', updatedAt: '2026-10-13T00:00:00+08:00' },
  ], scenarios: [], changes: [], seq: 1,
});
let state = seed();
const listeners = new Set<() => void>();
const commit = (s: SettingsState) => { state = s; listeners.forEach(l => l()); };
export const getSettings = () => state;
export const useSettings = () => useSyncExternalStore(l => { listeners.add(l); return () => { listeners.delete(l); }; }, getSettings, getSettings);
export const _resetSettings = () => commit(seed());
export const reportRules = source.reportRules;
export const categorySourceVersion = source.version;
const live = (actor: StaffUser) => listAccounts().find(a => a.id === actor.id && a.status === 'active' && (!a.expiresAt || Date.parse(a.expiresAt) > Date.now()));
export const canManage = (actor: StaffUser, part: 'locations' | 'finance' | 'policy') => {
  const a = live(actor); if (!a) return false;
  return hasRole(a, 'owner') || hasRole(a, 'sysadmin') || (part === 'finance' && hasRole(a, 'finance'));
};
function change(actor: StaffUser, target: string, before: unknown, after: unknown, next: SettingsState) {
  commit({ ...next, changes: [...next.changes, { at: now(), actor: actor.displayName, target, before: JSON.stringify(before), after: JSON.stringify(after) }] });
}
const uniqueName = (rows: { id: string; name: string }[], id: string, name: string) => !rows.some(r => r.id !== id && r.name.trim().toLowerCase() === name.trim().toLowerCase());

export function saveLocation(input: Location, actor: StaffUser): Result {
  if (!canManage(actor, 'locations')) return fail('forbidden');
  const name = input.name.trim();
  if (!name || !uniqueName(state.locations, input.id, name)) return fail('duplicate');
  if (input.id === 'LOC-CN-PENDING' && input.status === 'active' && /待確認/.test(name)) return fail('pending');
  const old = state.locations.find(l => l.id === input.id);
  const row = { ...input, name, id: old?.id ?? `LOC-${state.seq}` };
  change(actor, row.id, old ?? null, row, { ...state, seq: state.seq + 1, locations: old ? state.locations.map(l => l.id === row.id ? row : l) : [...state.locations, row] });
  return { ok: true, value: undefined };
}
export function saveCategory(input: Category, actor: StaffUser): Result {
  if (!canManage(actor, 'finance')) return fail('forbidden');
  const old = state.categories.find(c => c.id === input.id);
  if (!old) return fail('notFound');
  if (!input.name.trim() || !uniqueName(state.categories, input.id, input.name)) return fail('duplicate');
  const row = { ...old, name: input.name.trim(), active: input.active };
  change(actor, row.id, old, row, { ...state, categories: state.categories.map(c => c.id === row.id ? row : c) });
  return { ok: true, value: undefined };
}
export function savePaymentAccount(input: PaymentAccount, actor: StaffUser): Result {
  if (!canManage(actor, 'finance')) return fail('forbidden');
  if (!input.name.trim() || !uniqueName(state.accounts, input.id, input.name)) return fail('duplicate');
  const old = state.accounts.find(a => a.id === input.id);
  if (old && old.currency !== input.currency && state.methods.some(m => m.accountId === old.id)) return fail('inUse');
  const row = { ...input, name: input.name.trim(), id: old?.id ?? `ACC-${state.seq}` };
  change(actor, row.id, old ?? null, row, { ...state, seq: state.seq + 1, accounts: old ? state.accounts.map(a => a.id === row.id ? row : a) : [...state.accounts, row], methods: !row.active ? state.methods.map(m => m.accountId === row.id ? { ...m, active: false } : m) : state.methods });
  return { ok: true, value: undefined };
}
export function savePaymentMethod(input: PaymentMethod, actor: StaffUser): Result {
  if (!canManage(actor, 'finance')) return fail('forbidden');
  if (!input.name.trim() || !uniqueName(state.methods, input.id, input.name)) return fail('duplicate');
  if (input.direction === 'receipt' && input.currency !== 'HKD') return fail('currency');
  const account = state.accounts.find(a => a.id === input.accountId);
  // RMB supplier amounts may settle from an HKD remittance account: retain both currencies.
  if (input.active && (!account?.active || /待確認/.test(input.name))) return fail('mapping');
  if (input.direction === 'receipt' && account && account.currency !== 'HKD') return fail('currency');
  const old = state.methods.find(m => m.id === input.id);
  const row = { ...input, name: input.name.trim(), id: old?.id ?? `PAY-${state.seq}` };
  change(actor, row.id, old ?? null, row, { ...state, seq: state.seq + 1, methods: old ? state.methods.map(m => m.id === row.id ? row : m) : [...state.methods, row] });
  return { ok: true, value: undefined };
}
export function revisePolicy(type: ExpensePolicy['type'], instruction: string, actor: StaffUser): Result {
  if (!canManage(actor, 'policy')) return fail('forbidden');
  const old = state.policies.find(p => p.type === type)!;
  if (!instruction.trim()) return fail('required');
  if (old.instruction === instruction.trim()) return { ok: true, value: undefined };
  const row = { ...old, instruction: instruction.trim(), version: old.version + 1, updatedAt: now() };
  change(actor, `policy-${type}`, old, row, { ...state, policies: state.policies.map(p => p.type === type ? row : p) });
  return { ok: true, value: undefined };
}
/** Explicit settings sandbox. These records are never accounting entries or payment instructions. */
export function createScenario(type: ExpensePolicy['type'], categoryId: string, locationId: string | null, requesterId: string, actor: StaffUser): Result<Scenario> {
  if (!canManage(actor, 'policy')) return fail('forbidden');
  const category = state.categories.find(c => c.id === categoryId && c.active);
  const location = state.locations.find(l => l.id === locationId && l.status === 'active');
  const requester = listAccounts().find(a => a.id === requesterId && a.status === 'active');
  if (!category || (locationId && !location) || !requester) return fail('inactive');
  const row: Scenario = { id: `SIM-${state.seq}`, requesterId, category: { id: category.id, name: category.name }, location: location ? { id: location.id, name: location.name } : null, policy: { ...state.policies.find(p => p.type === type)! }, assigneeId: 'u-ocean', status: 'pending', history: [{ at: now(), actor: actor.displayName, event: '建立設定驗證情境' }] };
  commit({ ...state, seq: state.seq + 1, scenarios: [...state.scenarios, row] });
  return { ok: true, value: row };
}
export function approveScenario(id: string, actor: StaffUser): Result {
  const row = state.scenarios.find(s => s.id === id);
  if (!row || row.status !== 'pending') return fail('notFound');
  if (!live(actor) || actor.id !== row.assigneeId) return fail('forbidden');
  const next: Scenario = { ...row, status: 'approved', history: [...row.history, { at: now(), actor: actor.displayName, event: row.requesterId === actor.id ? 'Ocean 確認本人提交；批准不等於付款' : '核對批准；批准不等於付款' }] };
  change(actor, id, row.status, next.status, { ...state, scenarios: state.scenarios.map(s => s.id === id ? next : s) });
  return { ok: true, value: undefined };
}
export function transferSettingApprovals(userId: string, actor: StaffUser) {
  const scenarios = state.scenarios.map(s => s.status === 'pending' && s.assigneeId === userId ? { ...s, assigneeId: 'u-ocean', history: [...s.history, { at: now(), actor: actor.displayName, event: `${userId} 停用；待審批交予 Ocean` }] } : s);
  if (scenarios.some((s, i) => s !== state.scenarios[i])) change(actor, `handoff-${userId}`, userId, 'u-ocean', { ...state, scenarios });
}
export const canViewSettingsFinance = (actor: StaffUser) => can(actor, 'settings', 'view') && (hasRole(actor, 'owner') || hasRole(actor, 'sysadmin') || hasRole(actor, 'finance'));
