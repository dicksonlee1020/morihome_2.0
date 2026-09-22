import { useState } from 'react';
import { Alert, Button, Flex, Form, Input, Typography } from 'antd';
import { ArrowLeftOutlined, MailOutlined } from '@ant-design/icons';
import { requestPasswordReset } from '../../auth/mockAuthService';
import { useT } from '../../i18n';
import { colors } from '../../theme';

const { Text, Title } = Typography;

export function ForgotPasswordPage({
  onBack,
  onOpenReset,
}: {
  onBack: () => void;
  /** Demo shortcut standing in for the link in the email. */
  onOpenReset: (token: string) => void;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ email: string; demoToken: string | null } | null>(null);

  const submit = async ({ email }: { email: string }) => {
    setBusy(true);
    try {
      const { demoToken } = await requestPasswordReset(email);
      setSent({ email, demoToken });
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <Flex vertical gap={16}>
        <Title level={2} style={{ margin: 0 }}>
          {t('auth.forgot.sentTitle')}
        </Title>
        <Alert
          type="success"
          showIcon
          title={t('auth.forgot.sentBody', { email: sent.email })}
          description={t('auth.forgot.sentHint')}
        />
        {sent.demoToken && (
          <Button type="dashed" onClick={() => onOpenReset(sent.demoToken!)}>
            {t('auth.forgot.demoOpen')}
          </Button>
        )}
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={onBack} style={{ alignSelf: 'flex-start' }}>
          {t('auth.forgot.back')}
        </Button>
      </Flex>
    );
  }

  return (
    <Flex vertical gap={16}>
      <Flex vertical gap={2}>
        <Title level={2} style={{ margin: 0 }}>
          {t('auth.forgot.title')}
        </Title>
        <Text type="secondary">{t('auth.forgot.subtitle')}</Text>
      </Flex>

      <Form layout="vertical" requiredMark={false} onFinish={submit}>
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
          />
        </Form.Item>
        <Button type="primary" htmlType="submit" size="large" block loading={busy}>
          {t('auth.forgot.submit')}
        </Button>
      </Form>

      <Button type="text" icon={<ArrowLeftOutlined />} onClick={onBack} style={{ alignSelf: 'flex-start' }}>
        {t('auth.forgot.back')}
      </Button>
    </Flex>
  );
}
