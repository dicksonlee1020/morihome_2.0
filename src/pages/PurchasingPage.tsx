import {
  DownloadOutlined,
  FileDoneOutlined,
  InboxOutlined,
} from '@ant-design/icons';
import {
  App,
  Button,
  Card,
  Checkbox,
  Col,
  DatePicker,
  Empty,
  Flex,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Typography,
  Upload,
} from 'antd';
import dayjs from 'dayjs';
import * as React from 'react';
import { useAuth } from '../auth/hooks';
import { CardList } from '../components/CardList';
import { DataTableCard } from '../components/DataTableCard';
import { FilterChip } from '../components/FilterChip';
import { ItemName, NameDisplaySwitch } from '../components/ItemName';
import { Pill } from '../components/Pill';
import { stockedProducts, SUPPLIERS } from '../data/catalog';
import {
  confirmOrdered,
  createPurchaseOrder,
  isStockRequirement,
  moriAppendToPurchaseOrder,
  moriAvailableStock,
  moriCancelRequirement,
  moriCreateManualRequirement,
  moriPurpose,
  moriSetFulfilment,
  moriSetReplenish,
  moriSupersedeRequirement,
  opsState,
  productOf,
  requirementStatus,
  useOps,
} from '../data/ops';
import { DEMO_TODAY } from '../domain/clock';
import { useT as MoriUseT } from '../i18n/hooks';
import { colors } from '../theme';
import { fmtDate } from '../utils/date';
import { money } from '../utils/format';
import {
  downloadPurchaseSheet,
  moriExportPurchaseImage,
  moriReviewConfirmationFile,
} from '../utils/purchaseSheet';
import { useDensity } from '../utils/useDensity';
import { useMockLoading } from '../utils/useMockLoading';
import { useTablePagination } from '../utils/useTablePagination';
const { Text, Title } = Typography;

/**
 * 採購（Ocean feedback B-01 / B-02）。
 * 需求 tab：按供應商 group，揀咗就每個供應商出一份採購表。
 * 採購單 tab：上載訂貨確認 → orderedAt 有值 → 「已訂」係推導，唔係人手剔。
 */
