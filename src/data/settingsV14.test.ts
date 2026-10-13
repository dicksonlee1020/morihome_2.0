import { beforeEach, describe, expect, it } from 'vitest';
import { can, canSee, rolesOf } from '../config/permissions';
import { canOpen, landingPage } from '../auth/permissions';
import { listAccounts, updateAccount } from '../auth/mockAuthService';
import { _resetAdmin, changeRoles, createAccount, setAccountStatus, canApprove, needsApproval } from './admin';
import { _resetOps, getOps, commit } from './ops';
import { _resetSettings, getSettings, saveCategory, saveLocation, savePaymentAccount, savePaymentMethod, revisePolicy, createScenario, approveScenario, canManage } from './settingsV14';

const user = (id: string) => listAccounts().find(u => u.id === id)!;
const ocean = () => user('u-ocean');
const kengi = () => user('u-kengi');
beforeEach(() => { _resetAdmin(); _resetOps(); _resetSettings(); });

describe('v14 roles and effective access', () => {
  it('unions assigned roles across navigation, actions and sensitive fields', () => {
    expect(changeRoles('u-wilson', ['sales', 'finance', 'hr'], kengi()).ok).toBe(true);
    const w = user('u-wilson');
    expect(rolesOf(w)).toEqual(['sales', 'finance', 'hr']);
    expect(canOpen(w, 'orders')).toBe(true);
    expect(canOpen(w, 'settings')).toBe(true);
    expect(can(w, 'payroll', 'edit')).toBe(true);
    expect(canSee(w, 'COST')).toBe(true);
  });
  it('removing a role removes the associated permission immediately', () => {
    changeRoles('u-wilson', ['sales', 'finance'], kengi());
    changeRoles('u-wilson', ['sales'], kengi());
    expect(canSee(user('u-wilson'), 'COST')).toBe(false);
    expect(canOpen(user('u-wilson'), 'settings')).toBe(false);
  });
  it('HR sees payroll but not purchasing cost or company finance', () => {
    const hr = user('u-hr-demo');
    expect(canSee(hr, 'HR')).toBe(true);
    expect(canOpen(hr, 'hr')).toBe(true);
    expect(canSee(hr, 'COST')).toBe(false);
    expect(canSee(hr, 'FINANCE_DETAIL')).toBe(false);
    expect(can(hr, 'finance', 'view')).toBe(false);
  });
  it('Kengi and Dickson can manage all settings but not sensitive business data', () => {
    for (const id of ['u-kengi', 'u-dickson']) {
      const u = user(id);
      expect(landingPage(u)).toBe('settings');
      expect(can(u, 'accounts', 'edit')).toBe(true);
      expect(canManage(u, 'locations')).toBe(true);
      expect(canManage(u, 'finance')).toBe(true);
      expect(canManage(u, 'policy')).toBe(true);
      expect(canSee(u, 'COST')).toBe(false);
      expect(canSee(u, 'HR')).toBe(false);
    }
  });
  it('refuses empty role assignment and admin self escalation', () => {
    expect(changeRoles('u-wilson', [], ocean()).ok).toBe(false);
    expect(changeRoles('u-kengi', ['sysadmin', 'owner'], kengi()).ok).toBe(false);
    expect(changeRoles('u-wilson', ['finance'], user('u-alex')).ok).toBe(false);
  });
  it('creates multi-role accounts in the same account directory used by sign-in', () => {
    const r = createAccount({ email: 'multi@morihome.example', displayName: '多角色示範', role: 'sales', roles: ['sales', 'hr'], locale: 'zh-Hant', expiresAt: null }, ocean());
    expect(r.ok && canSee(r.value, 'HR')).toBe(true);
    expect(r.ok && r.value.mustChangePassword).toBe(true);
  });
  it('deactivation transfers only open workbench tasks to Ocean, retaining history', () => {
    const old = getOps();
    const a = old.activities[0];
    commit({ ...old, activities: [{ ...a, id: 'TEST-OPEN', kind: 'other', taskType: 'other', orderId: null, source: 'manual', owner: 'Alex', doneAt: null }, { ...a, id: 'TEST-DONE', owner: 'Alex', doneAt: '2026-10-01' }] });
    expect(setAccountStatus('u-alex', 'inactive', kengi()).ok).toBe(true);
    expect(getOps().activities.find(a => a.id === 'TEST-OPEN')?.owner).toBe('Ocean');
    expect(getOps().activities.find(a => a.id === 'TEST-OPEN')?.history?.at(-1)).toMatchObject({ fromOwner: 'Alex', toOwner: 'Ocean', action: 'reassigned' });
    expect(getOps().activities.find(a => a.id === 'TEST-DONE')?.owner).toBe('Alex');
    commit(getOps());
    expect(getOps().activities.filter(a => !a.doneAt && a.owner === 'Alex')).toHaveLength(0);
    expect(canOpen(user('u-alex'), 'purchasing')).toBe(false);
  });
  it('preserves the only configured approval recipient', () => {
    expect(setAccountStatus('u-ocean', 'inactive', kengi()).ok).toBe(false);
    expect(user('u-ocean').status).toBe('active');
  });
});

