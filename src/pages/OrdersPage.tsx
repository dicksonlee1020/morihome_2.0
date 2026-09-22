import { useMemo, useState } from 'react';
import {
  App,
  Button,
  Card,
  Col,
  DatePicker,
  Dropdown,
  Empty,
  Flex,
  Input,
  Row,
  Segmented,
  Select,
  Space,
  Statistic,
  Table,
  Tooltip,
  Typography,
} from 'antd';
import type { TableColumnsType } from 'antd';
import {
  DownloadOutlined,
  EllipsisOutlined,
  MoreOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  TruckOutlined,
} from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import {
  CHANNEL_META,
  PAYMENT_META,
  STATUS_META,
  STATUS_ORDER,
  orders as seedOrders,
} from '../data/orders';
import { colors, useIsMobile } from '../theme';
import { orderQty, orderTotal } from '../types';
import type { Order, OrderStatus } from '../types';
import { Pill } from '../components/Pill';
import { OrderCards } from '../components/OrderCards';

const { Text, Title } = Typography;

/** 示範資料以呢日為基準，逾期判斷先至穩定。 */
const TODAY = dayjs('2026-09-22');

const nowrap = { whiteSpace: 'nowrap' } as const;

const money = (n: number) =>
  `HK$${n.toLocaleString('en-HK', { maximumFractionDigits: 0 })}`;

type StatusFilter = OrderStatus | 'all';

