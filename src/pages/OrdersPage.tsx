import {
  CalendarOutlined,
  DownloadOutlined,
  MoreOutlined,
  PlusOutlined,
} from '@ant-design/icons';
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
import dayjs from 'dayjs';
import * as React from 'react';
import { useAuth as MoriUseAuth } from '../auth/hooks';
import { CardList } from '../components/CardList';
import { DataTableCard } from '../components/DataTableCard';
import { FilterChip } from '../components/FilterChip';
import { Pill } from '../components/Pill';
import { can, canSee } from '../config/permissions';
import { BUCKET_META } from '../data/buckets';
import type { Channel, PaymentState, SalesOrder } from '../data/ops';
import { packagesOfOrder, productOf, useOps } from '../data/ops';
import { DEMO_TODAY, today } from '../domain/clock';
import type { OrderBucket } from '../domain/derive';
import { daysInHk, ORDER_BUCKETS, orderBucket } from '../domain/derive';
import type { MessageKey } from '../i18n';
import { useT as MoriUseT } from '../i18n/hooks';
import { usePeek, useRegisterPeekList } from '../peek/hooks';
import { colors } from '../theme';
import { cmpDate, fmtDate } from '../utils/date';
import { money, moriPhoneFormat } from '../utils/format';
import type { Tone } from '../utils/tones';
import { useMockLoading } from '../utils/useMockLoading';
import { useTablePagination } from '../utils/useTablePagination';
const { Text, Title } = Typography;

/**
 * 訂單（查閱層，spec §6）。
 * CLAUDE.md DoD：「狀態」欄 = 推導 bucket，同「我的跟進」一套；冇任何人手狀態鏈。
 * UI 規範：日期／金額／數量可排序，預設落單日期降序；電話獨立一欄；
 * 「逾期未送」係行級 chip，唔入日期欄；首欄 fixed left、操作 fixed right。
 */
const PAYMENT_META: Record<
  PaymentState,
  {
    labelKey: MessageKey;
    tone: Tone;
  }