describe('v14 master data and historical snapshots', () => {
  it('imports the exact 16 daily IDs and seven initially disabled reserves', () => {
    const s = getSettings();
    expect(s.categories.filter(c => c.active).map(c => c.id)).toEqual(Array.from({ length: 16 }, (_, i) => `D${String(i + 1).padStart(2, '0')}`));
    expect(s.categories.filter(c => c.reserve)).toHaveLength(7);
    expect(s.categories.find(c => c.id === 'D08')?.caution).toContain('KPay／YeahPay 不自行合併');
    expect(s.categories.find(c => c.id === 'D16')?.report).toContain('不冒充零成本');
  });
  it('uses one active store and one HK warehouse; CN pending is not selectable', () => {
    expect(getSettings().locations.filter(l => l.kind === 'shop' && l.status === 'active')).toHaveLength(1);
    expect(getSettings().locations.filter(l => l.kind === 'warehouse' && l.status === 'active')).toHaveLength(1);
    expect(createScenario('expense', 'D13', 'LOC-CN-PENDING', 'u-ocean', ocean()).ok).toBe(false);
    expect(createScenario('expense', 'D13', 'LOC-MK618', 'u-ocean', ocean()).ok).toBe(false);
  });
  it('category and location edits affect new entries, not old names in snapshots', () => {
    createScenario('expense', 'D13', 'LOC-KT-WH', 'u-ocean', ocean());
    const s = getSettings(); const category = s.categories.find(c => c.id === 'D13')!; const loc = s.locations.find(l => l.id === 'LOC-KT-WH')!;
    saveCategory({ ...category, name: '行政開支（新版）', active: false }, ocean());
    saveLocation({ ...loc, name: '倉庫（新版）', status: 'inactive' }, ocean());
    const old = getSettings().scenarios[0];
    expect(old.category.name).toBe('行政及專業服務');
    expect(old.location?.name).toBe('觀塘倉');
    expect(createScenario('expense', 'D13', null, 'u-ocean', ocean()).ok).toBe(false);
    expect(createScenario('expense', 'D12', 'LOC-KT-WH', 'u-ocean', ocean()).ok).toBe(false);
  });
  it('blocks duplicate names, unconfirmed warehouse activation and unauthorized edits', () => {
    const loc = getSettings().locations[3];
    expect(saveLocation({ ...loc, status: 'active' }, ocean()).ok).toBe(false);
    expect(saveLocation({ ...loc, name: '觀塘倉' }, ocean()).ok).toBe(false);
    expect(saveCategory({ ...getSettings().categories[0], active: false }, user('u-alex')).ok).toBe(false);
    expect(saveLocation({ ...loc, name: '新倉庫' }, user('u-manman')).ok).toBe(false);
  });
  it('finance can manage classifications and payment mappings', () => {
    expect(saveCategory({ ...getSettings().categories[0], active: false }, user('u-manman')).ok).toBe(true);
    expect(canManage(user('u-manman'), 'policy')).toBe(false);
  });
});