export function OrdersPage() {
  const { message } = App.useApp();
  const isMobile = useIsMobile();

  const [data] = useState<Order[]>(seedOrders);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [payment, setPayment] = useState<string>('all');
  const [keyword, setKeyword] = useState('');
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [selected, setSelected] = useState<React.Key[]>([]);

  const counts = useMemo(() => {
    const base: Record<string, number> = { all: data.length };
    STATUS_ORDER.forEach((s) => {
      base[s] = data.filter((o) => o.status === s).length;
    });
    return base;
  }, [data]);

  const rows = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return data.filter((o) => {
      if (status !== 'all' && o.status !== status) return false;
      if (payment !== 'all' && o.payment !== payment) return false;
      if (range) {
        const created = dayjs(o.createdAt);
        if (created.isBefore(range[0], 'day') || created.isAfter(range[1], 'day'))
          return false;
      }
      if (!kw) return true;
      return (
        o.id.toLowerCase().includes(kw) ||
        o.customer.name.toLowerCase().includes(kw) ||
        o.customer.phone.replace(/\s/g, '').includes(kw.replace(/\s/g, '')) ||
        o.items.some((i) => i.name.toLowerCase().includes(kw))
      );
    });
  }, [data, status, payment, keyword, range]);

  const stats = useMemo(() => {
    const live = data.filter((o) => o.status !== 'cancelled');
    return {
      today: data.filter((o) => dayjs(o.createdAt).isSame(TODAY.subtract(1, 'day'), 'day')).length,
      handling: data.filter((o) =>
        ['pending', 'confirmed', 'preparing'].includes(o.status)
      ).length,
      shipping: data.filter((o) => o.status === 'ready').length,
      revenue: live.reduce((sum, o) => sum + orderTotal(o), 0),
    };
  }, [data]);

  const filteredTotal = rows.reduce((sum, o) => sum + orderTotal(o), 0);

  const isOverdue = (o: Order) =>
    o.deliveryAt != null &&
    dayjs(o.deliveryAt).isBefore(TODAY, 'day') &&
    o.status !== 'delivered' &&
    o.status !== 'cancelled';

  const columns: TableColumnsType<Order> = [
    {
      title: '訂單編號',
      dataIndex: 'id',
      width: 118,
      fixed: 'left',
      render: (id: string) => (
        <Button type="link" style={{ padding: 0, fontWeight: 500 }}>
          {id}
        </Button>
      ),
    },
    {
      title: '客戶',
      dataIndex: ['customer', 'name'],
      width: 140,
      render: (_, o) => (
        <Flex vertical gap={2}>
          <Text style={{ fontWeight: 500 }}>{o.customer.name}</Text>
          <Text type="secondary" style={{ fontSize: 13 }}>
            {o.customer.phone}
          </Text>
        </Flex>
      ),
    },
    {
      title: '渠道',
      dataIndex: 'channel',
      width: 88,
      responsive: ['lg'],
      render: (c: Order['channel']) => <Pill>{CHANNEL_META[c].label}</Pill>,
    },
    {
      title: '落單日期',
      dataIndex: 'createdAt',
      width: 112,
      responsive: ['md'],
      sorter: (a, b) => dayjs(a.createdAt).valueOf() - dayjs(b.createdAt).valueOf(),
      render: (d: string) => <Text type="secondary">{dayjs(d).format('YYYY-MM-DD')}</Text>,
    },
    {
      title: '送貨日期',
      dataIndex: 'deliveryAt',
      width: 132,
      sorter: (a, b) =>
        dayjs(a.deliveryAt ?? '2099-12-31').valueOf() -
        dayjs(b.deliveryAt ?? '2099-12-31').valueOf(),
      render: (_, o) => {
        if (!o.deliveryAt) return <Text type="secondary">未約</Text>;
        const label = dayjs(o.deliveryAt).format('YYYY-MM-DD');
        if (!isOverdue(o)) return <Text style={nowrap}>{label}</Text>;
        return (
          <Tooltip title="已過送貨日仍未送出">
            <Flex vertical gap={2}>
              <Text style={{ ...nowrap, color: colors.error, fontWeight: 500 }}>{label}</Text>
              <Text style={{ ...nowrap, color: colors.error, fontSize: 13 }}>逾期未送</Text>
            </Flex>
          </Tooltip>
        );
      },
    },
    {
      title: '件數',
      key: 'qty',
      width: 64,
      align: 'right',
      responsive: ['lg'],
      render: (_, o) => <Text type="secondary">{orderQty(o)}</Text>,
    },
    {
      title: '金額',
      key: 'amount',
      width: 118,
      align: 'right',
      sorter: (a, b) => orderTotal(a) - orderTotal(b),
      render: (_, o) => <Text style={{ fontWeight: 500 }}>{money(orderTotal(o))}</Text>,
    },
    {
      title: '付款',
      dataIndex: 'payment',
      width: 98,
      render: (p: Order['payment']) => {
        const m = PAYMENT_META[p];
        return <Pill color={m.color} bg={m.bg}>{m.label}</Pill>;
      },
    },
    {
      title: '狀態',
      dataIndex: 'status',
      width: 98,
      render: (s: OrderStatus) => {
        const m = STATUS_META[s];
        return <Pill color={m.color} bg={m.bg} dot>{m.label}</Pill>;
      },
    },
    {
      title: '跟進',
      dataIndex: 'assignee',
      width: 78,
      // xl = 1200px，1440 闊會逼到最尾兩欄；留到 xxl(1600) 先出
      responsive: ['xxl'],
      render: (a: string) => <Text type="secondary">{a}</Text>,
    },
    {
      title: '',
      key: 'action',
      width: 52,
      fixed: 'right',
      align: 'center',
      render: (_, o) => (
        <Dropdown
          trigger={['click']}
          menu={{
            items: [
              { key: 'view', label: '查看訂單' },
              { key: 'print', label: '列印送貨單' },
              { key: 'whatsapp', label: 'WhatsApp 通知客戶' },
              { type: 'divider' },
              { key: 'cancel', label: '取消訂單', danger: true },
            ],
            onClick: ({ key }) => message.info(`${o.id}：${key}（示範畫面，未接後台）`),
          }}
        >
          <Button type="text" icon={<MoreOutlined />} />
        </Dropdown>
      ),
    },
  ];

  const segmentOptions = [
    { label: `全部 ${counts.all}`, value: 'all' },
    ...STATUS_ORDER.map((s) => ({
      label: `${STATUS_META[s].label} ${counts[s]}`,
      value: s,
    })),
  ];

  return (
    <Flex vertical gap={16}>
      <Flex align="center" justify="space-between" wrap gap={12}>
        <Flex vertical gap={2}>
          <Title level={1} style={{ margin: 0 }}>
            訂單
          </Title>
          <Text type="secondary">
            管理落單、備貨同送貨進度 · 資料截至 {TODAY.format('YYYY-MM-DD')}
          </Text>
        </Flex>
        <Space>
          <Button icon={<DownloadOutlined />}>匯出</Button>
          <Button type="primary" icon={<PlusOutlined />}>
            新增訂單
          </Button>
        </Space>
      </Flex>

      <Row gutter={[16, 16]}>
        {[
          { title: '昨日新訂單', value: stats.today, suffix: '張' },
          { title: '待處理', value: stats.handling, suffix: '張' },
          { title: '待送貨', value: stats.shipping, suffix: '張' },
          { title: '訂單總額（未計取消）', value: money(stats.revenue) },
        ].map((s) => (
          <Col key={s.title} xs={12} lg={6}>
            <Card size="small">
              <Statistic
                title={s.title}
                value={s.value}
                suffix={s.suffix}
                styles={{ content: { fontSize: 24, fontWeight: 600 } }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <Card
        styles={{ body: { paddingTop: 12 } }}
        title={
          isMobile ? (
            <Select
              value={status}
              onChange={(v) => setStatus(v as StatusFilter)}
              options={segmentOptions}
              style={{ width: '100%' }}
            />
          ) : (
            <Segmented
              value={status}
              onChange={(v) => setStatus(v as StatusFilter)}
              options={segmentOptions}
            />
          )
        }
        extra={
          !isMobile && (
            <Space>
              <Tooltip title="重新整理">
                <Button icon={<ReloadOutlined />} onClick={() => message.success('已更新')} />
              </Tooltip>
              <Button icon={<EllipsisOutlined />} />
            </Space>
          )
        }
      >
        <Flex gap={12} wrap style={{ marginBottom: 16 }}>
          <Input
            allowClear
            prefix={<SearchOutlined style={{ color: colors.textMuted }} />}
            placeholder="搵訂單編號、客戶、電話或貨品"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            style={{ width: isMobile ? '100%' : 300 }}
          />
          <Select
            value={payment}
            onChange={setPayment}
            style={{ width: isMobile ? '100%' : 150 }}
            options={[
              { value: 'all', label: '所有付款狀態' },
              ...Object.entries(PAYMENT_META).map(([v, m]) => ({
                value: v,
                label: m.label,
              })),
            ]}
          />
          <DatePicker.RangePicker
            value={range}
            onChange={(v) => setRange(v as [Dayjs, Dayjs] | null)}
            placeholder={['落單由', '落單至']}
            style={{ width: isMobile ? '100%' : 260 }}
          />
        </Flex>

        {selected.length > 0 && (
          <Flex
            align="center"
            justify="space-between"
            wrap
            gap={8}
            style={{
              marginBottom: 16,
              padding: '8px 12px',
              background: colors.primarySubtle,
              borderRadius: 6,
            }}
          >
            <Text>已揀 {selected.length} 張訂單</Text>
            <Space>
              <Button size="small" icon={<TruckOutlined />} onClick={() => message.success(`已為 ${selected.length} 張訂單安排送貨`)}>
                安排送貨
              </Button>
              <Button size="small" onClick={() => message.success('已匯出')}>
                匯出所揀
              </Button>
              <Button size="small" type="text" onClick={() => setSelected([])}>
                清除
              </Button>
            </Space>
          </Flex>
        )}

        {isMobile ? (
          <OrderCards orders={rows} money={money} isOverdue={isOverdue} />
        ) : (
          <Table<Order>
            rowKey="id"
            columns={columns}
            dataSource={rows}
            size="large"
            scroll={{ x: 1100 }}
            rowSelection={{
              selectedRowKeys: selected,
              onChange: setSelected,
              getCheckboxProps: (o) => ({ disabled: o.status === 'cancelled' }),
            }}
            expandable={{
              expandedRowRender: (o) => <OrderDetail order={o} />,
              rowExpandable: () => true,
            }}
            locale={{
              emptyText: <Empty description="冇符合條件嘅訂單" />,
            }}
            pagination={{
              pageSize: 10,
              showSizeChanger: true,
              showTotal: (t, r) => `第 ${r[0]}–${r[1]} 張，共 ${t} 張`,
            }}
            summary={() =>
              rows.length > 0 ? (
                <Table.Summary>
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} colSpan={columns.length + 2}>
                      <Flex align="center" justify="space-between" gap={12}>
                        <Text type="secondary">
                          目前篩選：{rows.length} 張訂單
                        </Text>
                        <Text style={{ fontWeight: 600 }}>
                          合計 {money(filteredTotal)}
                        </Text>
                      </Flex>
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                </Table.Summary>
              ) : null
            }
          />
        )}
      </Card>
    </Flex>
  );
}

function OrderDetail({ order }: { order: Order }) {
  return (
    <Flex vertical gap={12} style={{ padding: '4px 0' }}>
      {order.remark && (
        <Text style={{ color: colors.warningText }}>備註：{order.remark}</Text>
      )}
      <Table
        rowKey="sku"
        size="small"
        pagination={false}
        dataSource={order.items}
        columns={[
          { title: 'SKU', dataIndex: 'sku', width: 140 },
          { title: '貨品', dataIndex: 'name' },
          { title: '數量', dataIndex: 'qty', width: 80, align: 'right' },
          {
            title: '單價',
            dataIndex: 'price',
            width: 120,
            align: 'right',
            render: (p: number) => money(p),
          },
          {
            title: '小計',
            key: 'sub',
            width: 130,
            align: 'right',
            render: (_, i) => (
              <Text style={{ fontWeight: 500 }}>{money(i.qty * i.price)}</Text>
            ),
          },
        ]}
      />
    </Flex>
  );
}
