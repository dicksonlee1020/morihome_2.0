import { useMemo, useState } from 'react';
import {
  App,
  Button,
  Card,
  Col,
  Empty,
  Flex,
  Row,
  Space,
  Statistic,
  Table,
  Typography,
} from 'antd';
import type { TableColumnsType } from 'antd';
import { SwapOutlined } from '@ant-design/icons';
import { hkPackages, productOf, useOps } from '../data/ops';
import type { Pkg } from '../data/ops';
import { daysSince } from '../domain/clock';
import { ESCALATION_DAYS_DEFAULT } from '../domain/derive';
import type { LocationKey } from '../domain/types';
import { colors } from '../theme';
import { fmtDate } from '../utils/date';
import { Pill } from '../components/Pill';
import { CardList } from '../components/CardList';
import { FilterChip } from '../components/FilterChip';
import { DataTableCard } from '../components/DataTableCard';
import { useTablePagination } from '../utils/useTablePagination';
import { useMockLoading } from '../utils/useMockLoading';
import { ItemName, NameDisplaySwitch } from '../components/ItemName';
import { useT } from '../i18n';
import type { MessageKey } from '../i18n';
import { useDensity } from '../utils/useDensity';

const { Text, Title } = Typography;

/**
 * 庫存 = 而家喺香港嘅包件（Ocean feedback B-05：貨到咗就係庫存，見貨賣貨）。
 * 「實有 / 預留 / 可售 / 安全存量」呢套只留畀儲定貨款，搬咗去備貨表。
 * 位置係唯一真相（INVARIANT 1）；呢頁冇任何改狀態嘅掣，調撥都係開 move。
 */
const LOC_LABEL: Partial<Record<LocationKey, MessageKey>> = {
  hkWarehouse: 'inventory.loc.hkWarehouse',
  showroom: 'inventory.loc.showroom',
};

type HkLocation = 'hkWarehouse' | 'showroom';
type Kind = 'order' | 'stock';

