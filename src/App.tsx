import { useEffect, useState } from 'react';
import {
  App as AntdApp,
  Avatar,
  ConfigProvider,
  Drawer,
  Dropdown,
  Empty,
  Flex,
  Layout,
  Menu,
  Segmented,
  Spin,
  Tooltip,
  Typography,
} from 'antd';
import zhHK from 'antd/locale/zh_HK';
import zhCN from 'antd/locale/zh_CN';
import 'dayjs/locale/zh-hk';
import 'dayjs/locale/zh-cn';
import dayjs from 'dayjs';
import {
  AppstoreOutlined,
  CarOutlined,
  CheckSquareOutlined,
  ContainerOutlined,
  FileTextOutlined,
  InboxOutlined,
  LogoutOutlined,
  MenuOutlined,
  SettingOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { colors, useIsMobile, useMoriTheme } from './theme';
import { OrdersPage } from './pages/OrdersPage';
import { ProductsPage } from './pages/ProductsPage';
import { InventoryPage } from './pages/InventoryPage';
import { MyFollowupsPage } from './pages/MyFollowupsPage';
import { AuthScreens } from './pages/auth/AuthScreens';
import { LOCALES, LocaleProvider, useLocale } from './i18n';
import type { MessageKey, Translate } from './i18n';
import { AuthProvider, canOpen, landingPage, useAuth } from './auth';
import type { PageKey, StaffUser } from './auth';
import { Pill } from './components/Pill';
import { Logo } from './components/Logo';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

/**
 * Spec §6: the main entry is a task screen, not a module menu, so the
 * follow-up list sits first. What each role actually sees comes from
 * PAGE_ROLES (default deny).
 */
const navItems: { key: PageKey; icon: React.ReactNode }[] = [
  { key: 'followups', icon: <CheckSquareOutlined /> },
  { key: 'orders', icon: <FileTextOutlined /> },
  { key: 'customers', icon: <TeamOutlined /> },
  { key: 'products', icon: <AppstoreOutlined /> },
  { key: 'inventory', icon: <InboxOutlined /> },
  { key: 'purchasing', icon: <ContainerOutlined /> },
  { key: 'delivery', icon: <CarOutlined /> },
  { key: 'settings', icon: <SettingOutlined /> },
];

const navLabelKey = (key: PageKey): MessageKey => `nav.${key}` as MessageKey;

/**
 * theme.ts suggests dense for products/inventory, but at 13px the compact
 * text was too small for the team (Dickson, 2026-09-22). Every screen opens
 * comfortable; the header toggle stays for anyone who wants it denser.
 */
const DENSE_BY_DEFAULT: PageKey[] = [];

function Brand({ t, compact = false }: { t: Translate; compact?: boolean }) {
  const isMobile = useIsMobile();
  return (
    <Flex align="center" gap={10}>
      {isMobile && compact ? (
        <Logo variant="mark" height={28} />
      ) : (
        <Logo variant="lockup" height={26} />
      )}
      <Text type="secondary" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
        {t('app.brandSub')}
      </Text>
    </Flex>
  );
}

function Nav({
  page,
  user,
  onSelect,
  t,
}: {
  page: PageKey;
  user: StaffUser;
  onSelect: (key: PageKey) => void;
  t: Translate;
}) {
  return (
    <Menu
      mode="inline"
      selectedKeys={[page]}
      items={navItems
        .filter((item) => canOpen(user.role, item.key))
        .map((item) => ({ ...item, label: t(navLabelKey(item.key)) }))}
      onClick={({ key }) => onSelect(key as PageKey)}
      style={{ borderInlineEnd: 'none', padding: 8 }}
    />
  );
}

function UserMenu({ user, t }: { user: StaffUser; t: Translate }) {
  const { signOut } = useAuth();
  const isMobile = useIsMobile();
  return (
    <Dropdown
      trigger={['click']}
      placement="bottomRight"
      menu={{
        items: [
          {
            key: 'who',
            disabled: true,
            label: (
              <Flex vertical gap={2} style={{ padding: '4px 0' }}>
                <Text type="secondary" style={{ fontSize: 13 }}>
                  {t('auth.user.signedInAs')}
                </Text>
                <Text style={{ fontWeight: 500 }}>{user.displayName}</Text>
                <Text type="secondary" style={{ fontSize: 13 }}>
                  {user.email}
                </Text>
                <div style={{ marginTop: 4 }}>
                  <Pill tone="brand">{t(`role.${user.role}` as MessageKey)}</Pill>
                </div>
              </Flex>
            ),
          },
          { type: 'divider' },
          {
            key: 'signout',
            icon: <LogoutOutlined />,
            label: t('auth.user.signOut'),
            onClick: signOut,
          },
        ],
      }}
    >
      <Flex align="center" gap={8} style={{ cursor: 'pointer' }}>
        <Avatar size={28} style={{ background: colors.wood }}>
          {user.displayName.slice(0, 1).toUpperCase()}
        </Avatar>
        {!isMobile && <Text>{user.displayName}</Text>}
      </Flex>
    </Dropdown>
  );
}

function PageBody({ page, user, t }: { page: PageKey; user: StaffUser; t: Translate }) {
  if (!canOpen(user.role, page)) {
    return (
      <Flex align="center" justify="center" style={{ minHeight: 400 }}>
        <Empty description={t('nav.noAccess')} />
      </Flex>
    );
  }
  switch (page) {
    case 'followups':
      return <MyFollowupsPage />;
    case 'orders':
      return <OrdersPage />;
    case 'products':
      return <ProductsPage />;
    case 'inventory':
      return <InventoryPage />;
    default:
      return (
        <Flex align="center" justify="center" style={{ minHeight: 400 }}>
          <Empty description={t('nav.notBuilt', { name: t(navLabelKey(page)) })} />
        </Flex>
      );
  }
}

function Shell({
  user,
  page,
  onNavigate,
  dense,
  onDensity,
}: {
  user: StaffUser;
  page: PageKey;
  onNavigate: (key: PageKey) => void;
  dense: boolean;
  onDensity: (dense: boolean) => void;
}) {
  const isMobile = useIsMobile();
  const { locale, setLocale, t } = useLocale();
  const [navOpen, setNavOpen] = useState(false);

  const go = (key: PageKey) => {
    onNavigate(key);
    setNavOpen(false);
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header
        style={{
          paddingInline: 16,
          borderBottom: `1px solid ${colors.border}`,
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <Flex align="center" justify="space-between" style={{ height: '100%' }}>
          <Flex align="center" gap={12}>
            {isMobile && (
              <MenuOutlined
                onClick={() => setNavOpen(true)}
                style={{ fontSize: 18, color: colors.textSecondary }}
              />
            )}
            <Brand t={t} compact />
          </Flex>
          <Flex align="center" gap={16}>
            <Tooltip title={t('app.locale.label')}>
              <Segmented
                size="small"
                value={locale}
                onChange={(v) => setLocale(v as typeof locale)}
                options={LOCALES}
              />
            </Tooltip>
            {!isMobile && (
              <Tooltip title={t('app.density.hint')}>
                <Segmented
                  size="small"
                  value={dense ? 'dense' : 'comfy'}
                  onChange={(v) => onDensity(v === 'dense')}
                  options={[
                    { value: 'comfy', label: t('app.density.comfy') },
                    { value: 'dense', label: t('app.density.dense') },
                  ]}
                />
              </Tooltip>
            )}
            <UserMenu user={user} t={t} />
          </Flex>
        </Flex>
      </Header>

      <Layout>
        {!isMobile && (
          <Sider
            width={200}
            style={{
              borderInlineEnd: `1px solid ${colors.border}`,
              position: 'sticky',
              top: 56,
              height: 'calc(100vh - 56px)',
            }}
          >
            <Nav page={page} user={user} onSelect={go} t={t} />
          </Sider>
        )}

        <Drawer
          open={navOpen}
          placement="left"
          size={240}
          onClose={() => setNavOpen(false)}
          title={<Brand t={t} compact />}
          styles={{ body: { padding: 0 } }}
        >
          <Nav page={page} user={user} onSelect={go} t={t} />
        </Drawer>

        <Content style={{ padding: isMobile ? 12 : 24 }}>
          <PageBody page={page} user={user} t={t} />
        </Content>
      </Layout>
    </Layout>
  );
}

function Root() {
  const { locale, setLocale } = useLocale();
  const { status, user } = useAuth();
  const [page, setPage] = useState<PageKey>('followups');
  const [dense, setDense] = useState(false);

  // On a phone useMoriTheme forces comfortable regardless of this flag.
  const theme = useMoriTheme(dense);

  // Language is a per-user setting: apply the account's choice at sign-in.
  // Switching later in the header is a session-level override until the
  // profile setting exists.
  useEffect(() => {
    if (user) {
      setLocale(user.locale);
      setPage(landingPage(user.role) ?? 'followups');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const navigate = (key: PageKey) => {
    setPage(key);
    setDense(DENSE_BY_DEFAULT.includes(key));
  };

  // Data is never translated, but antd's own strings and dayjs formats follow
  // the user's locale.
  dayjs.locale(locale === 'zh-Hans' ? 'zh-cn' : 'zh-hk');

  let body: React.ReactNode;
  if (status === 'loading') {
    body = (
      <Flex align="center" justify="center" style={{ minHeight: '100vh' }}>
        <Spin size="large" />
      </Flex>
    );
  } else if (!user || user.mustChangePassword) {
    body = <AuthScreens />;
  } else {
    body = (
      <Shell
        user={user}
        page={page}
        onNavigate={navigate}
        dense={dense}
        onDensity={setDense}
      />
    );
  }

  return (
    <ConfigProvider theme={theme} locale={locale === 'zh-Hans' ? zhCN : zhHK}>
      <AntdApp>{body}</AntdApp>
    </ConfigProvider>
  );
}

export default function App() {
  return (
    <LocaleProvider>
      <AuthProvider>
        <Root />
      </AuthProvider>
    </LocaleProvider>
  );
}
