import { CalendarOutlined, WhatsAppOutlined } from '@ant-design/icons';
import { Flex, Typography } from 'antd';
import type { MessageInstance } from 'antd/es/message/interface';
import type { ReactNode } from 'react';
import type { StaffUser } from '../auth';
import { ItemName } from '../components/ItemName';
import { Pill } from '../components/Pill';
import type { StaffRole } from '../config/permissions';
import { can, canSee } from '../config/permissions';
import { BUCKET_META } from '../data/buckets';
import type { Channel } from '../data/ops';
import {
  getOps,
  packagesOfOrder,
  productOf,
  scheduleOrder,
  updateOrder,
} from '../data/ops';
import { orderBucket } from '../domain/derive';
import type { Activity } from '../domain/types';
import type { MessageKey, Translate } from '../i18n';
import { colors } from '../theme';
import { fmtDate } from '../utils/date';
import { money, moriPhoneFormat } from '../utils/format';
import type { Tone } from '../utils/tones';
import { SchedulePopoverContent } from './RecordPeek';
const { Text } = Typography;
type OpsState = ReturnType<typeof getOps>;
export interface PeekCtx {
  t: Translate;
  role: StaffRole;
  user: StaffUser | null;
  ops: OpsState;
  message: MessageInstance;
}
export interface SummaryField {
  key: string;
  label: string;
  value: ReactNode;
  editHint?: string;
  editable?:
    | {
        type: 'date';
        value: string | null;
        onChange: (v: string) => void;
      }
    | {
        type: 'text';
        value: string;
        onChange: (v: string) => void;
      }
    | {
        type: 'select';
        value: string;
        options: {
          value: string;
          label: string;
        }[];
        onChange: (v: string) => void;
      };
}
export interface PeekAction {
  key: string;
  label: string;
  icon?: ReactNode;
  primary?: boolean;
  onClick: () => void;
  /** 有 content 就係原地 popover（例：安排送貨揀日期時段） */
  content?: ReactNode;
}

/**
 * side-peek-spec §6：一個通用組件 + 每個 model 一份 config。
 * Phase 1 覆蓋 訂單｜採購單｜送貨單｜包件｜流水／對數｜商品｜客戶 —— 先做訂單做樣板，其餘逐個推。
 */
