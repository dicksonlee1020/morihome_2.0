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
  Row,
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
import type { Order, OrderStatus, PaymentStatus } from '../types';
import { Pill } from '../components/Pill';
import { FilterChip } from '../components/FilterChip';
import { DataTableCard } from '../components/DataTableCard';
import { useTablePagination } from '../utils/useTablePagination';
import { useT } from '../i18n';
import { OrderCards } from '../components/OrderCards';

const { Text, Title } = Typography;

/** 示範資料以呢日為基準，逾期判斷先至穩定。 */
const TODAY = dayjs('2026-09-22');

const nowrap = { whiteSpace: 'nowrap' } as const;

const money = (n: number) =>
  `HK$${n.toLocaleString('en-HK', { maximumFractionDigits: 0 })}`;


export function OrdersPage() {
  const { message } = App.useApp();
  const isMobile = useIsMobile();
  const t = useT();

  const [data] = useState<Order[]>(seedOrders);
  const [statuses, setStatuses] = useState<OrderStatus[]>([]);
  const [payments, setPayments] = useState<PaymentStatus[]>([]);
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
      if (statuses.length > 0 && !statuses.includes(o.status)) return false;
      if (payments.length > 0 && !payments.includes(o.payment)) return false;
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
  }, [data, statuses, payments, keyword, range]);

  const pagination = useTablePagination(rows.length);

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
      title: t('orders.col.id'),
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
      title: t('orders.col.customer'),
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
      title: t('orders.col.channel'),
      dataIndex: 'channel',
      width: 88,
      responsive: ['lg'],
      render: (c: Order['channel']) => <Pill>{t(CHANNEL_META[c].labelKey)}</Pill>,
    },
    {
      title: t('orders.col.orderedAt'),
      dataIndex: 'createdAt',
      width: 112,
      responsive: ['md'],
      sorter: (a, b) => dayjs(a.createdAt).valueOf() - dayjs(b.createdAt).valueOf(),
      render: (d: string) => <Text type="secondary">{dayjs(d).format('YYYY-MM-DD')}</Text>,
    },
    {
      title: t('orders.col.deliveryAt'),
      dataIndex: 'deliveryAt',
      width: 132,
      sorter: (a, b) =>
        dayjs(a.deliveryAt ?? '2099-12-31').valueOf() -
        dayjs(b.deliveryAt ?? '2099-12-31').valueOf(),
      render: (_, o) => {
        if (!o.deliveryAt) return <Text type="secondary">{t('orders.notScheduled')}</Text>;
        const label = dayjs(o.deliveryAt).format('YYYY-MM-DD');
        if (!isOverdue(o)) return <Text style={nowrap}>{label}</Text>;
        return (
          <Tooltip title={t('orders.overdueHint')}>
            <Flex vertical gap={2}>
              <Text style={{ ...nowrap, color: colors.error, fontWeight: 500 }}>{label}</Text>
              <Text style={{ ...nowrap, color: colors.error, fontSize: 13 }}>{t('orders.overdue')}</Text>
            </Flex>
          </Tooltip>
        );
      },
    },
    {
      title: t('orders.col.qty'),
      key: 'qty',
      width: 64,
      align: 'right',
      responsive: ['lg'],
      render: (_, o) => <Text type="secondary">{orderQty(o)}</Text>,
    },
    {
      title: t('orders.col.amount'),
      key: 'amount',
      width: 118,
      align: 'right',
      sorter: (a, b) => orderTotal(a) - orderTotal(b),
      render: (_, o) => <Text style={{ fontWeight: 500 }}>{money(orderTotal(o))}</Text>,
    },
    {
      title: t('orders.col.payment'),
      dataIndex: 'payment',
      width: 98,
      render: (p: Order['payment']) => {
        const m = PAYMENT_META[p];
        return <Pill color={m.color} bg={m.bg}>{t(m.labelKey)}</Pill>;
      },
    },
    {
      title: t('orders.col.status'),
      dataIndex: 'status',
      width: 98,
      render: (s: OrderStatus) => {
        const m = STATUS_META[s];
        return <Pill color={m.color} bg={m.bg} dot>{t(m.labelKey)}</Pill>;
      },
    },
    {
      title: t('orders.col.assignee'),
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
              { key: 'view', label: t('orders.action.view') },
              { key: 'print', label: t('orders.action.print') },
              { key: 'whatsapp', label: t('orders.action.whatsapp') },
              { type: 'divider' },
              { key: 'cancel', label: t('orders.action.cancel'), danger: true },
            ],
            onClick: ({ key }) => message.info(t('orders.actionDemo', { id: o.id, action: key, note: t('common.notWired') })),
          }}
        >
          <Button type="text" icon={<MoreOutlined />} />
        </Dropdown>
      ),
    },
  ];

  const statusOptions = STATUS_ORDER.map((v) => ({
    value: v,
    label: (
      <Flex justify="space-between" gap={12} style={{ flexGrow: 1 }}>
        <Pill color={STATUS_META[v].color} bg={STATUS_META[v].bg} dot>{t(STATUS_META[v].labelKey)}</Pill>
        <Text type="secondary">{counts[v]}</Text>
      </Flex>
    ),
  }));
  const paymentOptions = (Object.keys(PAYMENT_META) as PaymentStatus[]).map((v) => ({
    value: v,
    label: <Pill color={PAYMENT_META[v].color} bg={PAYMENT_META[v].bg} dot>{t(PAYMENT_META[v].labelKey)}</Pill>,
  }));
  const filtered = statuses.length > 0 || payments.length > 0 || range != null || keyword !== '';
  const clearFilters = () => {
    setStatuses([]);
    setPayments([]);
    setRange(null);
    setKeyword('');
  };

  return (
    <Flex vertical gap={16}>
      <Flex align="center" justify="space-between" wrap gap={12}>
        <Flex vertical gap={2}>
          <Title level={1} style={{ margin: 0 }}>
            {t('orders.title')}
          </Title>
          <Text type="secondary">
            {t('orders.subtitle', { date: TODAY.format('YYYY-MM-DD') })}
          </Text>
        </Flex>
        <Space>
          <Button icon={<DownloadOutlined />}>{t('common.export')}</Button>
          <Button type="primary" icon={<PlusOutlined />}>
            {t('orders.new')}
          </Button>
        </Space>
      </Flex>

      <Row gutter={[16, 16]}>
        {[
          { title: t('orders.stat.yesterdayNew'), value: stats.today, suffix: t('orders.unit') },
          { title: t('orders.stat.handling'), value: stats.handling, suffix: t('orders.unit') },
          { title: t('orders.stat.shipping'), value: stats.shipping, suffix: t('orders.unit') },
          { title: t('orders.stat.revenue'), value: money(stats.revenue) },
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

      <DataTableCard
        filters={
          <>
            <FilterChip label={t('orders.filter.status')} options={statusOptions} value={statuses} onChange={setStatuses} />
            <FilterChip label={t('orders.filter.payment')} options={paymentOptions} value={payments} onChange={setPayments} />
            <DatePicker.RangePicker
              value={range}
              onChange={(v) => setRange(v as [Dayjs, Dayjs] | null)}
              placeholder={[t('orders.dateFrom'), t('orders.dateTo')]}
              style={{ width: isMobile ? '100%' : 260 }}
            />
          </>
        }
        onClearFilters={filtered ? clearFilters : undefined}
        search={{ value: keyword, onChange: setKeyword, placeholder: t('orders.search'), width: 280 }}
        extra={
          <Space>
            <Tooltip title={t('common.refresh')}>
              <Button icon={<ReloadOutlined />} onClick={() => message.success(t('common.refreshed'))} />
            </Tooltip>
            <Button icon={<EllipsisOutlined />} />
          </Space>
        }
        count={`${t('orders.summary.count', { n: rows.length })} · ${t('orders.summary.total', { amount: money(filteredTotal) })}`}
        selection={{
          count: selected.length,
          text: t('orders.selected', { n: selected.length }),
          actions: (
            <>
              <Button size="small" icon={<TruckOutlined />} onClick={() => message.success(t('orders.bulk.scheduled', { n: selected.length }))}>
                {t('orders.bulk.schedule')}
              </Button>
              <Button size="small" onClick={() => message.success(t('common.exported'))}>
                {t('orders.bulk.export')}
              </Button>
            </>
          ),
          onClear: () => setSelected([]),
        }}
        mobile={<OrderCards orders={rows} money={money} isOverdue={isOverdue} />}
      >
        <Table<Order>
          rowKey="id"
          columns={columns}
          dataSource={rows}
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
            emptyText: <Empty description={t('orders.empty')} />,
          }}
          pagination={pagination}
        />
      </DataTableCard>
    </Flex>
  );
}

function OrderDetail({ order }: { order: Order }) {
  const t = useT();
  return (
    <Flex vertical gap={12} style={{ padding: '4px 0' }}>
      {order.remark && (
        <Text style={{ color: colors.warningText }}>{t('orders.remark', { text: order.remark })}</Text>
      )}
      <Table
        rowKey="sku"
        size="small"
        pagination={false}
        dataSource={order.items}
        columns={[
          { title: 'SKU', dataIndex: 'sku', width: 140 },
          { title: t('orders.item.name'), dataIndex: 'name' },
          { title: t('orders.item.qty'), dataIndex: 'qty', width: 80, align: 'right' },
          {
            title: t('orders.item.price'),
            dataIndex: 'price',
            width: 120,
            align: 'right',
            render: (p: number) => money(p),
          },
          {
            title: t('orders.item.subtotal'),
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
