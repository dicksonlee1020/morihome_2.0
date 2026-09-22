import { useMemo, useState } from 'react';
import {
  App,
  Button,
  Card,
  Col,
  Flex,
  Input,
  Row,
  Segmented,
  Select,
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
  SearchOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import {
  CATEGORY_OPTIONS,
  PRODUCT_STATUS_META,
  SERIES,
  TOTAL_SKU,
  products as catalog,
} from '../data/catalog';
import { colors, useIsMobile } from '../theme';
import { amount, money, percent } from '../utils/format';
import { margin, sellable, stockState } from '../types';
import type { Product, ProductStatus } from '../types';
import { Pill } from '../components/Pill';
import { CardList } from '../components/CardList';
import { useTableHeight } from '../utils/useTableHeight';
import { useDensity } from '../utils/useDensity';

const { Text, Title } = Typography;

type StatusFilter = ProductStatus | 'all';

/** 毛利低過呢個數就標色，叫同事覆下個成本價 */
const MARGIN_FLOOR = 0.4;

export function ProductsPage() {
  const { message } = App.useApp();
  const isMobile = useIsMobile();
  const tableHeight = useTableHeight(470);
  const { w } = useDensity();

  const [status, setStatus] = useState<StatusFilter>('all');
  const [category, setCategory] = useState<string | undefined>();
  const [series, setSeries] = useState<string | undefined>();
  const [keyword, setKeyword] = useState('');
  const [outOnly, setOutOnly] = useState(false);
  const [selected, setSelected] = useState<React.Key[]>([]);

  const rows = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return catalog.filter((p) => {
      if (status !== 'all' && p.status !== status) return false;
      if (category && p.category !== category) return false;
      if (series && p.series !== series) return false;
      if (outOnly && sellable(p.stock) > 0) return false;
      if (!kw) return true;
      return (
        p.sku.toLowerCase().includes(kw) ||
        p.name.toLowerCase().includes(kw) ||
        p.variant.toLowerCase().includes(kw)
      );
    });
  }, [status, category, series, keyword, outOnly]);

  const stats = useMemo(() => {
    let active = 0;
    let draft = 0;
    let out = 0;
    let stockValue = 0;
    for (const p of catalog) {
      if (p.status === 'active') active++;
      if (p.status === 'draft') draft++;
      if (p.status === 'active' && sellable(p.stock) === 0) out++;
      stockValue += (p.stock.main + p.stock.shop) * p.cost;
    }
    return { active, draft, out, stockValue };
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
      title: '貨品名稱',
      dataIndex: 'name',
      width: w(230),
      render: (_, p) => (
        <Flex gap={6} align="baseline">
          <Text ellipsis>{p.name}</Text>
          <Text type="secondary" style={{ whiteSpace: 'nowrap' }}>
            {p.variant}
          </Text>
        </Flex>
      ),
    },
    { title: '分類', dataIndex: 'category', width: w(80) },
    { title: '系列', dataIndex: 'series', width: w(80) },
    {
      title: '供應商',
      dataIndex: 'supplier',
      width: w(140),
      responsive: ['xxl'],
      render: (s: string) => <Text type="secondary" ellipsis>{s}</Text>,
    },
    {
      title: '成本',
      dataIndex: 'cost',
      width: w(90),
      align: 'right',
      sorter: (a, b) => a.cost - b.cost,
      render: (c: number) => <Text type="secondary">{amount(c)}</Text>,
    },
    {
      title: '售價',
      dataIndex: 'price',
      width: w(90),
      align: 'right',
      sorter: (a, b) => a.price - b.price,
      render: (p: number) => <Text style={{ fontWeight: 500 }}>{amount(p)}</Text>,
    },
    {
      title: '毛利',
      key: 'margin',
      width: w(80),
      align: 'right',
      sorter: (a, b) => margin(a) - margin(b),
      render: (_, p) => {
        const m = margin(p);
        const thin = m < MARGIN_FLOOR;
        return (
          <Tooltip title={thin ? `低過 ${percent(MARGIN_FLOOR)}，覆下成本價` : undefined}>
            <Text style={{ color: thin ? colors.warningText : undefined, fontWeight: thin ? 500 : undefined }}>
              {percent(m)}
            </Text>
          </Tooltip>
        );
      },
    },
    {
      title: '可售',
      key: 'sellable',
      width: w(80),
      align: 'right',
      sorter: (a, b) => sellable(a.stock) - sellable(b.stock),
      render: (_, p) => {
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
      title: '狀態',
      dataIndex: 'status',
      width: w(90),
      render: (s: ProductStatus) => {
        const m = PRODUCT_STATUS_META[s];
        return <Pill tone={m.tone} dot>{m.label}</Pill>;
      },
    },
    {
      title: '最後更新',
      dataIndex: 'updatedAt',
      width: w(100),
      responsive: ['xl'],
      sorter: (a, b) => a.updatedAt.localeCompare(b.updatedAt),
      render: (d: string) => <Text type="secondary">{d}</Text>,
    },
  ];

  const toolbar = (
    <Flex gap={8} wrap>
      <Input
        allowClear
        prefix={<SearchOutlined style={{ color: colors.textMuted }} />}
        placeholder="搵 SKU 或貨品名"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        style={{ width: isMobile ? '100%' : 240 }}
      />
      <Select
        allowClear
        placeholder="分類"
        value={category}
        onChange={setCategory}
        options={CATEGORY_OPTIONS}
        style={{ width: isMobile ? '100%' : 130 }}
      />
      <Select
        allowClear
        placeholder="系列"
        value={series}
        onChange={setSeries}
        options={SERIES.map((s) => ({ value: s, label: s }))}
        style={{ width: isMobile ? '100%' : 120 }}
      />
      <Flex align="center" gap={8}>
        <Switch checked={outOnly} onChange={setOutOnly} size="small" />
        <Text type="secondary">只睇缺貨</Text>
      </Flex>
    </Flex>
  );

  return (
    <Flex vertical gap={12}>
      <Flex align="center" justify="space-between" wrap gap={12}>
        <Flex vertical gap={2}>
          <Title level={1} style={{ margin: 0 }}>
            產品
          </Title>
          <Text type="secondary">
            共 {TOTAL_SKU.toLocaleString('en-HK')} 個 SKU
          </Text>
        </Flex>
        <Space>
          <Button icon={<UploadOutlined />}>匯入 CSV</Button>
          <Button icon={<DownloadOutlined />}>匯出</Button>
          <Button type="primary" icon={<PlusOutlined />}>
            新增產品
          </Button>
        </Space>
      </Flex>

      <Row gutter={[12, 12]}>
        {[
          { title: '已上架', value: stats.active.toLocaleString('en-HK') },
          { title: '草稿', value: stats.draft.toLocaleString('en-HK') },
          { title: '已上架但缺貨', value: stats.out.toLocaleString('en-HK'), warn: true },
          { title: '庫存成本值', value: money(stats.stockValue) },
        ].map((s) => (
          <Col key={s.title} xs={12} lg={6}>
            <Card size="small">
              <Statistic
                title={s.title}
                value={s.value}
                styles={{
                  content: {
                    fontSize: 22,
                    fontWeight: 600,
                    color: s.warn ? colors.error : undefined,
                  },
                }}
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
              onChange={setStatus}
              style={{ width: '100%' }}
              options={[
                { value: 'all', label: '全部狀態' },
                ...Object.entries(PRODUCT_STATUS_META).map(([v, m]) => ({
                  value: v,
                  label: m.label,
                })),
              ]}
            />
          ) : (
            <Segmented
              value={status}
              onChange={(v) => setStatus(v as StatusFilter)}
              options={[
                { value: 'all', label: '全部' },
                ...Object.entries(PRODUCT_STATUS_META).map(([v, m]) => ({
                  value: v,
                  label: m.label,
                })),
              ]}
            />
          )
        }
        extra={
          !isMobile && (
            <Text type="secondary">
              篩選後 {rows.length.toLocaleString('en-HK')} 個 SKU
            </Text>
          )
        }
      >
        <Flex vertical gap={12}>
          {toolbar}

          {selected.length > 0 && (
            <Flex
              align="center"
              justify="space-between"
              wrap
              gap={8}
              style={{
                padding: '6px 12px',
                background: colors.primarySubtle,
                borderRadius: 6,
              }}
            >
              <Text>已揀 {selected.length} 個 SKU</Text>
              <Space>
                <Button size="small" onClick={() => message.success(`已上架 ${selected.length} 個 SKU`)}>
                  批量上架
                </Button>
                <Button size="small" onClick={() => message.success(`已下架 ${selected.length} 個 SKU`)}>
                  批量下架
                </Button>
                <Button size="small" onClick={() => message.info('改價面板未接後台')}>
                  批量改價
                </Button>
                <Button size="small" type="text" onClick={() => setSelected([])}>
                  清除
                </Button>
              </Space>
            </Flex>
          )}

          {isMobile ? (
            <ProductCards products={rows} />
          ) : (
            <Table<Product>
              rowKey="sku"
              columns={columns}
              dataSource={rows}
              // 5,241 行唔用虛擬捲動會卡；虛擬捲動就冇分頁，改為固定高度捲
              virtual
              scroll={{ x: w(1000), y: tableHeight }}
              pagination={false}
              rowSelection={{
                selectedRowKeys: selected,
                onChange: setSelected,
                // antd 預設 32px，舒適模式 padding 一大就切到個 checkbox
                columnWidth: w(40),
              }}
            />
          )}
        </Flex>
      </Card>
    </Flex>
  );
}

/** 手機版：密集表格喺 390px 完全用唔到，改用卡 */
function ProductCards({ products }: { products: Product[] }) {
  return (
    <CardList
      items={products}
      rowKey={(p) => p.sku}
      emptyText="冇符合條件嘅 SKU"
      renderItem={(p) => {
        const meta = PRODUCT_STATUS_META[p.status];
        const state = stockState(p.stock);
        return (
            <Card size="small" style={{ width: '100%' }}>
              <Flex vertical gap={8}>
                <Flex align="center" justify="space-between" gap={8}>
                  <Text style={{ fontWeight: 600 }}>{p.sku}</Text>
                  <Pill tone={meta.tone} dot>
                    {meta.label}
                  </Pill>
                </Flex>
                <Flex vertical gap={2}>
                  <Text>
                    {p.name} · {p.variant}
                  </Text>
                  <Text type="secondary">
                    {p.category} · {p.series}
                  </Text>
                </Flex>
                <Flex align="baseline" justify="space-between" gap={8}>
                  <Text style={{ fontWeight: 600 }}>{money(p.price)}</Text>
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
                    可售 {sellable(p.stock)}
                    {state === 'out' && ' · 缺貨'}
                    {state === 'low' && ' · 偏低'}
                  </Text>
                </Flex>
              </Flex>
            </Card>
        );
      }}
    />
  );
}
