import { useState } from 'react';
import { Alert, Button, Flex, Form, Input, Typography } from 'antd';
import { CheckCircleFilled, LockOutlined } from '@ant-design/icons';
import { useAuth } from '../../auth';
import { changePassword, resetPassword } from '../../auth/mockAuthService';
import { useT } from '../../i18n';
import { colors } from '../../theme';

const { Text, Title } = Typography;

interface Values {
  password: string;
  confirm: string;
}

/** Kept deliberately simple: staff IT comfort is low, one rule set for all. */
const rules = {
  length: (p: string) => p.length >= 8,
  mix: (p: string) => /[A-Za-z]/.test(p) && /\d/.test(p),
};

/**
 * Two entry points share this form:
 * - `token` set: came from a reset link
 * - `firstLogin`: signed in with a temporary password and must replace it
 */
export function ResetPasswordPage({
  token,
  firstLogin,
  onDone,
  onExpired,
}: {
  token?: string;
  firstLogin?: boolean;
  onDone: () => void;
  onExpired: () => void;
}) {
  const t = useT();
  const { user, markPasswordChanged } = useAuth();
  const [form] = Form.useForm<Values>();
  const [busy, setBusy] = useState(false);
  const [expired, setExpired] = useState(false);
  const password = Form.useWatch('password', form) ?? '';
  const confirm = Form.useWatch('confirm', form) ?? '';

  const checks = [
    { key: 'length', ok: rules.length(password), label: t('auth.reset.rule.length') },
    { key: 'mix', ok: rules.mix(password), label: t('auth.reset.rule.mix') },
    { key: 'match', ok: password.length > 0 && password === confirm, label: t('auth.reset.rule.match') },
  ];
  const allOk = checks.every((c) => c.ok);

  const submit = async (values: Values) => {
    setBusy(true);
    try {
      if (firstLogin && user) {
        const r = await changePassword(user.id, values.password);
        if (r.ok) {
          markPasswordChanged();
          onDone();
        }
        return;
      }
      if (token) {
        const r = await resetPassword(token, values.password);
        if (r.ok) onDone();
        else setExpired(true);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Flex vertical gap={16}>
      <Flex vertical gap={2}>
        <Title level={2} style={{ margin: 0 }}>
          {firstLogin ? t('auth.reset.firstLoginTitle') : t('auth.reset.title')}
        </Title>
        {firstLogin && <Text type="secondary">{t('auth.reset.firstLoginBody')}</Text>}
      </Flex>

      {expired && (
        <Alert
          type="error"
          showIcon
          title={t('auth.reset.expired')}
          action={
            <Button size="small" onClick={onExpired}>
              {t('auth.forgot.title')}
            </Button>
          }
        />
      )}

      <Form<Values> form={form} layout="vertical" requiredMark={false} onFinish={submit}>
        <Form.Item name="password" label={t('auth.reset.password')}>
          <Input.Password
            size="large"
            autoFocus
            autoComplete="new-password"
            prefix={<LockOutlined style={{ color: colors.textMuted }} />}
          />
        </Form.Item>
        <Form.Item name="confirm" label={t('auth.reset.confirm')} style={{ marginBottom: 12 }}>
          <Input.Password
            size="large"
            autoComplete="new-password"
            prefix={<LockOutlined style={{ color: colors.textMuted }} />}
          />
        </Form.Item>

        <Flex vertical gap={4} style={{ marginBottom: 20 }}>
          {checks.map((c) => (
            <Flex key={c.key} align="center" gap={8}>
              <CheckCircleFilled
                style={{ color: c.ok ? colors.success : colors.borderStrong, fontSize: 14 }}
              />
              <Text type={c.ok ? undefined : 'secondary'}>{c.label}</Text>
            </Flex>
          ))}
        </Flex>

        <Button
          type="primary"
          htmlType="submit"
          size="large"
          block
          loading={busy}
          disabled={!allOk || expired}
        >
          {t('auth.reset.submit')}
        </Button>
      </Form>
    </Flex>
  );
}