describe('v14 payments configuration', () => {
  it('never invents bank accounts or enables unmapped methods', () => {
    expect(getSettings().accounts).toEqual([]);
    expect(getSettings().methods.every(m => !m.active)).toBe(true);
    expect(savePaymentMethod({ ...getSettings().methods[1], active: true }, ocean()).ok).toBe(false);
  });
  it('supports RMB supplier amounts settled from an HKD remittance account', () => {
    savePaymentAccount({ id: '', name: '示範港幣戶口', currency: 'HKD', active: true }, ocean());
    const a = getSettings().accounts[0];
    expect(savePaymentMethod({ ...getSettings().methods[1], accountId: a.id, active: true }, ocean()).ok).toBe(true);
    expect(getSettings().methods[1].currency).toBe('RMB');
    expect(getSettings().accounts[0].currency).toBe('HKD');
  });
  it('refuses non-HKD customer receipts and suspends mappings with disabled accounts', () => {
    savePaymentAccount({ id: '', name: '示範港幣戶口', currency: 'HKD', active: true }, ocean());
    const a = getSettings().accounts[0];
    const m = { ...getSettings().methods[0], name: '示範轉帳收款', accountId: a.id, active: true };
    expect(savePaymentMethod({ ...m, currency: 'RMB' }, ocean()).ok).toBe(false);
    expect(savePaymentMethod(m, ocean()).ok).toBe(true);
    savePaymentAccount({ ...a, active: false }, ocean());
    expect(getSettings().methods[0].active).toBe(false);
    expect(getSettings().methods[0].accountId).toBe(a.id);
  });
});

describe('v14 approval settings sandbox', () => {
  it('requires Ocean at every amount and records Ocean self-confirmation', () => {
    expect(needsApproval('pettyCash', 0)).toBe(true);
    expect(canApprove('pettyCash', ocean(), 'u-ocean')).toBe(true);
    createScenario('claim', 'D13', null, 'u-ocean', ocean());
    const id = getSettings().scenarios[0].id;
    expect(approveScenario(id, kengi()).ok).toBe(false);
    expect(approveScenario(id, ocean()).ok).toBe(true);
    expect(getSettings().scenarios[0].status).toBe('approved');
    expect(getSettings().scenarios[0].history.at(-1)?.event).toContain('Ocean 確認本人提交');
    expect(approveScenario(id, ocean()).ok).toBe(false);
  });
  it('retains old approval instructions and revisions when settings change', () => {
    createScenario('expense', 'D13', null, 'u-alex', ocean());
    const old = getSettings().scenarios[0].policy;
    revisePolicy('expense', '新版核對指引，先批後付。', kengi());
    createScenario('expense', 'D13', null, 'u-alex', ocean());
    expect(getSettings().scenarios[0].policy).toEqual(old);
    expect(getSettings().scenarios[1].policy.version).toBe(2);
    expect(getSettings().changes).toHaveLength(1);
  });
  it('leaves cases pending when Ocean cannot act; does not delegate to another owner', () => {
    createScenario('claim', 'D13', null, 'u-alex', ocean());
    const row = getSettings().scenarios[0];
    expect(approveScenario(row.id, user('u-jenny')).ok).toBe(false);
    updateAccount('u-ocean', { status: 'inactive' });
    expect(approveScenario(row.id, ocean()).ok).toBe(false);
    expect(getSettings().scenarios[0].status).toBe('pending');
  });
  it('checks the live actor account instead of accepting stale elevated settings access', () => {
    const prior = user('u-dickson');
    changeRoles(prior.id, ['sales'], ocean());
    expect(saveLocation({ ...getSettings().locations[0], name: 'Changed' }, prior).ok).toBe(false);
  });
});
