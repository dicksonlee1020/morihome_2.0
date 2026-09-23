import { useMemo, useState } from 'react';
import {
  App,
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Flex,
  Form,
  Input,
  Modal,
  Row,
  Space,
  Statistic,
  Table,
  Tabs,
  Typography,
  Upload,
} from 'antd';
import type { TableColumnsType, UploadFile } from 'antd';
import {
  DownloadOutlined,
  FileDoneOutlined,
  InboxOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { SUPPLIERS } from '../data/catalog';
import {
  confirmOrdered,
  createPurchaseOrder,
  isStockRequirement,
  productOf,
  requirementStatus,
  useOps,
} from '../data/ops';
import type { PurchaseOrder, Requirement, RequirementStatus } from '../data/ops';
import { colors, useIsMobile } from '../theme';
import { Pill } from '../components/Pill';
import { CardList } from '../components/CardList';
import { FilterChip } from '../components/FilterChip';
import { downloadPurchaseSheet } from '../utils/purchaseSheet';
import { ItemName, NameDisplaySwitch } from '../components/ItemName';
import { useTableHeight } from '../utils/useTableHeight';
import { useT } from '../i18n';
import type { MessageKey } from '../i18n';
import { useDensity } from '../utils/useDensity';
import type { Tone } from '../utils/tones';

const { Text, Title } = Typography;

/**
 * 採購（Ocean feedback B-01 / B-02）。
 * 需求 tab：按供應商 group，揀咗就每個供應商出一份採購表。
 * 採購單 tab：上載訂貨確認 → orderedAt 有值 → 「已訂」係推導，唔係人手剔。
 */
const STATUS_META: Record<RequirementStatus, { labelKey: MessageKey; tone: Tone }> = {
  open: { labelKey: 'purchasing.status.open', tone: 'warning' },
  inPurchaseOrder: { labelKey: 'purchasing.status.inPo', tone: 'brand' },
  ordered: { labelKey: 'purchasing.status.ordered', tone: 'success' },
};


export function PurchasingPage() {
  const { message } = App.useApp();
  const t = useT();
  const isMobile = useIsMobile();
  const { wc } = useDensity();
  const tableHeight = useTableHeight(520);
  const ops = useOps();

  const [tab, setTab] = useState<'requirements' | 'orders'>('requirements');
  const [suppliers, setSuppliers] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<RequirementStatus[]>(['open']);
  const [keyword, setKeyword] = useState('');
  const [selected, setSelected] = useState<React.Key[]>([]);
  const [confirming, setConfirming] = useState<PurchaseOrder | null>(null);

  const withStatus = useMemo(
    () => ops.requirements.map((r) => ({ ...r, status: requirementStatus(r, ops.purchaseOrders) })),
    [ops]
  );

  /** 每個供應商仲有幾多需求未採購 —— filter chip 嘅選項旁邊顯示 */
  const openBySupplier = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of withStatus) if (r.status === 'open') m.set(r.supplier, (m.get(r.supplier) ?? 0) + 1);
    return m;
  }, [withStatus]);

  const rows = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return withStatus
      .filter((r) => {
        if (suppliers.length > 0 && !suppliers.includes(r.supplier)) return false;
        if (statuses.length > 0 && !statuses.includes(r.status)) return false;
        if (!kw) return true;
        const p = productOf(r.sku);
        return (
          r.orderNo.toLowerCase().includes(kw) ||
          r.sku.toLowerCase().includes(kw) ||
          r.customer.alias.includes(kw) ||
          (p?.name.toLowerCase().includes(kw) ?? false) ||
          (p?.supplierName.toLowerCase().includes(kw) ?? false)
        );
      })
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.orderNo.localeCompare(b.orderNo));
  }, [withStatus, suppliers, statuses, keyword]);

  const filtered = suppliers.length > 0 || statuses.length !== 1 || statuses[0] !== 'open' || keyword !== '';
  const clearFilters = () => {
    setSuppliers([]);
    setStatuses(['open']);
    setKeyword('');
    setSelected([]);
  };

  // 有揀就用揀咗嘅；冇揀就用篩選後所有未採購嘅行 —— Ocean 嘅流程係篩供應商即刻 download
  const openRows = rows.filter((r) => r.status === 'open');
  const selectedRows = openRows.filter((r) => selected.includes(r.id));
  const targetRows = selectedRows.length > 0 ? selectedRows : openRows;
  const targetSuppliers = [...new Set(targetRows.map((r) => r.supplier))];

  /** B-01：每個供應商一份採購表 —— 生成 draft PurchaseOrder，即刻下載 Excel 畀同事 send */
  const download = () => {
    const made: string[] = [];
    for (const s of targetSuppliers) {
      const po = createPurchaseOrder(
        s,
        targetRows.filter((r) => r.supplier === s).map((r) => r.id)
      );
      downloadPurchaseSheet(po, ops.requirements);
      made.push(`${po.batchNo}（${s}）`);
    }
    setSelected([]);
    message.success(t('purchasing.downloaded', { n: made.length, list: made.join('、') }), 6);
  };

  const stats = useMemo(() => {
    const open = withStatus.filter((r) => r.status === 'open').length;
    const drafts = ops.purchaseOrders.filter((p) => !p.orderedAt).length;
    const ordered = ops.purchaseOrders.filter((p) => p.orderedAt).length;
    const oldest = withStatus
      .filter((r) => r.status === 'open')
      .reduce((d, r) => (r.createdAt < d ? r.createdAt : d), '9999');
    const oldestDays = oldest === '9999' ? 0 : dayjs('2026-09-22').diff(oldest, 'day');
    return { open, drafts, ordered, oldestDays };
  }, [withStatus, ops.purchaseOrders]);

  const STATUS_ORDER: RequirementStatus[] = ['open', 'inPurchaseOrder', 'ordered'];

  const columns: TableColumnsType<(typeof rows)[number]> = [
    {
      title: t('purchasing.col.orderNo'),
      dataIndex: 'orderNo',
      width: wc(110),
      fixed: 'left',
      sorter: (a, b) => a.orderNo.localeCompare(b.orderNo),
      render: (no: string, r) => (
        <Text style={{ fontWeight: 500 }}>{isStockRequirement(r) ? t('purchasing.stockOrder') : no}</Text>
      ),
    },
    {
      title: t('purchasing.col.orderDate'),
      dataIndex: 'createdAt',
      width: wc(120),
      sorter: (a, b) => a.createdAt.localeCompare(b.createdAt),
      defaultSortOrder: 'ascend',
      render: (d: string) => <Text type="secondary">{d}</Text>,
    },
    {
      title: t('purchasing.col.customer'),
      key: 'customer',
      width: wc(130),
      render: (_, r) =>
        isStockRequirement(r) ? (
          <Pill tone="muted">{t('purchasing.stockOrder')}</Pill>
        ) : (
          <Text>{r.customer.alias} · {r.customer.district}</Text>
        ),
    },
    {
      title: t('purchasing.col.item'),
      key: 'item',
      width: wc(320),
      render: (_, r) => {
        const p = productOf(r.sku);
        return p ? <ItemName product={p} thumb /> : <Text>{r.sku}</Text>;
      },
    },
    {
      title: t('purchasing.col.qty'),
      dataIndex: 'qty',
      width: wc(84),
      align: 'right',
      sorter: (a, b) => a.qty - b.qty,
    },
    {
      title: t('purchasing.col.supplier'),
      dataIndex: 'supplier',
      width: wc(160),
      sorter: (a, b) => a.supplier.localeCompare(b.supplier),
      render: (s: string) => <Text type="secondary">{s}</Text>,
    },
    {
      title: t('purchasing.col.sourcing'),
      dataIndex: 'sourcing',
      width: wc(96),
      render: (s: Requirement['sourcing']) => (
        <Text type="secondary">{t(s === 'useStock' ? 'purchasing.sourcing.useStock' : 'purchasing.sourcing.orderNew')}</Text>
      ),
    },
    {
      title: t('common.status'),
      key: 'status',
      width: wc(170),
      sorter: (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status),
      render: (_, r) => {
        const m = STATUS_META[r.status];
        const po = ops.purchaseOrders.find((p) => p.id === r.purchaseOrderId);
        return (
          <Flex gap={6} align="center" wrap>
            <Pill tone={m.tone} dot>{t(m.labelKey)}</Pill>
            {po && <Text type="secondary" style={{ fontSize: 13 }}>{po.batchNo}</Text>}
          </Flex>
        );
      },
    },
  ];

  const supplierOptions = SUPPLIERS.map((s) => ({
    value: s,
    label: (
      <Flex justify="space-between" gap={12} style={{ flexGrow: 1 }}>
        <Text>{s}</Text>
        <Text type="secondary">{openBySupplier.get(s) ?? 0}</Text>
      </Flex>
    ),
  }));
  const statusOptions = STATUS_ORDER.map((v) => ({
    value: v,
    label: <Pill tone={STATUS_META[v].tone} dot>{t(STATUS_META[v].labelKey)}</Pill>,
  }));

  const downloadLabel =
    targetSuppliers.length > 1
      ? t('purchasing.downloadMany', { n: targetSuppliers.length })
      : targetSuppliers.length === 1
        ? t('purchasing.downloadOne', { supplier: targetSuppliers[0] })
        : t('purchasing.download');

  const requirementsTab = (
    <Card styles={{ body: { paddingTop: 12 } }}>
      <Flex vertical gap={12}>
        <Flex gap={8} wrap align="center">
          <FilterChip
            label={t('purchasing.filter.supplier')}
            options={supplierOptions}
            value={suppliers}
            onChange={(v) => {
              setSuppliers(v);
              setSelected([]);
            }}
            renderSelected={(v) => <Text style={{ fontWeight: 500 }}>{v}</Text>}
          />
          <FilterChip
            label={t('purchasing.filter.status')}
            options={statusOptions}
            value={statuses}
            onChange={(v) => {
              setStatuses(v);
              setSelected([]);
            }}
          />
          {filtered && (
            <Button type="text" size="small" onClick={clearFilters}>
              {t('filter.clearAll')}
            </Button>
          )}
          <span style={{ flexGrow: 1 }} />
          <Input
            allowClear
            prefix={<SearchOutlined style={{ color: colors.textMuted }} />}
            placeholder={t('purchasing.search')}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            style={{ width: isMobile ? '100%' : 260 }}
          />
          <NameDisplaySwitch />
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            disabled={targetRows.length === 0}
            onClick={download}
          >
            {downloadLabel}
          </Button>
        </Flex>

        <Flex align="center" justify="space-between" wrap gap={8}>
          <Text type="secondary" style={{ fontSize: 13 }}>
            {selectedRows.length > 0
              ? t('purchasing.selected', { n: selectedRows.length, suppliers: targetSuppliers.length })
              : t('purchasing.filtered', { n: rows.length })}
          </Text>
          {selectedRows.length > 0 && (
            <Button size="small" type="text" onClick={() => setSelected([])}>
              {t('common.clear')}
            </Button>
          )}
        </Flex>

        {isMobile ? (
          <CardList
            items={rows}
            rowKey={(r) => r.id}
            renderItem={(r) => {
              const p = productOf(r.sku);
              const m = STATUS_META[r.status];
              const picked = selected.includes(r.id);
              return (
                <Card
                  size="small"
                  onClick={() =>
                    r.status === 'open' &&
                    setSelected((prev) => (picked ? prev.filter((k) => k !== r.id) : [...prev, r.id]))
                  }
                  style={{ borderColor: picked ? colors.primary : undefined }}
                >
                  <Flex vertical gap={8}>
                    <Flex justify="space-between" align="center">
                      <Text style={{ fontWeight: 600 }}>
                        {isStockRequirement(r) ? t('purchasing.stockOrder') : `${r.orderNo} · ${r.customer.alias} · ${r.customer.district}`}
                      </Text>
                      <Pill tone={m.tone} dot>{t(m.labelKey)}</Pill>
                    </Flex>
                    {p && <ItemName product={p} thumb />}
                    <Text type="secondary">
                      {r.createdAt} · {r.supplier} · {t('purchasing.col.qty')} {r.qty}
                    </Text>
                  </Flex>
                </Card>
              );
            }}
          />
        ) : (
          <Table
            rowKey="id"
            columns={columns}
            dataSource={rows}
            pagination={false}
            scroll={{ x: wc(1100), y: tableHeight }}
            rowSelection={{
              selectedRowKeys: selected,
              onChange: setSelected,
              columnWidth: wc(48),
              getCheckboxProps: (r) => ({ disabled: r.status !== 'open' }),
            }}
            locale={{ emptyText: <Empty description={t('purchasing.emptyOpen')} /> }}
          />
        )}
      </Flex>
    </Card>
  );

  const ordersTab = (
    <PurchaseOrderList
      orders={[...ops.purchaseOrders].filter((p) => p.supplier).sort((a, b) => b.createdAt.localeCompare(a.createdAt))}
      onConfirm={setConfirming}
      onExport={(po) => downloadPurchaseSheet(po, ops.requirements)}
    />
  );

  return (
    <Flex vertical gap={12}>
      <Flex align="center" justify="space-between" wrap gap={12}>
        <Flex vertical gap={2}>
          <Title level={1} style={{ margin: 0 }}>{t('purchasing.title')}</Title>
          <Text type="secondary">{t('purchasing.flowHint')}</Text>
        </Flex>
      </Flex>

      <Row gutter={[12, 12]}>
        {[
          { title: t('purchasing.stat.open'), value: stats.open, warn: stats.open > 0 },
          { title: t('purchasing.stat.oldest'), value: t('purchasing.stat.days', { n: stats.oldestDays }), warn: stats.oldestDays >= 3 },
          { title: t('purchasing.stat.drafts'), value: stats.drafts },
          { title: t('purchasing.stat.ordered'), value: stats.ordered },
        ].map((s) => (
          <Col key={s.title} xs={12} lg={6}>
            <Card size="small">
              <Statistic
                title={s.title}
                value={s.value}
                styles={{ content: { fontSize: 22, fontWeight: 600, color: s.warn ? colors.warningText : undefined } }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <Tabs
        activeKey={tab}
        onChange={(k) => setTab(k as typeof tab)}
        items={[
          { key: 'requirements', label: t('purchasing.tab.requirements', { n: stats.open }), children: requirementsTab },
          { key: 'orders', label: t('purchasing.tab.orders', { n: stats.drafts }), children: ordersTab },
        ]}
      />

      <ConfirmModal
        po={confirming}
        onClose={() => setConfirming(null)}
        onSave={(po, v) => {
          confirmOrdered(po.id, v);
          setConfirming(null);
          message.success(t('purchasing.confirmed', { batch: po.batchNo, n: po.lines.length }));
        }}
      />
    </Flex>
  );
}

function PurchaseOrderList({
  orders,
  onConfirm,
  onExport,
}: {
  orders: PurchaseOrder[];
  onConfirm: (po: PurchaseOrder) => void;
  onExport: (po: PurchaseOrder) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState<string | null>(null);
  if (orders.length === 0) return <Empty description={t('common.empty')} />;
  return (
    <Flex vertical gap={8}>
      {orders.map((po) => {
        const ordered = !!po.orderedAt;
        const expanded = open === po.id;
        return (
          <Card key={po.id} size="small" styles={{ body: { padding: '12px 16px' } }}>
            <Flex vertical gap={8}>
              <Flex align="center" justify="space-between" wrap gap={8}>
                <Flex vertical gap={2} style={{ minWidth: 0 }}>
                  <Flex gap={8} align="center" wrap>
                    <Text style={{ fontWeight: 600 }}>{po.batchNo}</Text>
                    <Pill tone={ordered ? 'success' : 'warning'} dot>
                      {t(ordered ? 'purchasing.po.ordered' : 'purchasing.po.draft')}
                    </Pill>
                  </Flex>
                  <Text type="secondary" style={{ fontSize: 13 }}>
                    {po.supplier} · {t('purchasing.po.lines', { n: po.lines.length })} · {t('purchasing.po.created', { date: po.createdAt })}
                  </Text>
                  {ordered && (
                    <Text type="secondary" style={{ fontSize: 13 }}>
                      {t('purchasing.po.supplierNo')} {po.supplierOrderNo}
                      {po.estimatedReady && ` · ${t('purchasing.po.estimatedReady', { date: po.estimatedReady })}`}
                      {po.confirmationFile && ` · ${po.confirmationFile}`}
                    </Text>
                  )}
                </Flex>
                <Space wrap>
                  <Button size="small" onClick={() => setOpen(expanded ? null : po.id)}>
                    {t(expanded ? 'purchasing.po.collapse' : 'purchasing.po.expand')}
                  </Button>
                  <Button size="small" icon={<DownloadOutlined />} onClick={() => onExport(po)}>
                    {t('purchasing.po.export')}
                  </Button>
                  {!ordered && (
                    <Button size="small" type="primary" icon={<FileDoneOutlined />} onClick={() => onConfirm(po)}>
                      {t('purchasing.po.uploadConfirmation')}
                    </Button>
                  )}
                </Space>
              </Flex>
              {expanded && (
                <Flex vertical gap={6} style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 8 }}>
                  {po.lines.map((l) => {
                    const p = productOf(l.sku);
                    return (
                      <Flex key={l.requirementId} align="center" justify="space-between" gap={12}>
                        {p ? <ItemName product={p} thumb /> : <Text>{l.sku}</Text>}
                        <Text style={{ whiteSpace: 'nowrap' }}>× {l.qty}</Text>
                      </Flex>
                    );
                  })}
                </Flex>
              )}
            </Flex>
          </Card>
        );
      })}
    </Flex>
  );
}

/**
 * B-02：上載訂貨確認。TODO：自動讀檔（OCR）留後；而家人手 key 供應商單號。
 * 附件只係記名，真上傳要行帶 auth 嘅 endpoint（CLAUDE.md）。
 */
function ConfirmModal({
  po,
  onClose,
  onSave,
}: {
  po: PurchaseOrder | null;
  onClose: () => void;
  onSave: (po: PurchaseOrder, v: { supplierOrderNo: string; confirmationFile: string; estimatedReady: string | null }) => void;
}) {
  const t = useT();
  const [form] = Form.useForm<{ supplierOrderNo: string; estimatedReady?: dayjs.Dayjs }>();
  const [file, setFile] = useState<UploadFile | null>(null);

  return (
    <Modal
      title={po ? t('purchasing.confirm.title', { batch: po.batchNo }) : ''}
      open={po != null}
      onCancel={onClose}
      okText={t('purchasing.confirm.ok')}
      cancelText={t('common.cancel')}
      destroyOnHidden
      afterClose={() => setFile(null)}
      okButtonProps={{ disabled: !file }}
      onOk={() =>
        form.validateFields().then((v) => {
          if (!po || !file) return;
          onSave(po, {
            supplierOrderNo: v.supplierOrderNo.trim(),
            confirmationFile: file.name,
            estimatedReady: v.estimatedReady ? v.estimatedReady.format('YYYY-MM-DD') : null,
          });
        })
      }
    >
      {po && (
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          <Upload.Dragger
            maxCount={1}
            accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls"
            beforeUpload={(f) => {
              setFile(f as UploadFile);
              return false;
            }}
            onRemove={() => setFile(null)}
            fileList={file ? [file] : []}
            style={{ marginBottom: 16 }}
          >
            <p><InboxOutlined style={{ fontSize: 28, color: colors.primary }} /></p>
            <p>{t('purchasing.confirm.drop')}</p>
            <p style={{ color: colors.textSecondary, fontSize: 13 }}>{t('purchasing.confirm.dropHint')}</p>
          </Upload.Dragger>
          <Form.Item
            name="supplierOrderNo"
            label={t('purchasing.confirm.supplierNo')}
            rules={[{ required: true, message: t('purchasing.confirm.supplierNoRequired') }]}
          >
            <Input placeholder="HB2026092300005127" />
          </Form.Item>
          <Form.Item name="estimatedReady" label={t('purchasing.confirm.estimatedReady')}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Text type="secondary" style={{ fontSize: 13 }}>
            {t('purchasing.confirm.note', { n: po.lines.length })}
          </Text>
        </Form>
      )}
    </Modal>
  );
}
