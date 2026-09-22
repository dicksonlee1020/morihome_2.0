import { useState } from 'react';
import {
  App as AntdApp,
  Avatar,
  Badge,
  ConfigProvider,
  Drawer,
  Empty,
  Flex,
  Layout,
  Menu,
  Segmented,
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
  BellOutlined,
  CarOutlined,
  CheckSquareOutlined,
  ContainerOutlined,
  FileTextOutlined,
  InboxOutlined,
  MenuOutlined,
  SettingOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { colors, useIsMobile, useMoriTheme } from './theme';
import { OrdersPage } from './pages/OrdersPage';
import { ProductsPage } from './pages/ProductsPage';
import { InventoryPage } from './pages/InventoryPage';
import { MyFollowupsPage } from './pages/MyFollowupsPage';
import { LOCALES, LocaleProvider, useLocale } from './i18n';
import type { MessageKey, Translate } from './i18n';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

type PageKey =
  | 'followups'
  | 'orders'
  | 'customers'
  | 'products'
  | 'inventory'
  | 'purchasing'
  | 'delivery'
  | 'settings';

/**
 * Spec §6: the main entry is a task screen, not a module menu, so the
 * follow-up list sits first and is what the app opens on.
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
 * 邊幾個畫面預設密集 —— 跟 theme.ts 嘅講法：
 * 產品（5,241 SKU）、庫存、上架 backlog 用密集，其餘舒適。
 */
const DENSE_BY_DEFAULT: PageKey[] = ['products', 'inventory'];

function Brand({ t }: { t: Translate }) {
  return (
    <Flex align="center" gap={10}>
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 6,
          background: colors.primary,
          color: '#fff',
          display: 'grid',
          placeItems: 'center',
          fontWeight: 700,
          fontSize: 14,
        }}
      >
        m
      </div>
      <Flex vertical gap={0} style={{ lineHeight: 1.2 }}>
        <Text style={{ fontWeight: 600 }}>mori home</Text>
        <Text type="secondary" style={{ fontSize: 13 }}>
          {t('app.brandSub')}
        </Text>
      </Flex>
    </Flex>
  );
}

function Nav({
  page,
  onSelect,
  t,
}: {
  page: PageKey;
  onSelect: (key: PageKey) => void;
  t: Translate;
}) {
  return (
    <Menu
      mode="inline"
      selectedKeys={[page]}
      items={navItems.map((item) => ({ ...item, label: t(navLabelKey(item.key)) }))}
      onClick={({ key }) => onSelect(key as PageKey)}
      style={{ borderInlineEnd: 'none', padding: 8 }}
    />
  );
}

function PageBody({ page, t }: { page: PageKey; t: Translate }) {
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
          <Empty
            description={t('nav.notBuilt', { name: t(navLabelKey(page)) })}
          />
        </Flex>
      );
  }
}

function Shell({
  page,
  onNavigate,
  dense,
  onDensity,
}: {
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
            <Brand t={t} />
          </Flex>
          <Flex align="center" gap={16}>
            {/* 手機一律舒適模式，擺個揀唔到嘅掣淨係阻住 */}
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
            <Badge count={3} size="small">
              <BellOutlined style={{ fontSize: 18, color: colors.textSecondary }} />
            </Badge>
            <Flex align="center" gap={8}>
              <Avatar size={28} style={{ background: colors.wood }}>
                O
              </Avatar>
              {!isMobile && <Text>Ocean</Text>}
            </Flex>
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
            <Nav page={page} onSelect={go} t={t} />
          </Sider>
        )}

        <Drawer
          open={navOpen}
          placement="left"
          size={240}
          onClose={() => setNavOpen(false)}
          title={<Brand t={t} />}
          styles={{ body: { padding: 0 } }}
        >
          <Nav page={page} onSelect={go} t={t} />
        </Drawer>

        <Content style={{ padding: isMobile ? 12 : 24 }}>
          <PageBody page={page} t={t} />
        </Content>
      </Layout>
    </Layout>
  );
}

function Root() {
  const { locale } = useLocale();
  const [page, setPage] = useState<PageKey>('followups');
  const [dense, setDense] = useState(false);

  // On a phone useMoriTheme forces comfortable regardless of this flag.
  const theme = useMoriTheme(dense);

  const navigate = (key: PageKey) => {
    setPage(key);
    setDense(DENSE_BY_DEFAULT.includes(key));
  };

  // Data is never translated, but antd's own strings and dayjs formats follow
  // the user's locale.
  dayjs.locale(locale === 'zh-Hans' ? 'zh-cn' : 'zh-hk');

  return (
    <ConfigProvider theme={theme} locale={locale === 'zh-Hans' ? zhCN : zhHK}>
      <AntdApp>
        <Shell
          page={page}
          onNavigate={navigate}
          dense={dense}
          onDensity={setDense}
        />
      </AntdApp>
    </ConfigProvider>
  );
}

export default function App() {
  return (
    <LocaleProvider>
      <Root />
    </LocaleProvider>
  );
}
