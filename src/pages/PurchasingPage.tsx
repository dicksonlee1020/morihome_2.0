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
  Menu,
  Modal,
  Row,
  Segmented,
  Select,
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

type StatusFilter = RequirementStatus | 'all';

export function PurchasingPage() {
  const { message } = App.useApp();
  const t = useT();
  const isMobile = useIsMobile();
  const { wc } = useDensity();
  const tableHeight = useTableHeight(520);
  const ops = useOps();

  const [tab, setTab] = useState<'requirements' | 'orders'>('requirements');
  const [supplier, setSupplier] = useState<string>('all');
  const [status, setStatus] = useState<StatusFilter>('open');
  const [keyword, setKeyword] = useState('');
  const [selected, setSelected] = useState<React.Key[]>([]);
  const [confirming, setConfirming] = useState<PurchaseOrder | null>(null);

  const withStatus = useMemo(
    () => ops.requirements.map((r) => ({ ...r, status: requirementStatus(r, ops.purchaseOrders) })),
    [ops]
  );

  /** 每個供應商仲有幾多需求未採購 —— 左邊清單同 B-01 嘅 group 靠呢個 */
  const openBySupplier = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of withStatus) if (r.status === 'open') m.set(r.supplier, (m.get(r.supplier) ?? 0) + 1);
    return m;
  }, [withStatus]);

  const rows = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return withStatus
      .filter((r) => {
        if (supplier !== 'all' && r.supplier !== supplier) return false;
        if (status !== 'all' && r.status !== status) return false;
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
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [withStatus, supplier, status, keyword]);

  const selectedRows = withStatus.filter((r) => selected.includes(r.id) && r.status === 'open');
  const selectedSuppliers = [...new Set(selectedRows.map((r) => r.supplier))];

  const generate = () => {
    const made: string[] = [];
    for (const s of selectedSuppliers) {
      const po = createPurchaseOrder(
        s,
        selectedRows.filter((r) => r.supplier === s).map((r) => r.id)
      );
      made.push(`${po.batchNo}（${s}）`);
    }
    setSelected([]);
    message.success(t('purchasing.generated', { n: made.length, list: made.join('、') }));
    setTab('orders');
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

  const columns: TableColumnsType<(typeof rows)[number]> = [
    {
      title: t('purchasing.col.order'),
      dataIndex: 'orderNo',
      width: wc(110),
      fixed: 'left',
      render: (no: string, r) => (
        <Flex vertical>
          <Text style={{ fontWeight: 500 }}>{isStockRequirement(r) ? t('purchasing.stockOrder') : no}</Text>
          <Text type="secondary" style={{ fontSize: 13 }}>{r.createdAt}</Text>
        </Flex>
      ),
    },
    {
      title: t('purchasing.col.customer'),
      key: 'customer',
      width: wc(120),
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
    { title: t('purchasing.col.qty'), dataIndex: 'qty', width: wc(64), align: 'right' },
    {
      title: t('purchasing.col.supplier'),
      dataIndex: 'supplier',
      width: wc(150),
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
      width: wc(150),
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

  const supplierMenu = (
    <Menu
      mode="inline"
      selectedKeys={[supplier]}
      onClick={({ key }) => {
        setSupplier(key);
        setSelected([]);
      }}
      style={{ borderInlineEnd: 'none' }}
      items={[
        {
          key: 'all',
          label: (
            <Flex justify="space-between">
              <span>{t('purchasing.allSuppliers')}</span>
              <Text type="secondary">{stats.open}</Text>
            </Flex>
          ),
        },
        ...SUPPLIERS.map((s) => ({
          key: s,
          label: (
            <Flex justify="space-between" gap={8}>
              <Text ellipsis>{s}</Text>
              <Text type="secondary">{openBySupplier.get(s) ?? 0}</Text>
            </Flex>
          ),
        })),
      ]}
    />
  );

  const statusOptions = [
    { value: 'open', label: t('purchasing.status.open') },
    { value: 'inPurchaseOrder', label: t('purchasing.status.inPo') },
    { value: 'ordered', label: t('purchasing.status.ordered') },
    { value: 'all', label: t('common.all') },
  ];

  const requirementsTab = (
    <Flex gap={16} align="stretch">
      {!isMobile && (
        <Card size="small" styles={{ body: { padding: 4 } }} style={{ width: 240, flexShrink: 0, alignSelf: 'flex-start' }}>
          <Text type="secondary" style={{ display: 'block', padding: '8px 16px 4px', fontSize: 13 }}>
            {t('purchasing.bySupplier')}
          </Text>
          {supplierMenu}
        </Card>
      )}
      <Card
        style={{ flex: 1, minWidth: 0 }}
        styles={{ body: { paddingTop: 12 } }}
        title={
          isMobile ? (
            <Select value={status} onChange={(v) => setStatus(v as StatusFilter)} options={statusOptions} style={{ width: '100%' }} />
          ) : (
            <Segmented value={status} onChange={(v) => setStatus(v as StatusFilter)} options={statusOptions} />
          )
        }
        extra={!isMobile && <Text type="secondary">{t('purchasing.filtered', { n: rows.length })}</Text>}
      >
        <Flex vertical gap={12}>
          <Flex gap={8} wrap align="center">
            <Input
              allowClear
              prefix={<SearchOutlined style={{ color: colors.textMuted }} />}
              placeholder={t('purchasing.search')}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              style={{ width: isMobile ? '100%' : 260 }}
            />
            {isMobile && (
              <Select
                value={supplier}
                onChange={(v) => setSupplier(v)}
                style={{ width: '100%' }}
                options={[
                  { value: 'all', label: t('purchasing.allSuppliers') },
                  ...SUPPLIERS.map((s) => ({ value: s, label: `${s}（${openBySupplier.get(s) ?? 0}）` })),
                ]}
              />
            )}
            <NameDisplaySwitch />
          </Flex>

          {selectedRows.length > 0 && (
            <Flex
              align="center"
              justify="space-between"
              wrap
              gap={8}
              style={{ padding: '6px 12px', background: colors.primarySubtle, borderRadius: 6 }}
            >
              <Text>
                {t('purchasing.selected', { n: selectedRows.length, suppliers: selectedSuppliers.length })}
              </Text>
              <Space>
                <Button type="primary" size="small" icon={<FileDoneOutlined />} onClick={generate}>
                  {selectedSuppliers.length > 1
                    ? t('purchasing.generateMany', { n: selectedSuppliers.length })
                    : t('purchasing.generateOne', { supplier: selectedSuppliers[0] })}
                </Button>
                <Button size="small" type="text" onClick={() => setSelected([])}>
                  {t('common.clear')}
                </Button>
              </Space>
            </Flex>
          )}

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
                        {r.supplier} · {t('purchasing.col.qty')} {r.qty}
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
              scroll={{ x: wc(1000), y: tableHeight }}
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
    </Flex>
  );

  const ordersTab = (
    <PurchaseOrderList
      orders={[...ops.purchaseOrders].filter((p) => p.supplier).sort((a, b) => b.createdAt.localeCompare(a.createdAt))}
      onConfirm={setConfirming}
      onExport={(po) => message.success(t('purchasing.exported', { batch: po.batchNo }))}
    />
  );

  return (
    <Flex vertical gap={12}>
      <Flex align="center" justify="space-between" wrap gap={12}>
        <Flex vertical gap={2}>
          <Title level={1} style={{ margin: 0 }}>{t('purchasing.title')}</Title>
          <Text type="secondary">{t('purchasing.subtitle')}</Text>
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
