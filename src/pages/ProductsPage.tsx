import { useMemo, useState } from 'react';
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
import type { TableColumnsType } from 'antd';
import {
  DownloadOutlined,
  PlusOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import {
  CATEGORY_OPTIONS,
  PRODUCT_STATUS_META,
  SERIES,
  TOTAL_SKU,
  products as catalog,
} from '../data/catalog';
import { colors } from '../theme';
import { fmtDate } from '../utils/date';
import { amount, money, percent } from '../utils/format';
import { margin, sellable, stockState } from '../types';
import type { Product, ProductStatus, SourcingType } from '../types';
import { Pill } from '../components/Pill';
import { CardList } from '../components/CardList';
import { FilterChip } from '../components/FilterChip';
import { DataTableCard } from '../components/DataTableCard';
import { useTablePagination } from '../utils/useTablePagination';
import { useMockLoading } from '../utils/useMockLoading';
import { ItemName, NameDisplaySwitch } from '../components/ItemName';
import { useT } from '../i18n';
import { useAuth } from '../auth';
import { canSee } from '../config/permissions';
import type { MessageKey } from '../i18n';
import { useDensity } from '../utils/useDensity';
import type { Tone } from '../utils/tones';

const { Text, Title } = Typography;

/** 毛利低過呢個數就標色，叫同事覆下個成本價 */
const MARGIN_FLOOR = 0.4;

const SOURCING_META: Record<SourcingType, { labelKey: MessageKey; tone: Tone }> = {
  stocked: { labelKey: 'products.sourcing.stocked', tone: 'brand' },
  orderOnDemand: { labelKey: 'products.sourcing.orderOnDemand', tone: 'muted' },
  custom: { labelKey: 'products.sourcing.custom', tone: 'warning' },
};

export function ProductsPage() {
  const { message } = App.useApp();
  const t = useT();
  const { w } = useDensity();
  const { user } = useAuth();
  // §9.5 FIELD_CLASS COST：成本、毛利只有 owner / finance 見到；server 序列化層剝除，呢度只係收埋欄
  const showCost = canSee(user?.role ?? 'content', 'COST');

  const [statuses, setStatuses] = useState<ProductStatus[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [seriesSel, setSeriesSel] = useState<string[]>([]);
  const [keyword, setKeyword] = useState('');
  const [stockedOnly, setStockedOnly] = useState(false);
  const [selected, setSelected] = useState<React.Key[]>([]);

  const rows = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return catalog.filter((p) => {
      if (statuses.length > 0 && !statuses.includes(p.status)) return false;
      if (categories.length > 0 && !categories.includes(p.category)) return false;
      if (seriesSel.length > 0 && !seriesSel.includes(p.series)) return false;
      if (stockedOnly && p.sourcingType !== 'stocked') return false;
      if (!kw) return true;
      // 兩個名都搜得到（B-07）：出街名、廠家名、廠家型號
      return (
        p.sku.toLowerCase().includes(kw) ||
        p.name.toLowerCase().includes(kw) ||
        p.variant.toLowerCase().includes(kw) ||
        p.supplierName.toLowerCase().includes(kw) ||
        p.supplierCode.toLowerCase().includes(kw)
      );
    });
  }, [statuses, categories, seriesSel, keyword, stockedOnly]);

  const loading = useMockLoading();
  const pagination = useTablePagination(rows.length);

  const stats = useMemo(() => {
    let active = 0;
    let draft = 0;
    let stocked = 0;
    let stockValue = 0;
    for (const p of catalog) {
      if (p.status === 'active') active++;
      if (p.status === 'draft') draft++;
      if (p.sourcingType === 'stocked') stocked++;
      stockValue += (p.stock.main + p.stock.shop) * p.cost;
    }
    return { active, draft, stocked, stockValue };
  }, []);

  const columns: TableColumnsType<Product> = [
    {
      title: 'SKU',
      dataIndex: 'sku',
      width: w(120),
      fixed: 'left',
      // 唔用 Button：controlHeight 會撐高每一行，密集模式就白做
      render: (sku: string) => (
        <Text style={{ color: colors.primary, fontWeight: 500, cursor: 'pointer' }}>
          {sku}
        </Text>
      ),
    },
    {
      title: t('products.col.name'),
      dataIndex: 'name',
      width: w(300),
      render: (_, p) => <ItemName product={p} thumb />,
    },
    { title: t('common.category'), dataIndex: 'category', width: w(80) },
    { title: t('products.col.series'), dataIndex: 'series', width: w(80), responsive: ['xl'] },
    {
      title: t('products.col.supplier'),
      dataIndex: 'supplier',
      width: w(140),
      responsive: ['xxl'],
      render: (s: string) => <Text type="secondary" ellipsis>{s}</Text>,
    },
    {
      title: t('products.col.sourcing'),
      dataIndex: 'sourcingType',
      width: w(90),
      render: (s: SourcingType) => {
        const m = SOURCING_META[s];
        return <Pill tone={m.tone}>{t(m.labelKey)}</Pill>;
      },
    },
    ...((showCost ? [{
      title: t('products.col.cost'),
      dataIndex: 'cost',
      width: w(90),
      align: 'right',
      sorter: (a, b) => a.cost - b.cost,
      render: (c: number) => <Text type="secondary" style={{ fontVariantNumeric: 'tabular-nums' }}>{amount(c)}</Text>,
    }] : []) as TableColumnsType<Product>),
    {
      title: t('products.col.price'),
      dataIndex: 'price',
      width: w(90),
      align: 'right',
      sorter: (a, b) => a.price - b.price,
      render: (p: number) => <Text style={{ fontWeight: 500 }}>{amount(p)}</Text>,
    },
    ...((showCost ? [{
      title: t('products.col.margin'),
      key: 'margin',
      width: w(80),
      align: 'right',
      sorter: (a, b) => margin(a) - margin(b),
      render: (_, p) => {
        const m = margin(p);
        const thin = m < MARGIN_FLOOR;
        return (
          <Tooltip title={thin ? t('products.marginHint', { floor: percent(MARGIN_FLOOR) }) : undefined}>
            <Text style={{ color: thin ? colors.warningText : undefined, fontWeight: thin ? 500 : undefined }}>
              {percent(m)}
            </Text>
          </Tooltip>
        );
      },
    }] : []) as TableColumnsType<Product>),
    {
      title: t('products.col.sellable'),
      key: 'sellable',
      width: w(80),
      align: 'right',
      sorter: (a, b) => sellable(a.stock) - sellable(b.stock),
      render: (_, p) => {
        // 只有儲定貨款先有「可售」呢個數；其餘款見貨賣貨（B-05）
        if (p.sourcingType !== 'stocked') return <Text type="secondary">—</Text>;
        const n = sellable(p.stock);
        const state = stockState(p.stock);
        return (
          <Text
            style={{
              color: state === 'out' ? colors.error : state === 'low' ? colors.warningText : undefined,
              fontWeight: state === 'ok' ? undefined : 500,
            }}
          >
            {n}
          </Text>
        );
      },
    },
    {
      title: t('common.status'),
      dataIndex: 'status',
      width: w(90),
      render: (s: ProductStatus) => {
        const m = PRODUCT_STATUS_META[s];
        return <Pill tone={m.tone} dot>{t(m.labelKey)}</Pill>;
      },
    },
    {
      title: t('products.col.updatedAt'),
      dataIndex: 'updatedAt',
      width: w(100),
      responsive: ['xl'],
      sorter: (a, b) => a.updatedAt.localeCompare(b.updatedAt),
      render: (d: string) => <Text type="secondary">{fmtDate(d)}</Text>,
    },
  ];

  const filtered = statuses.length > 0 || categories.length > 0 || seriesSel.length > 0 || stockedOnly || keyword !== '';
  const clearFilters = () => {
    setStatuses([]);
    setCategories([]);
    setSeriesSel([]);
    setStockedOnly(false);
    setKeyword('');
  };

  const statusOptions = (Object.keys(PRODUCT_STATUS_META) as ProductStatus[]).map((v) => ({
    value: v,
    label: <Pill tone={PRODUCT_STATUS_META[v].tone} dot>{t(PRODUCT_STATUS_META[v].labelKey)}</Pill>,
  }));

  return (
    <Flex vertical gap={12}>
      <Flex align="center" justify="space-between" wrap gap={12}>
        <Flex vertical gap={2}>
          <Title level={1} style={{ margin: 0 }}>
            {t('products.title')}
          </Title>
          <Text type="secondary">
            {t('products.subtitle', { n: TOTAL_SKU.toLocaleString('en-HK') })}
          </Text>
        </Flex>
        <Space>
          <Button icon={<UploadOutlined />}>{t('products.importCsv')}</Button>
          <Button icon={<DownloadOutlined />}>{t('common.export')}</Button>
          <Button type="primary" icon={<PlusOutlined />}>
            {t('products.new')}
          </Button>
        </Space>
      </Flex>

      <Row gutter={[12, 12]}>
        {[
          { title: t('products.stat.active'), value: stats.active.toLocaleString('en-HK') },
          { title: t('products.stat.draft'), value: stats.draft.toLocaleString('en-HK') },
          { title: t('products.stat.stocked'), value: stats.stocked.toLocaleString('en-HK') },
          { title: t('products.stat.stockValue'), value: showCost ? money(stats.stockValue) : '—' },
        ].map((s) => (
          <Col key={s.title} xs={12} lg={6}>
            <Card size="small">
              <Statistic
                title={s.title}
                value={s.value}
                styles={{ content: { fontSize: 22, fontWeight: 600 } }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <DataTableCard
        filters={
          <>
            <FilterChip label={t('products.filter.status')} options={statusOptions} value={statuses} onChange={setStatuses} />
            <FilterChip
              label={t('products.filter.category')}
              options={CATEGORY_OPTIONS.map((c) => ({ value: c.value, label: c.label }))}
              value={categories}
              onChange={setCategories}
            />
            <FilterChip
              label={t('products.filter.series')}
              options={SERIES.map((v) => ({ value: v, label: v }))}
              value={seriesSel}
              onChange={setSeriesSel}
            />
            <Flex align="center" gap={8} style={{ paddingInline: 4 }}>
              <Switch checked={stockedOnly} onChange={setStockedOnly} size="small" />
              <Text type="secondary">{t('products.stockedOnly')}</Text>
            </Flex>
          </>
        }
        onClearFilters={filtered ? clearFilters : undefined}
        search={{ value: keyword, onChange: setKeyword, placeholder: t('common.search.sku') }}
        extra={<NameDisplaySwitch />}
        count={t('common.filteredSku', { n: rows.length.toLocaleString('en-HK') })}
        selection={{
          count: selected.length,
          text: t('common.selectedSku', { n: selected.length }),
          actions: (
            <>
              <Button size="small" onClick={() => message.success(t('products.bulk.published', { n: selected.length }))}>
                {t('products.bulk.publish')}
              </Button>
              <Button size="small" onClick={() => message.success(t('products.bulk.unpublished', { n: selected.length }))}>
                {t('products.bulk.unpublish')}
              </Button>
              <Button size="small" onClick={() => message.info(t('products.bulk.repriceDemo'))}>
                {t('products.bulk.reprice')}
              </Button>
            </>
          ),
          onClear: () => setSelected([]),
        }}
        mobile={<ProductCards products={rows} />}
      >
        <Table<Product>
          loading={loading}
          rowKey="sku"
          columns={columns}
          dataSource={rows}
          pagination={pagination}
          scroll={{ x: w(1000) }}
          rowSelection={{
            selectedRowKeys: selected,
            onChange: setSelected,
            columnWidth: w(40),
          }}
        />
      </DataTableCard>
    </Flex>
  );
}

/** 手機版：密集表格喺 390px 完全用唔到，改用卡 */
function ProductCards({ products }: { products: Product[] }) {
  const t = useT();
  return (
    <CardList
      items={products}
      rowKey={(p) => p.sku}
      emptyText={t('common.emptySku')}
      renderItem={(p) => {
        const meta = PRODUCT_STATUS_META[p.status];
        const state = stockState(p.stock);
        return (
            <Card size="small" style={{ width: '100%' }}>
              <Flex vertical gap={8}>
                <Flex align="center" justify="space-between" gap={8}>
                  <Text style={{ fontWeight: 600 }}>{p.sku}</Text>
                  <Pill tone={meta.tone} dot>
                    {t(meta.labelKey)}
                  </Pill>
                </Flex>
                <ItemName product={p} thumb />
                <Text type="secondary">
                  {p.category} · {p.series} · {t(SOURCING_META[p.sourcingType].labelKey)}
                </Text>
                <Flex align="baseline" justify="space-between" gap={8}>
                  <Text style={{ fontWeight: 600 }}>{money(p.price)}</Text>
                  {p.sourcingType === 'stocked' && (
                    <Text
                      style={{
                        color:
                          state === 'out'
                            ? colors.error
                            : state === 'low'
                              ? colors.warningText
                              : colors.textSecondary,
                      }}
                    >
                      {t('products.card.sellable', { n: sellable(p.stock) })}
                      {state === 'out' && ` · ${t('products.card.out')}`}
                      {state === 'low' && ` · ${t('products.card.low')}`}
                    </Text>
                  )}
                </Flex>
              </Flex>
            </Card>
        );
      }}
    />
  );
}
