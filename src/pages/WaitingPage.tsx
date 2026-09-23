import { useMemo, useState } from 'react';
import {
  App,
  Button,
  Card,
  Col,
  Collapse,
  Empty,
  Flex,
  Modal,
  Progress,
  Row,
  Space,
  Statistic,
  Table,
  Typography,
  Upload,
} from 'antd';
import type { TableColumnsType } from 'antd';
import { ExperimentOutlined, UploadOutlined } from '@ant-design/icons';
import {
  applyShipment,
  demoShipmentRows,
  matchShipment,
  parseShipmentText,
  productOf,
  useOps,
  waitingGroups,
} from '../data/ops';
import type { Pkg, ShipmentResult, WaitingGroup } from '../data/ops';
import type { LocationKey } from '../domain/types';
import { colors, useIsMobile } from '../theme';
import { Pill } from '../components/Pill';
import { CardList } from '../components/CardList';
import { FilterChip } from '../components/FilterChip';
import { DataTableCard } from '../components/DataTableCard';
import { useTablePagination } from '../utils/useTablePagination';
import { ItemName, NameDisplaySwitch } from '../components/ItemName';
import { useT } from '../i18n';
import type { MessageKey } from '../i18n';
import { useDensity } from '../utils/useDensity';
import type { Tone } from '../utils/tones';

const { Text, Title } = Typography;

/**
 * 庫存等候（Ocean feedback B-03 / B-04）。
 * 已落單、廠未發齊嘅訂單。按訂單收埋，右邊一眼睇到幾件發咗；爆開先見件貨。
 * 上載廠家發貨表 → 對包件編碼 → 每件開一張 move → 燈自動著。
 */
const LOCATION_META: Partial<Record<LocationKey, { labelKey: MessageKey; tone: Tone }>> = {
  supplier: { labelKey: 'waiting.loc.supplier', tone: 'muted' },
  cnWarehouse: { labelKey: 'waiting.loc.cnWarehouse', tone: 'brand' },
  transit: { labelKey: 'waiting.loc.transit', tone: 'success' },
};

type WaitState = 'none' | 'partial' | 'shipped';
const stateOf = (g: WaitingGroup): WaitState => (g.allShipped ? 'shipped' : g.shipped === 0 ? 'none' : 'partial');

