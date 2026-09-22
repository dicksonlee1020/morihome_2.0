import { useState } from 'react';
import { useAuth } from '../../auth';
import { useT } from '../../i18n';
import { AuthLayout } from './AuthLayout';
import { ForgotPasswordPage } from './ForgotPasswordPage';
import { LoginPage } from './LoginPage';
import { ResetPasswordPage } from './ResetPasswordPage';

type View =
  | { name: 'login'; notice?: string }
  | { name: 'forgot' }
  | { name: 'reset'; token: string };

/**
 * Everything a signed-out visitor can see. Routing is local state for now;
 * a reset link in a real email would carry the token in the URL instead.
 */
export function AuthScreens() {
  const t = useT();
  const { user } = useAuth();
  const [view, setView] = useState<View>({ name: 'login' });

  // Signed in with a temporary password: nothing else until it is replaced.
  if (user?.mustChangePassword) {
    return (
      <AuthLayout>
        <ResetPasswordPage firstLogin onDone={() => undefined} onExpired={() => undefined} />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      {view.name === 'login' && (
        <LoginPage notice={view.notice} onForgot={() => setView({ name: 'forgot' })} />
      )}
      {view.name === 'forgot' && (
        <ForgotPasswordPage
          onBack={() => setView({ name: 'login' })}
          onOpenReset={(token) => setView({ name: 'reset', token })}
        />
      )}
      {view.name === 'reset' && (
        <ResetPasswordPage
          token={view.token}
          onDone={() => setView({ name: 'login', notice: t('auth.reset.done') })}
          onExpired={() => setView({ name: 'forgot' })}
        />
      )}
    </AuthLayout>
  );
}
