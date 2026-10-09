import {
  DownloadOutlined,
  PlusOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import {
  App,
  Button,
  Card,
  Col,
  Flex,
  Row,
  Space,
  Statistic,
  Switch,
  Table,
  Tooltip,
  Typography,
} from 'antd';
import * as React from 'react';
import { useAuth as MoriUseAuth } from '../auth/hooks';
import { CardList } from '../components/CardList';
import { DataTableCard } from '../components/DataTableCard';
import { FilterChip } from '../components/FilterChip';
import { ItemName, NameDisplaySwitch } from '../components/ItemName';
import { Pill } from '../components/Pill';
import { canSee } from '../config/permissions';
import {
  CATEGORY_OPTIONS,
  PRODUCT_STATUS_META,
  SERIES,
  TOTAL_SKU,
} from '../data/catalog';
import { moriLiveProducts, useOps } from '../data/ops';
import type { MessageKey } from '../i18n';
import { useT as MoriUseT } from '../i18n/hooks';
import { colors } from '../theme';
import type { SourcingType } from '../types';
import { margin, sellable, stockState } from '../types';
import { fmtDate } from '../utils/date';
import { amount, money, percent } from '../utils/format';
import type { Tone } from '../utils/tones';
import { useDensity } from '../utils/useDensity';
import { useMockLoading } from '../utils/useMockLoading';
import { useTablePagination } from '../utils/useTablePagination';
const { Text, Title } = Typography;

/** 毛利低過呢個數就標色，叫同事覆下個成本價 */
const MARGIN_FLOOR = 0.4;
const SOURCING_META: Record<
  SourcingType,
  {
    labelKey: MessageKey;
    tone: Tone;
  }
> = {
  stocked: {
    labelKey: 'products.sourcing.stocked',
    tone: 'brand',
  },
  orderOnDemand: {
    labelKey: 'products.sourcing.orderOnDemand',
    tone: 'muted',
  },
  custom: {
    labelKey: 'products.sourcing.custom',
    tone: 'warning',
  },
};
export function ProductsPage() {
  const inventoryState = useOps();
  const liveProducts = React.useMemo(
    () => moriLiveProducts(inventoryState),
    [inventoryState],
  );
  let { message } = App.useApp();
  let t = MoriUseT();
  let { w: n } = useDensity();
  let { user } = MoriUseAuth();
  let showCost = canSee(
    (user == null ? undefined : user.role) ?? `content`,
    `COST`,
  );
  let [statuses, setStatuses] = React.useState<any>([]);
  let [categories, setCategories] = React.useState<any>([]);
  let [seriesSel, setSeriesSel] = React.useState<any>([]);
  let [keyword, setKeyword] = React.useState<any>(``);
  let [stockedOnly, setStockedOnly] = React.useState<any>(false);
  let [selected, setSelected] = React.useState<any>([]);
  let rows = React.useMemo(() => {
    let e = keyword.trim().toLowerCase();
    return liveProducts.filter((t: any) =>
      (statuses.length > 0 && !statuses.includes(t.status)) ||
      (categories.length > 0 && !categories.includes(t.category)) ||
      (seriesSel.length > 0 && !seriesSel.includes(t.series)) ||
      (stockedOnly && t.sourcingType !== `stocked`)
        ? false
        : !e ||
          t.sku.toLowerCase().includes(e) ||
          t.name.toLowerCase().includes(e) ||
          t.variant.toLowerCase().includes(e) ||
          t.supplierName.toLowerCase().includes(e) ||
          t.supplierCode.toLowerCase().includes(e),
    );
  }, [statuses, categories, seriesSel, keyword, stockedOnly, liveProducts]);
  let loading = useMockLoading();
  let pagination = useTablePagination(rows.length);
  let stats = React.useMemo(() => {
    let e = 0;
    let t = 0;
    let n = 0;
    let r = 0;
    for (let i of liveProducts) {
      if (i.status === `active`) {
        e++;
      }
      if (i.status === `draft`) {
        t++;
      }
      if (i.sourcingType === `stocked`) {
        n++;
      }
      r += i.stock.stockValue;
    }
    return {
      active: e,
      draft: t,
      stocked: n,
      stockValue: r,
    };
  }, [liveProducts]);
  let columns: any[] = [
    {
      title: `SKU`,
      dataIndex: `sku`,
      width: n(120),
      fixed: `left`,
      render: (e: any) => (
        <Text
          style={{
            color: colors.primary,
            fontWeight: 500,
            cursor: `pointer`,
          }}
        >
          {e}
        </Text>
      ),
    },
    {
      title: t(`products.col.name`),
      dataIndex: `name`,
      width: n(300),
      render: (_e: any, t: any) => <ItemName product={t} thumb={true} />,
    },
    {
      title: t(`common.category`),
      dataIndex: `category`,
      width: n(80),
    },
    {
      title: t(`products.col.series`),
      dataIndex: `series`,
      width: n(80),
      responsive: [`xl`],
    },
    {
      title: t(`products.col.supplier`),
      dataIndex: `supplier`,
      width: n(140),
      responsive: [`xxl`],
      render: (e: any) => (
        <Text type={`secondary`} ellipsis={true}>
          {e}
        </Text>
      ),
    },
    {
      title: t(`products.col.sourcing`),
      dataIndex: `sourcingType`,
      width: n(90),
      render: (e: any) => {
        let n = SOURCING_META[e as keyof typeof SOURCING_META];
        return <Pill tone={n.tone}>{t(n.labelKey)}</Pill>;
      },
    },
    ...(showCost
      ? [
          {
            title: t(`products.col.cost`),
            dataIndex: `cost`,
            width: n(90),
            align: `right`,
            sorter: (e: any, t: any) => e.cost - t.cost,
            render: (e: any) => (
              <Text
                type={`secondary`}
                style={{
                  fontVariantNumeric: `tabular-nums`,
                }}
              >
                {amount(e)}
              </Text>
            ),
          },
        ]
      : []),
    {
      title: t(`products.col.price`),
      dataIndex: `price`,
      width: n(90),
      align: `right`,
      sorter: (e: any, t: any) => e.price - t.price,
      render: (e: any) => (
        <Text
          style={{
            fontWeight: 500,
          }}
        >
          {amount(e)}
        </Text>
      ),
    },
    ...(showCost
      ? [
          {
            title: t(`products.col.margin`),
            key: `margin`,
            width: n(80),
            align: `right`,
            sorter: (e: any, t: any) => margin(e) - margin(t),
            render: (_e: any, n: any) => {
              let r = margin(n);
              let i = r < MARGIN_FLOOR;
              return (
                <Tooltip
                  title={
                    i
                      ? t(`products.marginHint`, {
                          floor: percent(MARGIN_FLOOR),
                        })
                      : undefined
                  }
                >
                  <Text
                    style={{
                      color: i ? colors.warningText : undefined,
                      fontWeight: i ? 500 : undefined,
                    }}
                  >
                    {percent(r)}
                  </Text>
                </Tooltip>
              );
            },
          },
        ]
      : []),
    {
      title: t(`products.col.sellable`),
      key: `sellable`,
      width: n(80),
      align: `right`,
      sorter: (e: any, t: any) => sellable(e.stock) - sellable(t.stock),
      render: (_e: any, t: any) => {
        let n = sellable(t.stock);
        let r = stockState(t.stock);
        return (
          <Text
            style={{
              color:
                r === `out`
                  ? colors.error
                  : r === `low`
                    ? colors.warningText
                    : undefined,
              fontWeight: r === `ok` ? undefined : 500,
            }}
          >{`${n} / ${t.stock.availableCN}`}</Text>
        );
      },
    },
    {
      title: t(`common.status`),
      dataIndex: `status`,
      width: n(90),
      render: (e: any) => {
        let n = PRODUCT_STATUS_META[e as keyof typeof PRODUCT_STATUS_META];
        return (
          <Pill tone={n.tone} dot={true}>
            {t(n.labelKey)}
          </Pill>
        );
      },
    },
    {
      title: t(`products.col.updatedAt`),
      dataIndex: `updatedAt`,
      width: n(100),
      responsive: [`xl`],
      sorter: (e: any, t: any) => e.updatedAt.localeCompare(t.updatedAt),
      render: (e: any) => <Text type={`secondary`}>{fmtDate(e)}</Text>,
    },
  ];
  let filtered =
    statuses.length > 0 ||
    categories.length > 0 ||
    seriesSel.length > 0 ||
    stockedOnly ||
    keyword !== ``;
  let clearFilters = () => {
    setStatuses([]);
    setCategories([]);
    setSeriesSel([]);
    setStockedOnly(false);
    setKeyword(``);
  };
  let statusOptions = Object.keys(PRODUCT_STATUS_META).map((e: any) => ({
    value: e,
    label: (
      <Pill
        tone={PRODUCT_STATUS_META[e as keyof typeof PRODUCT_STATUS_META].tone}
        dot={true}
      >
        {t(PRODUCT_STATUS_META[e as keyof typeof PRODUCT_STATUS_META].labelKey)}
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
            {t(`products.title`)}
          </Title>
          <Text type={`secondary`}>
            {t(`products.subtitle`, {
              n: TOTAL_SKU.toLocaleString(`en-HK`),
            })}
          </Text>
        </Flex>
        <Space>
          <Button icon={<UploadOutlined />}>{t(`products.importCsv`)}</Button>
          <Button icon={<DownloadOutlined />}>{t(`common.export`)}</Button>
          <Button type={`primary`} icon={<PlusOutlined />}>
            {t(`products.new`)}
          </Button>
        </Space>
      </Flex>
      <Row gutter={[12, 12]}>
        {[
          {
            title: t(`products.stat.active`),
            value: stats.active.toLocaleString(`en-HK`),
          },
          {
            title: t(`products.stat.draft`),
            value: stats.draft.toLocaleString(`en-HK`),
          },
          {
            title: t(`products.stat.stocked`),
            value: stats.stocked.toLocaleString(`en-HK`),
          },
          {
            title: t(`products.stat.stockValue`),
            value: showCost ? money(stats.stockValue) : `—`,
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
              label={t(`products.filter.status`)}
              options={statusOptions}
              value={statuses}
              onChange={setStatuses}
            />
            <FilterChip
              label={t(`products.filter.category`)}
              options={CATEGORY_OPTIONS.map((e: any) => ({
                value: e.value,
                label: e.label,
              }))}
              value={categories}
              onChange={setCategories}
            />
            <FilterChip
              label={t(`products.filter.series`)}
              options={SERIES.map((e: any) => ({
                value: e,
                label: e,
              }))}
              value={seriesSel}
              onChange={setSeriesSel}
            />
            <Flex
              align={`center`}
              gap={8}
              style={{
                paddingInline: 4,
              }}
            >
              <Switch
                checked={stockedOnly}
                onChange={setStockedOnly}
                size={`small`}
              />
              <Text type={`secondary`}>{t(`products.stockedOnly`)}</Text>
            </Flex>
          </>
        }
        onClearFilters={filtered ? clearFilters : undefined}
        search={{
          value: keyword,
          onChange: setKeyword,
          placeholder: t(`common.search.sku`),
        }}
        extra={<NameDisplaySwitch />}
        count={t(`common.filteredSku`, {
          n: rows.length.toLocaleString(`en-HK`),
        })}
        selection={{
          count: selected.length,
          text: t(`common.selectedSku`, {
            n: selected.length,
          }),
          actions: (
            <>
              <Button
                size={`small`}
                onClick={() =>
                  message.success(
                    t(`products.bulk.published`, {
                      n: selected.length,
                    }),
                  )
                }
              >
                {t(`products.bulk.publish`)}
              </Button>
              <Button
                size={`small`}
                onClick={() =>
                  message.success(
                    t(`products.bulk.unpublished`, {
                      n: selected.length,
                    }),
                  )
                }
              >
                {t(`products.bulk.unpublish`)}
              </Button>
              <Button
                size={`small`}
                onClick={() => message.info(t(`products.bulk.repriceDemo`))}
              >
                {t(`products.bulk.reprice`)}
              </Button>
            </>
          ),
          onClear: () => setSelected([]),
        }}
        mobile={<ProductCards products={rows} />}
      >
        <Table
          loading={loading}
          rowKey={`sku`}
          columns={columns}
          dataSource={rows}
          pagination={pagination}
          scroll={{
            x: n(1e3),
          }}
          rowSelection={{
            selectedRowKeys: selected,
            onChange: setSelected,
            columnWidth: n(40),
          }}
        />
      </DataTableCard>
    </Flex>
  );
}

/** 手機版：密集表格喺 390px 完全用唔到，改用卡 */

function ProductCards({ products }: any) {
  let t = MoriUseT();
  return (
    <CardList
      items={products}
      rowKey={(e: any) => e.sku}
      emptyText={t(`common.emptySku`)}
      renderItem={(e: any) => {
        let n =
          PRODUCT_STATUS_META[e.status as keyof typeof PRODUCT_STATUS_META];
        let r = stockState(e.stock);
        return (
          <Card
            size={`small`}
            style={{
              width: `100%`,
            }}
          >
            <Flex vertical={true} gap={8}>
              <Flex align={`center`} justify={`space-between`} gap={8}>
                <Text
                  style={{
                    fontWeight: 600,
                  }}
                >
                  {e.sku}
                </Text>
                <Pill tone={n.tone} dot={true}>
                  {t(n.labelKey)}
                </Pill>
              </Flex>
              <ItemName product={e} thumb={true} />
              <Text type={`secondary`}>
                {e.category}
                {` · `}
                {e.series}
                {` · `}
                {t(
                  SOURCING_META[e.sourcingType as keyof typeof SOURCING_META]
                    .labelKey,
                )}
              </Text>
              <Flex align={`baseline`} justify={`space-between`} gap={8}>
                <Text
                  style={{
                    fontWeight: 600,
                  }}
                >
                  {money(e.price)}
                </Text>
                <Text
                  style={{
                    color:
                      r === `out`
                        ? colors.error
                        : r === `low`
                          ? colors.warningText
                          : colors.textSecondary,
                  }}
                >
                  {`香港可用 ${sellable(e.stock)} · 大陸可用 ${e.stock.availableCN}`}
                  {r === `out` && ` · ${t(`products.card.out`)}`}
                  {r === `low` && ` · ${t(`products.card.low`)}`}
                </Text>
              </Flex>
            </Flex>
          </Card>
        );
      }}
    />
  );
}
