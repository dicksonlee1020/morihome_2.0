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
import 'dayjs/locale/zh-hk';
import dayjs from 'dayjs';
import {
  AppstoreOutlined,
  BellOutlined,
  CarOutlined,
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

dayjs.locale('zh-hk');

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

type PageKey =
  | 'orders'
  | 'customers'
  | 'products'
  | 'inventory'
  | 'purchasing'
  | 'delivery'
  | 'settings';

const navItems: { key: PageKey; icon: React.ReactNode; label: string }[] = [
  { key: 'orders', icon: <FileTextOutlined />, label: '訂單' },
  { key: 'customers', icon: <TeamOutlined />, label: '客戶' },
  { key: 'products', icon: <AppstoreOutlined />, label: '產品' },
  { key: 'inventory', icon: <InboxOutlined />, label: '庫存' },
  { key: 'purchasing', icon: <ContainerOutlined />, label: '採購' },
  { key: 'delivery', icon: <CarOutlined />, label: '送貨' },
  { key: 'settings', icon: <SettingOutlined />, label: '設定' },
];

/**
 * 邊幾個畫面預設密集 —— 跟 theme.ts 嘅講法：
 * 產品（5,241 SKU）、庫存、上架 backlog 用密集，其餘舒適。
 */
const DENSE_BY_DEFAULT: PageKey[] = ['products', 'inventory'];

function Brand() {
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
          ERP
        </Text>
      </Flex>
    </Flex>
  );
}

function Nav({
  page,
  onSelect,
}: {
  page: PageKey;
  onSelect: (key: PageKey) => void;
}) {
  return (
    <Menu
      mode="inline"
      selectedKeys={[page]}
      items={navItems}
      onClick={({ key }) => onSelect(key as PageKey)}
      style={{ borderInlineEnd: 'none', padding: 8 }}
    />
  );
}

function PageBody({ page }: { page: PageKey }) {
  switch (page) {
    case 'orders':
      return <OrdersPage />;
    case 'products':
      return <ProductsPage />;
    case 'inventory':
      return <InventoryPage />;
    default: {
      const label = navItems.find((n) => n.key === page)?.label ?? page;
      return (
        <Flex align="center" justify="center" style={{ minHeight: 400 }}>
          <Empty description={`${label}畫面未砌`} />
        </Flex>
      );
    }
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
            <Brand />
          </Flex>
          <Flex align="center" gap={16}>
            {/* 手機一律舒適模式，擺個揀唔到嘅掣淨係阻住 */}
            {!isMobile && (
              <Tooltip title="密集模式：同一套顏色組件，收窄間距同字級">
                <Segmented
                  size="small"
                  value={dense ? 'dense' : 'comfy'}
                  onChange={(v) => onDensity(v === 'dense')}
                  options={[
                    { value: 'comfy', label: '舒適' },
                    { value: 'dense', label: '密集' },
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
            <Nav page={page} onSelect={go} />
          </Sider>
        )}

        <Drawer
          open={navOpen}
          placement="left"
          size={240}
          onClose={() => setNavOpen(false)}
          title={<Brand />}
          styles={{ body: { padding: 0 } }}
        >
          <Nav page={page} onSelect={go} />
        </Drawer>

        <Content style={{ padding: isMobile ? 12 : 24 }}>
          <PageBody page={page} />
        </Content>
      </Layout>
    </Layout>
  );
}

export default function App() {
  const [page, setPage] = useState<PageKey>('orders');
  const [dense, setDense] = useState(false);

  // 手機會喺 useMoriTheme 入面被覆寫返舒適，呢度唔使理
  const theme = useMoriTheme(dense);

  const navigate = (key: PageKey) => {
    setPage(key);
    setDense(DENSE_BY_DEFAULT.includes(key));
  };

  return (
    <ConfigProvider theme={theme} locale={zhHK}>
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
