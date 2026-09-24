import dayjs from 'dayjs';
import type {
  GoogleAccount,
  ResetResult,
  Session,
  SignInResult,
  StaffUser,
} from './types';

/**
 * In-memory stand-in for the auth API. Every function here maps 1:1 to an
 * endpoint the backend will expose; the pages only ever talk to this surface,
 * so swapping in HTTP calls does not touch the UI.
 *
 * Behaviour it deliberately mirrors from the intended backend:
 * - one generic "invalid" answer for a wrong email OR a wrong password, so the
 *   form never confirms which addresses exist
 * - lockout after repeated failures
 * - deactivated accounts are refused before the password is even checked
 * - Google sign-in only succeeds for an address that is already a staff account
 *
 * TODO(workspace): the company has no Google Workspace tenant yet. Once it
 * exists, the real SSO must restrict to that domain (hosted-domain check) and
 * the demo picker below goes away.
 */

export const DEMO_PASSWORD = 'morihome2026';

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const RESET_LINK_MINUTES = 30;
const SESSION_DAYS_REMEMBER = 30;
const SESSION_HOURS_DEFAULT = 12;

/**
 * Staff from the project's people list. Roles follow spec §6.
 * TODO(spec): §6 has no IT/admin role; Kengi is filed under owner for now.
 */
interface StoredUser extends StaffUser {
  password: string;
}

const users: StoredUser[] = [
  { id: 'u-ocean', email: 'ocean@morihome.example', displayName: 'Ocean', role: 'owner', status: 'active', locale: 'zh-Hant', mustChangePassword: false, expiresAt: null, lastLoginAt: '2026-09-21T09:12:00+08:00', password: DEMO_PASSWORD },
  { id: 'u-jenny', email: 'jenny@morihome.example', displayName: 'Jenny', role: 'owner', status: 'active', locale: 'zh-Hant', expiresAt: null, mustChangePassword: false, lastLoginAt: '2026-09-20T15:10:00+08:00', password: DEMO_PASSWORD },
  { id: 'u-kengi', email: 'kengi@morihome.example', displayName: 'Kengi', role: 'sysadmin', status: 'active', locale: 'zh-Hant', expiresAt: null, mustChangePassword: false, lastLoginAt: '2026-09-22T08:40:00+08:00', password: DEMO_PASSWORD },
  { id: 'u-alex', email: 'alex@morihome.example', displayName: 'Alex', role: 'ops', status: 'active', locale: 'zh-Hant', expiresAt: null, mustChangePassword: false, lastLoginAt: '2026-09-22T09:05:00+08:00', password: DEMO_PASSWORD },
  { id: 'u-manman', email: 'manman@morihome.example', displayName: '雯雯', role: 'finance', status: 'active', locale: 'zh-Hans', expiresAt: null, mustChangePassword: false, lastLoginAt: '2026-09-22T09:30:00+08:00', password: DEMO_PASSWORD },
  { id: 'u-yumi', email: 'yumi@morihome.example', displayName: 'Yumi', role: 'content', status: 'active', locale: 'zh-Hant', expiresAt: null, mustChangePassword: false, lastLoginAt: '2026-09-21T17:50:00+08:00', password: DEMO_PASSWORD },
  { id: 'u-wilson', email: 'wilson@morihome.example', displayName: 'Wilson', role: 'sales', status: 'active', locale: 'zh-Hant', expiresAt: null, mustChangePassword: false, lastLoginAt: '2026-09-22T10:02:00+08:00', password: DEMO_PASSWORD },
  { id: 'u-steve', email: 'steve@morihome.example', displayName: 'Steve', role: 'sales', status: 'active', locale: 'zh-Hant', expiresAt: null, mustChangePassword: true, lastLoginAt: null, password: DEMO_PASSWORD },
  { id: 'u-hang', email: 'hang@morihome.example', displayName: '阿桁', role: 'driver', status: 'active', locale: 'zh-Hant', expiresAt: null, mustChangePassword: false, lastLoginAt: '2026-09-22T07:55:00+08:00', password: DEMO_PASSWORD },
  // A leaver: the account stays for audit history but can no longer sign in.
  { id: 'u-former', email: 'former@morihome.example', displayName: '前同事', role: 'sales', status: 'inactive', locale: 'zh-Hant', expiresAt: null, mustChangePassword: false, lastLoginAt: '2026-03-02T18:20:00+08:00', password: DEMO_PASSWORD },
];