const STATUS_META = {
  partialConfirmed: {
    labelKey: `purchasing.status.partialConfirmed`,
    tone: `warning`,
  },
  confirmationDeferred: {
    labelKey: `purchasing.status.confirmationDeferred`,
    tone: `muted`,
  },
  open: {
    labelKey: `purchasing.status.open`,
    tone: `warning`,
  },
  inPurchaseOrder: {
    labelKey: `purchasing.status.inPo`,
    tone: `brand`,
  },
  ordered: {
    labelKey: `purchasing.status.ordered`,
    tone: `success`,
  },
  stockAssigned: {
    labelKey: `purchasing.status.stockAssigned`,
    tone: `success`,
  },
  cancelled: {
    labelKey: `purchasing.status.cancelled`,
    tone: `muted`,
  },
  superseded: {
    labelKey: `purchasing.status.superseded`,
    tone: `muted`,
  },
};
export function PurchasingPage() {
  let { message } = App.useApp();
  let t = MoriUseT();
  let { wc: n } = useDensity();
  let ops = useOps();
  let [tab, setTab] = React.useState<any>(`requirements`);
  let [suppliers, setSuppliers] = React.useState<any>([]);
  let [statuses, setStatuses] = React.useState<any>([`open`]);
  let [keyword, setKeyword] = React.useState<any>(``);
  let [selected, setSelected] = React.useState<any>([]);
  let [confirming, setConfirming] = React.useState<any>(null);
  let [q, U] = React.useState<any>(null);
  let [B, V] = React.useState<any>(null);
  let [H, W] = React.useState<any>(null);
  let [G, K] = React.useState<any>(null);
  let withStatus = React.useMemo(
    () =>
      ops.requirements.map((e: any) => ({
        ...e,
        status: requirementStatus(e, ops.purchaseOrders),
        stock: moriAvailableStock(e),
      })),
    [ops],
  );
  let openBySupplier = React.useMemo(() => {
    let e = new Map<any, any>();
    for (let t of withStatus)
      if (t.status === `open`) {
        e.set(t.supplier, (e.get(t.supplier) ?? 0) + 1);
      }
    return e;
  }, [withStatus]);
  let rows = React.useMemo(() => {
    let e = keyword.trim().toLowerCase();
    return withStatus
      .filter((t: any) => {
        var n;
        if (
          (suppliers.length > 0 && !suppliers.includes(t.supplier)) ||
          (statuses.length > 0 && !statuses.includes(t.status))
        )
          return false;
        if (!e) return true;
        let r = productOf(t.sku);
        return (
          t.orderNo.toLowerCase().includes(e) ||
          t.sku.toLowerCase().includes(e) ||
          (((n = t.customer) == null ? undefined : n.alias.includes(e)) ??
            false) ||
          (t.linkedOrderNo ?? ``).toLowerCase().includes(e) ||
          ((r == null ? undefined : r.name.toLowerCase().includes(e)) ??
            false) ||
          ((r == null ? undefined : r.supplierName.toLowerCase().includes(e)) ??
            false)
        );
      })
      .sort(
        (e: any, t: any) =>
          e.createdAt.localeCompare(t.createdAt) ||
          e.orderNo.localeCompare(t.orderNo),
      );
  }, [withStatus, suppliers, statuses, keyword]);
  let loading = useMockLoading();
  let pagination = useTablePagination(rows.length);
  let filtered =
    suppliers.length > 0 ||
    statuses.length !== 1 ||
    statuses[0] !== `open` ||
    keyword !== ``;
  let clearFilters = () => {
    setSuppliers([]);
    setStatuses([`open`]);
    setKeyword(``);
    setSelected([]);
  };
  let openRows = rows.filter((e: any) => e.status === `open`);
  let selectedRows = openRows.filter((e: any) => selected.includes(e.id));
  let targetRows = selectedRows.length > 0 ? selectedRows : openRows;
  let targetSuppliers: any[] = [
    ...new Set(
      targetRows
        .filter((e: any) => e.sourcing === `orderNew` || e.replenish)
        .map((e: any) => e.supplier),
    ),
  ];
  let download = () => {
    let n: any[] = [];
    for (let e of targetSuppliers) {
      let t = createPurchaseOrder(
        e,
        targetRows
          .filter(
            (t: any) =>
              t.supplier === e && (t.sourcing === `orderNew` || t.replenish),
          )
          .map((e: any) => e.id),
      );
      if (t!.lines.length) {
        {
          downloadPurchaseSheet(t, ops.requirements);
          n.push(`${t!.batchNo}（${e}）`);
        }
      }
    }
    setSelected([]);
    if (n.length) {
      message.success(
        t(`purchasing.downloaded`, {
          n: n.length,
          list: n.join(`、`),
        }),
        6,
      );
    }
  };
  let stats = React.useMemo(() => {
    let e = withStatus.filter((e: any) => e.status === `open`).length;
    let t = ops.purchaseOrders.filter((e: any) => !e.orderedAt).length;
    let n = ops.purchaseOrders.filter(
      (e: any) => e.orderedAt && e.confirmationState !== `unconfirmed`,
    ).length;
    let i = withStatus
      .filter((e: any) => e.status === `open`)
      .reduce((e: any, t: any) => (t.createdAt < e ? t.createdAt : e), `9999`);
    return {
      open: e,
      drafts: t,
      ordered: n,
      oldestDays: i === `9999` ? 0 : dayjs(`2026-09-22`).diff(i, `day`),
    };
  }, [withStatus, ops.purchaseOrders]);
  let STATUS_ORDER: any[] = [
    `open`,
    `inPurchaseOrder`,
    `partialConfirmed`,
    `confirmationDeferred`,
    `ordered`,
    `stockAssigned`,
    `superseded`,
    `cancelled`,
  ];
  let R = (e: any) => (
    <Button
      size={`small`}
      onClick={(t: any) => {
        t.stopPropagation();
        U(e);
      }}
    >
      {t(`purchasing.action.manage`)}
    </Button>
  );
  let L = (n: any) => {
    let r = n.stock ?? {
      hk: 0,
      cn: 0,
    };
    let i: any[] = [];
    if (r.hk > 0) {
      i.push(
        <Pill tone={`success`} key={`hk`}>
          {t(`purchasing.stock.hk`, {
            n: r.hk,
          })}
        </Pill>,
      );
    }
    if (r.cn > 0) {
      i.push(
        <Pill tone={`brand`} key={`cn`}>
          {t(`purchasing.stock.cn`, {
            n: r.cn,
          })}
        </Pill>,
      );
    }
    return i.length ? (
      <Flex gap={4} wrap={true}>
        {i}
      </Flex>
    ) : (
      <Text type={`secondary`}>{t(`purchasing.stock.none`)}</Text>
    );
  };
  let J = (e: any) => {
    let n = moriPurpose(e);
    return n === `customerOrder` ? null : (
      <Pill
        tone={
          n === `display` ? `brand` : n === `aftersales` ? `warning` : `muted`
        }
      >
        {t(`purchasing.internal.${n}` as Parameters<typeof t>[0])}
      </Pill>
    );
  };
  let columns: any[] = [
    {
      title: t(`purchasing.col.orderNo`),
      dataIndex: `orderNo`,
      width: n(130),
      fixed: `left`,
      sorter: (e: any, t: any) => e.orderNo.localeCompare(t.orderNo),
      render: (e: any, n: any) => (
        <Flex vertical={true} gap={2}>
          <Text
            style={{
              fontWeight: 500,
            }}
          >
            {e}
          </Text>
          {J(n)}
          {n.parentRequirementId && (
            <Text
              type={`secondary`}
              style={{
                fontSize: 12,
              }}
            >{`餘量 · ${n.id} ← ${n.parentRequirementId}`}</Text>
          )}
          {n.linkedOrderNo && (
            <Text
              type={`secondary`}
              style={{
                fontSize: 12,
              }}
            >{`↳ ${n.linkedOrderNo}`}</Text>
          )}
        </Flex>
      ),
    },
    {
      title: t(`purchasing.col.orderDate`),
      dataIndex: `createdAt`,
      width: n(120),
      sorter: (e: any, t: any) => e.createdAt.localeCompare(t.createdAt),
      defaultSortOrder: `ascend`,
      render: (e: any) => <Text type={`secondary`}>{fmtDate(e)}</Text>,
    },
    {
      title: t(`purchasing.col.customer`),
      key: `customer`,
      width: n(140),
      render: (_e: any, n: any) => {
        var r;
        var i;
        return isStockRequirement(n) ? (
          J(n)
        ) : (
          <Text>
            {(r = n.customer) == null ? undefined : r.alias}
            {` · `}
            {(i = n.customer) == null ? undefined : i.district}
          </Text>
        );
      },
    },
    {
      title: t(`purchasing.col.item`),
      key: `item`,
      width: n(300),
      render: (_e: any, t: any) => {
        let n = productOf(t.sku);
        return n ? <ItemName product={n} thumb={true} /> : <Text>{t.sku}</Text>;
      },
    },
    {
      title: t(`purchasing.col.qty`),
      dataIndex: `qty`,
      width: n(74),
      align: `right`,
      sorter: (e: any, t: any) => e.qty - t.qty,
    },
    {
      title: t(`purchasing.col.supplier`),
      dataIndex: `supplier`,
      width: n(140),
      sorter: (e: any, t: any) => e.supplier.localeCompare(t.supplier),
      render: (e: any) => <Text type={`secondary`}>{e}</Text>,
    },
    {
      title: t(`purchasing.col.stock`),
      key: `stock`,
      width: n(150),
      render: (_e: any, t: any) => L(t),
    },
    {
      title: t(`purchasing.col.sourcing`),
      dataIndex: `sourcing`,
      width: n(170),
      render: (e: any, n: any) => (
        <Flex gap={4} wrap={true}>
          <Pill
            tone={
              e === `orderNew`
                ? `muted`
                : e === `useHKStock`
                  ? `success`
                  : `brand`
            }
          >
            {t(
              e === `useHKStock`
                ? `purchasing.sourcing.useHKStock`
                : e === `useCNStock`
                  ? `purchasing.sourcing.useCNStock`
                  : `purchasing.sourcing.orderNew`,
            )}
          </Pill>
          {n.replenish && (
            <Pill tone={`warning`}>{t(`purchasing.replenish.badge`)}</Pill>
          )}
        </Flex>
      ),
    },
    {
      title: t(`common.status`),
      key: `status`,
      width: n(155),
      sorter: (e: any, t: any) =>
        STATUS_ORDER.indexOf(e.status) - STATUS_ORDER.indexOf(t.status),
      render: (_e: any, n: any) => {
        let i = STATUS_META[n.status as keyof typeof STATUS_META];
        let a = ops.purchaseOrders.find((e: any) => e.id === n.purchaseOrderId);
        return (
          <Flex gap={6} align={`center`} wrap={true}>
            <Pill
              tone={
                i.tone as 'brand' | 'muted' | 'warning' | 'success' | 'error'
              }
              dot={true}
            >
              {t(i.labelKey as Parameters<typeof t>[0])}
            </Pill>
            {a && (
              <Text
                type={`secondary`}
                style={{
                  fontSize: 13,
                }}
              >
                {a.batchNo}
              </Text>
            )}
          </Flex>
        );
      },
    },
    {
      title: t(`common.actions`),
      key: `actions`,
      width: n(100),
      fixed: `right`,
      render: (_e: any, t: any) => R(t),
    },
  ];
  let supplierOptions = SUPPLIERS.map((e: any) => ({
    value: e,
    label: (
      <Flex
        justify={`space-between`}
        gap={12}
        style={{
          flexGrow: 1,
        }}
      >
        <Text>{e}</Text>
        <Text type={`secondary`}>{openBySupplier.get(e) ?? 0}</Text>
      </Flex>
    ),
  }));
  let statusOptions = STATUS_ORDER.map((e: any) => ({
    value: e,
    label: (
      <Pill
        tone={
          STATUS_META[e as keyof typeof STATUS_META].tone as
            'brand' | 'muted' | 'warning' | 'success' | 'error'
        }
        dot={true}
      >
        {t(
          STATUS_META[e as keyof typeof STATUS_META].labelKey as Parameters<
            typeof t
          >[0],
        )}
      </Pill>
    ),
  }));
  let downloadLabel =
    targetSuppliers.length > 1
      ? t(`purchasing.downloadMany`, {
          n: targetSuppliers.length,
        })
      : targetSuppliers.length === 1
        ? t(`purchasing.downloadOne`, {
            supplier: targetSuppliers[0],
          })
        : t(`purchasing.download`);
  let requirementsTab = (
    <DataTableCard
      filters={
        <>
          <FilterChip
            label={t(`purchasing.filter.supplier`)}
            options={supplierOptions}
            value={suppliers}
            onChange={(e: any) => {
              setSuppliers(e);
              setSelected([]);
            }}
            renderSelected={(e: any) => (
              <Text
                style={{
                  fontWeight: 500,
                }}
              >
                {e}
              </Text>
            )}
          />
          <FilterChip
            label={t(`purchasing.filter.status`)}
            options={statusOptions}
            value={statuses}
            onChange={(e: any) => {
              setStatuses(e);
              setSelected([]);
            }}
          />
        </>
      }
      onClearFilters={filtered ? clearFilters : undefined}
      search={{
        value: keyword,
        onChange: setKeyword,
        placeholder: t(`purchasing.search`),
      }}
      extra={
        <>
          <NameDisplaySwitch />
          <Button
            type={`primary`}
            icon={<DownloadOutlined />}
            disabled={
              targetRows.filter(
                (e: any) => e.sourcing === `orderNew` || e.replenish,
              ).length === 0
            }
            onClick={download}
          >
            {downloadLabel}
          </Button>
        </>
      }
      count={t(`purchasing.filtered`, {
        n: rows.length,
      })}
      selection={{
        count: selectedRows.length,
        text: t(`purchasing.selected`, {
          n: selectedRows.length,
          suppliers: targetSuppliers.length,
        }),
        actions: null,
        onClear: () => setSelected([]),
      }}
      mobile={
        <CardList
          items={rows}
          rowKey={(e: any) => e.id}
          renderItem={(e: any) => {
            var n;
            var r;
            let i = productOf(e.sku);
            let a = STATUS_META[e.status as keyof typeof STATUS_META];
            let o = selected.includes(e.id);
            return (
              <Card
                size={`small`}
                onClick={() =>
                  e.status === `open` &&
                  setSelected((t: any) =>
                    o ? t.filter((t: any) => t !== e.id) : [...t, e.id],
                  )
                }
                style={{
                  borderColor: o ? colors.primary : undefined,
                }}
              >
                <Flex vertical={true} gap={8}>
                  <Flex justify={`space-between`} align={`center`}>
                    <Flex gap={6} align={`center`} wrap={true}>
                      <Text
                        style={{
                          fontWeight: 600,
                        }}
                      >
                        {isStockRequirement(e)
                          ? e.orderNo
                          : `${e.orderNo} · ${(n = e.customer) == null ? undefined : n.alias} · ${(r = e.customer) == null ? undefined : r.district}`}
                      </Text>
                      {J(e)}
                      {e.parentRequirementId && (
                        <Text
                          type={`secondary`}
                          style={{
                            fontSize: 12,
                          }}
                        >{`餘量 · ${e.id} ← ${e.parentRequirementId}`}</Text>
                      )}
                    </Flex>
                    <Pill
                      tone={
                        a.tone as
                          'brand' | 'muted' | 'warning' | 'success' | 'error'
                      }
                      dot={true}
                    >
                      {t(a.labelKey as Parameters<typeof t>[0])}
                    </Pill>
                  </Flex>
                  {i && <ItemName product={i} thumb={true} />}
                  <Text type={`secondary`}>
                    {e.createdAt}
                    {` · `}
                    {e.supplier}
                    {` · `}
                    {t(`purchasing.col.qty`)}
                    {` `}
                    {e.qty}
                  </Text>
                  <Flex gap={6} wrap={true}>
                    <Pill
                      tone={
                        e.sourcing === `orderNew`
                          ? `muted`
                          : e.sourcing === `useHKStock`
                            ? `success`
                            : `brand`
                      }
                    >
                      {t(
                        e.sourcing === `useHKStock`
                          ? `purchasing.sourcing.useHKStock`
                          : e.sourcing === `useCNStock`
                            ? `purchasing.sourcing.useCNStock`
                            : `purchasing.sourcing.orderNew`,
                      )}
                    </Pill>
                    {e.replenish && (
                      <Pill tone={`warning`}>
                        {t(`purchasing.replenish.badge`)}
                      </Pill>
                    )}
                    {L(e)}
                  </Flex>
                  {R(e)}
                </Flex>
              </Card>
            );
          }}
        />
      }
    >
      <Table
        loading={loading}
        rowKey={`id`}
        columns={columns}
        dataSource={rows}
        pagination={pagination}
        scroll={{
          x: n(1450),
        }}
        rowSelection={{
          selectedRowKeys: selected,
          onChange: setSelected,
          columnWidth: n(48),
          getCheckboxProps: (e: any) => ({
            disabled: e.status !== `open`,
          }),
        }}
        locale={{
          emptyText: <Empty description={t(`purchasing.emptyOpen`)} />,
        }}
      />
    </DataTableCard>
  );
  let ordersTab = (
    <PurchaseOrderList
      orders={[...ops.purchaseOrders]
        .filter((e: any) => e.supplier)
        .sort((e: any, t: any) => t.createdAt.localeCompare(e.createdAt))}
      onConfirm={setConfirming}
      onExport={(e: any) => downloadPurchaseSheet(e, ops.requirements)}
      onExportImage={(e: any) => {
        moriExportPurchaseImage(e, ops.requirements);
        if (e) {
          undefined;
        }
      }}
      onAddOn={K}
    />
  );
  return (
    <Flex vertical={true} gap={12}>
      <Flex align={`center`} justify={`space-between`} wrap={true} gap={12}>
        <Flex vertical={true} gap={2}>
          <Title
            level={1}
            style={{
              margin: 0,
            }}
          >
            {t(`purchasing.title`)}
          </Title>
          <Text type={`secondary`}>{t(`purchasing.flowHint`)}</Text>
        </Flex>
        <Button
          type={`primary`}
          onClick={() =>
            V({
              purpose: `restock`,
              qty: 1,
            })
          }
        >
          {t(`purchasing.manual.new`)}
        </Button>
      </Flex>
      <Row gutter={[12, 12]}>
        {[
          {
            title: t(`purchasing.stat.open`),
            value: stats.open,
            warn: stats.open > 0,
          },
          {
            title: t(`purchasing.stat.oldest`),
            value: t(`purchasing.stat.days`, {
              n: stats.oldestDays,
            }),
            warn: stats.oldestDays >= 3,
          },
          {
            title: t(`purchasing.stat.drafts`),
            value: stats.drafts,
          },
          {
            title: t(`purchasing.stat.ordered`),
            value: stats.ordered,
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
                    color: e.warn ? colors.warningText : undefined,
                  },
                }}
              />
            </Card>
          </Col>
        ))}
      </Row>
      <Tabs
        activeKey={tab}
        onChange={(e: any) => setTab(e)}
        items={[
          {
            key: `requirements`,
            label: t(`purchasing.tab.requirements`, {
              n: stats.open,
            }),
            children: requirementsTab,
          },
          {
            key: `orders`,
            label: t(`purchasing.tab.orders`, {
              n: stats.drafts,
            }),
            children: ordersTab,
          },
        ]}
      />
      <ConfirmModal
        po={confirming}
        onClose={() => setConfirming(null)}
        onSave={(n: any, r: any) => {
          confirmOrdered(n.id, r);
          setConfirming(null);
          message.success(`確認已保存；未確認餘量保留於待採購需求。`);
        }}
      />
      {
        <ManualRequirementModal
          preset={B}
          onClose={() => V(null)}
          onSave={(n: any) => {
            let r = moriCreateManualRequirement(n);
            if (r) {
              {
                V(null);
                message.success(
                  t(`purchasing.manual.saved`, {
                    ref: r.orderNo,
                  }),
                );
              }
            }
          }}
        />
      }
      {
        <RequirementActionModal
          req={q}
          onClose={() => U(null)}
          onUseStock={(n: any, r: any) => {
            if (moriSetFulfilment(n.id, r)) {
              {
                U(null);
                message.success(
                  t(`purchasing.stock.assigned`, {
                    source: r === `useHKStock` ? `香港` : `大陸`,
                  }),
                );
              }
            } else {
              message.error(t(`purchasing.stock.insufficient`));
            }
          }}
          onOrderNew={(n: any) => {
            moriSetFulfilment(n.id, `orderNew`);
            U(null);
          }}
          onReplenish={(n: any) => {
            moriSetReplenish(n.id, !n.replenish);
            U(null);
          }}
          onCreatePo={(n: any) => {
            let i = createPurchaseOrder(n.supplier, [n.id]);
            if (i!.lines.length) {
              {
                downloadPurchaseSheet(i, ops.requirements);
                U(null);
                setTab(`orders`);
                message.success(
                  t(`purchasing.generated`, {
                    n: 1,
                    list: i!.batchNo,
                  }),
                );
              }
            }
          }}
          onManualConfirm={(n: any) => {
            let r = createPurchaseOrder(n.supplier, [n.id]);
            if (r!.lines.length) {
              {
                U(null);
                setConfirming(r);
                setTab(`orders`);
              }
            }
          }}
          onCopy={(n: any) => {
            U(null);
            V({
              purpose: `restock`,
              sku: n.sku,
              qty: n.qty,
              note: `複製自 ${n.orderNo}`,
            });
          }}
          onChange={(n: any) => {
            U(null);
            W(n);
          }}
          onCancel={(n: any) => {
            if (moriCancelRequirement(n.id)) {
              {
                U(null);
                message.success(t(`purchasing.action.cancelled`));
              }
            }
          }}
          onShowPo={() => {
            U(null);
            setTab(`orders`);
          }}
        />
      }
      {
        <ChangeRequirementModal
          req={H}
          onClose={() => W(null)}
          onSave={(n: any, r: any) => {
            let i = moriSupersedeRequirement(n.id, r);
            if (i) {
              {
                W(null);
                message.success(t(`purchasing.action.superseded`));
              }
            }
          }}
        />
      }
      {
        <AddOnModal
          po={G}
          onClose={() => K(null)}
          onSave={(n: any, r: any) => {
            let i = moriAppendToPurchaseOrder(n.id, r);
            if (i) {
              {
                K(null);
                setTab(`orders`);
                message.success(
                  t(
                    i.parentPurchaseOrderId
                      ? `purchasing.addon.savedRevision`
                      : `purchasing.addon.savedDraft`,
                    {
                      batch: i.batchNo,
                    },
                  ),
                );
              }
            }
          }}
        />
      }
    </Flex>
  );
}
function PurchaseOrderList({
  orders,
  onConfirm,
  onExport,
  onExportImage: r,
  onAddOn: open,
}: any) {
  let setOpen = MoriUseT();
  let [o, s] = React.useState<any>(null);
  return orders.length === 0 ? (
    <Empty description={setOpen(`common.empty`)} />
  ) : (
    <Flex vertical={true} gap={8}>
      {orders.map((e: any) => {
        let l = !!e.orderedAt;
        let u = o === e.id;
        return (
          <Card
            size={`small`}
            styles={{
              body: {
                padding: `12px 16px`,
              },
            }}
            key={e.id}
          >
            <Flex vertical={true} gap={8}>
              <Flex
                align={`center`}
                justify={`space-between`}
                wrap={true}
                gap={8}
              >
                <Flex
                  vertical={true}
                  gap={2}
                  style={{
                    minWidth: 0,
                  }}
                >
                  <Flex gap={8} align={`center`} wrap={true}>
                    <Text
                      style={{
                        fontWeight: 600,
                      }}
                    >
                      {e.batchNo}
                    </Text>
                    <Pill
                      tone={
                        (l && e.confirmationState === `confirmed`) ||
                        (l && !e.confirmationState)
                          ? `success`
                          : `warning`
                      }
                      dot={true}
                    >
                      {e.confirmationState === `partial`
                        ? `部分確認`
                        : e.confirmationState === `unconfirmed`
                          ? `未確認・已轉待採購`
                          : setOpen(
                              l
                                ? `purchasing.po.ordered`
                                : `purchasing.po.draft`,
                            )}
                    </Pill>
                    {(e.revision ?? 1) > 1 && (
                      <Pill tone={`brand`}>
                        {setOpen(`purchasing.po.revision`, {
                          n: e.revision,
                        })}
                      </Pill>
                    )}
                  </Flex>
                  <Text
                    type={`secondary`}
                    style={{
                      fontSize: 13,
                    }}
                  >
                    {e.supplier}
                    {` · `}
                    {setOpen(`purchasing.po.lines`, {
                      n: e.lines.length,
                    })}
                    {` · `}
                    {setOpen(`purchasing.po.created`, {
                      date: e.createdAt,
                    })}
                  </Text>
                  {l &&
                    e.matchReview?.unmatched?.some((r: any) => !r.resolved) && (
                      <Text
                        type={`secondary`}
                        style={{
                          fontSize: 12,
                        }}
                      >{`未配對 ${e.matchReview.unmatched.filter((r: any) => !r.resolved).length} 行 · 已保留採購異常待辦`}</Text>
                    )}
                  {l && (
                    <Text
                      type={`secondary`}
                      style={{
                        fontSize: 13,
                      }}
                    >
                      {setOpen(`purchasing.po.supplierNo`)}
                      {` `}
                      {e.supplierOrderNo}
                      {e.estimatedReady &&
                        ` · ${setOpen(`purchasing.po.estimatedReady`, {
                          date: e.estimatedReady,
                        })}`}
                      {` · `}
                      {setOpen(
                        `purchasing.route.${e.deliveryRoute ?? `viaCN`}` as Parameters<
                          typeof setOpen
                        >[0],
                      )}
                      {e.confirmationFile && ` · ${e.confirmationFile}`}
                    </Text>
                  )}
                </Flex>
                <Space wrap={true}>
                  <Button size={`small`} onClick={() => s(u ? null : e.id)}>
                    {setOpen(
                      u ? `purchasing.po.collapse` : `purchasing.po.expand`,
                    )}
                  </Button>
                  <Button
                    size={`small`}
                    icon={<DownloadOutlined />}
                    onClick={() => onExport(e)}
                  >
                    {setOpen(`purchasing.po.export`)}
                  </Button>
                  <Button size={`small`} onClick={() => r(e)}>
                    {setOpen(`purchasing.po.image`)}
                  </Button>
                  <Button size={`small`} onClick={() => open(e)}>
                    {setOpen(`purchasing.addon`)}
                  </Button>
                  {!l && (
                    <Button
                      size={`small`}
                      type={`primary`}
                      icon={<FileDoneOutlined />}
                      onClick={() => onConfirm(e)}
                    >
                      {setOpen(`purchasing.po.uploadConfirmation`)}
                    </Button>
                  )}
                </Space>
              </Flex>
              {u &&
                e.matchReview?.unmatched
                  ?.filter((r: any) => !r.resolved)
                  .map((row: any) => (
                    <Text
                      type={`secondary`}
                      style={{
                        fontSize: 12,
                      }}
                      key={row.rowId}
                    >{`${row.label} · ${row.followupReason || row.reason} · ${row.owner || `—`}`}</Text>
                  ))}
              {u && (
                <Flex
                  vertical={true}
                  gap={6}
                  style={{
                    borderTop: `1px solid ${colors.border}`,
                    paddingTop: 8,
                  }}
                >
                  {e.lines.map((e: any) => {
                    let t = productOf(e.sku);
                    return (
                      <Flex
                        align={`center`}
                        justify={`space-between`}
                        gap={12}
                        key={e.requirementId}
                      >
                        {t ? (
                          <ItemName product={t} thumb={true} />
                        ) : (
                          <Text>{e.sku}</Text>
                        )}
                        <Text
                          style={{
                            textAlign: `right`,
                            overflowWrap: `anywhere`,
                          }}
                        >
                          {e.remainingQty != null
                            ? `需求 ${e.qty} · 確認 ${e.confirmedQty} · 餘量 ${e.remainingQty}`
                            : `× ${e.confirmedQty ?? e.qty}`}
                          {e.remainingRequirementId &&
                            ` · ${e.remainingRequirementId}`}
                          {e.unitCost != null &&
                            ` · ${setOpen(`purchasing.po.actualUnitCost`, {
                              cost: money(e.unitCost),
                            })}`}
                        </Text>
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
} /**
 * B-02：上載訂貨確認。TODO：自動讀檔（OCR）留後；而家人手 key 供應商單號。
 * 附件只係記名，真上傳要行帶 auth 嘅 endpoint（CLAUDE.md）。
 */

function ConfirmModal({ po, onClose, onSave }: any) {
  const t = MoriUseT();
  const { user } = useAuth();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [file, setFile] = React.useState<any>(null);
  const [review, setReview] = React.useState<any>(null);
  const [saving, setSaving] = React.useState<any>(false);
  const token = React.useRef(0);
  const initialise = () => {
    form.resetFields();
    const fields: any = {
      deliveryRoute: po?.deliveryRoute || `viaCN`,
    };
    for (const line of po?.lines || []) {
      fields[`qty_${line.requirementId}`] = line.qty;
      fields[`cost_${line.requirementId}`] = productOf(line.sku)?.cost;
      fields[`check_${line.requirementId}`] = false;
    }
    form.setFieldsValue(fields);
  };
  React.useEffect(() => {
    token.current++;
    setFile(null);
    setReview(null);
    if (po) initialise();
  }, [po?.id]);
  const downloadTemplate = () => {
    const quote = (v: any) => `"${String(v ?? ``).replace(/"/g, `""`)}"`;
    const rows: any[] = [
      [`SKU`, `OrderNo`, `PR`, `qty`, `cost`, `supplierReference`],
      ...po.lines.map((l: any) => [
        l.sku,
        opsState.requirements.find((r: any) => r.id === l.requirementId)
          ?.orderNo || ``,
        l.requirementId,
        l.qty,
        productOf(l.sku)?.cost ?? ``,
        ``,
      ]),
    ];
    const url = URL.createObjectURL(
      new Blob(
        [
          `\uFEFF` +
            rows.map((row: any) => row.map(quote).join(`,`)).join(`\r\n`),
        ],
        {
          type: `text/csv;charset=utf-8`,
        },
      ),
    );
    const a = document.createElement(`a`);
    a.href = url;
    a.download = `${po.batchNo}-confirmation-template.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const applyRow = (row: any) => {
    form.setFieldsValue({
      [`qty_${row.requirementId}`]: row.qty,
      [`cost_${row.requirementId}`]: row.cost,
      [`ref_${row.requirementId}`]: row.supplierReference || ``,
      [`check_${row.requirementId}`]: false,
    });
  };
  const upload = (f: any) => {
    const current = ++token.current;
    setFile(f);
    initialise();
    setReview({
      loading: true,
      matched: [],
      unmatched: [],
    });
    moriReviewConfirmationFile(f, po).then((result: any) => {
      if (current !== token.current) return;
      result.matched.forEach(applyRow);
      setReview(result);
      const refs: any[] = [
        ...new Set(
          [...result.matched, ...result.unmatched]
            .map((r: any) => r.supplierReference)
            .filter(Boolean),
        ),
      ];
      if (refs.length === 1)
        form.setFieldsValue({
          supplierOrderNo: refs[0],
        });
    });
    return false;
  };
  const mapRow = (row: any, index: any) => {
    const line = po.lines.find((l: any) => l.requirementId === row.targetId);
    if (!line) return message.error(`請選擇配對需求。`);
    if (review.matched.some((r: any) => r.requirementId === line.requirementId))
      return message.error(`此需求已有配對行，請先核對重複資料。`);
    if (
      row.qty === null ||
      !Number.isInteger(row.qty) ||
      row.qty < 0 ||
      row.qty > line.qty ||
      row.cost === null ||
      row.cost < 0
    )
      return message.error(
        `文件數量／價格缺漏或超出需求，請在下方人工確認，並記錄此行跟進原因。`,
      );
    const matched: any = {
      ...row,
      requirementId: line.requirementId,
      manualMapped: true,
    };
    applyRow(matched);
    setReview({
      ...review,
      matched: [...review.matched, matched],
      unmatched: review.unmatched.map((r: any, i: any) =>
        i === index
          ? {
              ...r,
              resolved: true,
              resolution: `mapped`,
              requirementId: line.requirementId,
            }
          : r,
      ),
    });
  };
  const update = (index: any, patch: any) =>
    setReview((r: any) => ({
      ...r,
      unmatched: r.unmatched.map((row: any, i: any) =>
        i === index
          ? {
              ...row,
              ...patch,
            }
          : row,
      ),
    }));
  const submit = async () => {
    if (!po || review?.loading) return;
    try {
      const raw = form.getFieldsValue(true);
      const lines = po.lines.filter(
        (l: any) => raw[`check_${l.requirementId}`],
      );
      if (!lines.length)
        return message.error(`請至少勾選一行「已核對」；確認量可為 0。`);
      const valid = await form.validateFields([
        `supplierOrderNo`,
        `estimatedReady`,
        `deliveryRoute`,
        ...lines.flatMap((l: any) => [
          `qty_${l.requirementId}`,
          `cost_${l.requirementId}`,
          `ref_${l.requirementId}`,
        ]),
      ]);
      const v: any = {
        ...raw,
        ...valid,
      };
      if (
        review?.unmatched.some(
          (r: any) => !r.resolved && (!r.followupReason?.trim() || !r.owner),
        )
      )
        return message.error(`請為未配對行填寫跟進原因及負責人。`);
      setSaving(true);
      onSave(po, {
        actor: user?.id || `u-alex`,
        supplierOrderNo: v.supplierOrderNo.trim(),
        confirmationFile: file?.name || null,
        estimatedReady: v.estimatedReady?.format(`YYYY-MM-DD`) || null,
        deliveryRoute: v.deliveryRoute,
        matchReview: review
          ? {
              ...review,
              unmatched: review.unmatched.map((r: any) => ({
                ...r,
                followupReason: r.followupReason?.trim(),
                followupDate: DEMO_TODAY,
              })),
            }
          : null,
        lineConfirmations: lines.map((l: any) => ({
          requirementId: l.requirementId,
          confirmedQty: Number(v[`qty_${l.requirementId}`]),
          unitCost: Number(v[`cost_${l.requirementId}`]),
          supplierReference:
            v[`ref_${l.requirementId}`]?.trim() || v.supplierOrderNo.trim(),
          confirmationSource: review?.matched.some(
            (r: any) => r.requirementId === l.requirementId,
          )
            ? `file-reviewed`
            : `manual-reviewed`,
        })),
      });
    } catch (error) {
      if (error instanceof Error) message.error(error.message);
    } finally {
      setSaving(false);
    }
  };
  const text = (value: any, props: any = {}) => <Text {...props}>{value}</Text>;
  return (
    <Modal
      title={
        po
          ? t(`purchasing.confirm.title`, {
              batch: po.batchNo,
            })
          : ``
      }
      open={!!po}
      onCancel={onClose}
      okText={`儲存已核對行`}
      cancelText={t(`common.cancel`)}
      destroyOnHidden={true}
      confirmLoading={saving}
      okButtonProps={{
        disabled: !!review?.loading,
      }}
      afterClose={() => {
        token.current++;
        setFile(null);
        setReview(null);
        form.resetFields();
      }}
      onOk={submit}
      width={680}
    >
      {po && (
        <Form
          form={form}
          layout={`vertical`}
          style={{
            marginTop: 12,
          }}
        >
          <Upload.Dragger
            maxCount={1}
            accept={`.pdf,.png,.jpg,.jpeg,.xlsx,.xls,.csv,.tsv,.txt`}
            beforeUpload={upload}
            onRemove={() => {
              token.current++;
              setFile(null);
              setReview(null);
              initialise();
              return true;
            }}
            fileList={file ? [file] : []}
            style={{
              marginBottom: 12,
            }}
          >
            {
              <p>
                <InboxOutlined
                  style={{
                    fontSize: 28,
                    color: colors.primary,
                  }}
                />
              </p>
            }
            {<p>{t(`purchasing.confirm.drop`)}</p>}
            {
              <p
                style={{
                  color: colors.textSecondary,
                  fontSize: 13,
                }}
              >
                {t(`purchasing.confirm.dropHint`)}
              </p>
            }
          </Upload.Dragger>
          {text(
            `Excel／CSV 按 SKU＋客單／PR 配對；PDF／圖片保留作憑證，逐行人工確認。`,
            {
              type: `secondary`,
              style: {
                display: `block`,
                fontSize: 12,
                marginBottom: 12,
              },
            },
          )}
          <Button
            size={`small`}
            onClick={downloadTemplate}
            style={{
              marginBottom: 12,
            }}
          >{`下載確認範本（CSV）`}</Button>
          {review && (
            <Card
              size={`small`}
              style={{
                marginBottom: 12,
              }}
            >
              {text(`文件配對覆核`, {
                strong: true,
              })}
              {review.loading ? (
                text(`讀取中…`)
              ) : (
                <Flex
                  vertical={true}
                  gap={8}
                  style={{
                    marginTop: 8,
                  }}
                >
                  {text(
                    `${file?.name || `—`} · 已配對 ${review.matched.length} 行 · 待處理 ${review.unmatched.filter((r: any) => !r.resolved).length} 行`,
                    {
                      type: `secondary`,
                    },
                  )}
                  {review.error &&
                    text(review.error, {
                      type: `warning`,
                    })}
                  {review.matched.map((row: any) => (
                    <Flex gap={6} wrap={true} key={row.rowId}>
                      {text(
                        `${row.label} · ${row.orderNo || opsState.requirements.find((r: any) => r.id === row.requirementId)?.orderNo || `—`} · ${row.requirementId}`,
                      )}
                      <Pill tone={`brand`}>{`已配對・待核對`}</Pill>
                      {text(`數量 ${row.qty} · ${money(row.cost)}`, {
                        type: `secondary`,
                      })}
                    </Flex>
                  ))}
                  {review.unmatched.map((row: any, index: any) => (
                    <Flex
                      vertical={true}
                      gap={6}
                      style={{
                        borderTop: `1px solid ${colors.border}`,
                        paddingTop: 8,
                      }}
                      key={row.rowId}
                    >
                      {text(
                        `${row.label} · ${row.orderNo || row.requirementId || `—`} · 數量 ${row.qty ?? `—`} · ${row.cost === null ? `—` : money(row.cost)}`,
                      )}
                      {text(row.reason, {
                        type: `secondary`,
                      })}
                      {row.resolved ? (
                        <Pill
                          tone={`success`}
                        >{`已人工配對 · ${row.requirementId}`}</Pill>
                      ) : (
                        <Flex vertical={true} gap={6}>
                          <Select
                            placeholder={`選擇此批次客單／PR（可選）`}
                            value={row.targetId}
                            style={{
                              width: `100%`,
                            }}
                            showSearch={true}
                            optionFilterProp={`label`}
                            onChange={(value: any) =>
                              update(index, {
                                targetId: value,
                              })
                            }
                            options={po.lines.map((l: any) => ({
                              value: l.requirementId,
                              label: `${opsState.requirements.find((r: any) => r.id === l.requirementId)?.orderNo || `—`} · ${l.requirementId} · ${l.sku} × ${l.qty}`,
                            }))}
                          />
                          <Button
                            size={`small`}
                            onClick={() => mapRow(row, index)}
                          >{`套用人工配對`}</Button>
                          {text(`未配對行會保留並建立採購異常待辦：`, {
                            type: `secondary`,
                            style: {
                              fontSize: 12,
                            },
                          })}
                          <Input
                            placeholder={`跟進原因（必填，例如：文件屬另一批次）`}
                            value={row.followupReason || ``}
                            onChange={(e: any) =>
                              update(index, {
                                followupReason: e.target.value,
                              })
                            }
                          />
                          <Select
                            placeholder={`負責人（必填）`}
                            value={row.owner}
                            style={{
                              width: `100%`,
                            }}
                            options={[`Alex`, `Ocean`, `Kengi`].map(
                              (v: any) => ({
                                value: v,
                                label: v,
                              }),
                            )}
                            onChange={(value: any) =>
                              update(index, {
                                owner: value,
                              })
                            }
                          />
                        </Flex>
                      )}
                    </Flex>
                  ))}
                </Flex>
              )}
            </Card>
          )}
          <Form.Item
            name={`supplierOrderNo`}
            label={t(`purchasing.confirm.supplierNo`)}
            rules={[
              {
                required: true,
                whitespace: true,
                message: `請輸入供應商訂單號／微信確認參考。`,
              },
            ]}
          >
            <Input placeholder={`HB2026092300005127 / 微信確認參考`} />
          </Form.Item>
          <Form.Item
            name={`estimatedReady`}
            label={t(`purchasing.confirm.estimatedReady`)}
          >
            <DatePicker
              style={{
                width: `100%`,
              }}
            />
          </Form.Item>
          <Form.Item
            name={`deliveryRoute`}
            label={t(`purchasing.confirm.route`)}
            rules={[
              {
                required: true,
              },
            ]}
          >
            <Select
              options={[`viaCN`, `directHK`, `directCustomer`].map(
                (v: any) => ({
                  value: v,
                  label: t(`purchasing.route.${v}` as Parameters<typeof t>[0]),
                }),
              )}
            />
          </Form.Item>
          {text(`逐行核對確認量及實際採購價`, {
            strong: true,
            style: {
              display: `block`,
              marginBottom: 8,
            },
          })}
          <Flex vertical={true} gap={8}>
            {po.lines.map((line: any) => {
              const product = productOf(line.sku);
              const req = opsState.requirements.find(
                (r: any) => r.id === line.requirementId,
              );
              return (
                <Card
                  size={`small`}
                  styles={{
                    body: {
                      padding: `10px 12px`,
                    },
                  }}
                  key={line.requirementId}
                >
                  {text(`${req?.orderNo || `—`} · ${line.requirementId}`, {
                    type: `secondary`,
                    style: {
                      display: `block`,
                      fontSize: 12,
                      marginBottom: 6,
                    },
                  })}
                  {product ? (
                    <ItemName product={product} compact={true} />
                  ) : (
                    text(line.sku)
                  )}
                  {text(`需求 ${line.qty} 件`, {
                    style: {
                      display: `block`,
                      marginTop: 6,
                    },
                  })}
                  <Row
                    gutter={8}
                    style={{
                      marginTop: 8,
                    }}
                  >
                    <Col xs={24} sm={10}>
                      <Form.Item
                        name={`qty_${line.requirementId}`}
                        label={`供應商確認量`}
                        rules={[
                          {
                            required: true,
                            message: `請輸入確認量。`,
                          },
                          {
                            validator: (_: any, v: any) =>
                              Number.isInteger(v) && v >= 0 && v <= line.qty
                                ? Promise.resolve()
                                : Promise.reject(
                                    Error(`需為 0–${line.qty} 的整數。`),
                                  ),
                          },
                        ]}
                        style={{
                          marginBottom: 8,
                        }}
                      >
                        <InputNumber
                          min={0}
                          max={line.qty}
                          precision={0}
                          style={{
                            width: `100%`,
                          }}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={14}>
                      <Form.Item
                        name={`cost_${line.requirementId}`}
                        label={`實際採購單價`}
                        rules={[
                          {
                            required: true,
                            message: `請輸入實際採購價；0 可保留。`,
                          },
                          {
                            validator: (_: any, v: any) =>
                              typeof v === `number` &&
                              Number.isFinite(v) &&
                              v >= 0
                                ? Promise.resolve()
                                : Promise.reject(Error(`價格需為非負數。`)),
                          },
                        ]}
                        style={{
                          marginBottom: 8,
                        }}
                      >
                        <InputNumber
                          min={0}
                          precision={2}
                          prefix={`HK$`}
                          style={{
                            width: `100%`,
                          }}
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Form.Item
                    name={`ref_${line.requirementId}`}
                    label={`此行供應商參考（空白沿用批次參考）`}
                    style={{
                      marginBottom: 8,
                    }}
                  >
                    <Input />
                  </Form.Item>
                  <Form.Item noStyle={true} shouldUpdate={true}>
                    {() =>
                      text(
                        `未確認餘量：${Math.max(0, line.qty - (form.getFieldValue(`check_${line.requirementId}`) ? Number(form.getFieldValue(`qty_${line.requirementId}`) || 0) : 0))} 件 · 儲存後保留為待採購需求`,
                        {
                          type: `secondary`,
                          style: {
                            display: `block`,
                            fontSize: 12,
                            marginBottom: 8,
                          },
                        },
                      )
                    }
                  </Form.Item>
                  <Form.Item
                    name={`check_${line.requirementId}`}
                    valuePropName={`checked`}
                    style={{
                      marginBottom: 0,
                    }}
                  >
                    <Checkbox>{`已核對此行數量、採購價及供應商參考`}</Checkbox>
                  </Form.Item>
                </Card>
              );
            })}
          </Flex>
          {text(
            `只為已核對的確認量建立包件。未勾選行及未確認餘量另建 PR，保留原需求／批次連結；儲存後可從「待採購」繼續跟進。`,
            {
              type: `secondary`,
              style: {
                display: `block`,
                fontSize: 13,
                marginTop: 10,
              },
            },
          )}
        </Form>
      )}
    </Modal>
  );
}
function ManualRequirementModal({ preset: e, onClose: t, onSave: n }: any) {
  let r = MoriUseT();
  let [i] = Form.useForm();
  return (
    <Modal
      title={r(`purchasing.manual.title`)}
      open={e != null}
      onCancel={t}
      okText={r(`common.save`)}
      cancelText={r(`common.cancel`)}
      destroyOnHidden={true}
      afterClose={() => i.resetFields()}
      onOk={() => i.validateFields().then(n)}
    >
      {e && (
        <Form
          form={i}
          layout={`vertical`}
          initialValues={{
            purpose: e.purpose ?? `restock`,
            sku: e.sku,
            qty: e.qty ?? 1,
            linkedOrderNo: e.linkedOrderNo ?? ``,
            note: e.note ?? ``,
          }}
          style={{
            marginTop: 12,
          }}
        >
          <Form.Item
            name={`purpose`}
            label={r(`purchasing.manual.purpose`)}
            rules={[
              {
                required: true,
              },
            ]}
          >
            <Select
              options={[`restock`, `display`, `aftersales`, `other`].map(
                (e: any) => ({
                  value: e,
                  label: r(
                    `purchasing.manual.purpose.${e}` as Parameters<typeof r>[0],
                  ),
                }),
              )}
            />
          </Form.Item>
          <Form.Item
            name={`sku`}
            label={r(`purchasing.manual.sku`)}
            rules={[
              {
                required: true,
              },
            ]}
          >
            <Select
              showSearch={true}
              optionFilterProp={`label`}
              options={stockedProducts.map((e: any) => ({
                value: e.sku,
                label: `${e.sku} · ${e.name} · ${e.supplierName}`,
              }))}
            />
          </Form.Item>
          <Form.Item
            name={`qty`}
            label={r(`purchasing.manual.qty`)}
            rules={[
              {
                required: true,
              },
            ]}
          >
            <InputNumber
              min={1}
              max={999}
              style={{
                width: `100%`,
              }}
            />
          </Form.Item>
          <Form.Item
            name={`linkedOrderNo`}
            label={r(`purchasing.manual.linkedOrder`)}
          >
            <Input placeholder={`PO3579`} />
          </Form.Item>
          <Form.Item name={`note`} label={r(`purchasing.manual.note`)}>
            <Input.TextArea
              autoSize={{
                minRows: 2,
                maxRows: 4,
              }}
            />
          </Form.Item>
        </Form>
      )}
    </Modal>
  );
}
function ChangeRequirementModal({ req: e, onClose: t, onSave: n }: any) {
  let r = MoriUseT();
  let [i] = Form.useForm();
  return (
    <Modal
      title={r(`purchasing.change.title`)}
      open={e != null}
      onCancel={t}
      okText={r(`common.confirm`)}
      cancelText={r(`common.cancel`)}
      destroyOnHidden={true}
      afterClose={() => i.resetFields()}
      onOk={() => i.validateFields().then((t: any) => e && n(e, t.sku))}
    >
      {e && (
        <Form
          form={i}
          layout={`vertical`}
          style={{
            marginTop: 12,
          }}
        >
          <Text
            type={`secondary`}
            style={{
              display: `block`,
              marginBottom: 12,
            }}
          >
            {r(`purchasing.change.hint`)}
          </Text>
          <ItemName product={productOf(e.sku)!} thumb={true} />
          <Form.Item
            name={`sku`}
            label={r(`purchasing.change.newSku`)}
            rules={[
              {
                required: true,
              },
            ]}
            style={{
              marginTop: 12,
            }}
          >
            <Select
              showSearch={true}
              optionFilterProp={`label`}
              options={stockedProducts
                .filter((t: any) => t.sku !== e.sku)
                .map((e: any) => ({
                  value: e.sku,
                  label: `${e.sku} · ${e.name} · ${e.supplierName}`,
                }))}
            />
          </Form.Item>
        </Form>
      )}
    </Modal>
  );
}
function RequirementActionModal({
  req: e,
  onClose: t,
  onUseStock: n,
  onOrderNew: r,
  onReplenish: i,
  onCreatePo: a,
  onManualConfirm: o,
  onCopy: s,
  onChange: c,
  onCancel: l,
  onShowPo: u,
}: any) {
  let d = MoriUseT();
  if (!e) return <Modal open={false} />;
  let f = e.status ?? requirementStatus(e, opsState.purchaseOrders);
  let p = e.stock ?? moriAvailableStock(e);
  let m = f === `open`;
  let h = e.sourcing === `useHKStock` || e.sourcing === `useCNStock`;
  return (
    <Modal
      title={d(`purchasing.action.title`)}
      open={true}
      onCancel={t}
      footer={null}
      destroyOnHidden={true}
    >
      <Flex
        vertical={true}
        gap={12}
        style={{
          marginTop: 8,
        }}
      >
        <ItemName product={productOf(e.sku)!} thumb={true} />
        <Text type={`secondary`}>
          {d(`purchasing.action.current`, {
            status: d(
              STATUS_META[f as keyof typeof STATUS_META].labelKey as Parameters<
                typeof d
              >[0],
            ),
          })}
        </Text>
        <Space wrap={true}>
          {m && !h && p.hk > 0 && (
            <Button onClick={() => n(e, `useHKStock`)}>
              {d(`purchasing.action.useHK`)}
            </Button>
          )}
          {m && !h && p.cn > 0 && (
            <Button onClick={() => n(e, `useCNStock`)}>
              {d(`purchasing.action.useCN`)}
            </Button>
          )}
          {h && !e.purchaseOrderId && (
            <Button onClick={() => r(e)}>
              {d(`purchasing.action.orderNew`)}
            </Button>
          )}
          {h && !e.purchaseOrderId && (
            <Button
              type={e.replenish ? `default` : `primary`}
              onClick={() => i(e)}
            >
              {d(
                e.replenish
                  ? `purchasing.action.cancelReplenish`
                  : `purchasing.action.replenish`,
              )}
            </Button>
          )}
          {m && (e.sourcing === `orderNew` || e.replenish) && (
            <Button type={`primary`} onClick={() => a(e)}>
              {d(`purchasing.action.createPo`)}
            </Button>
          )}
          {m && (e.sourcing === `orderNew` || e.replenish) && (
            <Button onClick={() => o(e)}>
              {d(`purchasing.action.manualConfirm`)}
            </Button>
          )}
          <Button onClick={() => s(e)}>{d(`purchasing.action.copySku`)}</Button>
          {!isStockRequirement(e) && !e.cancelledAt && (
            <Button onClick={() => c(e)}>
              {d(`purchasing.action.changeSku`)}
            </Button>
          )}
          {e.purchaseOrderId && (
            <Button onClick={u}>{d(`purchasing.action.toOrders`)}</Button>
          )}
          {!e.purchaseOrderId && !e.cancelledAt && !e.supersededAt && (
            <Button danger={true} onClick={() => l(e)}>
              {d(`purchasing.action.cancelRequirement`)}
            </Button>
          )}
        </Space>
      </Flex>
    </Modal>
  );
}
function AddOnModal({ po: e, onClose: t, onSave: n }: any) {
  let r = MoriUseT();
  let i = useOps();
  let [a] = Form.useForm();
  let o = e
    ? i.requirements.filter(
        (t: any) =>
          t.supplier === e.supplier &&
          requirementStatus(t, i.purchaseOrders) === `open` &&
          (t.sourcing === `orderNew` || t.replenish),
      )
    : [];
  return (
    <Modal
      title={
        e
          ? r(`purchasing.addon.title`, {
              batch: e.batchNo,
            })
          : ``
      }
      open={e != null}
      onCancel={t}
      okText={r(`purchasing.addon`)}
      cancelText={r(`common.cancel`)}
      destroyOnHidden={true}
      okButtonProps={{
        disabled: o.length === 0,
      }}
      afterClose={() => a.resetFields()}
      onOk={() =>
        a.validateFields().then((t: any) => e && n(e, t.requirements ?? []))
      }
    >
      {e && (
        <Form
          form={a}
          layout={`vertical`}
          style={{
            marginTop: 12,
          }}
        >
          <Form.Item
            name={`requirements`}
            label={r(`purchasing.addon.requirements`)}
            rules={[
              {
                required: true,
              },
            ]}
          >
            <Select
              mode={`multiple`}
              showSearch={true}
              optionFilterProp={`label`}
              options={o.map((e: any) => ({
                value: e.id,
                label: `${e.orderNo} · ${e.sku} × ${e.qty}`,
              }))}
            />
          </Form.Item>
        </Form>
      )}
    </Modal>
  );
}