export function InventoryPage({ onOpenRestock }: { onOpenRestock?: () => void }) {
  const { message } = App.useApp();
  const t = useT();
  const { wc } = useDensity();
  const ops = useOps();

  const [locs, setLocs] = useState<HkLocation[]>([]);
  const [kinds, setKinds] = useState<Kind[]>([]);
  const [keyword, setKeyword] = useState('');
  const [selected, setSelected] = useState<React.Key[]>([]);

  const all = useMemo(() => hkPackages(ops), [ops]);
  const orderByNo = useMemo(() => new Map(ops.orders.map((o) => [o.orderNo, o])), [ops.orders]);
  const customerOf = (orderNo: string | null) => (orderNo ? orderByNo.get(orderNo)?.customer : undefined);

  const rows = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return all
      .filter((k) => {
        if (locs.length > 0 && !locs.includes(k.location as HkLocation)) return false;
        if (kinds.length > 0 && !kinds.includes(k.orderNo ? 'order' : 'stock')) return false;
        if (!kw) return true;
        const p = productOf(k.sku);
        return (
          (k.packageCode ?? '').toLowerCase().includes(kw) ||
          k.sku.toLowerCase().includes(kw) ||
          (k.orderNo?.toLowerCase().includes(kw) ?? false) ||
          (customerOf(k.orderNo)?.alias.includes(kw) ?? false) ||
          (p?.name.toLowerCase().includes(kw) ?? false) ||
          (p?.supplierName.toLowerCase().includes(kw) ?? false)
        );
      })
      .sort((a, b) => {
        // 客單先、再按到港日（耐嗰啲排前）
        if (!!a.orderNo !== !!b.orderNo) return a.orderNo ? -1 : 1;
        return (a.arrivedAt ?? '').localeCompare(b.arrivedAt ?? '');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, locs, kinds, keyword, orderByNo]);

  const loading = useMockLoading();
  const pagination = useTablePagination(rows.length);

  const stats = useMemo(() => {
    const orders = new Set<string>();
    const escalatedOrders = new Set<string>();
    let stock = 0;
    for (const k of all) {
      if (k.orderNo) {
        orders.add(k.orderNo);
        if ((daysSince(k.arrivedAt) ?? 0) >= ESCALATION_DAYS_DEFAULT) escalatedOrders.add(k.orderNo);
      } else stock += 1;
    }
    return { pkgs: all.length, orders: orders.size, stock, escalated: escalatedOrders.size };
  }, [all]);

  const ageCell = (k: Pkg) => {
    const days = daysSince(k.arrivedAt);
    const hot = !!k.orderNo && (days ?? 0) >= ESCALATION_DAYS_DEFAULT;
    return (
      <Flex vertical>
        <Text style={{ color: hot ? colors.error : undefined, fontWeight: hot ? 500 : undefined }}>
          {days == null ? '—' : t('inventory.days', { n: days })}
          {hot && ` · ${t('inventory.escalated')}`}
        </Text>
        <Text type="secondary" style={{ fontSize: 13 }}>{fmtDate(k.arrivedAt)}</Text>
      </Flex>
    );
  };

  const belongsTo = (k: Pkg) =>
    k.orderNo ? (
      <Flex vertical>
        <Text style={{ fontWeight: 500 }}>{k.orderNo}</Text>
        <Text type="secondary" style={{ fontSize: 13 }}>{customerOf(k.orderNo)?.alias} · {customerOf(k.orderNo)?.district}</Text>
      </Flex>
    ) : (
      <Pill tone="muted">{t('inventory.kind.stock')}</Pill>
    );

  const columns: TableColumnsType<Pkg> = [
    {
      title: t('inventory.col.package'),
      dataIndex: 'packageCode',
      width: wc(150),
      fixed: 'left',
      sorter: (a, b) => (a.packageCode ?? '').localeCompare(b.packageCode ?? ''),
      render: (c: string | null) => <Text style={{ fontWeight: 500, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13 }}>{c ?? t('inventory.uncoded')}</Text>,
    },
    {
      title: t('inventory.col.item'),
      key: 'item',
      width: wc(320),
      render: (_, k) => {
        const p = productOf(k.sku);
        return p ? <ItemName product={p} thumb /> : <Text>{k.sku}</Text>;
      },
    },
    {
      title: t('inventory.col.location'),
      dataIndex: 'location',
      width: wc(100),
      render: (l: LocationKey) => <Pill tone={l === 'showroom' ? 'brand' : 'muted'}>{t(LOC_LABEL[l] ?? 'inventory.loc.hkWarehouse')}</Pill>,
    },
    { title: t('inventory.col.belongsTo'), key: 'belongsTo', width: wc(170), render: (_, k) => belongsTo(k) },
    {
      title: t('inventory.col.inHk'),
      key: 'age',
      width: wc(140),
      sorter: (a, b) => (a.arrivedAt ?? '').localeCompare(b.arrivedAt ?? ''),
      render: (_, k) => ageCell(k),
    },
    {
      title: t('inventory.col.note'),
      dataIndex: 'deliveryNoteNo',
      width: wc(150),
      responsive: ['xl'],
      render: (n: string | null, k) => <Text type="secondary" ellipsis={{ tooltip: k.logisticsNo ?? undefined }}>{n ?? '—'}</Text>,
    },
  ];

  const locOptions = (['hkWarehouse', 'showroom'] as HkLocation[]).map((v) => ({
    value: v,
    label: <Pill tone={v === 'showroom' ? 'brand' : 'muted'}>{t(LOC_LABEL[v]!)}</Pill>,
  }));
  const kindOptions = (['order', 'stock'] as Kind[]).map((v) => ({
    value: v,
    label: t(v === 'order' ? 'inventory.kind.order' : 'inventory.kind.stock'),
  }));

  return (
    <Flex vertical gap={12}>
      <Flex align="center" justify="space-between" wrap gap={12}>
        <Flex vertical gap={2}>
          <Title level={1} style={{ margin: 0 }}>{t('inventory.title')}</Title>
          <Text type="secondary">{t('inventory.subtitle')}</Text>
        </Flex>
        <Space>
          <Button onClick={onOpenRestock}>{t('inventory.openRestock')}</Button>
          <Button type="primary" onClick={() => message.info(t('inventory.startCountDemo'))}>
            {t('inventory.startCount')}
          </Button>
        </Space>
      </Flex>

      <Row gutter={[12, 12]}>
        {[
          { title: t('inventory.stat.packages'), value: stats.pkgs },
          { title: t('inventory.stat.orders'), value: stats.orders },
          { title: t('inventory.stat.stock'), value: stats.stock },
          { title: t('inventory.stat.escalated', { days: ESCALATION_DAYS_DEFAULT }), value: stats.escalated, warn: stats.escalated > 0 },
        ].map((s) => (
          <Col key={s.title} xs={12} lg={6}>
            <Card size="small">
              <Statistic
                title={s.title}
                value={s.value.toLocaleString('en-HK')}
                styles={{ content: { fontSize: 22, fontWeight: 600, color: s.warn ? colors.error : undefined } }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <DataTableCard
        filters={
          <>
            <FilterChip label={t('inventory.col.location')} options={locOptions} value={locs} onChange={setLocs} />
            <FilterChip label={t('inventory.filter.kind')} options={kindOptions} value={kinds} onChange={setKinds} />
          </>
        }
        onClearFilters={locs.length > 0 || kinds.length > 0 || keyword ? () => { setLocs([]); setKinds([]); setKeyword(''); } : undefined}
        search={{ value: keyword, onChange: setKeyword, placeholder: t('inventory.search'), width: 300 }}
        extra={<NameDisplaySwitch />}
        count={t('inventory.filtered', { n: rows.length.toLocaleString('en-HK') })}
        selection={{
          count: selected.length,
          text: t('inventory.selected', { n: selected.length }),
          actions: (
            <>
              <Button size="small" icon={<SwapOutlined />} onClick={() => message.info(t('inventory.bulk.transferDemo', { n: selected.length }))}>
                {t('inventory.bulk.transfer')}
              </Button>
              <Button size="small" onClick={() => message.info(t('inventory.bulk.adjustDemo', { n: selected.length }))}>
                {t('inventory.bulk.adjust')}
              </Button>
            </>
          ),
          onClear: () => setSelected([]),
        }}
        mobile={
          <CardList
            items={rows}
            rowKey={(k) => k.id}
            renderItem={(k) => {
              const p = productOf(k.sku);
              return (
                <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
                  <Flex vertical gap={8}>
                    <Flex justify="space-between" align="center" gap={8}>
                      <Text style={{ fontWeight: 600, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13 }}>{k.packageCode ?? t('inventory.uncoded')}</Text>
                      <Pill tone={k.location === 'showroom' ? 'brand' : 'muted'}>{t(LOC_LABEL[k.location] ?? 'inventory.loc.hkWarehouse')}</Pill>
                    </Flex>
                    {p && <ItemName product={p} thumb />}
                    <Flex justify="space-between" align="center" gap={8}>
                      {belongsTo(k)}
                      {ageCell(k)}
                    </Flex>
                  </Flex>
                </Card>
              );
            }}
          />
        }
      >
        <Table<Pkg>
          loading={loading}
          rowKey="id"
          columns={columns}
          dataSource={rows}
          pagination={pagination}
          scroll={{ x: wc(1000) }}
          rowSelection={{ selectedRowKeys: selected, onChange: setSelected, columnWidth: wc(48) }}
          locale={{ emptyText: <Empty description={t('common.empty')} /> }}
        />
      </DataTableCard>
    </Flex>
  );
}
