import { ExperimentOutlined, UploadOutlined } from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Col,
  Collapse,
  DatePicker,
  Empty,
  Flex,
  Input,
  Modal,
  Progress,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Typography,
  Upload,
} from 'antd';
import * as React from 'react';
import { useAuth } from '../auth/hooks';
import { CardList } from '../components/CardList';
import { DataTableCard } from '../components/DataTableCard';
import { FilterChip } from '../components/FilterChip';
import { ItemName, NameDisplaySwitch } from '../components/ItemName';
import { Pill } from '../components/Pill';
import { can } from '../config/permissions';
import { OWNERS } from '../data/followups';
import type { WaitingGroup } from '../data/ops';
import {
  applyShipment,
  demoShipmentRows,
  matchShipment,
  moriExportReceiving,
  moriManualShip,
  moriOpenReceiptException,
  moriProcurementRef,
  moriReceiptCanEdit,
  moriReceiptStage,
  moriReceivingRows,
  moriReceivingSearch,
  moriSaveReceipt,
  moriTransferHK,
  opsState,
  parseShipmentText,
  productOf,
  useOps,
  waitingGroups,
} from '../data/ops';
import { staffById } from '../data/staff';
import { today } from '../domain/clock';
import { useT as MoriUseT } from '../i18n/hooks';
import { LOC_KEY } from '../peek/configs';
import { colors, useIsMobile } from '../theme';
import { cmpDate, fmtDate } from '../utils/date';
import { useDensity } from '../utils/useDensity';
import { useMockLoading } from '../utils/useMockLoading';
import { useTablePagination } from '../utils/useTablePagination';
const { Text, Title } = Typography;

/**
 * 庫存等候（Ocean feedback B-03 / B-04）。
 * 已落單、廠未發齊嘅訂單。按訂單收埋，右邊一眼睇到幾件發咗；爆開先見件貨。
 * 上載廠家發貨表 → 對包件編碼 → 每件開一張 move → 燈自動著。
 */
const LOCATION_META = {
  customerTransit: {
    labelKey: `waiting.loc.customerTransit`,
    tone: `brand`,
  },
  supplier: {
    labelKey: `waiting.loc.supplier`,
    tone: `muted`,
  },
  supplierTransit: {
    labelKey: `waiting.loc.supplierTransit`,
    tone: `brand`,
  },
  cnWarehouse: {
    labelKey: `waiting.loc.cnWarehouse`,
    tone: `brand`,
  },
  transit: {
    labelKey: `waiting.loc.transit`,
    tone: `success`,
  },
};
type WaitState = 'none' | 'partial' | 'shipped';
const stateOf = (g: WaitingGroup): WaitState =>
  g.allShipped ? 'shipped' : g.shipped === 0 ? 'none' : 'partial';
