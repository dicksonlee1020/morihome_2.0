import { SwapOutlined } from '@ant-design/icons';
import {
  App,
  Button,
  Card,
  Col,
  Collapse,
  Empty,
  Flex,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Typography,
} from 'antd';
import * as React from 'react';
import { useAuth } from '../auth/hooks';
import { CardList } from '../components/CardList';
import { DataTableCard } from '../components/DataTableCard';
import { FilterChip } from '../components/FilterChip';
import { ItemName, NameDisplaySwitch } from '../components/ItemName';
import { Pill } from '../components/Pill';
import { accountOf } from '../data/admin';
import {
  hkPackages,
  moriFreePackage,
  moriIncompleteAllocation,
  moriOpenReceiptException,
  moriOpenReceivingTask,
  moriOrderCapacity,
  moriPackagePurpose,
  moriReallocatePackages,
  moriUnitGroups,
  productOf,
  useOps,
} from '../data/ops';
import { daysSince } from '../domain/clock';
import { IN_HK } from '../domain/types';
import { useT as MoriUseT } from '../i18n/hooks';
import { colors } from '../theme';
import { fmtDate, fmtWhen } from '../utils/date';
import { useDensity } from '../utils/useDensity';
import { useMockLoading } from '../utils/useMockLoading';
import { useTablePagination } from '../utils/useTablePagination';
const { Text, Title } = Typography;

/**
 * 庫存 = 而家喺香港嘅包件（Ocean feedback B-05：貨到咗就係庫存，見貨賣貨）。
 * 「實有 / 預留 / 可售 / 安全存量」呢套只留畀儲定貨款，搬咗去備貨表。
 * 位置係唯一真相（INVARIANT 1）；呢頁冇任何改狀態嘅掣，調撥都係開 move。
 */
