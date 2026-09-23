import { useMemo, useState } from 'react';
import {
  App,
  Button,
  Card,
  Col,
  Empty,
  Flex,
  Input,
  InputNumber,
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
import { SearchOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import { stockedProducts } from '../data/catalog';
import { createStockRequirements } from '../data/ops';
import { colors, useIsMobile } from '../theme';
import { onHand, sellable } from '../types';
import type { Product } from '../types';
import { Pill } from '../components/Pill';
import { CardList } from '../components/CardList';
import { ItemName, NameDisplaySwitch } from '../components/ItemName';
import { useTableHeight } from '../utils/useTableHeight';
import { useT } from '../i18n';
import type { MessageKey } from '../i18n';
import { useDensity } from '../utils/useDensity';
import type { Tone } from '../utils/tones';

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

const REMINDER_META: Record<Reminder, { labelKey: MessageKey; tone: Tone }> = {
  now: { labelKey: 'restock.reminder.now', tone: 'error' },
  soon: { labelKey: 'restock.reminder.soon', tone: 'warning' },
  covered: { labelKey: 'restock.reminder.covered', tone: 'brand' },
  ok: { labelKey: 'restock.reminder.ok', tone: 'success' },
};

const SOON_FACTOR = 1.5;

function reminder(p: Product, safety: number): Reminder {
  const avail = sellable(p.stock);
  if (avail <= safety) return p.stock.inTransit >= safety - avail + 1 ? 'covered' : 'now';
  if (avail < safety * SOON_FACTOR) return 'soon';
  return 'ok';
}

/** 補足到安全存量兩倍，減埋在途 */
const suggest = (p: Product, safety: number) => {
  const r = reminder(p, safety);
  if (r === 'ok' || r === 'covered') return 0;
  return Math.max(0, safety * 2 - sellable(p.stock) - p.stock.inTransit);
};

type Filter = Reminder | 'all';

export function RestockPage() {
  const { message } = App.useApp();
  const t = useT();
  const isMobile = useIsMobile();
  const { wc } = useDensity();
  const tableHeight = useTableHeight(470);

  /** sku → 改咗嘅安全存量。安全存量係真欄位，唔係推導，所以可以 inline 改。 */
  const [safety, setSafety] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState<Filter>('all');
  const [keyword, setKeyword] = useState('');
  const [selected, setSelected] = useState<React.Key[]>([]);

  const safetyOf = (p: Product) => safety[p.sku] ?? p.stock.safetyStock;

  const rows = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    const order: Reminder[] = ['now', 'soon', 'covered', 'ok'];
    return stockedProducts
      .filter((p) => {
        if (filter !== 'all' && reminder(p, safetyOf(p)) !== filter) return false;
        if (!kw) return true;
        return (
          p.sku.toLowerCase().includes(kw) ||
          p.name.toLowerCase().includes(kw) ||
          p.supplierName.toLowerCase().includes(kw) ||
          p.supplierCode.toLowerCase().includes(kw)
        );
      })
      .sort((a, b) => order.indexOf(reminder(a, safetyOf(a))) - order.indexOf(reminder(b, safetyOf(b))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, keyword, safety]);

  const stats = useMemo(() => {
    const c = { now: 0, soon: 0, covered: 0, ok: 0 };
    for (const p of stockedProducts) c[reminder(p, safetyOf(p))] += 1;
    return { total: stockedProducts.length, ...c };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safety]);

  const raise = () => {
    const items = stockedProducts
      .filter((p) => selected.includes(p.sku))
      .map((p) => ({ sku: p.sku, qty: Math.max(1, suggest(p, safetyOf(p))) }));
    const n = createStockRequirements(items);
    setSelected([]);
    message.success(t('restock.raised', { n }));
  };

  const num = (n: number, color?: string) => (
    <Text style={{ color, fontWeight: color ? 500 : undefined }}>{n}</Text>
  );

  const columns: TableColumnsType<Product> = [
    {
      title: 'SKU',
      dataIndex: 'sku',
      width: wc(110),
      fixed: 'left',
      render: (sku: string) => <Text style={{ fontWeight: 500 }}>{sku}</Text>,
    },
    { title: t('restock.col.item'), key: 'item', width: wc(300), render: (_, p) => <ItemName product={p} thumb /> },
    {
      title: t('restock.col.onHand'),
      key: 'onHand',
      width: wc(80),
      align: 'right',
      render: (_, p) => (
        <Tooltip title={t('restock.onHandHint', { main: p.stock.main, shop: p.stock.shop })}>
          {num(onHand(p.stock))}
        </Tooltip>
      ),
    },
    { title: t('restock.col.reserved'), key: 'reserved', width: wc(80), align: 'right', render: (_, p) => <Text type="secondary">{p.stock.reserved || '—'}</Text> },
    {
      title: t('restock.col.sellable'),
      key: 'sellable',
      width: wc(80),
      align: 'right',
      sorter: (a, b) => sellable(a.stock) - sellable(b.stock),
      render: (_, p) => {
        const r = reminder(p, safetyOf(p));
        return num(sellable(p.stock), r === 'now' ? colors.error : r === 'soon' ? colors.warningText : undefined);
      },
    },
    {
      title: t('restock.col.inTransit'),
      key: 'inTransit',
      width: wc(80),
      align: 'right',
      render: (_, p) => (p.stock.inTransit > 0 ? num(p.stock.inTransit, colors.primary) : <Text type="secondary">—</Text>),
    },
    {
      title: t('restock.col.safety'),
      key: 'safety',
      width: wc(110),
      align: 'right',
      render: (_, p) => (
        <InputNumber
          size="small"
          min={0}
          max={999}
          value={safetyOf(p)}
          onChange={(v) => v != null && setSafety((prev) => ({ ...prev, [p.sku]: v }))}
          style={{ width: 72 }}
        />
      ),
    },
    {
      title: t('restock.col.reminder'),
      key: 'reminder',
      width: wc(130),
      render: (_, p) => {
        const m = REMINDER_META[reminder(p, safetyOf(p))];
        return <Pill tone={m.tone} dot>{t(m.labelKey)}</Pill>;
      },
    },
    {
      title: t('restock.col.suggest'),
      key: 'suggest',
      width: wc(116),
      align: 'right',
      sorter: (a, b) => suggest(a, safetyOf(a)) - suggest(b, safetyOf(b)),
      render: (_, p) => {
        const n = suggest(p, safetyOf(p));
        return n === 0 ? <Text type="secondary">—</Text> : <Text style={{ fontWeight: 500 }}>{n}</Text>;
      },
    },
    {
      title: t('restock.col.supplier'),
      dataIndex: 'supplier',
      width: wc(150),
      responsive: ['xl'],
      render: (s: string) => <Text type="secondary" ellipsis>{s}</Text>,
    },
    {
      title: t('restock.col.countedAt'),
      key: 'countedAt',
      width: wc(100),
      responsive: ['xxl'],
      render: (_, p) => <Text type="secondary">{p.stock.countedAt}</Text>,
    },
  ];

  const filterOptions = [
    { value: 'all', label: t('common.all') },
    { value: 'now', label: t('restock.reminder.now') },
    { value: 'soon', label: t('restock.reminder.soon') },
    { value: 'covered', label: t('restock.reminder.covered') },
    { value: 'ok', label: t('restock.reminder.ok') },
  ];

  return (
    <Flex vertical gap={12}>
      <Flex align="center" justify="space-between" wrap gap={12}>
        <Flex vertical gap={2}>
          <Title level={1} style={{ margin: 0 }}>{t('restock.title')}</Title>
          <Text type="secondary">{t('restock.subtitle', { n: stats.total })}</Text>
        </Flex>
      </Flex>

      <Row gutter={[12, 12]}>
        {[
          { title: t('restock.stat.total'), value: stats.total },
          { title: t('restock.reminder.now'), value: stats.now, color: colors.error },
          { title: t('restock.reminder.soon'), value: stats.soon, color: colors.warningText },
          { title: t('restock.reminder.covered'), value: stats.covered, color: colors.primary },
        ].map((s) => (
          <Col key={s.title} xs={12} lg={6}>
            <Card size="small">
              <Statistic title={s.title} value={s.value} styles={{ content: { fontSize: 22, fontWeight: 600, color: s.value > 0 ? s.color : undefined } }} />
            </Card>
          </Col>
        ))}
      </Row>

      <Card
        styles={{ body: { paddingTop: 12 } }}
        title={
          isMobile ? (
            <Select value={filter} onChange={(v) => setFilter(v as Filter)} options={filterOptions} style={{ width: '100%' }} />
          ) : (
            <Segmented value={filter} onChange={(v) => setFilter(v as Filter)} options={filterOptions} />
          )
        }
        extra={!isMobile && <Text type="secondary">{t('common.filteredSku', { n: rows.length })}</Text>}
      >
        <Flex vertical gap={12}>
          <Flex gap={8} wrap align="center">
            <Input
              allowClear
              prefix={<SearchOutlined style={{ color: colors.textMuted }} />}
              placeholder={t('common.search.sku')}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              style={{ width: isMobile ? '100%' : 260 }}
            />
            <NameDisplaySwitch />
            <Text type="secondary" style={{ fontSize: 13 }}>{t('restock.hint')}</Text>
          </Flex>

          {selected.length > 0 && (
            <Flex align="center" justify="space-between" wrap gap={8} style={{ padding: '6px 12px', background: colors.primarySubtle, borderRadius: 6 }}>
              <Text>{t('common.selectedSku', { n: selected.length })}</Text>
              <Space>
                <Button size="small" type="primary" icon={<ShoppingCartOutlined />} onClick={raise}>
                  {t('restock.bulk.raise')}
                </Button>
                <Button size="small" type="text" onClick={() => setSelected([])}>{t('common.clear')}</Button>
              </Space>
            </Flex>
          )}

          {isMobile ? (
            <CardList
              items={rows}
              rowKey={(p) => p.sku}
              emptyText={t('common.emptySku')}
              renderItem={(p) => {
                const r = reminder(p, safetyOf(p));
                const m = REMINDER_META[r];
                const n = suggest(p, safetyOf(p));
                return (
                  <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
                    <Flex vertical gap={8}>
                      <Flex justify="space-between" align="center" gap={8}>
                        <Text style={{ fontWeight: 600 }}>{p.sku}</Text>
                        <Pill tone={m.tone} dot>{t(m.labelKey)}</Pill>
                      </Flex>
                      <ItemName product={p} thumb />
                      <Flex gap={12} wrap>
                        <Text style={{ fontWeight: 600, color: r === 'now' ? colors.error : r === 'soon' ? colors.warningText : undefined }}>
                          {t('restock.card.sellable', { n: sellable(p.stock) })}
                        </Text>
                        <Text type="secondary">{t('restock.card.onHand', { n: onHand(p.stock) })}</Text>
                        <Text type="secondary">{t('restock.card.safety', { n: safetyOf(p) })}</Text>
                        {p.stock.inTransit > 0 && <Text style={{ color: colors.primary }}>{t('restock.card.inTransit', { n: p.stock.inTransit })}</Text>}
                        {n > 0 && <Text style={{ fontWeight: 500 }}>{t('restock.card.suggest', { n })}</Text>}
                      </Flex>
                    </Flex>
                  </Card>
                );
              }}
            />
          ) : (
            <Table<Product>
              rowKey="sku"
              columns={columns}
              dataSource={rows}
              virtual
              scroll={{ x: wc(1100), y: tableHeight }}
              pagination={false}
              rowSelection={{ selectedRowKeys: selected, onChange: setSelected, columnWidth: wc(48) }}
              locale={{ emptyText: <Empty description={t('common.emptySku')} /> }}
            />
          )}
        </Flex>
      </Card>
    </Flex>
  );
}
