import { beforeEach, describe, expect, it } from 'vitest';
import {
  _resetAdmin,
  canApprove,
  canSeeWithGrants,
  changeRole,
  createAccount,
  decideRoleChange,
  getAdmin,
  hasGrant,
  issueGrant,
  needsApproval,
  pendingRoleRequests,
  revokeGrant,
  setAccountStatus,
  updateRule,
} from './admin';
import { listAccounts, signInWithPassword, DEMO_PASSWORD } from '../auth/mockAuthService';
import type { StaffUser } from '../auth/types';

const user = (id: string): StaffUser => listAccounts().find((u) => u.id === id)!;

beforeEach(() => _resetAdmin());

describe('accounts (rbac §9.1, §9.3 ⁹, §9.8.4)', () => {
  it('owner changes another account role immediately and it is audited', () => {
    const res = changeRole('u-steve', 'ops', user('u-ocean'));
    expect(res).toEqual({ ok: true, value: 'applied' });
    expect(user('u-steve').role).toBe('ops');
    const last = getAdmin().audit.at(-1)!;
    expect(last).toMatchObject({ userId: 'u-ocean', event: 'roleChange', targetId: 'u-steve', before: 'sales', after: 'ops' });
  });

  it('sysadmin can manage accounts but never their own role', () => {
    expect(changeRole('u-wilson', 'ops', user('u-kengi')).ok).toBe(true);
    expect(changeRole('u-kengi', 'owner', user('u-kengi'))).toEqual({ ok: false, error: 'selfRole' });
    expect(user('u-kengi').role).toBe('sysadmin');
  });

  it('owner changing their own role waits for a second owner', () => {
    expect(changeRole('u-ocean', 'sysadmin', user('u-ocean'))).toEqual({ ok: true, value: 'pending' });
    expect(user('u-ocean').role).toBe('owner');
    const req = pendingRoleRequests()[0];
    expect(decideRoleChange(req.id, 'confirmed', user('u-ocean'))).toEqual({ ok: false, error: 'sameActor' });
    expect(decideRoleChange(req.id, 'confirmed', user('u-kengi'))).toEqual({ ok: false, error: 'notOwner' });
    expect(decideRoleChange(req.id, 'confirmed', user('u-jenny')).ok).toBe(true);
    expect(user('u-ocean').role).toBe('sysadmin');
    expect(pendingRoleRequests()).toHaveLength(0);
  });

  it('non-admin roles are refused by the registry', () => {
    expect(changeRole('u-steve', 'ops', user('u-alex'))).toEqual({ ok: false, error: 'forbidden' });
    expect(setAccountStatus('u-steve', 'inactive', user('u-manman'))).toEqual({ ok: false, error: 'forbidden' });
  });

  it('deactivating blocks sign-in at once; nobody deactivates themselves', async () => {
    expect(setAccountStatus('u-ocean', 'inactive', user('u-ocean'))).toEqual({ ok: false, error: 'selfStatus' });
    expect(setAccountStatus('u-wilson', 'inactive', user('u-ocean')).ok).toBe(true);
    const r = await signInWithPassword('wilson@morihome.example', DEMO_PASSWORD, false);
    expect(r).toMatchObject({ ok: false, error: 'inactive' });
  });

  it('new accounts start on a temporary password and duplicates are refused', () => {
    const res = createAccount({ email: 'new@morihome.example', displayName: 'New', role: 'driver', locale: 'zh-Hant', expiresAt: null }, user('u-ocean'));
    expect(res.ok && res.value.mustChangePassword).toBe(true);
    expect(createAccount({ email: 'ocean@morihome.example', displayName: 'X', role: 'sales', locale: 'zh-Hant', expiresAt: null }, user('u-ocean'))).toEqual({ ok: false, error: 'duplicate' });
  });

  it('expired temporary accounts cannot sign in', async () => {
    createAccount({ email: 'temp@morihome.example', displayName: 'Temp', role: 'content', locale: 'zh-Hant', expiresAt: '2020-01-01' }, user('u-ocean'));
    const r = await signInWithPassword('temp@morihome.example', DEMO_PASSWORD, false);
    expect(r).toMatchObject({ ok: false, error: 'inactive' });
  });
});

describe('approval rules (§9.6)', () => {
  it('threshold decides whether approval is needed at all', () => {
    expect(needsApproval('purchase', 1)).toBe(true);
    expect(needsApproval('stocktake', 2)).toBe(false);
    expect(needsApproval('stocktake', 3)).toBe(true);
    expect(needsApproval('pettyCash', 9999)).toBe(false); // inactive
  });

  it('the named approver decides, never the requester; a requester who is the approver falls back to the role', () => {
    expect(canApprove('leave', user('u-jenny'), 'u-wilson')).toBe(true);
    expect(canApprove('leave', user('u-ocean'), 'u-wilson')).toBe(false);
    expect(canApprove('leave', user('u-jenny'), 'u-jenny')).toBe(false);
    expect(canApprove('leave', user('u-ocean'), 'u-jenny')).toBe(true);
  });

  it('rule edits are settings changes with an audit line per field', () => {
    const n = getAdmin().audit.length;
    expect(updateRule('AR-01', { threshold: 20000, approverUserId: 'u-jenny' }, user('u-manman')).ok).toBe(true);
    expect(getAdmin().audit.length).toBe(n + 2);
    expect(updateRule('AR-01', { active: false }, user('u-wilson'))).toEqual({ ok: false, error: 'forbidden' });
  });
});

describe('temporary field grants (§9.8)', () => {
  it('only an owner grants; the grant lifts the field class until it expires or is revoked', () => {
    const kengi = user('u-kengi');
    expect(canSeeWithGrants(kengi, 'CUSTOMER_PII')).toBe(false); // FG-02 expired
    expect(canSeeWithGrants(kengi, 'COST')).toBe(true); // FG-01 active
    expect(issueGrant({ userId: 'u-kengi', fieldClass: 'CUSTOMER_PII', hours: 2, reason: 'debug' }, kengi)).toEqual({ ok: false, error: 'notOwner' });
    const res = issueGrant({ userId: 'u-kengi', fieldClass: 'CUSTOMER_PII', hours: 2, reason: 'debug' }, user('u-ocean'));
    expect(res.ok).toBe(true);
    expect(hasGrant('u-kengi', 'CUSTOMER_PII')).toBe(true);
    if (res.ok) {
      expect(hasGrant('u-kengi', 'CUSTOMER_PII', Date.parse(res.value.expiresAt) + 1)).toBe(false);
      expect(revokeGrant(res.value.id, user('u-ocean')).ok).toBe(true);
    }
    expect(hasGrant('u-kengi', 'CUSTOMER_PII')).toBe(false);
    expect(getAdmin().audit.filter((a) => a.event === 'grantIssued' || a.event === 'grantRevoked').length).toBeGreaterThanOrEqual(4);
  });
});
