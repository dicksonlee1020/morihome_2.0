import { ShoppingCartOutlined } from '@ant-design/icons';
import {
  App,
  Button,
  Card,
  Col,
  Empty,
  Flex,
  InputNumber,
  Row,
  Statistic,
  Table,
  Tooltip,
  Typography,
} from 'antd';
import * as React from 'react';
import { CardList } from '../components/CardList';
import { DataTableCard } from '../components/DataTableCard';
import { FilterChip } from '../components/FilterChip';
import { ItemName, NameDisplaySwitch } from '../components/ItemName';
import { Pill } from '../components/Pill';
import {
  createStockRequirements,
  moriRestockProducts,
  moriSetSafetyStock,
  useOps,
} from '../data/ops';
import type { MessageKey } from '../i18n';
import { useT as MoriUseT } from '../i18n/hooks';
import { colors } from '../theme';
import { onHand, sellable } from '../types';
import { fmtDate } from '../utils/date';
import type { Tone } from '../utils/tones';
import { useDensity } from '../utils/useDensity';
import { useMockLoading } from '../utils/useMockLoading';
import { useTablePagination } from '../utils/useTablePagination';
const { Text, Title } = Typography;

/**
 * 備貨表（Ocean feedback B-05）：只入儲定貨款（§2.2 sourcingType = stocked）。
 * 「實有 / 預留 / 可售 / 安全存量」同補貨提醒喺呢度，唔喺庫存頁。
 *
 * 補貨提醒係推導：
 *   now  = 可售 ≤ 安全存量，而且在途都補唔返
 *   soon = 可售 < 安全存量 × 1.5（TODO：接埋銷售速度同廠期先準）
 *   covered = 跌穿咗但在途夠補
 */
type Reminder = 'now' | 'soon' | 'covered' | 'ok';
const REMINDER_META: Record<
  Reminder,
  {
    labelKey: MessageKey;
    tone: Tone;
  }
