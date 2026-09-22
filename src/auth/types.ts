import type { Locale } from '../i18n';

/**
 * Staff accounts and sessions.
 * SPEC REF §6: six roles, permissions default to deny. §7: Google Workspace
 * SSO, deactivating a leaver's account cuts them off everywhere at once.
 *
 * Accounts are created by an administrator; there is no self-registration and
 * a role is never taken from anything the client sends.
 */

export type StaffRole =
  | 'owner'
  | 'procurement'
  | 'finance'
  | 'sales'
  | 'driver'
  | 'merchandising';

export const STAFF_ROLES: StaffRole[] = [
  'owner',
  'procurement',
  'finance',
  'sales',
  'driver',
  'merchandising',
];

export type AccountStatus = 'active' | 'inactive';

export interface StaffUser {
  id: string;
  email: string;
  displayName: string;
  role: StaffRole;
  status: AccountStatus;
  /** Per-user language setting (CLAUDE.md); applied the moment they sign in. */
  locale: Locale;
  /** Set on accounts opened with a temporary password. */
  mustChangePassword: boolean;
  lastLoginAt: string | null;
}

export interface Session {
  token: string;
  user: StaffUser;
  issuedAt: string;
  expiresAt: string;
  /** Whether the session should outlive the browser tab. */
  remember: boolean;
}

export type AuthErrorCode =
  | 'invalid'
  | 'locked'
  | 'inactive'
  | 'ssoNotStaff'
  | 'ssoCancelled'
  | 'network';

export type SignInResult =
  | { ok: true; session: Session }
  | { ok: false; error: AuthErrorCode; lockedMinutes?: number };

export type ResetResult =
  | { ok: true }
  | { ok: false; error: 'expired' | 'network' };

/** What a Google sign-in hands back once the popup closes. */
export interface GoogleAccount {
  email: string;
  name: string;
}