> = {
  unpaid: {
    labelKey: 'orders.paymentStatus.unpaid',
    tone: 'error',
  },
  deposit: {
    labelKey: 'orders.paymentStatus.deposit',
    tone: 'warning',
  },
  paid: {
    labelKey: 'orders.paymentStatus.paid',
    tone: 'success',
  },
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
  var e;
  let { message } = App.useApp();
  let n = MoriUseT();
  let { user } = MoriUseAuth();
  let ops = useOps();
  let role = (user == null ? undefined : user.role) ?? `sales`;
  let showPii = canSee(role, `CUSTOMER_PII`);
  let mayExecute =
    can(role, `delivery`, `execute`) || can(role, `orders`, `execute`);
  let [buckets, setBuckets] = React.useState<any>([]);
  let [payments, setPayments] = React.useState<any>([]);
  let [channels, setChannels] = React.useState<any>([]);
  let [range, setRange] = React.useState<any>(null);
  let [keyword, setKeyword] = React.useState<any>(``);
  let [selected, setSelected] = React.useState<any>([]);
  let all = React.useMemo(
    () =>
      ops.orders.map((e: any) => {
        let t = packagesOfOrder(ops, e.orderNo);
        let n = orderBucket(t, e.delivery);
        let r: any[] = [];
        if (
          e.delivery.scheduledDate &&
          !e.delivery.completedDate &&
          e.delivery.scheduledDate < `2026-09-22` &&
          n !== `completed`
        ) {
          r.push(`overdue`);
        }
        if (n === `toSchedule` && (daysInHk(t) ?? 0) >= 14) {
          r.push(`escalated`);
        }
        return {
          order: e,
          bucket: n,
          qty: e.lines.reduce((e: any, t: any) => e + t.qty, 0),
          amount: e.lines.reduce((e: any, t: any) => e + t.qty * t.price, 0),
          alerts: r,
        };
      }),
    [ops],
  );
  let counts = React.useMemo(() => {
    let e: any = {};
    for (let t of all) e[t.bucket] = (e[t.bucket] ?? 0) + 1;
    return e;
  }, [all]);
  let scoped =
    role === `driver`
      ? all.filter(
          (e: any) =>
            e.order.delivery.scheduledDate === `2026-09-22` &&
            !e.order.delivery.completedDate,
        )
      : all;
  let rows = React.useMemo(() => {
    let e = keyword.trim().toLowerCase();
    return scoped
      .filter((t: any) => {
        let n = t.order;
        if (
          (buckets.length > 0 && !buckets.includes(t.bucket)) ||
          (payments.length > 0 && !payments.includes(n.payment)) ||
          (channels.length > 0 && !channels.includes(n.channel))
        )
          return false;
        if (range) {
          let e = dayjs(n.createdAt);
          if (e.isBefore(range[0], `day`) || e.isAfter(range[1], `day`))
            return false;
        }
        return (
          !e ||
          n.orderNo.toLowerCase().includes(e) ||
          n.customer.alias.includes(e) ||
          n.customer.district.includes(e) ||
          (showPii &&
            n.customer.phone
              .replace(/\s/g, ``)
              .includes(e.replace(/\s/g, ``))) ||
          n.lines.some((t: any) => {
            let n = productOf(t.sku);
            return (
              t.sku.toLowerCase().includes(e) ||
              ((n == null ? undefined : n.name.toLowerCase().includes(e)) ??
                false) ||
              ((n == null
                ? undefined
                : n.supplierName.toLowerCase().includes(e)) ??
                false)
            );
          })
        );
      })
      .sort(
        (e: any, t: any) =>
          cmpDate(t.order.createdAt, e.order.createdAt) ||
          t.order.orderNo.localeCompare(e.order.orderNo),
      );
  }, [scoped, buckets, payments, channels, range, keyword, showPii]);
  let loading = useMockLoading();
  let pagination = useTablePagination(rows.length);
  let peek = usePeek();
  useRegisterPeekList(
    `order`,
    rows.map((e: any) => e.order.orderNo),
  );
  let activeId =
    ((e = peek.target) == null ? undefined : e.model) === `order`
      ? peek.target!.id
      : null;
  let stats = React.useMemo(() => {
    let e = today().subtract(1, `day`).format(`YYYY-MM-DD`);
    return {
      yesterdayNew: all.filter((t: any) => t.order.createdAt === e).length,
      notProcured: counts.notProcured ?? 0,
      toSchedule: counts.toSchedule ?? 0,
      escalated: all.filter((e: any) => e.alerts.includes(`escalated`)).length,
    };
  }, [all, counts]);
  let filteredTotal = rows.reduce((e: any, t: any) => e + t.amount, 0);
  let filtered =
    buckets.length > 0 ||
    payments.length > 0 ||
    channels.length > 0 ||
    range != null ||
    keyword !== ``;
  let clearFilters = () => {
    setBuckets([]);
    setPayments([]);
    setChannels([]);
    setRange(null);
    setKeyword(``);
  };
  let alertChip = (e: any) =>
    e === `overdue` ? (
      <Pill tone={`error`} dot={true} key={e}>
        {n(`orders.alert.overdue`)}
      </Pill>
    ) : (
      <Pill tone={`error`} dot={true} key={e}>
        {n(`orders.alert.escalated`, {
          days: 14,
        })}
      </Pill>
    );
  let columns: any[] = [
    {
      title: n(`orders.col.id`),
      key: `orderNo`,
      width: 110,
      fixed: `left`,
      sorter: (e: any, t: any) =>
        e.order.orderNo.localeCompare(t.order.orderNo),
      render: (_e: any, t: any) => (
        <Text
          style={{
            fontWeight: 500,
          }}
        >
          {t.order.orderNo}
        </Text>
      ),
    },
    {
      title: n(`orders.col.orderedAt`),
      key: `createdAt`,
      width: 112,
      sorter: (e: any, t: any) => cmpDate(e.order.createdAt, t.order.createdAt),
      defaultSortOrder: `descend`,
      render: (_e: any, t: any) => (
        <Text type={`secondary`}>{fmtDate(t.order.createdAt)}</Text>
      ),
    },
    {
      title: n(`orders.col.customer`),
      key: `customer`,
      width: 110,
      render: (_e: any, t: any) => (
        <Text
          ellipsis={{
            tooltip: t.order.customer.alias,
          }}
        >
          {t.order.customer.alias}
        </Text>
      ),
    },
    ...(showPii
      ? [
          {
            title: n(`orders.col.phone`),
            key: `phone`,
            width: 110,
            render: (_e: any, t: any) => (
              <Text
                type={`secondary`}
                style={{
                  fontVariantNumeric: `tabular-nums`,
                }}
              >
                {moriPhoneFormat(t.order.customer.phone)}
              </Text>
            ),
          },
        ]
      : []),
    {
      title: n(`orders.col.district`),
      key: `district`,
      width: 96,
      sorter: (e: any, t: any) =>
        e.order.customer.district.localeCompare(t.order.customer.district),
      render: (_e: any, t: any) => <Text>{t.order.customer.district}</Text>,
    },
    {
      title: n(`orders.col.channel`),
      key: `channel`,
      width: 96,
      render: (_e: any, t: any) => (
        <Pill tone={`muted`}>
          {n(CHANNEL_KEY[t.order.channel as keyof typeof CHANNEL_KEY])}
        </Pill>
      ),
    },
    {
      title: n(`orders.col.items`),
      key: `items`,
      width: 220,
      render: (_e: any, t: any) => {
        let n = productOf(t.order.lines[0].sku);
        let r = n ? n.name : t.order.lines[0].sku;
        let i = t.order.lines.length > 1 ? ` +${t.order.lines.length - 1}` : ``;
        return (
          <Text
            ellipsis={{
              tooltip: t.order.lines
                .map((e: any) => {
                  var t;
                  return `${((t = productOf(e.sku)) == null ? undefined : t.name) ?? e.sku} × ${e.qty}`;
                })
                .join(`、`),
            }}
          >
            {r}
            {i && <Text type={`secondary`}>{i}</Text>}
          </Text>
        );
      },
    },
    {
      title: n(`orders.col.qty`),
      key: `qty`,
      width: 72,
      align: `right`,
      sorter: (e: any, t: any) => e.qty - t.qty,
      render: (_e: any, t: any) => (
        <Text
          style={{
            fontVariantNumeric: `tabular-nums`,
          }}
        >
          {t.qty}
        </Text>
      ),
    },
    {
      title: n(`orders.col.amount`),
      key: `amount`,
      width: 110,
      align: `right`,
      sorter: (e: any, t: any) => e.amount - t.amount,
      render: (_e: any, t: any) => (
        <Text
          style={{
            fontWeight: 500,
            fontVariantNumeric: `tabular-nums`,
          }}
        >
          {money(t.amount)}
        </Text>
      ),
    },
    {
      title: n(`orders.col.payment`),
      key: `payment`,
      width: 96,
      sorter: (e: any, t: any) =>
        e.order.payment.localeCompare(t.order.payment),
      render: (_e: any, t: any) => {
        let r = PAYMENT_META[t.order.payment as keyof typeof PAYMENT_META];
        return (
          <Pill tone={r.tone} dot={true}>
            {n(r.labelKey)}
          </Pill>
        );
      },
    },
    {
      title: n(`orders.col.status`),
      key: `bucket`,
      width: 110,
      sorter: (e: any, t: any) =>
        ORDER_BUCKETS.indexOf(e.bucket) - ORDER_BUCKETS.indexOf(t.bucket),
      render: (_e: any, t: any) => {
        let r = BUCKET_META[t.bucket as keyof typeof BUCKET_META];
        return (
          <Pill tone={r.tone} dot={true}>
            {n(r.labelKey)}
          </Pill>
        );
      },
    },
    {
      title: n(`orders.col.deliveryAt`),
      key: `scheduledDate`,
      width: 112,
      sorter: (e: any, t: any) =>
        cmpDate(e.order.delivery.scheduledDate, t.order.delivery.scheduledDate),
      render: (_e: any, t: any) =>
        t.order.delivery.scheduledDate ? (
          <Text>{fmtDate(t.order.delivery.scheduledDate)}</Text>
        ) : (
          <Text type={`secondary`}>{n(`orders.notScheduled`)}</Text>
        ),
    },
    {
      title: n(`orders.col.alerts`),
      key: `alerts`,
      width: 140,
      render: (_e: any, t: any) =>
        t.alerts.length ? (
          <Flex gap={4} wrap={true}>
            {t.alerts.map(alertChip)}
          </Flex>
        ) : (
          <Text type={`secondary`}>{`—`}</Text>
        ),
    },
    {
      title: ``,
      key: `actions`,
      width: 150,
      fixed: `right`,
      render: (_e: any, r: any) => (
        <Flex
          gap={4}
          justify={`flex-end`}
          onClick={(e: any) => e.stopPropagation()}
        >
          {mayExecute && r.bucket === `toSchedule` && (
            <Button
              size={`small`}
              icon={<CalendarOutlined />}
              onClick={() =>
                message.info(
                  n(`orders.scheduleDemo`, {
                    order: r.order.orderNo,
                  }),
                )
              }
            >
              {n(`orders.action.schedule`)}
            </Button>
          )}
          <Dropdown
            trigger={[`click`]}
            menu={{
              items: [
                {
                  key: `detail`,
                  label: n(`orders.action.detail`),
                },
                {
                  key: `export`,
                  label: n(`orders.action.exportOne`),
                },
              ],
              onClick: () => message.info(n(`common.notWired`)),
            }}
          >
            <Button
              type={`text`}
              size={`small`}
              icon={<MoreOutlined />}
              aria-label={n(`orders.action.more`)}
            />
          </Dropdown>
        </Flex>
      ),
    },
  ];
  let bucketOptions = ORDER_BUCKETS.map((e: any) => ({
    value: e,
    label: (
      <Flex
        justify={`space-between`}
        gap={12}
        style={{
          flexGrow: 1,
        }}
      >
        <Pill tone={BUCKET_META[e as keyof typeof BUCKET_META].tone} dot={true}>
          {n(BUCKET_META[e as keyof typeof BUCKET_META].labelKey)}
        </Pill>
        <Text type={`secondary`}>{counts[e] ?? 0}</Text>
      </Flex>
    ),
  }));
  let paymentOptions = Object.keys(PAYMENT_META).map((e: any) => ({
    value: e,
    label: (
      <Pill tone={PAYMENT_META[e as keyof typeof PAYMENT_META].tone} dot={true}>
        {n(PAYMENT_META[e as keyof typeof PAYMENT_META].labelKey)}
      </Pill>
    ),
  }));
  let channelOptions = Object.keys(CHANNEL_KEY).map((e: any) => ({
    value: e,
    label: n(CHANNEL_KEY[e as keyof typeof CHANNEL_KEY]),
  }));
  return (
    <Flex vertical={true} gap={12}>
      <Flex align={`center`} justify={`space-between`} wrap={true} gap={12}>
        <Flex vertical={true} gap={2}>
          <Title
            level={1}
            style={{
              margin: 0,
            }}
          >
            {n(`orders.title`)}
          </Title>
          <Text type={`secondary`}>
            {n(`orders.subtitle`, {
              date: fmtDate(DEMO_TODAY, `detail`),
            })}
          </Text>
        </Flex>
        <Space>
          {can(role, `orders`, `export`) && (
            <Button
              icon={<DownloadOutlined />}
              onClick={() => message.success(n(`common.exported`))}
            >
              {n(`common.export`)}
            </Button>
          )}
          {can(role, `orders`, `edit`) && (
            <Tooltip title={n(`orders.newHint`)}>
              <Button
                type={`primary`}
                icon={<PlusOutlined />}
                onClick={() => message.info(n(`orders.newHint`))}
              >
                {n(`orders.new`)}
              </Button>
            </Tooltip>
          )}
        </Space>
      </Flex>
      <Row gutter={[12, 12]}>
        {[
          {
            title: n(`orders.stat.yesterdayNew`),
            value: stats.yesterdayNew,
          },
          {
            title: n(`orders.bucket.notProcured`),
            value: stats.notProcured,
            color: colors.warningText,
          },
          {
            title: n(`orders.bucket.toSchedule`),
            value: stats.toSchedule,
            color: colors.warningText,
          },
          {
            title: n(`orders.stat.escalated`, {
              days: 14,
            }),
            value: stats.escalated,
            color: colors.error,
          },
        ].map((e: any) => (
          <Col xs={12} lg={6} key={e.title}>
            <Card size={`small`}>
              <Statistic
                title={e.title}
                value={e.value}
                styles={{
                  content: {
                    fontSize: 22,
                    fontWeight: 600,
                    color: e.value > 0 ? e.color : undefined,
                  },
                }}
              />
            </Card>
          </Col>
        ))}
      </Row>
      <DataTableCard
        filters={
          <>
            <FilterChip
              label={n(`orders.filter.status`)}
              options={bucketOptions}
              value={buckets}
              onChange={setBuckets}
            />
            <FilterChip
              label={n(`orders.filter.payment`)}
              options={paymentOptions}
              value={payments}
              onChange={setPayments}
            />
            <FilterChip
              label={n(`orders.col.channel`)}
              options={channelOptions}
              value={channels}
              onChange={setChannels}
            />
            <DatePicker.RangePicker
              value={range}
              onChange={(e: any) => setRange(e)}
              placeholder={[n(`orders.dateFrom`), n(`orders.dateTo`)]}
              style={{
                width: 240,
              }}
            />
          </>
        }
        onClearFilters={filtered ? clearFilters : undefined}
        search={{
          value: keyword,
          onChange: setKeyword,
          placeholder: n(`orders.search`),
          width: 280,
        }}
        count={`${n(`orders.summary.count`, {
          n: rows.length,
        })} · ${n(`orders.summary.total`, {
          amount: money(filteredTotal),
        })}`}
        selection={{
          count: selected.length,
          text: n(`orders.selected`, {
            n: selected.length,
          }),
          actions: (
            <>
              {mayExecute && (
                <Button
                  size={`small`}
                  icon={<CalendarOutlined />}
                  onClick={() =>
                    message.success(
                      n(`orders.bulk.scheduled`, {
                        n: selected.length,
                      }),
                    )
                  }
                >
                  {n(`orders.bulk.schedule`)}
                </Button>
              )}
              <Button
                size={`small`}
                onClick={() => message.success(n(`common.exported`))}
              >
                {n(`orders.bulk.export`)}
              </Button>
            </>
          ),
          onClear: () => setSelected([]),
        }}
        mobile={
          <CardList
            items={rows}
            rowKey={(e: any) => e.order.id}
            emptyText={n(`orders.empty`)}
            renderItem={(e: any) => {
              let r = BUCKET_META[e.bucket as keyof typeof BUCKET_META];
              return (
                <Card
                  size={`small`}
                  styles={{
                    body: {
                      padding: `12px 16px`,
                    },
                  }}
                  onClick={() =>
                    peek.open({
                      model: `order`,
                      id: e.order.orderNo,
                    })
                  }
                >
                  <Flex vertical={true} gap={8}>
                    <Flex justify={`space-between`} align={`center`} gap={8}>
                      <Text
                        style={{
                          fontWeight: 600,
                        }}
                      >
                        {e.order.orderNo}
                        {` · `}
                        {e.order.customer.alias}
                        {` · `}
                        {e.order.customer.district}
                      </Text>
                      <Pill tone={r.tone} dot={true}>
                        {n(r.labelKey)}
                      </Pill>
                    </Flex>
                    <Text type={`secondary`}>
                      {fmtDate(e.order.createdAt)}
                      {` · `}
                      {n(
                        CHANNEL_KEY[
                          e.order.channel as keyof typeof CHANNEL_KEY
                        ],
                      )}
                      {` · `}
                      {e.qty}
                      {` `}
                      {n(`orders.unitItems`)}
                      {` · `}
                      {money(e.amount)}
                    </Text>
                    {e.alerts.length > 0 && (
                      <Flex gap={4} wrap={true}>
                        {e.alerts.map(alertChip)}
                      </Flex>
                    )}
                    {mayExecute && e.bucket === `toSchedule` && (
                      <Button
                        icon={<CalendarOutlined />}
                        onClick={(r: any) => {
                          r.stopPropagation();
                          message.info(
                            n(`orders.scheduleDemo`, {
                              order: e.order.orderNo,
                            }),
                          );
                        }}
                      >
                        {n(`orders.action.schedule`)}
                      </Button>
                    )}
                  </Flex>
                </Card>
              );
            }}
          />
        }
      >
        <Table
          loading={loading}
          rowKey={(e: any) => e.order.id}
          columns={columns}
          dataSource={rows}
          scroll={{
            x: 1500,
          }}
          pagination={pagination}
          rowSelection={{
            selectedRowKeys: selected,
            onChange: setSelected,
            columnWidth: 48,
            onCell: () => ({
              onClick: (e: any) => e.stopPropagation(),
            }),
          }}
          rowClassName={(e: any) =>
            e.order.orderNo === activeId
              ? `mori-row-active`
              : `mori-row-clickable`
          }
          onRow={(e: any) => ({
            onClick: () =>
              peek.open({
                model: `order`,
                id: e.order.orderNo,
              }),
          })}
          locale={{
            emptyText: <Empty description={n(`orders.empty`)} />,
          }}
        />
      </DataTableCard>
    </Flex>
  );
}
