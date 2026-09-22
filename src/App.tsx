import { useState } from 'react';
import {
  App as AntdApp,
  Avatar,
  Badge,
  ConfigProvider,
  Drawer,
  Flex,
  Layout,
  Menu,
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

dayjs.locale('zh-hk');

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

const navItems = [
  { key: 'orders', icon: <FileTextOutlined />, label: '訂單' },
  { key: 'customers', icon: <TeamOutlined />, label: '客戶' },
  { key: 'products', icon: <AppstoreOutlined />, label: '產品' },
  { key: 'inventory', icon: <InboxOutlined />, label: '庫存' },
  { key: 'purchasing', icon: <ContainerOutlined />, label: '採購' },
  { key: 'delivery', icon: <CarOutlined />, label: '送貨' },
  { key: 'settings', icon: <SettingOutlined />, label: '設定' },
];

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

function Nav({ onSelect }: { onSelect?: () => void }) {
  return (
    <Menu
      mode="inline"
      selectedKeys={['orders']}
      items={navItems}
      onClick={onSelect}
      style={{ borderInlineEnd: 'none', padding: 8 }}
    />
  );
}

function Shell() {
  const isMobile = useIsMobile();
  const [navOpen, setNavOpen] = useState(false);

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
            <Nav />
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
          <Nav onSelect={() => setNavOpen(false)} />
        </Drawer>

        <Content style={{ padding: isMobile ? 12 : 24 }}>
          <OrdersPage />
        </Content>
      </Layout>
    </Layout>
  );
}

export default function App() {
  const theme = useMoriTheme(); // 訂單畫面用舒適模式；手機會自動再覆寫
  return (
    <ConfigProvider theme={theme} locale={zhHK}>
      <AntdApp>
        <Shell />
      </AntdApp>
    </ConfigProvider>
  );
}