/** Accounts the demo Google picker offers, including one that is not staff. */
export const DEMO_GOOGLE_ACCOUNTS: GoogleAccount[] = [
  { email: 'ocean@morihome.example', name: 'Ocean' },
  { email: 'alex@morihome.example', name: 'Alex' },
  { email: 'someone@gmail.example', name: 'Someone Else' },
];

export const DEMO_ACCOUNTS = users
  .filter((u) => u.status === 'active')
  .map(({ email, displayName, role, locale, mustChangePassword }) => ({
    email,
    displayName,
    role,
    locale,
    mustChangePassword,
  }));

const attempts = new Map<string, { count: number; lockedUntil: number | null }>();
const resetTokens = new Map<string, { email: string; expiresAt: number }>();

const publicUser = ({ password: _password, ...rest }: StoredUser): StaffUser => rest;

/** Deactivated or expired (§9.1 expiresAt) accounts are refused alike. */
const isActive = (u: StoredUser, now = Date.now()) =>
  u.status === 'active' && (u.expiresAt === null || Date.parse(u.expiresAt) > now);

const findByEmail = (email: string) =>
  users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());

const randomToken = () =>
  Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

function makeSession(user: StoredUser, remember: boolean): Session {
  const now = dayjs();
  const expires = remember
    ? now.add(SESSION_DAYS_REMEMBER, 'day')
    : now.add(SESSION_HOURS_DEFAULT, 'hour');
  user.lastLoginAt = now.toISOString();
  return {
    token: randomToken(),
    user: publicUser(user),
    issuedAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    remember,
  };
}

function lockState(email: string, now: number) {
  const entry = attempts.get(email);
  if (!entry?.lockedUntil) return null;
  if (entry.lockedUntil <= now) {
    attempts.delete(email);
    return null;
  }
  return Math.max(1, Math.ceil((entry.lockedUntil - now) / 60_000));
}

function recordFailure(email: string, now: number) {
  const entry = attempts.get(email) ?? { count: 0, lockedUntil: null };
  entry.count += 1;
  if (entry.count >= MAX_ATTEMPTS) {
    entry.lockedUntil = now + LOCK_MINUTES * 60_000;
    entry.count = 0;
  }
  attempts.set(email, entry);
}

export async function signInWithPassword(
  email: string,
  password: string,
  remember: boolean,
  now = Date.now()
): Promise<SignInResult> {
  const key = email.trim().toLowerCase();
  const lockedMinutes = lockState(key, now);
  if (lockedMinutes) return { ok: false, error: 'locked', lockedMinutes };

  const user = findByEmail(email);
  if (!user || user.password !== password) {
    recordFailure(key, now);
    const nowLocked = lockState(key, now);
    return nowLocked
      ? { ok: false, error: 'locked', lockedMinutes: nowLocked }
      : { ok: false, error: 'invalid' };
  }
  if (!isActive(user, now)) return { ok: false, error: 'inactive' };

  attempts.delete(key);
  return { ok: true, session: makeSession(user, remember) };
}

export async function signInWithGoogle(
  account: GoogleAccount | null
): Promise<SignInResult> {
  if (!account) return { ok: false, error: 'ssoCancelled' };
  const user = findByEmail(account.email);
  if (!user) return { ok: false, error: 'ssoNotStaff' };
  if (!isActive(user)) return { ok: false, error: 'inactive' };
  // SSO sessions follow the identity provider, so they always persist.
  return { ok: true, session: makeSession(user, true) };
}

/**
 * Always resolves the same way whether or not the address is known, so the
 * form cannot be used to enumerate staff. Returns the token only so the demo
 * can "click the link" without an inbox.
 */