> = {
  now: {
    labelKey: 'restock.reminder.now',
    tone: 'error',
  },
  soon: {
    labelKey: 'restock.reminder.soon',
    tone: 'warning',
  },
  covered: {
    labelKey: 'restock.reminder.covered',
    tone: 'brand',
  },
  ok: {
    labelKey: 'restock.reminder.ok',
    tone: 'success',
  },
};
const SOON_FACTOR = 1.5;
function reminder(e: any, safety: any) {
  let avail = sellable(e.stock);
  return avail <= safety
    ? e.stock.incomingStock >= safety - avail + 1
      ? `covered`
      : `now`
    : avail < safety * SOON_FACTOR
      ? `soon`
      : `ok`;
} /** 補足到安全存量兩倍，減埋在途 */
const suggest = (e: any, t: any) => {
  let n = reminder(e, t);
  return n === `ok` || n === `covered`
    ? 0
    : Math.max(0, t * 2 - sellable(e.stock) - e.stock.incomingStock);
};
export function RestockPage() {
  const inventoryState = useOps();
  const liveProducts = React.useMemo(
    () => moriRestockProducts(inventoryState),
    [inventoryState],
  );
  let { message } = App.useApp();
  let t = MoriUseT();
  let { wc: n } = useDensity();
  let [safety, _setSafety] = React.useState<any>({});
  let [reminders, setReminders] = React.useState<any>([]);
  let [keyword, setKeyword] = React.useState<any>(``);
  let [selected, setSelected] = React.useState<any>([]);
  let safetyOf = (e: any) => e.stock.safetyStock;
  let rows = React.useMemo(() => {
    let e = keyword.trim().toLowerCase();
    let t: any[] = [`now`, `soon`, `covered`, `ok`];
    return liveProducts
      .filter((t: any) =>
        reminders.length > 0 && !reminders.includes(reminder(t, safetyOf(t)))
          ? false
          : !e ||
            t.sku.toLowerCase().includes(e) ||
            t.name.toLowerCase().includes(e) ||
            t.supplierName.toLowerCase().includes(e) ||
            t.supplierCode.toLowerCase().includes(e),
      )
      .sort(
        (e: any, n: any) =>
          t.indexOf(reminder(e, safetyOf(e))) -
          t.indexOf(reminder(n, safetyOf(n))),
      );
  }, [reminders, keyword, safety, liveProducts]);
  let loading = useMockLoading();
  let pagination = useTablePagination(rows.length);
  let stats = React.useMemo(() => {
    let e: any = {
      now: 0,
      soon: 0,
      covered: 0,
      ok: 0,
    };
    for (let t of liveProducts) e[reminder(t, safetyOf(t))] += 1;
    return {
      total: liveProducts.length,
      ...e,
    };
  }, [safety, liveProducts]);
  let raise = () => {
    let n = createStockRequirements(
      liveProducts
        .filter(
          (e: any) => selected.includes(e.sku) && suggest(e, safetyOf(e)) > 0,
        )
        .map((e: any) => ({
          sku: e.sku,
          qty: Math.max(1, suggest(e, safetyOf(e))),
        })),
    );
    setSelected([]);
    message.success(
      t(`restock.raised`, {
        n,
      }),
    );
  };
  let num = (e: any, t?: string) => (
    <Text
      style={{
        color: t,
        fontWeight: t ? 500 : undefined,
      }}
    >
      {e}
    </Text>
  );
  let columns: any[] = [
    {
      title: `SKU`,
      dataIndex: `sku`,
      width: n(110),
      fixed: `left`,
      render: (e: any) => (
        <Text
          style={{
            fontWeight: 500,
          }}
        >
          {e}
        </Text>
      ),
    },
    {
      title: t(`restock.col.item`),
      key: `item`,
      width: n(300),
      render: (_e: any, t: any) => <ItemName product={t} thumb={true} />,
    },
    {
      title: t(`restock.col.onHand`),
      key: `onHand`,
      width: n(80),
      align: `right`,
      render: (_e: any, n: any) => (
        <Tooltip
          title={t(`restock.onHandHint`, {
            main: n.stock.main,
            shop: n.stock.shop,
            cn: n.stock.cn,
          })}
        >
          {num(onHand(n.stock))}
        </Tooltip>
      ),
    },
    {
      title: t(`restock.col.reserved`),
      key: `reserved`,
      width: n(80),
      align: `right`,
      render: (_e: any, t: any) => (
        <Text type={`secondary`}>{t.stock.reserved || `—`}</Text>
      ),
    },
    {
      title: t(`restock.col.sellable`),
      key: `sellable`,
      width: n(80),
      align: `right`,
      sorter: (e: any, t: any) => sellable(e.stock) - sellable(t.stock),
      render: (_e: any, t: any) => {
        let n = reminder(t, safetyOf(t));
        return num(
          sellable(t.stock),
          n === `now`
            ? colors.error
            : n === `soon`
              ? colors.warningText
              : undefined,
        );
      },
    },
    {
      title: `大陸可用`,
      key: `cnAvailable`,
      width: n(90),
      align: `right`,
      render: (_e: any, t: any) => num(t.stock.availableCN),
    },
    {
      title: t(`restock.col.inTransit`),
      key: `inTransit`,
      width: n(80),
      align: `right`,
      render: (_e: any, t: any) =>
        t.stock.incomingStock > 0 ? (
          num(t.stock.incomingStock, colors.primary)
        ) : (
          <Text type={`secondary`}>{`—`}</Text>
        ),
    },
    {
      title: t(`restock.col.safety`),
      key: `safety`,
      width: n(110),
      align: `right`,
      render: (_e: any, t: any) => (
        <InputNumber
          size={`small`}
          min={0}
          max={999}
          value={safetyOf(t)}
          onChange={(e: any) => e != null && moriSetSafetyStock(t.sku, e)}
          style={{
            width: 72,
          }}
        />
      ),
    },
    {
      title: t(`restock.col.reminder`),
      key: `reminder`,
      width: n(130),
      render: (_e: any, n: any) => {
        let r = REMINDER_META[reminder(n, safetyOf(n))];
        return (
          <Pill tone={r.tone} dot={true}>
            {t(r.labelKey)}
          </Pill>
        );
      },
    },
    {
      title: t(`restock.col.suggest`),
      key: `suggest`,
      width: n(116),
      align: `right`,
      sorter: (e: any, t: any) =>
        suggest(e, safetyOf(e)) - suggest(t, safetyOf(t)),
      render: (_e: any, t: any) => {
        let n = suggest(t, safetyOf(t));
        return n === 0 ? (
          <Text type={`secondary`}>{`—`}</Text>
        ) : (
          <Text
            style={{
              fontWeight: 500,
            }}
          >
            {n}
          </Text>
        );
      },
    },
    {
      title: t(`restock.col.supplier`),
      dataIndex: `supplier`,
      width: n(150),
      responsive: [`xl`],
      render: (e: any) => (
        <Text type={`secondary`} ellipsis={true}>
          {e}
        </Text>
      ),
    },
    {
      title: t(`restock.col.countedAt`),
      key: `countedAt`,
      width: n(100),
      responsive: [`xxl`],
      render: (_e: any, t: any) => (
        <Text type={`secondary`}>{fmtDate(t.stock.countedAt)}</Text>
      ),
    },
  ];
  let reminderOptions = [`now`, `soon`, `covered`, `ok`].map((e: any) => ({
    value: e,
    label: (
      <Pill
        tone={REMINDER_META[e as keyof typeof REMINDER_META].tone}
        dot={true}
      >
        {t(REMINDER_META[e as keyof typeof REMINDER_META].labelKey)}
      </Pill>
    ),
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
            {t(`restock.title`)}
          </Title>
          <Text type={`secondary`}>
            {t(`restock.subtitle`, {
              n: stats.total,
            })}
          </Text>
        </Flex>
      </Flex>
      <Row gutter={[12, 12]}>
        {[
          {
            title: t(`restock.stat.total`),
            value: stats.total,
          },
          {
            title: t(`restock.reminder.now`),
            value: stats.now,
            color: colors.error,
          },
          {
            title: t(`restock.reminder.soon`),
            value: stats.soon,
            color: colors.warningText,
          },
          {
            title: t(`restock.reminder.covered`),
            value: stats.covered,
            color: colors.primary,
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
          <FilterChip
            label={t(`restock.col.reminder`)}
            options={reminderOptions}
            value={reminders}
            onChange={setReminders}
          />
        }
        onClearFilters={
          reminders.length > 0 || keyword
            ? () => {
                setReminders([]);
                setKeyword(``);
              }
            : undefined
        }
        search={{
          value: keyword,
          onChange: setKeyword,
          placeholder: t(`common.search.sku`),
        }}
        extra={<NameDisplaySwitch />}
        count={`${t(`common.filteredSku`, {
          n: rows.length,
        })} · ${t(`restock.hint`)}`}
        selection={{
          count: selected.length,
          text: t(`common.selectedSku`, {
            n: selected.length,
          }),
          actions: (
            <Button
              size={`small`}
              type={`primary`}
              icon={<ShoppingCartOutlined />}
              onClick={raise}
              disabled={
                !liveProducts.some(
                  (e: any) =>
                    selected.includes(e.sku) && suggest(e, safetyOf(e)) > 0,
                )
              }
            >
              {t(`restock.bulk.raise`)}
            </Button>
          ),
          onClear: () => setSelected([]),
        }}
        mobile={
          <CardList
            items={rows}
            rowKey={(e: any) => e.sku}
            emptyText={t(`common.emptySku`)}
            renderItem={(e: any) => {
              let n = reminder(e, safetyOf(e));
              let r = REMINDER_META[n as keyof typeof REMINDER_META];
              let i = suggest(e, safetyOf(e));
              return (
                <Card
                  size={`small`}
                  styles={{
                    body: {
                      padding: `12px 16px`,
                    },
                  }}
                >
                  <Flex vertical={true} gap={8}>
                    <Flex justify={`space-between`} align={`center`} gap={8}>
                      <Text
                        style={{
                          fontWeight: 600,
                        }}
                      >
                        {e.sku}
                      </Text>
                      <Pill tone={r.tone} dot={true}>
                        {t(r.labelKey)}
                      </Pill>
                    </Flex>
                    <ItemName product={e} thumb={true} />
                    <Flex gap={12} wrap={true}>
                      <Text
                        style={{
                          fontWeight: 600,
                          color:
                            n === `now`
                              ? colors.error
                              : n === `soon`
                                ? colors.warningText
                                : undefined,
                        }}
                      >{`香港可用 ${sellable(e.stock)} · 大陸可用 ${e.stock.availableCN}`}</Text>
                      <Text type={`secondary`}>
                        {t(`restock.card.onHand`, {
                          n: onHand(e.stock),
                        })}
                      </Text>
                      <Text type={`secondary`}>
                        {t(`restock.card.safety`, {
                          n: safetyOf(e),
                        })}
                      </Text>
                      {e.stock.incomingStock > 0 && (
                        <Text
                          style={{
                            color: colors.primary,
                          }}
                        >
                          {t(`restock.card.inTransit`, {
                            n: e.stock.incomingStock,
                          })}
                        </Text>
                      )}
                      {i > 0 && (
                        <Text
                          style={{
                            fontWeight: 500,
                          }}
                        >
                          {t(`restock.card.suggest`, {
                            n: i,
                          })}
                        </Text>
                      )}
                    </Flex>
                  </Flex>
                </Card>
              );
            }}
          />
        }
      >
        <Table
          loading={loading}
          rowKey={`sku`}
          columns={columns}
          dataSource={rows}
          pagination={pagination}
          scroll={{
            x: n(1100),
          }}
          rowSelection={{
            selectedRowKeys: selected,
            onChange: setSelected,
            columnWidth: n(48),
          }}
          locale={{
            emptyText: <Empty description={t(`common.emptySku`)} />,
          }}
        />
      </DataTableCard>
    </Flex>
  );
}