const LOC_LABEL = {
  cnWarehouse: `inventory.loc.cnWarehouse`,
  transit: `inventory.loc.transit`,
  hkWarehouse: `inventory.loc.hkWarehouse`,
  showroom: `inventory.loc.showroom`,
};
export function InventoryPage({ onOpenRestock }: any) {
  let { message } = App.useApp();
  let n = MoriUseT();
  let { wc: r } = useDensity();
  let ops = useOps();
  let [locs, setLocs] = React.useState<any>([]);
  let [kinds, setKinds] = React.useState<any>([]);
  let [keyword, setKeyword] = React.useState<any>(``);
  let [selected, setSelected] = React.useState<any>([]);
  let [R, L] = React.useState<any>(null);
  let all = React.useMemo(() => hkPackages(ops), [ops]);
  let orderByNo = React.useMemo(
    () => new Map(ops.orders.map((e: any) => [e.orderNo, e])),
    [ops.orders],
  );
  let customerOf = (e: any) => {
    var t;
    return e
      ? (t = orderByNo.get(e)) == null
        ? undefined
        : t.customer
      : undefined;
  };
  let G = (e: any) => {
    const purpose = moriPackagePurpose(e, ops);
    return purpose === `customerOrder`
      ? `order`
      : purpose === `display`
        ? `display`
        : purpose === `aftersales`
          ? `aftersales`
          : purpose === `other`
            ? `other`
            : `stock`;
  };
  let rows = React.useMemo(() => {
    let e = keyword.trim().toLowerCase();
    return all
      .filter((t: any) => {
        var n;
        var r;
        if (
          (locs.length > 0 && !locs.includes(t.location)) ||
          (kinds.length > 0 && !kinds.includes(G(t)))
        )
          return false;
        if (!e) return true;
        let i = productOf(t.sku);
        return (
          (t.packageCode ?? ``).toLowerCase().includes(e) ||
          (t.procurementReference ?? ``).toLowerCase().includes(e) ||
          t.sku.toLowerCase().includes(e) ||
          (((n = t.orderNo) == null
            ? undefined
            : n.toLowerCase().includes(e)) ??
            false) ||
          (((r = customerOf(t.orderNo)) == null
            ? undefined
            : r.alias.includes(e)) ??
            false) ||
          ((i == null ? undefined : i.name.toLowerCase().includes(e)) ??
            false) ||
          ((i == null ? undefined : i.supplierName.toLowerCase().includes(e)) ??
            false)
        );
      })
      .sort((e: any, t: any) =>
        !!e.orderNo == !!t.orderNo
          ? (e.arrivedAt ?? ``).localeCompare(t.arrivedAt ?? ``)
          : e.orderNo
            ? -1
            : 1,
      );
  }, [all, locs, kinds, keyword, orderByNo]);
  let loading = useMockLoading();
  let pagination = useTablePagination(rows.length);
  let stats = React.useMemo(() => {
    let e = new Set<any>();
    let t = new Set<any>();
    let n = 0;
    for (let r of all)
      if (moriPackagePurpose(r, ops) === `customerOrder` && r.orderNo) {
        {
          e.add(r.orderNo);
          if (
            IN_HK.includes(r.location) &&
            (daysSince(r.arrivedAt) ?? 0) >= 14
          ) {
            t.add(r.orderNo);
          }
        }
      } else {
        if (moriFreePackage(r, ops)) {
          n += 1;
        }
      }
    return {
      pkgs: all.length,
      orders: e.size,
      stock: n,
      escalated: t.size,
    };
  }, [all]);
  let ageCell = (e: any) => {
    let t = daysSince(e.arrivedAt);
    let r = !!e.orderNo && IN_HK.includes(e.location) && (t ?? 0) >= 14;
    return (
      <Flex vertical={true}>
        <Text
          style={{
            color: r ? colors.error : undefined,
            fontWeight: r ? 500 : undefined,
          }}
        >
          {t == null
            ? `—`
            : n(`inventory.days`, {
                n: t,
              })}
          {r && ` · ${n(`inventory.escalated`)}`}
        </Text>
        <Text
          type={`secondary`}
          style={{
            fontSize: 13,
          }}
        >
          {fmtDate(e.arrivedAt)}
        </Text>
      </Flex>
    );
  };
  let belongsTo = (e: any) => (
    <Flex vertical={true} gap={2}>
      {moriOpenReceiptException(e) && (
        <Button
          size={`small`}
          type={`link`}
          danger={true}
          onClick={() =>
            moriOpenReceivingTask({
              packageId: e.id,
            })
          }
        >
          {n(`receiving.resolveAction`)}
        </Button>
      )}
      {moriPackagePurpose(e, ops) === `customerOrder` ? (
        <Text
          style={{
            fontWeight: 500,
          }}
        >
          {e.orderNo}
          {` · `}
          {customerOf(e.orderNo)?.alias ?? `—`}
        </Text>
      ) : (
        <Pill
          tone={moriPackagePurpose(e, ops) === `display` ? `brand` : `muted`}
        >
          {n(
            moriPackagePurpose(e, ops) === `display`
              ? `inventory.kind.display`
              : moriPackagePurpose(e, ops) === `aftersales`
                ? `inventory.kind.aftersales`
                : moriPackagePurpose(e, ops) === `other`
                  ? `inventory.kind.other`
                  : `inventory.kind.stock`,
          )}
        </Pill>
      )}
      <Text
        type={`secondary`}
        style={{
          fontSize: 12,
          overflowWrap: `anywhere`,
        }}
      >{`來源 ${e.procurementReference || `期初庫存`}${e.purchaseOrderId ? ` · ${ops.purchaseOrders.find((p: any) => p.id === e.purchaseOrderId)?.batchNo || `—`}` : ``}`}</Text>
    </Flex>
  );
  let H = (e: any) =>
    e === `hkWarehouse`
      ? `success`
      : e === `transit`
        ? `warning`
        : e === `showroom`
          ? `brand`
          : `muted`;
  let columns: any[] = [
    {
      title: n(`inventory.col.package`),
      dataIndex: `packageCode`,
      width: r(150),
      fixed: `left`,
      sorter: (e: any, t: any) =>
        (e.packageCode ?? ``).localeCompare(t.packageCode ?? ``),
      render: (e: any) => (
        <Text
          style={{
            fontWeight: 500,
            fontFamily: `ui-monospace, Menlo, monospace`,
            fontSize: 13,
          }}
        >
          {e ?? n(`inventory.uncoded`)}
        </Text>
      ),
    },
    {
      title: n(`inventory.col.item`),
      key: `item`,
      width: r(320),
      render: (_e: any, t: any) => {
        let n = productOf(t.sku);
        return n ? <ItemName product={n} thumb={true} /> : <Text>{t.sku}</Text>;
      },
    },
    {
      title: n(`inventory.col.location`),
      dataIndex: `location`,
      width: r(110),
      render: (e: any) => (
        <Pill tone={H(e)}>
          {n(
            (LOC_LABEL[e as keyof typeof LOC_LABEL] ?? e) as Parameters<
              typeof n
            >[0],
          )}
        </Pill>
      ),
    },
    {
      title: n(`inventory.col.belongsTo`),
      key: `belongsTo`,
      width: r(170),
      render: (_e: any, t: any) => belongsTo(t),
    },
    {
      title: n(`inventory.col.inHk`),
      key: `age`,
      width: r(140),
      sorter: (e: any, t: any) =>
        (e.arrivedAt ?? ``).localeCompare(t.arrivedAt ?? ``),
      render: (_e: any, t: any) => ageCell(t),
    },
    {
      title: n(`inventory.col.note`),
      dataIndex: `deliveryNoteNo`,
      width: r(150),
      responsive: [`xl`],
      render: (e: any, t: any) => (
        <Text
          type={`secondary`}
          ellipsis={{
            tooltip: t.logisticsNo ?? undefined,
          }}
        >
          {e ?? `—`}
        </Text>
      ),
    },
  ];
  let locOptions = [`cnWarehouse`, `transit`, `hkWarehouse`, `showroom`].map(
    (e: any) => ({
      value: e,
      label: (
        <Pill tone={H(e)}>
          {n(LOC_LABEL[e as keyof typeof LOC_LABEL] as Parameters<typeof n>[0])}
        </Pill>
      ),
    }),
  );
  let kindOptions = [`order`, `stock`, `display`, `aftersales`, `other`].map(
    (e: any) => ({
      value: e,
      label: n(
        e === `order`
          ? `inventory.kind.order`
          : e === `display`
            ? `inventory.kind.display`
            : e === `aftersales`
              ? `inventory.kind.aftersales`
              : e === `other`
                ? `inventory.kind.other`
                : `inventory.kind.stock`,
      ),
    }),
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
            {n(`inventory.title`)}
          </Title>
          <Text type={`secondary`}>{n(`inventory.subtitle`)}</Text>
        </Flex>
        <Space>
          <Button onClick={onOpenRestock}>{n(`inventory.openRestock`)}</Button>
          <Button
            type={`primary`}
            onClick={() => message.info(n(`inventory.startCountDemo`))}
          >
            {n(`inventory.startCount`)}
          </Button>
        </Space>
      </Flex>
      <Row gutter={[12, 12]}>
        {[
          {
            title: n(`inventory.stat.packages`),
            value: stats.pkgs,
          },
          {
            title: n(`inventory.stat.orders`),
            value: stats.orders,
          },
          {
            title: n(`inventory.stat.stock`),
            value: stats.stock,
          },
          {
            title: n(`inventory.stat.escalated`, {
              days: 14,
            }),
            value: stats.escalated,
            warn: stats.escalated > 0,
          },
        ].map((e: any) => (
          <Col xs={12} lg={6} key={e.title}>
            <Card size={`small`}>
              <Statistic
                title={e.title}
                value={e.value.toLocaleString(`en-HK`)}
                styles={{
                  content: {
                    fontSize: 22,
                    fontWeight: 600,
                    color: e.warn ? colors.error : undefined,
                  },
                }}
              />
            </Card>
          </Col>
        ))}
      </Row>
      <DataTableCard
        filters={
          <>
            <FilterChip
              label={n(`inventory.col.location`)}
              options={locOptions}
              value={locs}
              onChange={setLocs}
            />
            <FilterChip
              label={n(`inventory.filter.kind`)}
              options={kindOptions}
              value={kinds}
              onChange={setKinds}
            />
          </>
        }
        onClearFilters={
          locs.length > 0 || kinds.length > 0 || keyword
            ? () => {
                setLocs([]);
                setKinds([]);
                setKeyword(``);
              }
            : undefined
        }
        search={{
          value: keyword,
          onChange: setKeyword,
          placeholder: n(`inventory.search`),
          width: 300,
        }}
        extra={<NameDisplaySwitch />}
        count={n(`inventory.filtered`, {
          n: rows.length.toLocaleString(`en-HK`),
        })}
        selection={{
          count: selected.length,
          text: n(`inventory.selected`, {
            n: selected.length,
          }),
          actions: (
            <>
              <Button
                size={`small`}
                icon={<SwapOutlined />}
                onClick={() =>
                  message.info(
                    n(`inventory.bulk.transferDemo`, {
                      n: selected.length,
                    }),
                  )
                }
              >
                {n(`inventory.bulk.transfer`)}
              </Button>
              <Button size={`small`} onClick={() => L([...selected])}>
                {n(`inventory.bulk.allocate`)}
              </Button>
              <Button
                size={`small`}
                onClick={() =>
                  message.info(
                    n(`inventory.bulk.adjustDemo`, {
                      n: selected.length,
                    }),
                  )
                }
              >
                {n(`inventory.bulk.adjust`)}
              </Button>
            </>
          ),
          onClear: () => setSelected([]),
        }}
        mobile={
          <CardList
            items={rows}
            rowKey={(e: any) => e.id}
            renderItem={(e: any) => {
              let t = productOf(e.sku);
              return (
                <Card
                  size={`small`}
                  styles={{
                    body: {
                      padding: `12px 16px`,
                    },
                  }}
                >
                  <Flex vertical={true} gap={8}>
                    <Flex justify={`space-between`} align={`center`} gap={8}>
                      <Text
                        style={{
                          fontWeight: 600,
                          fontFamily: `ui-monospace, Menlo, monospace`,
                          fontSize: 13,
                        }}
                      >
                        {e.packageCode ?? n(`inventory.uncoded`)}
                      </Text>
                      <Pill tone={H(e.location)}>
                        {n(
                          (LOC_LABEL[e.location as keyof typeof LOC_LABEL] ??
                            e.location) as Parameters<typeof n>[0],
                        )}
                      </Pill>
                    </Flex>
                    {t && <ItemName product={t} thumb={true} />}
                    <Flex justify={`space-between`} align={`center`} gap={8}>
                      {belongsTo(e)}
                      {ageCell(e)}
                      <Button
                        size={`small`}
                        onClick={() =>
                          L(
                            ops.packages
                              .filter((p: any) => p.unitId === e.unitId)
                              .map((p: any) => p.id),
                          )
                        }
                      >{`分配`}</Button>
                    </Flex>
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
            x: r(1e3),
          }}
          rowSelection={{
            selectedRowKeys: selected,
            onChange: setSelected,
            columnWidth: r(48),
          }}
          locale={{
            emptyText: <Empty description={n(`common.empty`)} />,
          }}
        />
      </DataTableCard>
      {
        <AllocationModal
          packageIds={R}
          onClose={() => L(null)}
          onSelectSet={(ids: any) => {
            L(ids);
            setSelected(ids);
          }}
          onSave={(e: any, r: any) => {
            try {
              let i = moriReallocatePackages(e, r);
              if (i > 0) {
                {
                  L(null);
                  setSelected([]);
                  message.success(
                    n(`inventory.allocate.saved`, {
                      n: i,
                    }),
                  );
                }
              }
            } catch (error: any) {
              message.error(error.message);
            }
          }}
        />
      }
    </Flex>
  );
}
function AllocationModal({ packageIds, onClose, onSave, onSelectSet }: any) {
  const t = MoriUseT();
  const state = useOps();
  const { user } = useAuth();
  const [form] = Form.useForm();
  const [kind, setKind] = React.useState<any>(`restock`);
  const selected = state.packages.filter((p: any) =>
    packageIds?.includes(p.id),
  );
  const skus: any[] = [...new Set(selected.map((p: any) => p.sku))];
  const sku = skus.length === 1 ? skus[0] : null;
  const units = sku ? moriUnitGroups(selected, sku) : [];
  const complete =
    units.flat().length === selected.length && selected.length > 0;
  const unitIds = new Set<any>(selected.map((p: any) => p.unitId));
  const whole = state.packages.filter(
    (p: any) => p.unitId && unitIds.has(p.unitId),
  );
  const sources: any[] = [
    ...new Set(selected.map((p: any) => p.orderNo).filter(Boolean)),
  ];
  const options = sku
    ? state.orders
        .filter((o: any) => o.lines.some((l: any) => l.sku === sku))
        .map((o: any) => {
          const cap = moriOrderCapacity(o, sku, state);
          const pending = state.requirements.some(
            (r: any) =>
              r.orderNo === o.orderNo &&
              r.sku === sku &&
              r.purchaseOrderId &&
              !state.purchaseOrders.find((p: any) => p.id === r.purchaseOrderId)
                ?.orderedAt,
          );
          return {
            value: o.orderNo,
            label: `${o.orderNo} · ${o.customer.alias} · 尚欠 ${cap.remaining} / ${cap.required} 件${pending ? ` · 有待確認採購` : ``}`,
            disabled:
              moriIncompleteAllocation(o.orderNo, sku, state) ||
              cap.remaining < units.length ||
              selected.some((p: any) => p.orderNo === o.orderNo) ||
              pending,
          };
        })
    : [];
  return (
    <Modal
      title={t(`inventory.allocate.title`)}
      open={!!packageIds}
      onCancel={onClose}
      okText={t(`common.confirm`)}
      cancelText={t(`common.cancel`)}
      destroyOnHidden={true}
      okButtonProps={{
        disabled: !sku || !complete,
      }}
      afterClose={() => {
        form.resetFields();
        setKind(`restock`);
      }}
      onOk={() =>
        form
          .validateFields()
          .then((v: any) =>
            onSave(packageIds, {
              ...v,
              actor: user?.id,
            }),
          )
          .catch(() => {})
      }
    >
      {packageIds && (
        <Form
          form={form}
          layout={`vertical`}
          initialValues={{
            type: `restock`,
          }}
          style={{
            marginTop: 12,
          }}
        >
          <Text
            style={{
              display: `block`,
              marginBottom: 8,
            }}
          >{`已選 ${selected.length} 包件 · ${units.length} 完整件 · ${sku || `多個 SKU`}`}</Text>
          {!complete && (
            <Flex
              gap={8}
              wrap={true}
              style={{
                marginBottom: 12,
              }}
            >
              <Pill tone={`warning`}>{`請選齊同一件貨品全部包件`}</Pill>
              {sku && whole.length > selected.length && (
                <Button
                  size={`small`}
                  onClick={() => onSelectSet(whole.map((p: any) => p.id))}
                >{`補選同套包件`}</Button>
              )}
            </Flex>
          )}
          <Text
            type={`secondary`}
            style={{
              display: `block`,
              fontSize: 12,
              marginBottom: 12,
            }}
          >{`分配只改用途／客單，實體倉位及採購來源保持獨立。只有同一倉位已收貨的完整貨品可分配。`}</Text>
          {sources.length > 0 && (
            <Text
              type={`warning`}
              style={{
                display: `block`,
                marginBottom: 12,
              }}
            >{`調走後將檢查原客單 ${sources.join(`、`)} 的缺口，保留待採購需求及核對待辦；已約送貨日期需跟進覆核。`}</Text>
          )}
          <Form.Item
            name={`type`}
            label={t(`inventory.allocate.target`)}
            rules={[
              {
                required: true,
              },
            ]}
          >
            <Select
              onChange={setKind}
              options={[
                {
                  value: `restock`,
                  label: t(`inventory.allocate.stock`),
                },
                {
                  value: `display`,
                  label: t(`inventory.allocate.display`),
                },
                {
                  value: `order`,
                  label: t(`inventory.allocate.order`),
                },
              ]}
            />
          </Form.Item>
          {kind === `order` && (
            <Form.Item
              name={`orderNo`}
              label={t(`inventory.allocate.orderField`)}
              rules={[
                {
                  required: true,
                },
              ]}
            >
              <Select
                showSearch={true}
                optionFilterProp={`label`}
                options={options}
              />
            </Form.Item>
          )}
          <Form.Item
            name={`reason`}
            label={`分配原因`}
            rules={[
              {
                required: true,
                whitespace: true,
                message: `請填寫分配原因。`,
              },
            ]}
          >
            <Input.TextArea
              autoSize={{
                minRows: 2,
                maxRows: 4,
              }}
              placeholder={`例如：調貨予較早收貨客戶／取消預留／轉陳列`}
            />
          </Form.Item>
          {selected.some((p: any) => p.allocationHistory?.length) && (
            <Collapse
              size={`small`}
              items={[
                {
                  key: `history`,
                  label: `分配記錄`,
                  children: (
                    <Flex vertical={true} gap={6}>
                      {selected.flatMap((p: any) =>
                        (p.allocationHistory || [])
                          .slice(-3)
                          .map((h: any, i: any) => (
                            <Text
                              type={`secondary`}
                              style={{
                                fontSize: 12,
                              }}
                              key={`${p.id}-${i}`}
                            >{`${p.packageCode || p.id} · ${fmtWhen(h.at)} · ${accountOf(h.actor)?.displayName || h.actor || `—`} · ${h.from} → ${h.to} · ${h.reason}`}</Text>
                          )),
                      )}
                    </Flex>
                  ),
                },
              ]}
            />
          )}
        </Form>
      )}
    </Modal>
  );
}
