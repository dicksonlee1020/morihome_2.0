import { Avatar, Flex, Modal, Typography } from 'antd';
import { DEMO_GOOGLE_ACCOUNTS } from '../../auth/mockAuthService';
import type { GoogleAccount } from '../../auth';
import { useT } from '../../i18n';
import { colors } from '../../theme';

const { Text } = Typography;

/**
 * Stand-in for Google's account chooser popup, so the SSO path can be walked
 * end to end without a Workspace tenant. Replaced by the real OAuth flow.
 */
export function GoogleAccountPicker({
  open,
  onPick,
  onCancel,
}: {
  open: boolean;
  onPick: (account: GoogleAccount) => void;
  onCancel: () => void;
}) {
  const t = useT();
  return (
    <Modal
      open={open}
      onCancel={onCancel}
      footer={null}
      title={t('auth.sso.pickTitle')}
      width={380}
      destroyOnHidden
    >
      <Text type="secondary">{t('auth.sso.pickBody')}</Text>
      <Flex vertical style={{ marginTop: 12 }}>
        {DEMO_GOOGLE_ACCOUNTS.map((account) => (
          <button
            key={account.email}
            type="button"
            onClick={() => onPick(account)}
            style={{
              all: 'unset',
              cursor: 'pointer',
              padding: '10px 8px',
              borderRadius: 6,
              borderBottom: `1px solid ${colors.border}`,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = colors.bgHover)}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <Flex align="center" gap={12}>
              <Avatar style={{ background: colors.wood }}>
                {account.name.slice(0, 1).toUpperCase()}
              </Avatar>
              <Flex vertical gap={0}>
                <Text>{account.name}</Text>
                <Text type="secondary">{account.email}</Text>
              </Flex>
            </Flex>
          </button>
        ))}
      </Flex>
    </Modal>
  );
}
