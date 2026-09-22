import { createContext } from 'react';
import type { GoogleAccount, Session, SignInResult, StaffUser } from './types';

export type AuthStatus = 'loading' | 'anonymous' | 'authenticated';

export interface AuthContextValue {
  status: AuthStatus;
  session: Session | null;
  user: StaffUser | null;
  signIn: (email: string, password: string, remember: boolean) => Promise<SignInResult>;
  signInWithGoogle: (account: GoogleAccount | null) => Promise<SignInResult>;
  /** Used by the first-sign-in flow once the temporary password is replaced. */
  markPasswordChanged: () => void;
  signOut: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export const SESSION_STORAGE_KEY = 'morihome.session';
