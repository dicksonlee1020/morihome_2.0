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
import { CalendarOutlined, DownloadOutlined, MoreOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { packagesOfOrder, productOf, useOps } from '../data/ops';
import type { Channel, PaymentState, SalesOrder } from '../data/ops';
import { ORDER_BUCKETS, orderBucket, daysInHk } from '../domain/derive';
import type { OrderBucket } from '../domain/derive';
import { ESCALATION_DAYS_DEFAULT } from '../domain/derive';
import { DEMO_TODAY, today } from '../domain/clock';
import { colors } from '../theme';
import { money } from '../utils/format';
import { fmtDate, cmpDate } from '../utils/date';
import { Pill } from '../components/Pill';
import { BUCKET_META } from '../data/buckets';
import { CardList } from '../components/CardList';
import { FilterChip } from '../components/FilterChip';
import { DataTableCard } from '../components/DataTableCard';
import { ItemName } from '../components/ItemName';
import { useTablePagination } from '../utils/useTablePagination';
import { useMockLoading } from '../utils/useMockLoading';
import { useT } from '../i18n';
import type { MessageKey } from '../i18n';
import { useAuth } from '../auth';
import { can, canSee } from '../config/permissions';
import type { Tone } from '../utils/tones';

const { Text, Title } = Typography;

/**
 * 訂單（查閱層，spec §6）。
 * CLAUDE.md DoD：「狀態」欄 = 推導 bucket，同「我的跟進」一套；冇任何人手狀態鏈。
 * UI 規範：日期／金額／數量可排序，預設落單日期降序；電話獨立一欄；
 * 「逾期未送」係行級 chip，唔入日期欄；首欄 fixed left、操作 fixed right。
 */
const PAYMENT_META: Record<PaymentState, { labelKey: MessageKey; tone: Tone }> = {
  unpaid: { labelKey: 'orders.paymentStatus.unpaid', tone: 'error' },
  deposit: { labelKey: 'orders.paymentStatus.deposit', tone: 'warning' },
  paid: { labelKey: 'orders.paymentStatus.paid', tone: 'success' },
};

const CHANNEL_KEY: Record<Channel, MessageKey> = {
  shopify: 'orders.channel.shopify',
  showroom: 'orders.channel.showroom',
  whatsapp: 'orders.channel.whatsapp',
  phone: 'orders.channel.phone',
};

type Alert = 'overdue' | 'escalated';

interface Row {
  order: SalesOrder;
  bucket: OrderBucket;
  qty: number;
  amount: number;
  alerts: Alert[];
}

export function OrdersPage() {
  const { message } = App.useApp();
  const t = useT();
  const { user } = useAuth();
  const ops = useOps();
  const role = user?.role ?? 'sales';
  const showPii = canSee(role, 'CUSTOMER_PII');
  const mayExecute = can(role, 'delivery', 'execute') || can(role, 'orders', 'execute');

  const [buckets, setBuckets] = useState<OrderBucket[]>([]);
  const [payments, setPayments] = useState<PaymentState[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [keyword, setKeyword] = useState('');
  const [selected, setSelected] = useState<React.Key[]>([]);

  /** 每張單嘅推導值只計一次 */
  const all = useMemo<Row[]>(
    () =>
      ops.orders.map((o) => {
        const units = packagesOfOrder(ops, o.orderNo);
        const bucket = orderBucket(units, o.delivery);
        const alerts: Alert[] = [];
        if (o.delivery.scheduledDate && !o.delivery.completedDate && o.delivery.scheduledDate < DEMO_TODAY && bucket !== 'completed') alerts.push('overdue');
        if (bucket === 'toSchedule' && (daysInHk(units) ?? 0) >= ESCALATION_DAYS_DEFAULT) alerts.push('escalated');
        return {
          order: o,
          bucket,
          qty: o.lines.reduce((n, l) => n + l.qty, 0),
          amount: o.lines.reduce((n, l) => n + l.qty * l.price, 0),
          alerts,
        };
      }),
    [ops]
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of all) c[r.bucket] = (c[r.bucket] ?? 0) + 1;
    return c;
  }, [all]);

  // §9.4 SCOPE_RULES driver.own_today：司機只見派畀本人 + 當日嘅單。
  // TODO(Q14)：車隊 / 司機派單未有資料，暫以「今日已約」代替「派畀本人」。
  const scoped = role === 'driver' ? all.filter((r) => r.order.delivery.scheduledDate === DEMO_TODAY && !r.order.delivery.completedDate) : all;

  const rows = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return scoped
      .filter((r) => {
        const o = r.order;
        if (buckets.length > 0 && !buckets.includes(r.bucket)) return false;
        if (payments.length > 0 && !payments.includes(o.payment)) return false;
        if (channels.length > 0 && !channels.includes(o.channel)) return false;
        if (range) {
          const d = dayjs(o.createdAt);
          if (d.isBefore(range[0], 'day') || d.isAfter(range[1], 'day')) return false;
        }
        if (!kw) return true;
        return (
          o.orderNo.toLowerCase().includes(kw) ||
          o.customer.alias.includes(kw) ||
          o.customer.district.includes(kw) ||
          (showPii && o.customer.phone.replace(/\s/g, '').includes(kw.replace(/\s/g, ''))) ||
          o.lines.some((l) => {
            const p = productOf(l.sku);
            return (p?.name.toLowerCase().includes(kw) ?? false) || (p?.supplierName.toLowerCase().includes(kw) ?? false);
          })
        );
      })
      .sort((a, b) => cmpDate(b.order.createdAt, a.order.createdAt) || b.order.orderNo.localeCompare(a.order.orderNo));
  }, [scoped, buckets, payments, channels, range, keyword, showPii]);

  const loading = useMockLoading();
  const pagination = useTablePagination(rows.length);

  const stats = useMemo(() => {
    const yesterday = today().subtract(1, 'day').format('YYYY-MM-DD');
    return {
      yesterdayNew: all.filter((r) => r.order.createdAt === yesterday).length,
      notProcured: counts.notProcured ?? 0,
      toSchedule: counts.toSchedule ?? 0,
      escalated: all.filter((r) => r.alerts.includes('escalated')).length,
    };
  }, [all, counts]);

  const filteredTotal = rows.reduce((n, r) => n + r.amount, 0);
  const filtered = buckets.length > 0 || payments.length > 0 || channels.length > 0 || range != null || keyword !== '';
  const clearFilters = () => {
    setBuckets([]);
    setPayments([]);
    setChannels([]);
    setRange(null);
    setKeyword('');
  };

  const alertChip = (a: Alert) =>
    a === 'overdue' ? (
      <Pill key={a} tone="error" dot>{t('orders.alert.overdue')}</Pill>
    ) : (
      <Pill key={a} tone="error" dot>{t('orders.alert.escalated', { days: ESCALATION_DAYS_DEFAULT })}</Pill>
    );

  const columns: TableColumnsType<Row> = [
    {
      title: t('orders.col.id'),
      key: 'orderNo',
      width: 110,
      fixed: 'left',
      sorter: (a, b) => a.order.orderNo.localeCompare(b.order.orderNo),
      render: (_, r) => <Text style={{ fontWeight: 500 }}>{r.order.orderNo}</Text>,
    },
    {
      title: t('orders.col.orderedAt'),
      key: 'createdAt',
      width: 112,
      sorter: (a, b) => cmpDate(a.order.createdAt, b.order.createdAt),
      defaultSortOrder: 'descend',
      render: (_, r) => <Text type="secondary">{fmtDate(r.order.createdAt)}</Text>,
    },
    {
      title: t('orders.col.customer'),
      key: 'customer',
      width: 110,
      render: (_, r) => <Text ellipsis={{ tooltip: r.order.customer.alias }}>{r.order.customer.alias}</Text>,
    },
    ...(showPii
      ? [
          {
            title: t('orders.col.phone'),
            key: 'phone',
            width: 110,
            render: (_: unknown, r: Row) => <Text type="secondary" style={{ fontVariantNumeric: 'tabular-nums' }}>{r.order.customer.phone}</Text>,
          } as TableColumnsType<Row>[number],
        ]
      : []),
    {
      title: t('orders.col.district'),
      key: 'district',
      width: 96,
      sorter: (a, b) => a.order.customer.district.localeCompare(b.order.customer.district),
      render: (_, r) => <Text>{r.order.customer.district}</Text>,
    },
    {
      title: t('orders.col.channel'),
      key: 'channel',
      width: 96,
      render: (_, r) => <Pill tone="muted">{t(CHANNEL_KEY[r.order.channel])}</Pill>,
    },
    {
      title: t('orders.col.items'),
      key: 'items',
      width: 220,
      render: (_, r) => {
        const first = productOf(r.order.lines[0].sku);
        const label = first ? first.name : r.order.lines[0].sku;
        const more = r.order.lines.length > 1 ? ` +${r.order.lines.length - 1}` : '';
        return (
          <Text ellipsis={{ tooltip: r.order.lines.map((l) => `${productOf(l.sku)?.name ?? l.sku} × ${l.qty}`).join('、') }}>
            {label}
            {more && <Text type="secondary">{more}</Text>}
          </Text>
        );
      },
    },
    {
      title: t('orders.col.qty'),
      key: 'qty',
      width: 72,
      align: 'right',
      sorter: (a, b) => a.qty - b.qty,
      render: (_, r) => <Text style={{ fontVariantNumeric: 'tabular-nums' }}>{r.qty}</Text>,
    },
    {
      title: t('orders.col.amount'),
      key: 'amount',
      width: 110,
      align: 'right',
      sorter: (a, b) => a.amount - b.amount,
      render: (_, r) => <Text style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{money(r.amount)}</Text>,
    },
    {
      title: t('orders.col.payment'),
      key: 'payment',
      width: 96,
      sorter: (a, b) => a.order.payment.localeCompare(b.order.payment),
      render: (_, r) => {
        const m = PAYMENT_META[r.order.payment];
        return <Pill tone={m.tone} dot>{t(m.labelKey)}</Pill>;
      },
    },
    {
      title: t('common.status'),
      key: 'bucket',
      width: 110,
      sorter: (a, b) => ORDER_BUCKETS.indexOf(a.bucket) - ORDER_BUCKETS.indexOf(b.bucket),
      render: (_, r) => {
        const m = BUCKET_META[r.bucket];
        return <Pill tone={m.tone} dot>{t(m.labelKey)}</Pill>;
      },
    },
    {
      title: t('orders.col.deliveryAt'),
      key: 'scheduledDate',
      width: 112,
      sorter: (a, b) => cmpDate(a.order.delivery.scheduledDate, b.order.delivery.scheduledDate),
      render: (_, r) =>
        r.order.delivery.scheduledDate ? (
          <Text>{fmtDate(r.order.delivery.completedDate ?? r.order.delivery.scheduledDate)}</Text>
        ) : (
          <Text type="secondary">{t('orders.notScheduled')}</Text>
        ),
    },
    {
      title: t('orders.col.alerts'),
      key: 'alerts',
      width: 140,
      render: (_, r) => (r.alerts.length ? <Flex gap={4} wrap>{r.alerts.map(alertChip)}</Flex> : <Text type="secondary">—</Text>),
    },
    {
      title: '',
      key: 'actions',
      width: 150,
      fixed: 'right',
      render: (_, r) => (
        <Flex gap={4} justify="flex-end">
          {mayExecute && r.bucket === 'toSchedule' && (
            <Button size="small" icon={<CalendarOutlined />} onClick={() => message.info(t('orders.scheduleDemo', { order: r.order.orderNo }))}>
              {t('orders.action.schedule')}
            </Button>
          )}
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                { key: 'detail', label: t('orders.action.detail') },
                { key: 'export', label: t('orders.action.exportOne') },
              ],
              onClick: () => message.info(t('common.notWired')),
            }}
          >
            <Button type="text" size="small" icon={<MoreOutlined />} aria-label={t('orders.action.more')} />
          </Dropdown>
        </Flex>
      ),
    },
  ];

  const bucketOptions = ORDER_BUCKETS.map((b) => ({
    value: b,
    label: (
      <Flex justify="space-between" gap={12} style={{ flexGrow: 1 }}>
        <Pill tone={BUCKET_META[b].tone} dot>{t(BUCKET_META[b].labelKey)}</Pill>
        <Text type="secondary">{counts[b] ?? 0}</Text>
      </Flex>
    ),
  }));
  const paymentOptions = (Object.keys(PAYMENT_META) as PaymentState[]).map((v) => ({
    value: v,
    label: <Pill tone={PAYMENT_META[v].tone} dot>{t(PAYMENT_META[v].labelKey)}</Pill>,
  }));
  const channelOptions = (Object.keys(CHANNEL_KEY) as Channel[]).map((v) => ({ value: v, label: t(CHANNEL_KEY[v]) }));

  const detail = (r: Row) => (
    <Flex vertical gap={8} style={{ padding: '4px 8px' }}>
      <Flex gap={24} wrap>
        <Text type="secondary">{t('orders.detail.created', { date: fmtDate(r.order.createdAt, 'detail') })}</Text>
        <Text type="secondary">{t('orders.detail.requested', { date: r.order.customerRequestedDate ? fmtDate(r.order.customerRequestedDate, 'detail') : '—' })}</Text>
        {r.order.customerRequestedNote && <Text type="secondary">{t('orders.detail.note', { note: r.order.customerRequestedNote })}</Text>}
        <Text type="secondary">{t('orders.detail.assignee', { name: r.order.assignee })}</Text>
      </Flex>
      {r.order.lines.map((l) => {
        const p = productOf(l.sku);
        return (
          <Flex key={l.id} align="center" justify="space-between" gap={12}>
            {p ? <ItemName product={p} thumb /> : <Text>{l.sku}</Text>}
            <Text style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
              × {l.qty} · {money(l.qty * l.price)}
            </Text>
          </Flex>
        );
      })}
    </Flex>
  );

  return (
    <Flex vertical gap={12}>
      <Flex align="center" justify="space-between" wrap gap={12}>
        <Flex vertical gap={2}>
          <Title level={1} style={{ margin: 0 }}>{t('orders.title')}</Title>
          <Text type="secondary">{t('orders.subtitle', { date: fmtDate(DEMO_TODAY, 'detail') })}</Text>
        </Flex>
        <Space>
          {can(role, 'orders', 'export') && (
            <Button icon={<DownloadOutlined />} onClick={() => message.success(t('common.exported'))}>{t('common.export')}</Button>
          )}
          {/* TODO(Q16)：訂單入口未定（全部經 Shopify 定 ERP 自己收單）。掣先留，功能等 Ocean 答。 */}
          {can(role, 'orders', 'edit') && (
            <Tooltip title={t('orders.newHint')}>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => message.info(t('orders.newHint'))}>{t('orders.new')}</Button>
            </Tooltip>
          )}
        </Space>
      </Flex>

      <Row gutter={[12, 12]}>
        {[
          { title: t('orders.stat.yesterdayNew'), value: stats.yesterdayNew },
          { title: t('orders.bucket.notProcured'), value: stats.notProcured, color: colors.warningText },
          { title: t('orders.bucket.toSchedule'), value: stats.toSchedule, color: colors.warningText },
          { title: t('orders.stat.escalated', { days: ESCALATION_DAYS_DEFAULT }), value: stats.escalated, color: colors.error },
        ].map((s) => (
          <Col key={s.title} xs={12} lg={6}>
            <Card size="small">
              <Statistic title={s.title} value={s.value} styles={{ content: { fontSize: 22, fontWeight: 600, color: s.value > 0 ? s.color : undefined } }} />
            </Card>
          </Col>
        ))}
      </Row>

      <DataTableCard
        filters={
          <>
            <FilterChip label={t('orders.filter.status')} options={bucketOptions} value={buckets} onChange={setBuckets} />
            <FilterChip label={t('orders.filter.payment')} options={paymentOptions} value={payments} onChange={setPayments} />
            <FilterChip label={t('orders.col.channel')} options={channelOptions} value={channels} onChange={setChannels} />
            <DatePicker.RangePicker
              value={range}
              onChange={(v) => setRange(v as [Dayjs, Dayjs] | null)}
              placeholder={[t('orders.dateFrom'), t('orders.dateTo')]}
              style={{ width: 240 }}
            />
          </>
        }
        onClearFilters={filtered ? clearFilters : undefined}
        search={{ value: keyword, onChange: setKeyword, placeholder: t('orders.search'), width: 280 }}
        count={`${t('orders.summary.count', { n: rows.length })} · ${t('orders.summary.total', { amount: money(filteredTotal) })}`}
        selection={{
          count: selected.length,
          text: t('orders.selected', { n: selected.length }),
          actions: (
            <>
              {mayExecute && (
                <Button size="small" icon={<CalendarOutlined />} onClick={() => message.success(t('orders.bulk.scheduled', { n: selected.length }))}>
                  {t('orders.bulk.schedule')}
                </Button>
              )}
              <Button size="small" onClick={() => message.success(t('common.exported'))}>{t('orders.bulk.export')}</Button>
            </>
          ),
          onClear: () => setSelected([]),
        }}
        mobile={
          <CardList
            items={rows}
            rowKey={(r) => r.order.id}
            emptyText={t('orders.empty')}
            renderItem={(r) => {
              const m = BUCKET_META[r.bucket];
              return (
                <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
                  <Flex vertical gap={8}>
                    <Flex justify="space-between" align="center" gap={8}>
                      <Text style={{ fontWeight: 600 }}>{r.order.orderNo} · {r.order.customer.alias} · {r.order.customer.district}</Text>
                      <Pill tone={m.tone} dot>{t(m.labelKey)}</Pill>
                    </Flex>
                    <Text type="secondary">
                      {fmtDate(r.order.createdAt)} · {t(CHANNEL_KEY[r.order.channel])} · {r.qty} {t('orders.unitItems')} · {money(r.amount)}
                    </Text>
                    {r.alerts.length > 0 && <Flex gap={4} wrap>{r.alerts.map(alertChip)}</Flex>}
                    {mayExecute && r.bucket === 'toSchedule' && (
                      <Button icon={<CalendarOutlined />} onClick={() => message.info(t('orders.scheduleDemo', { order: r.order.orderNo }))}>
                        {t('orders.action.schedule')}
                      </Button>
                    )}
                  </Flex>
                </Card>
              );
            }}
          />
        }
      >
        <Table<Row>
          loading={loading}
          rowKey={(r) => r.order.id}
          columns={columns}
          dataSource={rows}
          scroll={{ x: 1500 }}
          pagination={pagination}
          rowSelection={{ selectedRowKeys: selected, onChange: setSelected, columnWidth: 48 }}
          expandable={{ expandedRowRender: detail }}
          locale={{ emptyText: <Empty description={t('orders.empty')} /> }}
        />
      </DataTableCard>
    </Flex>
  );
}
