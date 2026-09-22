import { useMemo, useState } from 'react';
import {
  App,
  Button,
  Card,
  Col,
  Flex,
  Form,
  Input,
  InputNumber,
  Modal,
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
import { DownloadOutlined, SearchOutlined, SlidersOutlined } from '@ant-design/icons';
import { CATEGORY_OPTIONS, products as catalog } from '../data/catalog';
import { colors, useIsMobile } from '../theme';
import { amount, money } from '../utils/format';
import { onHand, sellable, stockState } from '../types';
import type { Product, StockState } from '../types';
import { Pill } from '../components/Pill';
import { CardList } from '../components/CardList';
import { useTableHeight } from '../utils/useTableHeight';
import { useDensity } from '../utils/useDensity';
import type { Tone } from '../utils/tones';

const { Text, Title } = Typography;

/**
 * label 係表格入面用嘅短文案 —— 密集模式一欄得 96px，
 * 「低於安全存量」六個字入唔到，會被右邊固定欄切走。
 * 長文案留畀篩選列同 tooltip。
 */
const STOCK_META: Record<
  StockState,
  { label: string; long: string; tone: Tone }
> = {
  out: { label: '缺貨', long: '缺貨', tone: 'error' },
  low: { label: '偏低', long: '低於安全存量', tone: 'warning' },
  ok: { label: '正常', long: '正常', tone: 'success' },
};

const ADJUST_REASONS = [
  '盤點更正',
  '損壞報廢',
  '客退回倉',
  '調撥去門市',
  '供應商補貨',
];

type StateFilter = StockState | 'all';

/** 建議補到安全存量嘅兩倍，減埋已經喺路上嘅數 */
const suggestRestock = (p: Product) => {
  // 夠貨就唔好嘈。只有跌穿安全存量先至建議補。
  if (stockState(p.stock) === 'ok') return 0;
  const target = p.stock.safetyStock * 2;
  return Math.max(0, target - sellable(p.stock) - p.stock.inTransit);
};

export function InventoryPage() {
  const { message } = App.useApp();
  const isMobile = useIsMobile();
  const tableHeight = useTableHeight(470);
  const { w } = useDensity();

  /** sku → 新嘅葵涌倉在倉數。淨係記改動過嘅，唔使抄成 5,241 件落 state。 */
  const [adjusted, setAdjusted] = useState<Record<string, number>>({});
  const [state, setState] = useState<StateFilter>('all');
  const [category, setCategory] = useState<string | undefined>();
  const [keyword, setKeyword] = useState('');
  const [selected, setSelected] = useState<React.Key[]>([]);
  const [editing, setEditing] = useState<Product | null>(null);

  const items = useMemo(
    () =>
      catalog.map((p) =>
        adjusted[p.sku] === undefined
          ? p
          : { ...p, stock: { ...p.stock, main: adjusted[p.sku] } }
      ),
    [adjusted]
  );

  const rows = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return items.filter((p) => {
      if (state !== 'all' && stockState(p.stock) !== state) return false;
      if (category && p.category !== category) return false;
      if (!kw) return true;
      return (
        p.sku.toLowerCase().includes(kw) || p.name.toLowerCase().includes(kw)
      );
    });
  }, [items, state, category, keyword]);

  const stats = useMemo(() => {
    let out = 0;
    let low = 0;
    let inTransit = 0;
    let value = 0;
    for (const p of items) {
      const s = stockState(p.stock);
      if (s === 'out') out++;
      if (s === 'low') low++;
      if (p.stock.inTransit > 0) inTransit++;
      value += onHand(p.stock) * p.cost;
    }
    return { out, low, inTransit, value };
  }, [items]);

  const numeric = (n: number, tone?: string) => (
    <Text style={{ color: tone, fontWeight: tone ? 500 : undefined }}>{n}</Text>
  );

  const columns: TableColumnsType<Product> = [
    {
      title: 'SKU',
      dataIndex: 'sku',
      width: w(120),
      fixed: 'left',
      render: (sku: string) => <Text style={{ fontWeight: 500 }}>{sku}</Text>,
    },
    {
      title: '貨品',
      dataIndex: 'name',
      width: w(220),
      render: (_, p) => (
        <Flex gap={6} align="baseline">
          <Text ellipsis>{p.name}</Text>
          <Text type="secondary" style={{ whiteSpace: 'nowrap' }}>
            {p.variant}
          </Text>
        </Flex>
      ),
    },
    { title: '分類', dataIndex: 'category', width: w(76), responsive: ['lg'] },
    {
      title: '葵涌倉',
      key: 'main',
      width: w(78),
      align: 'right',
      sorter: (a, b) => a.stock.main - b.stock.main,
      render: (_, p) => numeric(p.stock.main),
    },
    {
      title: '門市',
      key: 'shop',
      width: w(66),
      align: 'right',
      render: (_, p) => numeric(p.stock.shop),
    },
    {
      title: '已預留',
      key: 'reserved',
      width: w(74),
      align: 'right',
      render: (_, p) => (
        <Text type="secondary">{p.stock.reserved || '—'}</Text>
      ),
    },
    {
      title: '可售',
      key: 'sellable',
      width: w(74),
      align: 'right',
      sorter: (a, b) => sellable(a.stock) - sellable(b.stock),
      render: (_, p) => {
        const s = stockState(p.stock);
        return numeric(
          sellable(p.stock),
          s === 'out' ? colors.error : s === 'low' ? colors.warningText : undefined
        );
      },
    },
    {
      title: '在途',
      key: 'inTransit',
      width: w(66),
      align: 'right',
      render: (_, p) =>
        p.stock.inTransit > 0 ? (
          <Text style={{ color: colors.primary }}>{p.stock.inTransit}</Text>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: '安全存量',
      key: 'safety',
      width: w(82),
      align: 'right',
      render: (_, p) => <Text type="secondary">{p.stock.safetyStock}</Text>,
    },
    {
      title: '建議補貨',
      key: 'restock',
      width: w(88),
      align: 'right',
      sorter: (a, b) => suggestRestock(a) - suggestRestock(b),
      render: (_, p) => {
        const n = suggestRestock(p);
        if (n === 0) return <Text type="secondary">—</Text>;
        return (
          <Tooltip title={`補到安全存量兩倍（${p.stock.safetyStock * 2}），已計在途`}>
            <Text style={{ fontWeight: 500 }}>{n}</Text>
          </Tooltip>
        );
      },
    },
    {
      title: '狀態',
      key: 'state',
      width: w(96),
      render: (_, p) => {
        const m = STOCK_META[stockState(p.stock)];
        return (
          <Tooltip title={m.long !== m.label ? m.long : undefined}>
            <span>
              <Pill tone={m.tone} dot>
                {m.label}
              </Pill>
            </span>
          </Tooltip>
        );
      },
    },
    {
      title: '最後盤點',
      key: 'countedAt',
      width: w(96),
      responsive: ['xxl'],
      render: (_, p) => <Text type="secondary">{p.stock.countedAt}</Text>,
    },
    {
      title: '',
      key: 'action',
      width: w(64),
      fixed: 'right',
      align: 'center',
      render: (_, p) => (
        <Tooltip title="調整庫存">
          <Button
            type="text"
            size="small"
            icon={<SlidersOutlined />}
            onClick={() => setEditing(p)}
          />
        </Tooltip>
      ),
    },
  ];

  const segmentOptions = [
    { value: 'all', label: '全部' },
    { value: 'out', label: '缺貨' },
    { value: 'low', label: '低於安全存量' },
    { value: 'ok', label: '正常' },
  ];

  return (
    <Flex vertical gap={12}>
      <Flex align="center" justify="space-between" wrap gap={12}>
        <Flex vertical gap={2}>
          <Title level={1} style={{ margin: 0 }}>
            庫存
          </Title>
          <Text type="secondary">葵涌倉 + 門市</Text>
        </Flex>
        <Space>
          <Button icon={<DownloadOutlined />}>匯出盤點表</Button>
          <Button type="primary" onClick={() => message.info('盤點流程未接後台')}>
            開始盤點
          </Button>
        </Space>
      </Flex>

      <Row gutter={[12, 12]}>
        {[
          { title: '缺貨 SKU', value: stats.out, warn: true },
          { title: '低於安全存量', value: stats.low, caution: true },
          { title: '有貨在途', value: stats.inTransit },
          { title: '庫存成本值', value: money(stats.value) },
        ].map((s) => (
          <Col key={s.title} xs={12} lg={6}>
            <Card size="small">
              <Statistic
                title={s.title}
                value={typeof s.value === 'number' ? s.value.toLocaleString('en-HK') : s.value}
                styles={{
                  content: {
                    fontSize: 22,
                    fontWeight: 600,
                    color: s.warn
                      ? colors.error
                      : s.caution
                        ? colors.warningText
                        : undefined,
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
              value={state}
              onChange={(v) => setState(v as StateFilter)}
              options={segmentOptions}
              style={{ width: '100%' }}
            />
          ) : (
            <Segmented
              value={state}
              onChange={(v) => setState(v as StateFilter)}
              options={segmentOptions}
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
          </Flex>

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
                <Button
                  size="small"
                  onClick={() => message.success(`已為 ${selected.length} 個 SKU 建立補貨單`)}
                >
                  建立補貨單
                </Button>
                <Button size="small" type="text" onClick={() => setSelected([])}>
                  清除
                </Button>
              </Space>
            </Flex>
          )}

          {isMobile ? (
            <StockCards items={rows} onAdjust={setEditing} />
          ) : (
            <Table<Product>
              rowKey="sku"
              columns={columns}
              dataSource={rows}
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

      <AdjustModal
        product={editing}
        onClose={() => setEditing(null)}
        onSave={(sku, qty, reason) => {
          setAdjusted((prev) => ({ ...prev, [sku]: qty }));
          setEditing(null);
          message.success(`${sku} 葵涌倉改為 ${qty} 件（${reason}）`);
        }}
      />
    </Flex>
  );
}

function AdjustModal({
  product,
  onClose,
  onSave,
}: {
  product: Product | null;
  onClose: () => void;
  onSave: (sku: string, qty: number, reason: string) => void;
}) {
  const [form] = Form.useForm<{ qty: number; reason: string; note?: string }>();

  return (
    <Modal
      title={product ? `調整庫存 · ${product.sku}` : '調整庫存'}
      open={product != null}
      onCancel={onClose}
      okText="儲存"
      cancelText="取消"
      destroyOnHidden
      onOk={() =>
        form.validateFields().then((v) => {
          if (product) onSave(product.sku, v.qty, v.reason);
        })
      }
    >
      {product && (
        <Form
          form={form}
          layout="vertical"
          initialValues={{ qty: product.stock.main, reason: ADJUST_REASONS[0] }}
        >
          <Text type="secondary">
            {product.name} · {product.variant}
          </Text>
          <Flex gap={16} style={{ margin: '12px 0' }}>
            <Text type="secondary">門市 {product.stock.shop}</Text>
            <Text type="secondary">已預留 {product.stock.reserved}</Text>
            <Text type="secondary">在途 {product.stock.inTransit}</Text>
            <Text type="secondary">安全存量 {product.stock.safetyStock}</Text>
          </Flex>
          <Form.Item
            name="qty"
            label="葵涌倉在倉數"
            rules={[{ required: true, message: '要填返個數' }]}
          >
            <InputNumber min={0} max={99999} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="reason" label="原因" rules={[{ required: true }]}>
            <Select options={ADJUST_REASONS.map((r) => ({ value: r, label: r }))} />
          </Form.Item>
          <Form.Item name="note" label="備註">
            <Input.TextArea rows={2} placeholder="例如邊個櫃位、邊張單" />
          </Form.Item>
        </Form>
      )}
    </Modal>
  );
}

function StockCards({
  items,
  onAdjust,
}: {
  items: Product[];
  onAdjust: (p: Product) => void;
}) {
  return (
    <CardList
      items={items}
      rowKey={(p) => p.sku}
      emptyText="冇符合條件嘅 SKU"
      renderItem={(p) => {
        const s = stockState(p.stock);
        const meta = STOCK_META[s];
        const restock = suggestRestock(p);
        return (
            <Card size="small" style={{ width: '100%' }}>
              <Flex vertical gap={8}>
                <Flex align="center" justify="space-between" gap={8}>
                  <Text style={{ fontWeight: 600 }}>{p.sku}</Text>
                  <Pill tone={meta.tone} dot>
                    {meta.long}
                  </Pill>
                </Flex>
                <Text>
                  {p.name} · {p.variant}
                </Text>
                <Flex gap={16} wrap>
                  <Text
                    style={{
                      fontWeight: 600,
                      color:
                        s === 'out'
                          ? colors.error
                          : s === 'low'
                            ? colors.warningText
                            : undefined,
                    }}
                  >
                    可售 {sellable(p.stock)}
                  </Text>
                  <Text type="secondary">倉 {p.stock.main}</Text>
                  <Text type="secondary">門市 {p.stock.shop}</Text>
                  <Text type="secondary">預留 {p.stock.reserved}</Text>
                  {p.stock.inTransit > 0 && (
                    <Text style={{ color: colors.primary }}>在途 {p.stock.inTransit}</Text>
                  )}
                </Flex>
                <Flex align="center" justify="space-between" gap={8}>
                  <Text type="secondary">
                    安全存量 {p.stock.safetyStock}
                    {restock > 0 && ` · 建議補 ${amount(restock)}`}
                  </Text>
                  <Button size="small" icon={<SlidersOutlined />} onClick={() => onAdjust(p)}>
                    調整
                  </Button>
                </Flex>
              </Flex>
            </Card>
        );
      }}
    />
  );
}