export async function requestPasswordReset(
  email: string,
  now = Date.now()
): Promise<{ demoToken: string | null }> {
  const user = findByEmail(email);
  if (!user || user.status !== 'active') return { demoToken: null };
  const token = randomToken();
  resetTokens.set(token, {
    email: user.email,
    expiresAt: now + RESET_LINK_MINUTES * 60_000,
  });
  return { demoToken: token };
}

export async function resetPassword(
  token: string,
  newPassword: string,
  now = Date.now()
): Promise<ResetResult> {
  const entry = resetTokens.get(token);
  if (!entry || entry.expiresAt <= now) return { ok: false, error: 'expired' };
  const user = findByEmail(entry.email);
  if (!user) return { ok: false, error: 'expired' };
  user.password = newPassword;
  user.mustChangePassword = false;
  resetTokens.delete(token);
  attempts.delete(user.email.toLowerCase());
  return { ok: true };
}

/** First sign-in with a temporary password: set a real one, keep the session. */
export async function changePassword(
  userId: string,
  newPassword: string
): Promise<ResetResult> {
  const user = users.find((u) => u.id === userId);
  if (!user) return { ok: false, error: 'network' };
  user.password = newPassword;
  user.mustChangePassword = false;
  return { ok: true };
}

/* ------------------------------------------------ account management API */
/**
 * §9.1 / §9.3 ⁹: accounts are opened and changed by owner or sysadmin only;
 * the rules about WHO may change WHAT (never your own role, second owner
 * confirms) live in data/admin.ts so the audit trail is written in one place.
 * These calls are the raw endpoints.
 */
const accountListeners = new Set<() => void>();
let accountsSnapshot: StaffUser[] = users.map(publicUser);
const emitAccounts = () => {
  accountsSnapshot = users.map(publicUser);
  accountListeners.forEach((l) => l());
};

export const listAccounts = (): StaffUser[] => accountsSnapshot;
export function subscribeAccounts(l: () => void) {
  accountListeners.add(l);
  return () => accountListeners.delete(l);
}

export function updateAccount(
  id: string,
  patch: Partial<Pick<StaffUser, 'role' | 'status' | 'locale' | 'displayName' | 'expiresAt'>>
): StaffUser | null {
  const user = users.find((u) => u.id === id);
  if (!user) return null;
  Object.assign(user, patch);
  emitAccounts();
  return publicUser(user);
}

/** Opens an account with a temporary password; the person sets their own at first sign-in. */
export function createAccount(input: Pick<StaffUser, 'email' | 'displayName' | 'role' | 'locale'> & { expiresAt?: string | null }): StaffUser | { error: 'duplicate' } {
  if (findByEmail(input.email)) return { error: 'duplicate' };
  const id = `u-${input.email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '')}`;
  const user: StoredUser = {
    id: users.some((u) => u.id === id) ? `${id}-${users.length}` : id,
    email: input.email.trim(),
    displayName: input.displayName.trim(),
    role: input.role,
    status: 'active',
    locale: input.locale,
    mustChangePassword: true,
    lastLoginAt: null,
    expiresAt: input.expiresAt ?? null,
    password: DEMO_PASSWORD,
  };
  users.push(user);
  emitAccounts();
  return publicUser(user);
}

/** Admin reset: back to the temporary password, forced change on next sign-in. */
export function resetToTemporaryPassword(id: string): boolean {
  const user = users.find((u) => u.id === id);
  if (!user) return false;
  user.password = DEMO_PASSWORD;
  user.mustChangePassword = true;
  attempts.delete(user.email.toLowerCase());
  emitAccounts();
  return true;
}

const SEED_ACCOUNTS = users.map((u) => ({ ...u }));

/** Test hook: wipe lockouts and tokens between cases. */
export function _resetMockState() {
  attempts.clear();
  resetTokens.clear();
  users.splice(0, users.length, ...SEED_ACCOUNTS.map((u) => ({ ...u })));
  emitAccounts();
}
