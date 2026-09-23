import { useMemo, useState } from 'react';
import {
  App,
  Button,
  Card,
  Col,
  Empty,
  Flex,
  Input,
  Row,
  Segmented,
  Select,
  Space,
  Statistic,
  Table,
  Typography,
} from 'antd';
import type { TableColumnsType } from 'antd';
import { SearchOutlined, SwapOutlined } from '@ant-design/icons';
import { hkPackages, productOf, useOps } from '../data/ops';
import type { Pkg } from '../data/ops';
import { daysSince } from '../domain/clock';
import { ESCALATION_DAYS_DEFAULT } from '../domain/derive';
import type { LocationKey } from '../domain/types';
import { colors, useIsMobile } from '../theme';
import { Pill } from '../components/Pill';
import { CardList } from '../components/CardList';
import { ItemName, NameDisplaySwitch } from '../components/ItemName';
import { useTableHeight } from '../utils/useTableHeight';
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

type LocFilter = 'all' | 'hkWarehouse' | 'showroom';
type KindFilter = 'all' | 'order' | 'stock';

export function InventoryPage({ onOpenRestock }: { onOpenRestock?: () => void }) {
  const { message } = App.useApp();
  const t = useT();
  const isMobile = useIsMobile();
  const { wc } = useDensity();
  const tableHeight = useTableHeight(470);
  const ops = useOps();

  const [loc, setLoc] = useState<LocFilter>('all');
  const [kind, setKind] = useState<KindFilter>('all');
  const [keyword, setKeyword] = useState('');
  const [selected, setSelected] = useState<React.Key[]>([]);

  const all = useMemo(() => hkPackages(ops), [ops]);

  const rows = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return all
      .filter((k) => {
        if (loc !== 'all' && k.location !== loc) return false;
        if (kind === 'order' && !k.orderNo) return false;
        if (kind === 'stock' && k.orderNo) return false;
        if (!kw) return true;
        const p = productOf(k.sku);
        return (
          k.packageCode.toLowerCase().includes(kw) ||
          k.sku.toLowerCase().includes(kw) ||
          (k.orderNo?.toLowerCase().includes(kw) ?? false) ||
          (k.customer?.alias.includes(kw) ?? false) ||
          (p?.name.toLowerCase().includes(kw) ?? false) ||
          (p?.supplierName.toLowerCase().includes(kw) ?? false)
        );
      })
      .sort((a, b) => {
        // 客單先、再按到港日（耐嗰啲排前）
        if (!!a.orderNo !== !!b.orderNo) return a.orderNo ? -1 : 1;
        return (a.arrivedAt ?? '').localeCompare(b.arrivedAt ?? '');
      });
  }, [all, loc, kind, keyword]);

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
        <Text type="secondary" style={{ fontSize: 13 }}>{k.arrivedAt}</Text>
      </Flex>
    );
  };

  const belongsTo = (k: Pkg) =>
    k.orderNo ? (
      <Flex vertical>
        <Text style={{ fontWeight: 500 }}>{k.orderNo}</Text>
        <Text type="secondary" style={{ fontSize: 13 }}>{k.customer?.alias} · {k.customer?.district}</Text>
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
      render: (c: string) => <Text style={{ fontWeight: 500, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13 }}>{c}</Text>,
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
      render: (n: string | null) => <Text type="secondary">{n ?? '—'}</Text>,
    },
  ];

  const locOptions = [
    { value: 'all', label: t('common.all') },
    { value: 'hkWarehouse', label: t('inventory.loc.hkWarehouse') },
    { value: 'showroom', label: t('inventory.loc.showroom') },
  ];
  const kindOptions = [
    { value: 'all', label: t('common.all') },
    { value: 'order', label: t('inventory.kind.order') },
    { value: 'stock', label: t('inventory.kind.stock') },
  ];

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

      <Card
        styles={{ body: { paddingTop: 12 } }}
        title={
          isMobile ? (
            <Select value={loc} onChange={(v) => setLoc(v as LocFilter)} options={locOptions} style={{ width: '100%' }} />
          ) : (
            <Flex gap={12} wrap>
              <Segmented value={loc} onChange={(v) => setLoc(v as LocFilter)} options={locOptions} />
              <Segmented value={kind} onChange={(v) => setKind(v as KindFilter)} options={kindOptions} />
            </Flex>
          )
        }
        extra={!isMobile && <Text type="secondary">{t('inventory.filtered', { n: rows.length.toLocaleString('en-HK') })}</Text>}
      >
        <Flex vertical gap={12}>
          <Flex gap={8} wrap align="center">
            <Input
              allowClear
              prefix={<SearchOutlined style={{ color: colors.textMuted }} />}
              placeholder={t('inventory.search')}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              style={{ width: isMobile ? '100%' : 300 }}
            />
            {isMobile && (
              <Select value={kind} onChange={(v) => setKind(v as KindFilter)} options={kindOptions} style={{ width: '100%' }} />
            )}
            <NameDisplaySwitch />
          </Flex>

          {selected.length > 0 && (
            <Flex
              align="center"
              justify="space-between"
              wrap
              gap={8}
              style={{ padding: '6px 12px', background: colors.primarySubtle, borderRadius: 6 }}
            >
              <Text>{t('inventory.selected', { n: selected.length })}</Text>
              <Space>
                <Button size="small" icon={<SwapOutlined />} onClick={() => message.info(t('inventory.bulk.transferDemo', { n: selected.length }))}>
                  {t('inventory.bulk.transfer')}
                </Button>
                <Button size="small" onClick={() => message.info(t('inventory.bulk.adjustDemo', { n: selected.length }))}>
                  {t('inventory.bulk.adjust')}
                </Button>
                <Button size="small" type="text" onClick={() => setSelected([])}>{t('common.clear')}</Button>
              </Space>
            </Flex>
          )}

          {isMobile ? (
            <CardList
              items={rows}
              rowKey={(k) => k.id}
              renderItem={(k) => {
                const p = productOf(k.sku);
                return (
                  <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
                    <Flex vertical gap={8}>
                      <Flex justify="space-between" align="center" gap={8}>
                        <Text style={{ fontWeight: 600, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13 }}>{k.packageCode}</Text>
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
          ) : (
            <Table<Pkg>
              rowKey="id"
              columns={columns}
              dataSource={rows}
              virtual
              scroll={{ x: wc(1000), y: tableHeight }}
              pagination={false}
              rowSelection={{ selectedRowKeys: selected, onChange: setSelected, columnWidth: wc(48) }}
              locale={{ emptyText: <Empty description={t('common.empty')} /> }}
            />
          )}
        </Flex>
      </Card>
    </Flex>
  );
}
