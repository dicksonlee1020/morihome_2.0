import { use } from 'react';
import { AuthContext } from './context';
import type { AuthContextValue } from './context';

export function useAuth(): AuthContextValue {
  const ctx = use(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