export function WaitingPage() {
  const { message } = App.useApp();
  const t = useT();
  const isMobile = useIsMobile();
  const { wc } = useDensity();
  const ops = useOps();

  const [states, setStates] = useState<WaitState[]>([]);
  const [keyword, setKeyword] = useState('');
  const [result, setResult] = useState<ShipmentResult | null>(null);

  const groups = useMemo(() => waitingGroups(ops), [ops]);

  const rows = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return groups.filter((g) => {
      if (states.length > 0 && !states.includes(stateOf(g))) return false;
      if (!kw) return true;
      return (
        g.orderNo.toLowerCase().includes(kw) ||
        g.customer.alias.includes(kw) ||
        g.purchaseOrder.batchNo.includes(kw) ||
        (g.purchaseOrder.supplierOrderNo?.toLowerCase().includes(kw) ?? false) ||
        g.lines.some((l) => {
          const p = productOf(l.sku);
          return (
            l.sku.toLowerCase().includes(kw) ||
            (p?.name.toLowerCase().includes(kw) ?? false) ||
            (p?.supplierName.toLowerCase().includes(kw) ?? false) ||
            l.packages.some((k) => k.packageCode.toLowerCase().includes(kw))
          );
        })
      );
    });
  }, [groups, states, keyword]);

  const pagination = useTablePagination(rows.length);

  const stats = useMemo(() => {
    let pkgs = 0;
    let shipped = 0;
    let done = 0;
    let overdue = 0;
    for (const g of groups) {
      pkgs += g.total;
      shipped += g.shipped;
      if (g.allShipped) done += 1;
      if (!g.allShipped && g.estimatedReady && g.estimatedReady < '2026-09-22') overdue += 1;
    }
    return { orders: groups.length, pkgs, shipped, done, overdue };
  }, [groups]);

  const onFile = (file: File) => {
    file.text().then((text) => {
      const parsed = parseShipmentText(text);
      if (parsed.length === 0) {
        message.error(t('waiting.upload.unreadable'));
        return;
      }
      setResult(matchShipment(parsed));
    });
    return false;
  };

  const apply = () => {
    if (!result) return;
    const n = applyShipment(result);
    setResult(null);
    message.success(t('waiting.upload.applied', { n }));
  };

  const progress = (g: WaitingGroup) => (
    <Flex vertical gap={2} style={{ minWidth: 150 }}>
      <Flex justify="space-between" align="baseline">
        <Text style={{ fontWeight: 500, color: g.allShipped ? colors.success : undefined }}>
          {t('waiting.progress', { shipped: g.shipped, total: g.total })}
        </Text>
        <Text type="secondary" style={{ fontSize: 13 }}>
          {g.allShipped ? t('waiting.state.shipped') : g.shipped === 0 ? t('waiting.state.none') : t('waiting.state.partial')}
        </Text>
      </Flex>
      <Progress
        percent={Math.round((g.shipped / g.total) * 100)}
        showInfo={false}
        size="small"
        strokeColor={g.allShipped ? colors.success : colors.primary}
      />
    </Flex>
  );

  const columns: TableColumnsType<WaitingGroup> = [
    {
      title: t('waiting.col.order'),
      dataIndex: 'orderNo',
      width: wc(120),
      render: (no: string) => <Text style={{ fontWeight: 500 }}>{no}</Text>,
    },
    {
      title: t('waiting.col.customer'),
      key: 'customer',
      width: wc(140),
      render: (_, g) => <Text>{g.customer.alias} · {g.customer.district}</Text>,
    },
    {
      title: t('waiting.col.items'),
      key: 'items',
      width: wc(260),
      render: (_, g) => (
        <Text type="secondary" ellipsis={{ tooltip: true }}>
          {t('waiting.itemsSummary', {
            n: g.lines.length,
            first: productOf(g.lines[0].sku)?.name ?? g.lines[0].sku,
          })}
        </Text>
      ),
    },
    {
      title: t('waiting.col.batch'),
      key: 'batch',
      width: wc(190),
      render: (_, g) => (
        <Flex vertical>
          <Text>{g.purchaseOrder.batchNo} · {g.purchaseOrder.supplier}</Text>
          <Text type="secondary" style={{ fontSize: 13 }}>{g.purchaseOrder.supplierOrderNo}</Text>
        </Flex>
      ),
    },
    {
      title: t('waiting.col.ordered'),
      dataIndex: 'orderedAt',
      width: wc(110),
      sorter: (a, b) => a.orderedAt.localeCompare(b.orderedAt),
      render: (d: string) => <Text type="secondary">{d}</Text>,
    },
    {
      title: t('waiting.col.eta'),
      dataIndex: 'estimatedReady',
      width: wc(110),
      render: (d: string | null, g) => {
        const late = !g.allShipped && d && d < '2026-09-22';
        return <Text style={{ color: late ? colors.error : colors.textSecondary, fontWeight: late ? 500 : undefined }}>{d ?? '—'}</Text>;
      },
    },
    {
      title: t('waiting.col.progress'),
      key: 'progress',
      width: wc(200),
      fixed: 'right',
      sorter: (a, b) => a.shipped / a.total - b.shipped / b.total,
      render: (_, g) => progress(g),
    },
  ];

  const packageChips = (pkgs: Pkg[]) => (
    <Flex gap={6} wrap>
      {pkgs.map((k) => {
        const m = LOCATION_META[k.location] ?? LOCATION_META.supplier!;
        return (
          <Pill key={k.id} tone={m.tone} dot>
            {k.packageCode} · {t(m.labelKey)}
            {k.deliveryNoteNo && ` · ${k.deliveryNoteNo}`}
          </Pill>
        );
      })}
    </Flex>
  );

  const expanded = (g: WaitingGroup) => (
    <Flex vertical gap={10} style={{ padding: isMobile ? 0 : '4px 8px' }}>
      {g.lines.map((l) => {
        const p = productOf(l.sku);
        return (
          <Flex key={l.sku} vertical gap={6}>
            <Flex align="center" justify="space-between" gap={12}>
              {p ? <ItemName product={p} thumb /> : <Text>{l.sku}</Text>}
              <Text style={{ whiteSpace: 'nowrap', color: l.shipped === l.packages.length ? colors.success : undefined }}>
                {t('waiting.lineProgress', { qty: l.qty, shipped: l.shipped, total: l.packages.length })}
              </Text>
            </Flex>
            {packageChips(l.packages)}
          </Flex>
        );
      })}
    </Flex>
  );

  const stateOptions = (['none', 'partial', 'shipped'] as WaitState[]).map((v) => ({
    value: v,
    label: (
      <Pill tone={v === 'shipped' ? 'success' : v === 'partial' ? 'brand' : 'muted'} dot>
        {t(`waiting.state.${v}` as MessageKey)}
      </Pill>
    ),
  }));

  return (
    <Flex vertical gap={12}>
      <Flex align="center" justify="space-between" wrap gap={12}>
        <Flex vertical gap={2}>
          <Title level={1} style={{ margin: 0 }}>{t('waiting.title')}</Title>
          <Text type="secondary">{t('waiting.subtitle')}</Text>
        </Flex>
        <Space wrap>
          <Button icon={<ExperimentOutlined />} onClick={() => setResult(matchShipment(demoShipmentRows()))}>
            {t('waiting.upload.demo')}
          </Button>
          <Upload accept=".csv,.tsv,.txt" showUploadList={false} beforeUpload={onFile}>
            <Button type="primary" icon={<UploadOutlined />}>{t('waiting.upload.button')}</Button>
          </Upload>
        </Space>
      </Flex>

      <Row gutter={[12, 12]}>
        {[
          { title: t('waiting.stat.orders'), value: stats.orders },
          { title: t('waiting.stat.packages'), value: `${stats.shipped} / ${stats.pkgs}` },
          { title: t('waiting.stat.done'), value: stats.done, ok: true },
          { title: t('waiting.stat.overdue'), value: stats.overdue, warn: stats.overdue > 0 },
        ].map((s) => (
          <Col key={s.title} xs={12} lg={6}>
            <Card size="small">
              <Statistic
                title={s.title}
                value={s.value}
                styles={{ content: { fontSize: 22, fontWeight: 600, color: s.warn ? colors.error : s.ok ? colors.success : undefined } }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <DataTableCard
        filters={
          <FilterChip label={t('waiting.filter.state')} options={stateOptions} value={states} onChange={setStates} />
        }
        onClearFilters={states.length > 0 || keyword ? () => { setStates([]); setKeyword(''); } : undefined}
        search={{ value: keyword, onChange: setKeyword, placeholder: t('waiting.search'), width: 300 }}
        extra={<NameDisplaySwitch />}
        count={`${t('waiting.filtered', { n: rows.length })} · ${t('waiting.hint')}`}
        mobile={
          <CardList
            items={rows}
            rowKey={(g) => g.orderNo}
            renderItem={(g) => (
              <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
                <Flex vertical gap={8}>
                  <Text style={{ fontWeight: 600 }}>{g.orderNo} · {g.customer.alias} · {g.customer.district}</Text>
                  {progress(g)}
                  <Text type="secondary" style={{ fontSize: 13 }}>
                    {g.purchaseOrder.batchNo} · {g.purchaseOrder.supplier}
                  </Text>
                  <Collapse
                    ghost
                    size="small"
                    items={[{ key: 'items', label: t('waiting.showItems', { n: g.lines.length }), children: expanded(g) }]}
                  />
                </Flex>
              </Card>
            )}
          />
        }
      >
        <Table<WaitingGroup>
          rowKey="orderNo"
          columns={columns}
          dataSource={rows}
          pagination={pagination}
          scroll={{ x: wc(1100) }}
          expandable={{ expandedRowRender: expanded, expandRowByClick: true }}
          locale={{ emptyText: <Empty description={t('common.empty')} /> }}
        />
      </DataTableCard>

      <Modal
        title={t('waiting.upload.resultTitle')}
        open={result != null}
        onCancel={() => setResult(null)}
        okText={t('waiting.upload.apply', { n: result?.matched.length ?? 0 })}
        cancelText={t('common.cancel')}
        okButtonProps={{ disabled: !result || result.matched.length === 0 }}
        onOk={apply}
        width={640}
      >
        {result && (
          <Flex vertical gap={12} style={{ marginTop: 8 }}>
            <Text>{t('waiting.upload.summary', { matched: result.matched.length, unmatched: result.unmatched.length })}</Text>
            {result.matched.length > 0 && (
              <Flex vertical gap={4}>
                <Text type="secondary" style={{ fontSize: 13 }}>{t('waiting.upload.matched')}</Text>
                <Flex gap={6} wrap>
                  {result.matched.map(({ pkg }) => (
                    <Pill key={pkg.id} tone="success" dot>
                      {pkg.packageCode} · {pkg.orderNo}
                    </Pill>
                  ))}
                </Flex>
              </Flex>
            )}
            {result.unmatched.length > 0 && (
              <Flex vertical gap={4}>
                <Text type="secondary" style={{ fontSize: 13 }}>{t('waiting.upload.unmatched')}</Text>
                <Flex gap={6} wrap>
                  {result.unmatched.map((u, i) => (
                    <Pill key={`${u.row.packageCode}-${i}`} tone="error" dot>
                      {u.row.packageCode} · {t(u.reason === 'notFound' ? 'waiting.upload.notFound' : 'waiting.upload.alreadyShipped')}
                    </Pill>
                  ))}
                </Flex>
              </Flex>
            )}
            <Text type="secondary" style={{ fontSize: 13 }}>{t('waiting.upload.note')}</Text>
          </Flex>
        )}
      </Modal>
    </Flex>
  );
}
