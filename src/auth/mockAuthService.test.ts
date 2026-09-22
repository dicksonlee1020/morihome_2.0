import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEMO_PASSWORD,
  _resetMockState,
  changePassword,
  requestPasswordReset,
  resetPassword,
  signInWithGoogle,
  signInWithPassword,
} from './mockAuthService';

const T0 = Date.parse('2026-09-22T09:00:00+08:00');
const min = (n: number) => n * 60_000;

beforeEach(() => _resetMockState());

describe('password sign-in', () => {
  it('signs a staff member in and applies their language', async () => {
    const r = await signInWithPassword('manman@morihome.example', DEMO_PASSWORD, false, T0);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.session.user.role).toBe('finance');
      expect(r.session.user.locale).toBe('zh-Hans');
      expect(r.session.remember).toBe(false);
    }
  });

  it('ignores case and whitespace in the address', async () => {
    const r = await signInWithPassword('  Ocean@Morihome.example ', DEMO_PASSWORD, true, T0);
    expect(r.ok).toBe(true);
  });

  it('gives the same answer for an unknown address and a wrong password', async () => {
    const unknown = await signInWithPassword('nobody@morihome.example', 'x', false, T0);
    const wrong = await signInWithPassword('ocean@morihome.example', 'x', false, T0);
    expect(unknown).toEqual({ ok: false, error: 'invalid' });
    expect(wrong).toEqual({ ok: false, error: 'invalid' });
  });

  it('refuses a deactivated account even with the right password', async () => {
    const r = await signInWithPassword('former@morihome.example', DEMO_PASSWORD, false, T0);
    expect(r).toEqual({ ok: false, error: 'inactive' });
  });

  it('locks the address after five failures and unlocks after 15 minutes', async () => {
    for (let i = 0; i < 4; i++) {
      expect((await signInWithPassword('alex@morihome.example', 'x', false, T0)).ok).toBe(false);
    }
    const fifth = await signInWithPassword('alex@morihome.example', 'x', false, T0);
    expect(fifth).toMatchObject({ ok: false, error: 'locked', lockedMinutes: 15 });

    // Right password, still locked.
    const during = await signInWithPassword('alex@morihome.example', DEMO_PASSWORD, false, T0 + min(10));
    expect(during).toMatchObject({ ok: false, error: 'locked', lockedMinutes: 5 });

    const after = await signInWithPassword('alex@morihome.example', DEMO_PASSWORD, false, T0 + min(16));
    expect(after.ok).toBe(true);
  });

  it('remember-me sessions last 30 days, others 12 hours', async () => {
    const short = await signInWithPassword('ocean@morihome.example', DEMO_PASSWORD, false, T0);
    const long = await signInWithPassword('ocean@morihome.example', DEMO_PASSWORD, true, T0);
    if (!short.ok || !long.ok) throw new Error('expected sign-in');
    const hours = (s: string, e: string) => (Date.parse(e) - Date.parse(s)) / 3_600_000;
    expect(hours(short.session.issuedAt, short.session.expiresAt)).toBe(12);
    expect(hours(long.session.issuedAt, long.session.expiresAt)).toBe(30 * 24);
  });

  it('flags an account that still has its temporary password', async () => {
    const r = await signInWithPassword('steve@morihome.example', DEMO_PASSWORD, false, T0);
    expect(r.ok && r.session.user.mustChangePassword).toBe(true);
  });
});

describe('Google sign-in', () => {
  it('accepts a staff address', async () => {
    const r = await signInWithGoogle({ email: 'ocean@morihome.example', name: 'Ocean' });
    expect(r.ok).toBe(true);
  });

  it('rejects an address that is not a staff account', async () => {
    const r = await signInWithGoogle({ email: 'someone@gmail.example', name: 'X' });
    expect(r).toEqual({ ok: false, error: 'ssoNotStaff' });
  });

  it('rejects a deactivated staff address', async () => {
    const r = await signInWithGoogle({ email: 'former@morihome.example', name: 'X' });
    expect(r).toEqual({ ok: false, error: 'inactive' });
  });

  it('reports a closed popup as cancelled', async () => {
    expect(await signInWithGoogle(null)).toEqual({ ok: false, error: 'ssoCancelled' });
  });
});

describe('password reset', () => {
  it('never reveals whether the address exists', async () => {
    const known = await requestPasswordReset('alex@morihome.example', T0);
    const unknown = await requestPasswordReset('nobody@morihome.example', T0);
    // Both resolve without error; only the demo token differs, and the UI
    // shows the same confirmation for either.
    expect(typeof known.demoToken).toBe('string');
    expect(unknown.demoToken).toBeNull();
  });

  it('does not issue a link for a deactivated account', async () => {
    const r = await requestPasswordReset('former@morihome.example', T0);
    expect(r.demoToken).toBeNull();
  });

  it('sets the new password, clears any lockout and burns the token', async () => {
    for (let i = 0; i < 5; i++) await signInWithPassword('alex@morihome.example', 'x', false, T0);
    const { demoToken } = await requestPasswordReset('alex@morihome.example', T0);
    expect(await resetPassword(demoToken!, 'newpass123', T0 + min(5))).toEqual({ ok: true });
    expect((await signInWithPassword('alex@morihome.example', 'newpass123', false, T0 + min(6))).ok).toBe(true);
    expect(await resetPassword(demoToken!, 'again456', T0 + min(7))).toEqual({ ok: false, error: 'expired' });
  });

  it('expires the link after 30 minutes', async () => {
    const { demoToken } = await requestPasswordReset('alex@morihome.example', T0);
    expect(await resetPassword(demoToken!, 'newpass123', T0 + min(31))).toEqual({ ok: false, error: 'expired' });
  });

  it('first-sign-in password change clears the flag', async () => {
    expect(await changePassword('u-steve', 'newpass123')).toEqual({ ok: true });
    const r = await signInWithPassword('steve@morihome.example', 'newpass123', false, T0);
    expect(r.ok && r.session.user.mustChangePassword).toBe(false);
  });
});