export function WaitingPage() {
  const [receiptScope, setReceiptScope] = React.useState<any>(() => {
    const id = window.__MORI_RECEIVING_FOCUS__;
    delete window.__MORI_RECEIVING_FOCUS__;
    return id
      ? {
          packageId: id,
        }
      : null;
  });
  const openReceipt = (stage: any, packages: any) =>
    setReceiptScope({
      stage,
      ids: packages.map((p: any) => p.id),
    });
  let { message } = App.useApp();
  const messageApi = message;
  let t = MoriUseT();
  let isMobile = useIsMobile();
  let { wc: r } = useDensity();
  let ops = useOps();
  let [states, setStates] = React.useState<any>([]);
  let [keyword, setKeyword] = React.useState<any>(``);
  let [result, setResult] = React.useState<any>(null);
  let groups = React.useMemo(() => waitingGroups(ops), [ops]);
  let rows = React.useMemo(() => {
    let e = keyword.trim().toLowerCase();
    return groups.filter((t: any) => {
      var n;
      return states.length > 0 && !states.includes(stateOf(t))
        ? false
        : !e ||
            t.orderNo.toLowerCase().includes(e) ||
            t.customer.alias.includes(e) ||
            t.purchaseOrder.batchNo.includes(e) ||
            (((n = t.purchaseOrder.supplierOrderNo) == null
              ? undefined
              : n.toLowerCase().includes(e)) ??
              false) ||
            t.lines.some((t: any) => {
              let n = productOf(t.sku);
              return (
                t.sku.toLowerCase().includes(e) ||
                ((n == null ? undefined : n.name.toLowerCase().includes(e)) ??
                  false) ||
                ((n == null
                  ? undefined
                  : n.supplierName.toLowerCase().includes(e)) ??
                  false) ||
                t.packages.some((t: any) =>
                  [t.packageCode, t.logisticsNo, t.deliveryNoteNo, t.orderNo]
                    .filter(Boolean)
                    .some((v: any) => String(v).toLowerCase().includes(e)),
                )
              );
            });
    });
  }, [groups, states, keyword]);
  let loading = useMockLoading();
  let pagination = useTablePagination(rows.length);
  let stats = React.useMemo(() => {
    let e = 0;
    let t = 0;
    let n = 0;
    let r = 0;
    for (let i of groups) {
      e += i.total;
      t += i.shipped;
      if (i.allShipped) {
        n += 1;
      }
      if (
        !i.allShipped &&
        i.estimatedReady &&
        i.estimatedReady < `2026-09-22`
      ) {
        r += 1;
      }
    }
    return {
      orders: groups.length,
      pkgs: e,
      shipped: t,
      done: n,
      overdue: r,
    };
  }, [groups]);
  let onFile = (n: any) => (
    n.text().then((n: any) => {
      let r = parseShipmentText(n);
      if (r.length === 0) {
        message.error(t(`waiting.upload.unreadable`));
        return;
      }
      setResult(matchShipment(r));
    }),
    false
  );
  let apply = () => {
    if (!result) return;
    try {
      let n = applyShipment(result);
      setResult(null);
      message.success(
        t(`waiting.upload.applied`, {
          n,
        }),
      );
    } catch (error: any) {
      message.error(error.message);
    }
  };
  let progress = (e: any) => (
    <Flex
      vertical={true}
      gap={2}
      style={{
        minWidth: 150,
      }}
    >
      <Flex justify={`space-between`} align={`baseline`}>
        <Text
          style={{
            fontWeight: 500,
            color: e.allShipped ? colors.success : undefined,
          }}
        >
          {t(`waiting.progress`, {
            shipped: e.shipped,
            total: e.total,
          })}
        </Text>
        <Text
          type={`secondary`}
          style={{
            fontSize: 13,
          }}
        >
          {e.allShipped
            ? t(`waiting.state.shipped`)
            : e.shipped === 0
              ? t(`waiting.state.none`)
              : t(`waiting.state.partial`)}
        </Text>
      </Flex>
      <Progress
        percent={Math.round((e.shipped / e.total) * 100)}
        showInfo={false}
        size={`small`}
        strokeColor={e.allShipped ? colors.success : colors.primary}
      />
    </Flex>
  );
  let columns: any[] = [
    {
      title: t(`waiting.col.order`),
      dataIndex: `orderNo`,
      width: r(120),
      fixed: `left`,
      sorter: (e: any, t: any) => e.orderNo.localeCompare(t.orderNo),
      render: (e: any) => (
        <Text
          style={{
            fontWeight: 500,
          }}
        >
          {e}
        </Text>
      ),
    },
    {
      title: t(`waiting.col.customer`),
      key: `customer`,
      width: r(140),
      render: (_e: any, t: any) => (
        <Text>
          {t.customer.alias}
          {` · `}
          {t.customer.district}
        </Text>
      ),
    },
    {
      title: t(`waiting.col.items`),
      key: `items`,
      width: r(260),
      render: (_e: any, n: any) => {
        var r;
        return (
          <Text
            type={`secondary`}
            ellipsis={{
              tooltip: true,
            }}
          >
            {t(`waiting.itemsSummary`, {
              n: n.lines.length,
              first:
                ((r = productOf(n.lines[0].sku)) == null
                  ? undefined
                  : r.name) ?? n.lines[0].sku,
            })}
          </Text>
        );
      },
    },
    {
      title: t(`waiting.col.batch`),
      key: `batch`,
      width: r(190),
      render: (_e: any, t: any) => (
        <Flex vertical={true}>
          <Text>
            {t.purchaseOrder.batchNo}
            {` · `}
            {t.purchaseOrder.supplier}
          </Text>
          <Text
            type={`secondary`}
            style={{
              fontSize: 13,
            }}
          >
            {t.purchaseOrder.supplierOrderNo}
          </Text>
        </Flex>
      ),
    },
    {
      title: t(`waiting.col.ordered`),
      dataIndex: `orderedAt`,
      width: r(110),
      sorter: (e: any, t: any) => e.orderedAt.localeCompare(t.orderedAt),
      render: (e: any) => <Text type={`secondary`}>{fmtDate(e)}</Text>,
    },
    {
      title: t(`waiting.col.eta`),
      dataIndex: `estimatedReady`,
      width: r(110),
      sorter: (e: any, t: any) => cmpDate(e.estimatedReady, t.estimatedReady),
      render: (e: any, t: any) => {
        let n = !t.allShipped && e && e < `2026-09-22`;
        return (
          <Text
            style={{
              color: n ? colors.error : colors.textSecondary,
              fontWeight: n ? 500 : undefined,
            }}
          >
            {fmtDate(e)}
          </Text>
        );
      },
    },
    {
      title: t(`waiting.col.progress`),
      key: `progress`,
      width: r(200),
      fixed: `right`,
      sorter: (e: any, t: any) => e.shipped / e.total - t.shipped / t.total,
      render: (_e: any, t: any) => progress(t),
    },
  ];
  let packageChips = (e: any) => (
    <Flex gap={6} wrap={true}>
      {e.map((e: any) => {
        let n =
          LOCATION_META[e.location as keyof typeof LOCATION_META] ??
          LOCATION_META.supplier;
        return (
          <Pill
            tone={n.tone as 'brand' | 'muted' | 'warning' | 'success' | 'error'}
            dot={true}
            key={e.id}
          >
            {e.packageCode ?? `${e.stem} · ${t(`waiting.uncoded`)}`}
            {` · `}
            {t(n.labelKey as Parameters<typeof t>[0])}
            {e.deliveryNoteNo && ` · ${e.deliveryNoteNo}`}
            {moriOpenReceiptException(e) &&
              ` · ${t(`receiving.${e.receivingException.type}` as Parameters<typeof t>[0])}`}
          </Pill>
        );
      })}
    </Flex>
  );
  let expanded = (group: any) => (
    <Flex
      vertical={true}
      gap={10}
      style={{
        padding: isMobile ? 0 : `4px 8px`,
      }}
    >
      {group.lines.map((e: any) => {
        let n = productOf(e.sku);
        let r = e.packages.find((e: any) => e.location === `supplier`);
        let i = e.packages.find((e: any) => e.location === `supplierTransit`);
        let a = e.packages.find((e: any) => e.location === `cnWarehouse`);
        let o = e.packages.find((e: any) => e.location === `transit`);
        let s = group.purchaseOrder.deliveryRoute ?? `viaCN`;
        let out = e.packages.some((p: any) => p.location === `customerTransit`);
        let ex = e.packages.find((p: any) => moriOpenReceiptException(p));
        return (
          <Flex vertical={true} gap={6} key={e.sku}>
            <Flex align={`center`} justify={`space-between`} gap={12}>
              {n ? <ItemName product={n} thumb={true} /> : <Text>{e.sku}</Text>}
              <Space wrap={true}>
                <Text
                  style={{
                    whiteSpace: `nowrap`,
                    color:
                      e.shipped === e.packages.length
                        ? colors.success
                        : undefined,
                  }}
                >
                  {t(`waiting.lineProgress`, {
                    qty: e.qty,
                    shipped: e.shipped,
                    total: e.packages.length,
                  })}
                </Text>
                <Pill
                  tone={
                    s === `viaCN`
                      ? `muted`
                      : s === `directHK`
                        ? `brand`
                        : `warning`
                  }
                >
                  {t(`waiting.route.${s}` as Parameters<typeof t>[0])}
                </Pill>
                {r && (
                  <Button
                    size={`small`}
                    onClick={(e: any) => {
                      e.stopPropagation();
                      moriManualShip(
                        moriProcurementRef(r),
                        r.purchaseOrderId,
                        r.sku,
                      );
                    }}
                  >
                    {t(`waiting.manualShip`)}
                  </Button>
                )}
                {i && (
                  <Button
                    size={`small`}
                    type={`primary`}
                    onClick={(e: any) => {
                      e.stopPropagation();
                      openReceipt(
                        `cn`,
                        opsState.packages.filter(
                          (p: any) =>
                            moriProcurementRef(p) === moriProcurementRef(i) &&
                            p.purchaseOrderId === i.purchaseOrderId &&
                            p.sku === i.sku,
                        ),
                      );
                    }}
                  >
                    {t(`waiting.receiveCN`)}
                  </Button>
                )}
                {a && (
                  <Button
                    size={`small`}
                    type={`primary`}
                    onClick={(e: any) => {
                      e.stopPropagation();
                      try {
                        moriTransferHK(
                          moriProcurementRef(a),
                          a.purchaseOrderId,
                          a.sku,
                        );
                      } catch (error: any) {
                        messageApi.error(error.message);
                      }
                    }}
                  >
                    {t(`waiting.transferHK`)}
                  </Button>
                )}
                {o && (
                  <Button
                    size={`small`}
                    type={`primary`}
                    onClick={(e: any) => {
                      e.stopPropagation();
                      openReceipt(
                        `hk`,
                        opsState.packages.filter(
                          (p: any) =>
                            moriProcurementRef(p) === moriProcurementRef(o) &&
                            p.purchaseOrderId === o.purchaseOrderId &&
                            p.sku === o.sku,
                        ),
                      );
                    }}
                  >
                    {t(`waiting.receiveHK`)}
                  </Button>
                )}
                {out && (
                  <Button
                    size={`small`}
                    type={`primary`}
                    onClick={() => openReceipt(`customer`, e.packages)}
                  >
                    {t(`receiving.signature`)}
                  </Button>
                )}
                {ex && (
                  <Button
                    size={`small`}
                    danger={true}
                    onClick={() =>
                      setReceiptScope({
                        packageId: ex.id,
                      })
                    }
                  >
                    {t(`receiving.resolveAction`)}
                  </Button>
                )}
              </Space>
            </Flex>
            {packageChips(e.packages)}
          </Flex>
        );
      })}
    </Flex>
  );
  let stateOptions = [`none`, `partial`, `shipped`].map((e: any) => ({
    value: e,
    label: (
      <Pill
        tone={e === `shipped` ? `success` : e === `partial` ? `brand` : `muted`}
        dot={true}
      >
        {t(`waiting.state.${e}` as Parameters<typeof t>[0])}
      </Pill>
    ),
  }));
  return (
    <Flex vertical={true} gap={12}>
      {receiptScope && (
        <MoriReceivingModal
          scope={receiptScope}
          onClose={() => setReceiptScope(null)}
        />
      )}
      <Flex align={`center`} justify={`space-between`} wrap={true} gap={12}>
        <Flex vertical={true} gap={2}>
          <Title
            level={1}
            style={{
              margin: 0,
            }}
          >
            {t(`waiting.title`)}
          </Title>
          <Text type={`secondary`}>{t(`waiting.subtitle`)}</Text>
        </Flex>
        <Space wrap={true}>
          <Button onClick={() => setReceiptScope({})}>
            {t(`receiving.title`)}
          </Button>
          <Button
            icon={<ExperimentOutlined />}
            onClick={() => setResult(matchShipment(demoShipmentRows()))}
          >
            {t(`waiting.upload.demo`)}
          </Button>
          <Upload
            accept={`.csv,.tsv,.txt`}
            showUploadList={false}
            beforeUpload={onFile}
          >
            <Button type={`primary`} icon={<UploadOutlined />}>
              {t(`waiting.upload.button`)}
            </Button>
          </Upload>
        </Space>
      </Flex>
      <Row gutter={[12, 12]}>
        {[
          {
            title: t(`waiting.stat.orders`),
            value: stats.orders,
          },
          {
            title: t(`waiting.stat.packages`),
            value: `${stats.shipped} / ${stats.pkgs}`,
          },
          {
            title: t(`waiting.stat.done`),
            value: stats.done,
            ok: true,
          },
          {
            title: t(`waiting.stat.overdue`),
            value: stats.overdue,
            warn: stats.overdue > 0,
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
                    color: e.warn
                      ? colors.error
                      : e.ok
                        ? colors.success
                        : undefined,
                  },
                }}
              />
            </Card>
          </Col>
        ))}
      </Row>
      <DataTableCard
        filters={
          <FilterChip
            label={t(`waiting.filter.state`)}
            options={stateOptions}
            value={states}
            onChange={setStates}
          />
        }
        onClearFilters={
          states.length > 0 || keyword
            ? () => {
                setStates([]);
                setKeyword(``);
              }
            : undefined
        }
        search={{
          value: keyword,
          onChange: setKeyword,
          placeholder: t(`waiting.search`),
          width: 300,
        }}
        extra={<NameDisplaySwitch />}
        count={`${t(`waiting.filtered`, {
          n: rows.length,
        })} · ${t(`waiting.hint`)}`}
        mobile={
          <CardList
            items={rows}
            rowKey={(e: any) => e.key}
            renderItem={(e: any) => (
              <Card
                size={`small`}
                styles={{
                  body: {
                    padding: `12px 16px`,
                  },
                }}
              >
                <Flex vertical={true} gap={8}>
                  <Text
                    style={{
                      fontWeight: 600,
                    }}
                  >
                    {e.orderNo}
                    {` · `}
                    {e.customer.alias}
                    {` · `}
                    {e.customer.district}
                  </Text>
                  {progress(e)}
                  <Text
                    type={`secondary`}
                    style={{
                      fontSize: 13,
                    }}
                  >
                    {e.purchaseOrder.batchNo}
                    {` · `}
                    {e.purchaseOrder.supplier}
                  </Text>
                  <Collapse
                    ghost={true}
                    size={`small`}
                    items={[
                      {
                        key: `items`,
                        label: t(`waiting.showItems`, {
                          n: e.lines.length,
                        }),
                        children: expanded(e),
                      },
                    ]}
                  />
                </Flex>
              </Card>
            )}
          />
        }
      >
        <Table
          loading={loading}
          rowKey={`key`}
          columns={columns}
          dataSource={rows}
          pagination={pagination}
          scroll={{
            x: r(1100),
          }}
          expandable={{
            expandedRowRender: expanded,
            expandRowByClick: true,
          }}
          locale={{
            emptyText: <Empty description={t(`common.empty`)} />,
          }}
        />
      </DataTableCard>
      <Modal
        title={t(`waiting.upload.resultTitle`)}
        open={result != null}
        onCancel={() => setResult(null)}
        okText={t(`waiting.upload.apply`, {
          n: (result == null ? undefined : result.matched.length) ?? 0,
        })}
        cancelText={t(`common.cancel`)}
        okButtonProps={{
          disabled: !result || result.matched.length === 0,
        }}
        onOk={apply}
        width={640}
      >
        {result && (
          <Flex
            vertical={true}
            gap={12}
            style={{
              marginTop: 8,
            }}
          >
            <Text>
              {t(`waiting.upload.summary`, {
                matched: result.matched.length,
                unmatched: result.unmatched.length,
              })}
            </Text>
            {result.matched.length > 0 && (
              <Flex vertical={true} gap={6}>
                <Text
                  type={`secondary`}
                  style={{
                    fontSize: 13,
                  }}
                >
                  {t(`waiting.upload.matched`)}
                </Text>
                {result.matched.map((e: any, n: any) => {
                  var r;
                  return (
                    <Flex
                      align={`center`}
                      justify={`space-between`}
                      gap={12}
                      key={`${e.row.supplierOrderNo}-${e.product.sku}-${n}`}
                    >
                      <ItemName product={e.product} compact={true} />
                      <Flex
                        gap={6}
                        align={`center`}
                        wrap={true}
                        style={{
                          justifyContent: `flex-end`,
                        }}
                      >
                        <Text
                          type={`secondary`}
                          style={{
                            fontSize: 13,
                          }}
                        >
                          {e.row.supplierOrderNo}
                          {` · `}
                          {(r = e.packages[0]) == null ? undefined : r.orderNo}
                        </Text>
                        <Pill tone={`success`} dot={true}>
                          {t(`waiting.upload.units`, {
                            n: e.row.qty - e.short,
                            pkgs: e.packages.length,
                          })}
                        </Pill>
                        {e.short > 0 && (
                          <Pill tone={`warning`}>
                            {t(`waiting.upload.short`, {
                              n: e.short,
                            })}
                          </Pill>
                        )}
                      </Flex>
                    </Flex>
                  );
                })}
              </Flex>
            )}
            {result.unmatched.length > 0 && (
              <Flex vertical={true} gap={6}>
                <Text
                  type={`secondary`}
                  style={{
                    fontSize: 13,
                  }}
                >
                  {t(`waiting.upload.unmatched`)}
                </Text>
                {result.unmatched.map((e: any, n: any) => (
                  <Flex
                    align={`center`}
                    justify={`space-between`}
                    gap={12}
                    key={`${e.row.supplierOrderNo}-${n}`}
                  >
                    <Text
                      ellipsis={{
                        tooltip: true,
                      }}
                      style={{
                        minWidth: 0,
                      }}
                    >
                      {e.row.supplierOrderNo}
                      {` · `}
                      {e.row.supplierCode}
                      {` `}
                      {e.row.supplierName}
                      {` × `}
                      {e.row.qty}
                    </Text>
                    <Pill tone={`error`} dot={true}>
                      {t(
                        `waiting.upload.reason.${e.reason}` as Parameters<
                          typeof t
                        >[0],
                      )}
                    </Pill>
                  </Flex>
                ))}
              </Flex>
            )}
            <Text
              type={`secondary`}
              style={{
                fontSize: 13,
              }}
            >
              {t(`waiting.upload.note`)}
            </Text>
          </Flex>
        )}
      </Modal>
    </Flex>
  );
}
function MoriReceivingModal({ scope, onClose }: any) {
  const state = useOps();
  const t = MoriUseT();
  const mobile = useIsMobile();
  const { user } = useAuth();
  const { message } = App.useApp();
  const focused = scope?.packageId
    ? state.packages.find((p: any) => p.id === scope.packageId)
    : null;
  const [stage, setStage] = React.useState<any>(
    scope?.stage || moriReceiptStage(focused || {}) || `cn`,
  );
  const [query, setQuery] = React.useState<any>(scope?.packageId || ``);
  const [view, setView] = React.useState<any>(`pending`);
  const [draft, setDraft] = React.useState<any>({});
  const [date, setDate] = React.useState<any>(today());
  const [owner, setOwner] = React.useState<any>(`Alex`);
  const [due, setDue] = React.useState<any>(today().add(1, `day`));
  const [recipient, setRecipient] = React.useState<any>(``);
  const [proof, setProof] = React.useState<any>(``);
  const [error, setError] = React.useState<any>(``);
  const [page, setPage] = React.useState<any>(1);
  const [discard, setDiscard] = React.useState<any>(false);
  const canEdit =
    can(user?.role || `sales`, `warehouse`, `execute`) ||
    can(user?.role || `sales`, `purchasing`, `execute`);
  const all = moriReceivingRows(state, stage).filter(
    (r: any) => !scope?.ids || scope.ids.includes(r.p.id),
  );
  const filtered = all.filter(
    (r: any) =>
      moriReceivingSearch(r, query) &&
      (view === `all` || view === `exceptions`
        ? view === `all` || !!r.exception
        : moriReceiptCanEdit(r, stage)),
  );
  const pending = all.filter((r: any) => moriReceiptCanEdit(r, stage));
  const selected = Object.entries(draft).filter(
    ([_id, r]: any) => r.result && r.result !== `pending`,
  );
  const hasExceptions = selected.some(
    ([id, r]: any) =>
      r.result !== `received` ||
      moriOpenReceiptException(
        state.packages.find((p: any) => p.id === id) || {},
      ),
  );
  const set = (id: any, patch: any) => {
    setDraft((d: any) => ({
      ...d,
      [id]: {
        ...d[id],
        ...patch,
      },
    }));
    setError(``);
  };
  const label = (key: any) => t(`receiving.${key}` as Parameters<typeof t>[0]);
  const field = (name: any, control: any) => (
    <Flex
      vertical={true}
      gap={4}
      style={{
        minWidth: 0,
        flex: `1 1 160px`,
      }}
    >
      <Text type={`secondary`}>{name}</Text>
      {control}
    </Flex>
  );
  const switchStage = (value: any) => {
    if (selected.length) {
      setError(label(`saveFirst`));
      return;
    }
    setStage(value);
    setQuery(``);
    setDraft({});
    setPage(1);
  };
  const close = () => (selected.length ? setDiscard(true) : onClose());
  const status = (row: any) =>
    row.exception
      ? label(row.exception.type)
      : row.last
        ? label(row.last.result)
        : label(`pending`);
  const tone = (row: any) =>
    row.exception
      ? `error`
      : row.last?.result === `received`
        ? `success`
        : `muted`;
  const history = (row: any) => (
    <Flex vertical={true} gap={3}>
      {row.exception && (
        <Text
          type={`secondary`}
        >{`${row.exception.note} · ${row.exception.owner} · ${row.exception.dueDate}`}</Text>
      )}
      {(row.p.receiptHistory || [])
        .filter((h: any) => h.stage === stage)
        .slice(-3)
        .reverse()
        .map((h: any, i: any) => (
          <Text
            type={`secondary`}
            style={{
              fontSize: 12,
              overflowWrap: `anywhere`,
            }}
            key={i}
          >{`${h.receiptId} · ${h.at.slice(0, 16).replace(`T`, ` `)} · ${staffById(h.actor)?.name || h.actor} · ${label(h.result)}${h.recipient ? ` · ${h.recipient} · ${h.proof}` : ``}${h.note ? ` · ${h.note}` : ``}`}</Text>
        ))}
      {row.p.receivingException?.unexpectedId && (
        <Text
          type={`secondary`}
          style={{
            fontSize: 12,
          }}
        >
          {label(`wrongHeld`) +
            `：` +
            (state.unexpectedReceipts || [])
              .filter(
                (u: any) => u.id === row.p.receivingException.unexpectedId,
              )
              .map(
                (u: any) =>
                  `${u.description} · ${label(u.status === `returned` ? `returned` : `quarantine`)}`,
              )
              .join(``)}
        </Text>
      )}
    </Flex>
  );
  const result = (row: any) => {
    if (!canEdit || !moriReceiptCanEdit(row, stage))
      return <Pill tone={tone(row)}>{status(row)}</Pill>;
    const d = draft[row.p.id] || {};
    const options = row.exception
      ? [`pending`, `received`, `followup`]
      : stage === `customer`
        ? [`pending`, `received`, `short`]
        : [`pending`, `received`, `short`, `wrong`, `damaged`];
    return (
      <Flex
        vertical={true}
        gap={6}
        style={{
          minWidth: 0,
        }}
      >
        <Select
          value={d.result || `pending`}
          style={{
            width: `100%`,
            minWidth: 130,
          }}
          aria-label={`${label(`result`)} ${row.p.id}`}
          options={options.map((value: any) => ({
            value,
            label:
              value === `received`
                ? row.exception
                  ? label(`resolve`)
                  : stage === `customer`
                    ? label(`signed`)
                    : label(`received`)
                : label(value),
          }))}
          onChange={(value: any) =>
            set(row.p.id, {
              result: value,
            })
          }
        />
        {d.result &&
          d.result !== `pending` &&
          (d.result !== `received` || row.exception) && (
            <Input.TextArea
              value={d.note || ``}
              maxLength={500}
              rows={2}
              placeholder={label(`noteRequired`)}
              aria-label={`${label(`note`)} ${row.p.id}`}
              onChange={(e: any) =>
                set(row.p.id, {
                  note: e.target.value,
                })
              }
            />
          )}
        {d.result === `wrong` && (
          <Input
            value={d.observed || ``}
            maxLength={200}
            placeholder={label(`observed`)}
            aria-label={`${label(`observed`)} ${row.p.id}`}
            onChange={(e: any) =>
              set(row.p.id, {
                observed: e.target.value,
              })
            }
          />
        )}
        {row.exception?.type === `wrong` && d.result === `received` && (
          <Checkbox
            checked={d.wrongDisposition === `returned`}
            onChange={(e: any) =>
              set(row.p.id, {
                wrongDisposition: e.target.checked ? `returned` : null,
              })
            }
          >
            {label(`returnConfirmed`)}
          </Checkbox>
        )}
      </Flex>
    );
  };
  const save = () => {
    try {
      if (!canEdit) throw Error(label(`readOnly`));
      const id = moriSaveReceipt({
        stage,
        date: date?.format(`YYYY-MM-DD`),
        rows: selected.map(([id, r]: any) => ({
          id,
          ...r,
        })),
        owner,
        dueDate: due?.format(`YYYY-MM-DD`),
        recipient,
        proof,
        actor: user?.id,
      });
      setDraft({});
      setError(``);
      setView(`all`);
      message.success(`${label(`saved`)} ${id}`);
    } catch (e: any) {
      setError(e.message);
    }
  };
  const columns: any[] = [
    {
      title: label(`package`),
      key: `package`,
      width: 230,
      render: (_: any, row: any) => (
        <Flex vertical={true} gap={3}>
          <Text strong={true}>{row.p.packageCode || row.p.id}</Text>
          <Text type={`secondary`}>{row.p.sku}</Text>
          <Text
            type={`secondary`}
            style={{
              fontSize: 12,
            }}
          >
            {productOf(row.p.sku)?.name || `—`}
          </Text>
          <Text
            type={`secondary`}
            style={{
              fontSize: 12,
            }}
          >
            {row.p.unitId}
          </Text>
        </Flex>
      ),
    },
    {
      title: label(`reference`),
      key: `reference`,
      width: 210,
      render: (_: any, row: any) => (
        <Flex vertical={true} gap={3}>
          <Text>{row.po?.batchNo || `—`}</Text>
          <Text>{row.p.orderNo || moriProcurementRef(row.p) || `—`}</Text>
          <Text type={`secondary`}>{row.p.logisticsNo || `—`}</Text>
          <Text
            type={`secondary`}
            style={{
              fontSize: 12,
            }}
          >
            {row.p.deliveryNoteNo || `—`}
          </Text>
        </Flex>
      ),
    },
    {
      title: label(`current`),
      key: `current`,
      width: 240,
      render: (_: any, row: any) => (
        <Flex vertical={true} gap={6}>
          <Flex gap={4} wrap={true}>
            <Pill tone={tone(row)}>{status(row)}</Pill>
            <Text type={`secondary`}>
              {t(
                (LOC_KEY[row.p.location as keyof typeof LOC_KEY] ||
                  `waiting.loc.supplier`) as Parameters<typeof t>[0],
              )}
            </Text>
          </Flex>
          {history(row)}
        </Flex>
      ),
    },
    {
      title: label(`result`),
      key: `result`,
      width: 230,
      render: (_: any, row: any) => result(row),
    },
  ];
  return (
    <>
      <Modal
        open={true}
        title={label(`title`)}
        width={1040}
        onCancel={close}
        footer={
          <Flex justify={`space-between`} wrap={true} gap={8}>
            <Text
              type={`secondary`}
            >{`${label(`selected`)} ${selected.length} · ${label(`hiddenDraft`)} ${selected.filter(([id]: any) => !filtered.some((r: any) => r.p.id === id)).length}`}</Text>
            <Flex gap={8} wrap={true}>
              <Button onClick={close}>{t(`common.close`)}</Button>
              {canEdit && (
                <Button
                  type={`primary`}
                  disabled={!selected.length}
                  onClick={save}
                >
                  {label(stage === `customer` ? `saveSignature` : `save`)}
                </Button>
              )}
            </Flex>
          </Flex>
        }
        styles={{
          body: {
            maxHeight: mobile ? `68vh` : `72vh`,
            overflowY: `auto`,
          },
        }}
      >
        <Flex vertical={true} gap={12}>
          <Text type={`secondary`}>{label(`hint`)}</Text>
          <Flex gap={8} wrap={true}>
            <Select
              value={stage}
              disabled={!!scope?.stage}
              style={{
                width: 150,
              }}
              options={[`cn`, `hk`, `customer`].map((value: any) => ({
                value,
                label: label(value),
              }))}
              onChange={switchStage}
            />
            <Select
              value={view}
              style={{
                width: 150,
              }}
              options={[`pending`, `exceptions`, `all`].map((value: any) => ({
                value,
                label: label(value === `pending` ? `pendingView` : value),
              }))}
              onChange={(v: any) => {
                setView(v);
                setPage(1);
              }}
            />
            <Input
              value={query}
              allowClear={true}
              placeholder={label(`search`)}
              style={{
                flex: `1 1 220px`,
              }}
              onChange={(e: any) => {
                setQuery(e.target.value);
                setPage(1);
              }}
            />
            <Button
              disabled={!filtered.length}
              onClick={() => moriExportReceiving(filtered, stage)}
            >
              {label(`export`)}
            </Button>
          </Flex>
          <Flex gap={8} wrap={true}>
            <Pill tone={`muted`}>{`${label(`scope`)} ${all.length}`}</Pill>
            <Pill
              tone={`warning`}
            >{`${label(`pendingView`)} ${pending.length}`}</Pill>
            <Pill
              tone={`error`}
            >{`${label(`exceptions`)} ${all.filter((r: any) => r.exception).length}`}</Pill>
            <Text
              type={`secondary`}
            >{`${label(`filtered`)} ${filtered.length}`}</Text>
          </Flex>
          {canEdit && (
            <Flex gap={12} wrap={true}>
              {field(
                label(`date`),
                <DatePicker
                  value={date}
                  onChange={setDate}
                  allowClear={false}
                  maxDate={today()}
                  style={{
                    width: `100%`,
                  }}
                />,
              )}
              {hasExceptions &&
                field(
                  label(`owner`),
                  <Select
                    value={owner}
                    options={OWNERS.map((value: any) => ({
                      value,
                      label: value,
                    }))}
                    onChange={setOwner}
                    style={{
                      width: `100%`,
                    }}
                  />,
                )}
              {hasExceptions &&
                field(
                  label(`due`),
                  <DatePicker
                    value={due}
                    onChange={setDue}
                    minDate={date || today()}
                    style={{
                      width: `100%`,
                    }}
                  />,
                )}
              {stage === `customer` &&
                field(
                  label(`recipient`),
                  <Input
                    value={recipient}
                    maxLength={80}
                    onChange={(e: any) => setRecipient(e.target.value)}
                  />,
                )}
              {stage === `customer` &&
                field(
                  label(`proof`),
                  <Input
                    value={proof}
                    maxLength={300}
                    onChange={(e: any) => setProof(e.target.value)}
                  />,
                )}
            </Flex>
          )}
          {error && <Alert type={`error`} showIcon={true} title={error} />}
          {!canEdit && <Text type={`secondary`}>{label(`readOnly`)}</Text>}
          {mobile ? (
            <CardList
              items={filtered}
              rowKey={(r: any) => r.p.id}
              pageSize={6}
              renderItem={(row: any) => (
                <Card size={`small`}>
                  <Flex vertical={true} gap={8}>
                    <Text
                      strong={true}
                      style={{
                        overflowWrap: `anywhere`,
                      }}
                    >
                      {row.p.packageCode || row.p.id}
                    </Text>
                    <Text>{`${row.p.sku} · ${row.p.orderNo || moriProcurementRef(row.p) || `—`}`}</Text>
                    <Text
                      type={`secondary`}
                      style={{
                        overflowWrap: `anywhere`,
                      }}
                    >{`${row.po?.batchNo || `—`} · ${row.p.logisticsNo || `—`}`}</Text>
                    <Flex gap={6} wrap={true}>
                      <Pill tone={tone(row)}>{status(row)}</Pill>
                      <Text type={`secondary`}>
                        {t(
                          (LOC_KEY[row.p.location as keyof typeof LOC_KEY] ||
                            `waiting.loc.supplier`) as Parameters<typeof t>[0],
                        )}
                      </Text>
                    </Flex>
                    {result(row)}
                    {history(row)}
                  </Flex>
                </Card>
              )}
            />
          ) : (
            <Table
              size={`small`}
              rowKey={(r: any) => r.p.id}
              dataSource={filtered}
              columns={columns}
              scroll={{
                x: 910,
              }}
              pagination={{
                current: page,
                onChange: setPage,
                pageSize: 10,
                showSizeChanger: false,
              }}
              locale={{
                emptyText: label(`empty`),
              }}
            />
          )}
        </Flex>
      </Modal>
      <Modal
        open={discard}
        title={label(`discardTitle`)}
        onCancel={() => setDiscard(false)}
        onOk={onClose}
        okText={label(`discard`)}
        cancelText={label(`continue`)}
      >
        {label(`discardBody`)}
      </Modal>
    </>
  );
}