export interface PeekConfig<T> {
  load: (ops: OpsState, id: string) => T | null;
  recordId: (r: T) => string;
  title: (r: T) => string;
  status: (
    r: T,
    ctx: PeekCtx,
  ) => {
    labelKey: MessageKey;
    tone: Tone;
  };
  actions: (r: T, ctx: PeekCtx) => PeekAction[];
  menu: (
    r: T,
    ctx: PeekCtx,
  ) => {
    key: string;
    label: string;
    onClick: () => void;
  }[];
  summary: (r: T, ctx: PeekCtx) => SummaryField[];
  tabs: (
    r: T,
    ctx: PeekCtx,
  ) => {
    key: string;
    label: string;
    content: ReactNode;
  }[];
  activities: (r: T, ctx: PeekCtx) => Activity[];
}
const CHANNEL_KEY: Record<Channel, MessageKey> = {
  shopify: 'orders.channel.shopify',
  showroom: 'orders.channel.showroom',
  whatsapp: 'orders.channel.whatsapp',
  phone: 'orders.channel.phone',
};
const LOC_KEY = {
  customerTransit: `waiting.loc.customerTransit`,
  supplier: `waiting.loc.supplier`,
  supplierTransit: `waiting.loc.supplierTransit`,
  cnWarehouse: `waiting.loc.cnWarehouse`,
  transit: `waiting.loc.transit`,
  hkWarehouse: `inventory.loc.hkWarehouse`,
  showroom: `inventory.loc.showroom`,
  customer: `peek.loc.customer`,
  returnArea: `peek.loc.returnArea`,
  stockLoss: `peek.loc.stockLoss`,
};
const LOC_TONE = {
  customerTransit: `brand`,
  supplier: `muted`,
  supplierTransit: `brand`,
  cnWarehouse: `brand`,
  transit: `brand`,
  hkWarehouse: `success`,
  showroom: `success`,
  customer: `success`,
  returnArea: `warning`,
  stockLoss: `error`,
};
// 其餘 model（採購單 / 包件 / 商品）等訂單 review 完先逐個加
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const PEEK_CONFIGS = {
  order: {
    load: (e: any, t: any) =>
      e.orders.find((e: any) => e.orderNo === t || e.id === t) ?? null,
    recordId: (e: any) => e.orderNo,
    title: (e: any) => e.orderNo,
    status: (e: any, { ops: t }: any) =>
      BUCKET_META[orderBucket(packagesOfOrder(t, e.orderNo), e.delivery)],
    actions: (e: any, { t, role: n, user: r, ops: i, message: a }: any) => {
      let o = orderBucket(packagesOfOrder(i, e.orderNo), e.delivery);
      let s: any[] = [];
      if (
        o === `toSchedule` &&
        (can(n, `delivery`, `execute`) || can(n, `orders`, `execute`))
      ) {
        s.push({
          key: `schedule`,
          label: t(`orders.action.schedule`),
          icon: <CalendarOutlined />,
          primary: true,
          onClick: () => undefined,
          content: (
            <SchedulePopoverContent
              t={t}
              onSubmit={(n: any, i: any) => {
                scheduleOrder(
                  e.orderNo,
                  n,
                  i,
                  (r == null ? undefined : r.id) ?? `u-system`,
                );
                a.success(
                  t(`followups.schedule.done`, {
                    order: e.orderNo,
                    date: n,
                    slot: t(`followups.slot.${i}`),
                  }),
                );
              }}
            />
          ),
        });
      }
      if (canSee(n, `CUSTOMER_PII`)) {
        s.push({
          key: `whatsapp`,
          label: t(`peek.action.whatsapp`),
          icon: <WhatsAppOutlined />,
          onClick: () =>
            window.open(
              `https://wa.me/852${e.customer.phone.replace(/\s/g, ``)}`,
              `_blank`,
              `noopener`,
            ),
        });
      }
      return s;
    },
    menu: (_e: any, { t, role: n, message: r }: any) => [
      ...(can(n, `orders`, `export`)
        ? [
            {
              key: `export`,
              label: t(`orders.action.exportOne`),
              onClick: () => r.success(t(`common.exported`)),
            },
          ]
        : []),
      {
        key: `link`,
        label: t(`peek.action.copyLink`),
        onClick: () => {
          var e;
          if (!((e = navigator.clipboard) == null)) {
            e.writeText(window.location.href).then(() =>
              r.success(t(`peek.action.linkCopied`)),
            );
          }
        },
      },
    ],
    summary: (e: any, { t, role: n, user: r }: any) => {
      let i = can(n, `orders`, `edit`);
      let a = (r == null ? undefined : r.id) ?? `u-system`;
      return [
        {
          key: `customer`,
          label: t(`orders.col.customer`),
          value: e.customer.alias,
        },
        ...(canSee(n, `CUSTOMER_PII`)
          ? [
              {
                key: `phone`,
                label: t(`orders.col.phone`),
                value: (
                  <span
                    style={{
                      fontVariantNumeric: `tabular-nums`,
                    }}
                  >
                    {moriPhoneFormat(e.customer.phone)}
                  </span>
                ),
              },
            ]
          : []),
        {
          key: `district`,
          label: t(`orders.col.district`),
          value: e.customer.district,
        },
        {
          key: `channel`,
          label: t(`orders.col.channel`),
          value: t(CHANNEL_KEY[e.channel as keyof typeof CHANNEL_KEY]),
          editHint: t(`peek.editHint`),
          editable: i
            ? {
                type: `select`,
                value: e.channel,
                options: Object.keys(CHANNEL_KEY).map((e: any) => ({
                  value: e,
                  label: t(CHANNEL_KEY[e as keyof typeof CHANNEL_KEY]),
                })),
                onChange: (t: any) =>
                  updateOrder(
                    e.orderNo,
                    {
                      channel: t,
                    },
                    a,
                  ),
              }
            : undefined,
        },
        {
          key: `createdAt`,
          label: t(`orders.col.orderedAt`),
          value: fmtDate(e.createdAt, `detail`),
        },
        {
          key: `requested`,
          label: t(`peek.field.customerRequestedDate`),
          value: e.customerRequestedDate
            ? fmtDate(e.customerRequestedDate, `detail`)
            : `—`,
          editHint: t(`peek.editHint`),
          editable: i
            ? {
                type: `date`,
                value: e.customerRequestedDate,
                onChange: (t: any) =>
                  updateOrder(
                    e.orderNo,
                    {
                      customerRequestedDate: t || null,
                    },
                    a,
                  ),
              }
            : undefined,
        },
        {
          key: `note`,
          label: t(`peek.field.customerRequestedNote`),
          value: e.customerRequestedNote || `—`,
          editHint: t(`peek.editHint`),
          editable: i
            ? {
                type: `text`,
                value: e.customerRequestedNote,
                onChange: (t: any) =>
                  updateOrder(
                    e.orderNo,
                    {
                      customerRequestedNote: t,
                    },
                    a,
                  ),
              }
            : undefined,
        },
        {
          key: `payment`,
          label: t(`orders.col.payment`),
          value: t(`orders.paymentStatus.${e.payment}`),
        },
        {
          key: `assignee`,
          label: t(`peek.field.assignee`),
          value: e.assignee,
          editHint: t(`peek.editHint`),
          editable: i
            ? {
                type: `select`,
                value: e.assignee,
                options: [`Wilson`, `Steve`, `Alex`].map((e: any) => ({
                  value: e,
                  label: e,
                })),
                onChange: (t: any) =>
                  updateOrder(
                    e.orderNo,
                    {
                      assignee: t,
                    },
                    a,
                  ),
              }
            : undefined,
        },
        {
          key: `amount`,
          label: t(`orders.col.amount`),
          value: (
            <span
              style={{
                fontVariantNumeric: `tabular-nums`,
              }}
            >
              {money(
                e.lines.reduce((e: any, t: any) => e + t.qty * t.price, 0),
              )}
            </span>
          ),
        },
      ];
    },
    tabs: (e: any, { t, ops: n, role: r }: any) => {
      let i = packagesOfOrder(n, e.orderNo);
      let a = e.lines.reduce((e: any, t: any) => e + t.qty * t.price, 0);
      let o = (
        <Flex
          vertical={true}
          gap={12}
          style={{
            paddingTop: 12,
          }}
        >
          {e.lines.map((e: any) => {
            let n = productOf(e.sku);
            let r = i.filter((t: any) => t.lineId === e.id);
            return (
              <Flex vertical={true} gap={6} key={e.id}>
                <Flex align={`center`} justify={`space-between`} gap={12}>
                  {n ? (
                    <ItemName product={n} thumb={true} />
                  ) : (
                    <Text>{e.sku}</Text>
                  )}
                  <Text
                    style={{
                      whiteSpace: `nowrap`,
                      fontVariantNumeric: `tabular-nums`,
                    }}
                  >
                    {`× `}
                    {e.qty}
                    {` · `}
                    {money(e.qty * e.price)}
                  </Text>
                </Flex>
                {r.length > 0 ? (
                  <Flex gap={6} wrap={true}>
                    {r.map((e: any) => (
                      <Pill
                        tone={
                          LOC_TONE[e.location as keyof typeof LOC_TONE] as
                            'brand' | 'muted' | 'warning' | 'success' | 'error'
                        }
                        dot={true}
                        key={e.id}
                      >
                        {e.packageCode ?? `${e.stem} · ${t(`waiting.uncoded`)}`}
                        {` · `}
                        {t(LOC_KEY[e.location as keyof typeof LOC_KEY])}
                      </Pill>
                    ))}
                  </Flex>
                ) : (
                  <Text
                    type={`secondary`}
                    style={{
                      fontSize: 13,
                    }}
                  >
                    {t(`peek.items.noPackages`)}
                  </Text>
                )}
              </Flex>
            );
          })}
        </Flex>
      );
      let s =
        e.channel === `shopify`
          ? `Shopify Payments`
          : e.channel === `showroom`
            ? `ypay`
            : `FPS`;
      let c: any[] = [];
      if (e.payment !== `unpaid`) {
        c.push({
          kind: `peek.payment.deposit`,
          amount: Math.round(a / 2),
          method: s,
          at: e.createdAt,
        });
      }
      if (e.payment === `paid`) {
        c.push({
          kind: `peek.payment.balance`,
          amount: a - Math.round(a / 2),
          method: s,
          at:
            e.delivery.completedDate ?? e.delivery.scheduledDate ?? e.createdAt,
        });
      }
      let l = canSee(r, `FINANCE_DETAIL`) ? (
        <Flex
          vertical={true}
          gap={8}
          style={{
            paddingTop: 12,
          }}
        >
          {c.length === 0 && (
            <Text type={`secondary`}>{t(`peek.payment.none`)}</Text>
          )}
          {c.map((e: any, n: any) => (
            <Flex justify={`space-between`} gap={12} key={n}>
              <Text>
                {t(e.kind)}
                {` · `}
                {e.method}
                {` · `}
                {fmtDate(e.at)}
              </Text>
              <Text
                style={{
                  fontWeight: 500,
                  fontVariantNumeric: `tabular-nums`,
                }}
              >
                {money(e.amount)}
              </Text>
            </Flex>
          ))}
          <Flex
            justify={`space-between`}
            style={{
              borderTop: `1px solid ${colors.border}`,
              paddingTop: 8,
            }}
          >
            <Text type={`secondary`}>{t(`peek.payment.outstanding`)}</Text>
            <Text
              style={{
                fontWeight: 600,
                fontVariantNumeric: `tabular-nums`,
              }}
            >
              {money(a - c.reduce((e: any, t: any) => e + t.amount, 0))}
            </Text>
          </Flex>
        </Flex>
      ) : (
        <Flex
          vertical={true}
          gap={8}
          style={{
            paddingTop: 12,
          }}
        >
          <Text>
            {t(`orders.col.payment`)}
            {`：`}
            {t(`orders.paymentStatus.${e.payment}`)}
          </Text>
          <Text
            type={`secondary`}
            style={{
              fontSize: 13,
            }}
          >
            {t(`peek.payment.restricted`)}
          </Text>
        </Flex>
      );
      let u = e.delivery;
      let d = (
        <div
          style={{
            paddingTop: 12,
            display: `grid`,
            gridTemplateColumns: `repeat(2, minmax(0, 1fr))`,
            gap: `10px 16px`,
          }}
        >
          {[
            [
              t(`peek.field.customerRequestedDate`),
              u.scheduledDate || e.customerRequestedDate
                ? fmtDate(e.customerRequestedDate, `detail`)
                : `—`,
            ],
            [
              t(`peek.field.scheduledDate`),
              u.scheduledDate
                ? `${fmtDate(u.scheduledDate, `detail`)}${u.timeSlot ? ` · ${t(`followups.slot.${u.timeSlot}`)}` : ``}`
                : t(`orders.notScheduled`),
            ],
            [
              t(`peek.field.completedDate`),
              u.completedDate ? fmtDate(u.completedDate, `detail`) : `—`,
            ],
            [
              t(`peek.field.customerRequestedNote`),
              e.customerRequestedNote || `—`,
            ],
          ].map(([e, t]: any) => (
            <Flex vertical={true} gap={2} key={e}>
              <Text
                type={`secondary`}
                style={{
                  fontSize: 12,
                }}
              >
                {e}
              </Text>
              <Text
                style={{
                  fontWeight: 500,
                }}
              >
                {t}
              </Text>
            </Flex>
          ))}
        </div>
      );
      return [
        {
          key: `items`,
          label: t(`peek.tab.items`),
          content: o,
        },
        {
          key: `payments`,
          label: t(`peek.tab.payments`),
          content: l,
        },
        {
          key: `delivery`,
          label: t(`peek.tab.delivery`),
          content: d,
        },
      ];
    },
    activities: (e: any, { ops: t }: any) =>
      t.activities.filter((t: any) => t.orderId === e.orderNo),
  },
};
export { LOC_KEY };
