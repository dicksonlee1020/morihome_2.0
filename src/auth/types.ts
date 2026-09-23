import type { Locale } from '../i18n';
import type { StaffRole } from '../config/permissions';

export type { StaffRole } from '../config/permissions';
export { ROLES as STAFF_ROLES } from '../config/permissions';

/**
 * Staff accounts and sessions.
 * SPEC REF rbac-spec.md §9.1: User ↔ Employee one-to-one, seven roles from the
 * shared registry, permissions default to deny, no per-user override.
 * §7 / Q19: Google + email-password both kept until Ocean decides.
 *
 * Accounts are created by an administrator; there is no self-registration and
 * a role is never taken from anything the client sends.
 */

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
