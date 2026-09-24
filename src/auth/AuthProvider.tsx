import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import dayjs from 'dayjs';
import { AuthContext, SESSION_STORAGE_KEY } from './context';
import type { AuthContextValue, AuthStatus } from './context';
import * as api from './mockAuthService';
import { logSession } from '../data/admin';
import type { GoogleAccount, Session } from './types';

/**
 * Holds the signed-in session and persists it.
 * "Remember me" (P29: staff hated re-authenticating every day) keeps the
 * session in localStorage for 30 days; otherwise it lives in sessionStorage
 * and ends with the tab.
 */
function readStoredSession(): Session | null {
  if (typeof window === 'undefined') return null;
  for (const store of [window.localStorage, window.sessionStorage]) {
    try {
      const raw = store.getItem(SESSION_STORAGE_KEY);
      if (!raw) continue;
      const session = JSON.parse(raw) as Session;
      if (dayjs(session.expiresAt).isAfter(dayjs())) return session;
      store.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // unreadable or blocked storage: treat as signed out
    }
  }
  return null;
}

function writeStoredSession(session: Session | null) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    if (session) {
      const store = session.remember ? window.localStorage : window.sessionStorage;
      store.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    }
  } catch {
    // not being able to persist must not block signing in
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Storage is synchronous, so the stored session is read once on first
  // render; 'loading' is reserved for when a server-side token check lands.
  const [session, setSession] = useState<Session | null>(readStoredSession);
  const status: AuthStatus = session ? 'authenticated' : 'anonymous';

  const adopt = useCallback((next: Session | null) => {
    writeStoredSession(next);
    setSession(next);
  }, []);

  const signIn = useCallback<AuthContextValue['signIn']>(
    async (email, password, remember) => {
      const result = await api.signInWithPassword(email, password, remember);
      if (result.ok) {
        adopt(result.session);
        logSession(result.session.user.id, 'login');
      }
      return result;
    },
    [adopt]
  );

  const signInWithGoogle = useCallback(
    async (account: GoogleAccount | null) => {
      const result = await api.signInWithGoogle(account);
      if (result.ok) {
        adopt(result.session);
        logSession(result.session.user.id, 'login');
      }
      return result;
    },
    [adopt]
  );

  const markPasswordChanged = useCallback(() => {
    setSession((prev) => {
      if (!prev) return prev;
      const next = { ...prev, user: { ...prev.user, mustChangePassword: false } };
      writeStoredSession(next);
      return next;
    });
  }, []);

  const signOut = useCallback(() => {
    if (session) logSession(session.user.id, 'logout');
    adopt(null);
  }, [adopt, session]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      user: session?.user ?? null,
      signIn,
      signInWithGoogle,
      markPasswordChanged,
      signOut,
    }),
    [status, session, signIn, signInWithGoogle, markPasswordChanged, signOut]
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}
