import { useState } from 'react';
import {
  Alert,
  App,
  Button,
  Checkbox,
  Collapse,
  Divider,
  Flex,
  Form,
  Input,
  Typography,
} from 'antd';
import { LockOutlined, MailOutlined } from '@ant-design/icons';
import { useAuth } from '../../auth';
import type { AuthErrorCode, GoogleAccount } from '../../auth';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../../auth/mockAuthService';
import { useT } from '../../i18n';
import type { MessageKey } from '../../i18n';
import { colors } from '../../theme';
import { Pill } from '../../components/Pill';
import { GoogleAccountPicker } from './GoogleAccountPicker';

const { Text, Title, Link } = Typography;

interface LoginValues {
  email: string;
  password: string;
  remember: boolean;
}

/** Shown once; keep it separate so removing the demo is one line. */
const SHOW_DEMO_ACCOUNTS = true;

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.5l6.8-6.8C35.7 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.9 6.1C12.4 13.5 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
      <path fill="#FBBC05" d="M10.5 28.6c-.5-1.5-.8-3-.8-4.6s.3-3.1.8-4.6l-7.9-6.1C1 16.4 0 20.1 0 24s1 7.6 2.6 10.7l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.2 0 11.5-2 15.3-5.5l-7.5-5.8c-2.1 1.4-4.7 2.2-7.8 2.2-6.3 0-11.6-4-13.5-9.6l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

export function LoginPage({
  onForgot,
  notice,
}: {
  onForgot: () => void;
  /** e.g. "password updated" after a reset */
  notice?: string | null;
}) {
  const t = useT();
  const { message } = App.useApp();
  const { signIn, signInWithGoogle } = useAuth();
  const [form] = Form.useForm<LoginValues>();
  const [error, setError] = useState<{ code: AuthErrorCode; minutes?: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const errorText = (code: AuthErrorCode, minutes?: number, email?: string) =>
    t(`auth.error.${code}` as MessageKey, { minutes: minutes ?? '', email: email ?? '' });

  const submit = async (values: LoginValues) => {
    setBusy(true);
    setError(null);
    try {
      const result = await signIn(values.email, values.password, values.remember);
      if (!result.ok) setError({ code: result.error, minutes: result.lockedMinutes });
    } catch {
      setError({ code: 'network' });
    } finally {
      setBusy(false);
    }
  };

  const pickGoogle = async (account: GoogleAccount | null) => {
    setPickerOpen(false);
    if (!account) return;
    setBusy(true);
    setError(null);
    try {
      const result = await signInWithGoogle(account);
      if (!result.ok) {
        if (result.error === 'ssoCancelled') message.info(t('auth.error.ssoCancelled'));
        else setError({ code: result.error });
      }
    } finally {
      setBusy(false);
    }
  };

  const [ssoEmail, setSsoEmail] = useState<string>('');

  return (
    <Flex vertical gap={16}>
      <Flex vertical gap={2}>
        <Title level={2} style={{ margin: 0 }}>
          {t('auth.login.title')}
        </Title>
        <Text type="secondary">{t('auth.login.subtitle')}</Text>
      </Flex>

      {notice && <Alert type="success" showIcon title={notice} />}
      {error && (
        <Alert
          type="error"
          showIcon
          title={errorText(error.code, error.minutes, ssoEmail)}
        />
      )}

      <Form<LoginValues>
        form={form}
        layout="vertical"
        requiredMark={false}
        initialValues={{ remember: true }}
        onFinish={submit}
        onValuesChange={() => error && setError(null)}
      >
        <Form.Item
          name="email"
          label={t('auth.login.email')}
          rules={[
            { required: true, message: t('auth.error.emailRequired') },
            { type: 'email', message: t('auth.error.emailInvalid') },
          ]}
        >
          <Input
            size="large"
            autoFocus
            autoComplete="username"
            inputMode="email"
            prefix={<MailOutlined style={{ color: colors.textMuted }} />}
            placeholder="name@company.com"
          />
        </Form.Item>

        <Form.Item
          name="password"
          label={t('auth.login.password')}
          rules={[{ required: true, message: t('auth.error.passwordRequired') }]}
          style={{ marginBottom: 12 }}
        >
          <Input.Password
            size="large"
            autoComplete="current-password"
            prefix={<LockOutlined style={{ color: colors.textMuted }} />}
          />
        </Form.Item>

        <Flex align="center" justify="space-between" wrap gap={8} style={{ marginBottom: 20 }}>
          <Form.Item name="remember" valuePropName="checked" noStyle>
            <Checkbox>
              <Text>{t('auth.login.remember')}</Text>
            </Checkbox>
          </Form.Item>
          <Link onClick={onForgot}>{t('auth.login.forgot')}</Link>
        </Flex>

        <Button type="primary" htmlType="submit" size="large" block loading={busy}>
          {t('auth.login.submit')}
        </Button>
      </Form>

      <Divider plain style={{ margin: '4px 0' }}>
        <Text type="secondary">{t('auth.login.or')}</Text>
      </Divider>

      <Flex vertical gap={6}>
        <Button
          size="large"
          block
          icon={<GoogleMark />}
          disabled={busy}
          onClick={() => {
            setSsoEmail('');
            setPickerOpen(true);
          }}
        >
          {t('auth.login.google')}
        </Button>
        <Text type="secondary" style={{ textAlign: 'center' }}>
          {t('auth.login.googleHint')}
        </Text>
      </Flex>

      <Text type="secondary" style={{ textAlign: 'center' }}>
        {t('auth.login.noAccount')}
      </Text>

      {SHOW_DEMO_ACCOUNTS && (
        <Collapse
          size="small"
          items={[
            {
              key: 'demo',
              label: t('auth.demo.title'),
              children: (
                <Flex vertical gap={8}>
                  <Text type="secondary">
                    {t('auth.demo.body', { password: DEMO_PASSWORD })}
                  </Text>
                  {DEMO_ACCOUNTS.map((a) => (
                    <Flex key={a.email} align="center" justify="space-between" gap={8}>
                      <Flex align="center" gap={8} style={{ minWidth: 0 }}>
                        <Text style={{ whiteSpace: 'nowrap' }}>{a.displayName}</Text>
                        <Pill tone="muted">{t(`role.${a.role}` as MessageKey)}</Pill>
                        {a.mustChangePassword && <Pill tone="warning">{t('auth.demo.tempPassword')}</Pill>}
                      </Flex>
                      <Button
                        size="small"
                        onClick={() => {
                          form.setFieldsValue({ email: a.email, password: DEMO_PASSWORD });
                          setError(null);
                        }}
                      >
                        {t('auth.demo.fill')}
                      </Button>
                    </Flex>
                  ))}
                </Flex>
              ),
            },
          ]}
        />
      )}

      <GoogleAccountPicker
        open={pickerOpen}
        onPick={(account) => {
          setSsoEmail(account.email);
          void pickGoogle(account);
        }}
        onCancel={() => void pickGoogle(null)}
      />
    </Flex>
  );
}
