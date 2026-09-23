import { Flex, Typography } from 'antd';
import type { ReactNode } from 'react';
import { CalendarOutlined, WhatsAppOutlined } from '@ant-design/icons';
import type { MessageInstance } from 'antd/es/message/interface';
import { getOps, packagesOfOrder, productOf, scheduleOrder, updateOrder } from '../data/ops';
import type { Channel, PeekModel, SalesOrder } from '../data/ops';
import { BUCKET_META } from '../data/buckets';
import { orderBucket } from '../domain/derive';
import type { Activity, LocationKey } from '../domain/types';
import { can, canSee } from '../config/permissions';
import type { StaffRole } from '../config/permissions';
import type { StaffUser } from '../auth';
import { colors } from '../theme';
import { money } from '../utils/format';
import { fmtDate } from '../utils/date';
import { Pill } from '../components/Pill';
import { ItemName } from '../components/ItemName';
import type { MessageKey, Translate } from '../i18n';
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
    | { type: 'date'; value: string | null; onChange: (v: string) => void }
    | { type: 'text'; value: string; onChange: (v: string) => void }
    | { type: 'select'; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void };
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
  status: (r: T, ctx: PeekCtx) => { labelKey: MessageKey; tone: Tone };
  actions: (r: T, ctx: PeekCtx) => PeekAction[];
  menu: (r: T, ctx: PeekCtx) => { key: string; label: string; onClick: () => void }[];
  summary: (r: T, ctx: PeekCtx) => SummaryField[];
  tabs: (r: T, ctx: PeekCtx) => { key: string; label: string; content: ReactNode }[];
  activities: (r: T, ctx: PeekCtx) => Activity[];
}

const CHANNEL_KEY: Record<Channel, MessageKey> = {
  shopify: 'orders.channel.shopify',
  showroom: 'orders.channel.showroom',
  whatsapp: 'orders.channel.whatsapp',
  phone: 'orders.channel.phone',
};

const LOC_KEY: Record<LocationKey, MessageKey> = {
  supplier: 'waiting.loc.supplier',
  cnWarehouse: 'waiting.loc.cnWarehouse',
  transit: 'waiting.loc.transit',
  hkWarehouse: 'inventory.loc.hkWarehouse',
  showroom: 'inventory.loc.showroom',
  customer: 'peek.loc.customer',
  returnArea: 'peek.loc.returnArea',
  stockLoss: 'peek.loc.stockLoss',
};
const LOC_TONE: Record<LocationKey, Tone> = {
  supplier: 'muted', cnWarehouse: 'brand', transit: 'brand', hkWarehouse: 'success', showroom: 'success', customer: 'success', returnArea: 'warning', stockLoss: 'error',
};

const orderConfig: PeekConfig<SalesOrder> = {
  load: (ops, id) => ops.orders.find((o) => o.orderNo === id || o.id === id) ?? null,
  recordId: (o) => o.orderNo,
  title: (o) => o.orderNo,
  status: (o, { ops }) => BUCKET_META[orderBucket(packagesOfOrder(ops, o.orderNo), o.delivery)],

  actions: (o, { t, role, user, ops, message }) => {
    const bucket = orderBucket(packagesOfOrder(ops, o.orderNo), o.delivery);
    const out: PeekAction[] = [];
    if (bucket === 'toSchedule' && (can(role, 'delivery', 'execute') || can(role, 'orders', 'execute'))) {
      out.push({
        key: 'schedule',
        label: t('orders.action.schedule'),
        icon: <CalendarOutlined />,
        primary: true,
        onClick: () => undefined,
        content: (
          <SchedulePopoverContent
            t={t}
            onSubmit={(date, slot) => {
              scheduleOrder(o.orderNo, date, slot, user?.id ?? 'u-system');
              message.success(t('followups.schedule.done', { order: o.orderNo, date, slot: t(`followups.slot.${slot}` as MessageKey) }));
            }}
          />
        ),
      });
    }
    if (canSee(role, 'CUSTOMER_PII')) {
      out.push({
        key: 'whatsapp',
        label: t('peek.action.whatsapp'),
        icon: <WhatsAppOutlined />,
        onClick: () => window.open(`https://wa.me/852${o.customer.phone.replace(/\s/g, '')}`, '_blank', 'noopener'),
      });
    }
    return out;
  },

  menu: (_o, { t, role, message }) => [
    ...(can(role, 'orders', 'export') ? [{ key: 'export', label: t('orders.action.exportOne'), onClick: () => message.success(t('common.exported')) }] : []),
    {
      key: 'link',
      label: t('peek.action.copyLink'),
      onClick: () => {
        navigator.clipboard?.writeText(window.location.href).then(() => message.success(t('peek.action.linkCopied')));
      },
    },
  ],

  summary: (o, { t, role, user }) => {
    const editable = can(role, 'orders', 'edit');
    const actor = user?.id ?? 'u-system';
    const fields: SummaryField[] = [
      { key: 'customer', label: t('orders.col.customer'), value: o.customer.alias },
      ...(canSee(role, 'CUSTOMER_PII') ? [{ key: 'phone', label: t('orders.col.phone'), value: <span style={{ fontVariantNumeric: 'tabular-nums' }}>{o.customer.phone}</span> }] : []),
      { key: 'district', label: t('orders.col.district'), value: o.customer.district },
      {
        key: 'channel',
        label: t('orders.col.channel'),
        value: t(CHANNEL_KEY[o.channel]),
        editHint: t('peek.editHint'),
        editable: editable
          ? { type: 'select', value: o.channel, options: (Object.keys(CHANNEL_KEY) as Channel[]).map((c) => ({ value: c, label: t(CHANNEL_KEY[c]) })), onChange: (v) => updateOrder(o.orderNo, { channel: v as Channel }, actor) }
          : undefined,
      },
      { key: 'createdAt', label: t('orders.col.orderedAt'), value: fmtDate(o.createdAt, 'detail') },
      {
        key: 'requested',
        label: t('peek.field.customerRequestedDate'),
        value: o.customerRequestedDate ? fmtDate(o.customerRequestedDate, 'detail') : '—',
        editHint: t('peek.editHint'),
        editable: editable ? { type: 'date', value: o.customerRequestedDate, onChange: (v) => updateOrder(o.orderNo, { customerRequestedDate: v || null }, actor) } : undefined,
      },
      {
        key: 'note',
        label: t('peek.field.customerRequestedNote'),
        value: o.customerRequestedNote || '—',
        editHint: t('peek.editHint'),
        editable: editable ? { type: 'text', value: o.customerRequestedNote, onChange: (v) => updateOrder(o.orderNo, { customerRequestedNote: v }, actor) } : undefined,
      },
      { key: 'payment', label: t('orders.col.payment'), value: t(`orders.paymentStatus.${o.payment}` as MessageKey) },
      {
        key: 'assignee',
        label: t('peek.field.assignee'),
        value: o.assignee,
        editHint: t('peek.editHint'),
        editable: editable ? { type: 'select', value: o.assignee, options: ['Wilson', 'Steve', 'Alex'].map((n) => ({ value: n, label: n })), onChange: (v) => updateOrder(o.orderNo, { assignee: v }, actor) } : undefined,
      },
      { key: 'amount', label: t('orders.col.amount'), value: <span style={{ fontVariantNumeric: 'tabular-nums' }}>{money(o.lines.reduce((n, l) => n + l.qty * l.price, 0))}</span> },
    ];
    return fields;
  },

  tabs: (o, { t, ops, role }) => {
    const pkgs = packagesOfOrder(ops, o.orderNo);
    const total = o.lines.reduce((n, l) => n + l.qty * l.price, 0);
    const items = (
      <Flex vertical gap={12} style={{ paddingTop: 12 }}>
        {o.lines.map((l) => {
          const p = productOf(l.sku);
          const mine = pkgs.filter((k) => k.lineId === l.id);
          return (
            <Flex key={l.id} vertical gap={6}>
              <Flex align="center" justify="space-between" gap={12}>
                {p ? <ItemName product={p} thumb /> : <Text>{l.sku}</Text>}
                <Text style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>× {l.qty} · {money(l.qty * l.price)}</Text>
              </Flex>
              {mine.length > 0 ? (
                <Flex gap={6} wrap>
                  {mine.map((k) => (
                    <Pill key={k.id} tone={LOC_TONE[k.location]} dot>
                      {k.packageCode ?? `${k.stem} · ${t('waiting.uncoded')}`} · {t(LOC_KEY[k.location])}
                    </Pill>
                  ))}
                </Flex>
              ) : (
                <Text type="secondary" style={{ fontSize: 13 }}>{t('peek.items.noPackages')}</Text>
              )}
            </Flex>
          );
        })}
      </Flex>
    );

    // 收款：Payment 每筆一行（§2.1）。示範由付款狀態推：訂金 50%、尾數 50%。
    const method = o.channel === 'shopify' ? 'Shopify Payments' : o.channel === 'showroom' ? 'ypay' : 'FPS';
    const rows: { kind: MessageKey; amount: number; method: string; at: string }[] = [];
    if (o.payment !== 'unpaid') rows.push({ kind: 'peek.payment.deposit', amount: Math.round(total / 2), method, at: o.createdAt });
    if (o.payment === 'paid') rows.push({ kind: 'peek.payment.balance', amount: total - Math.round(total / 2), method, at: o.delivery.completedDate ?? o.delivery.scheduledDate ?? o.createdAt });
    const payments = canSee(role, 'FINANCE_DETAIL') ? (
      <Flex vertical gap={8} style={{ paddingTop: 12 }}>
        {rows.length === 0 && <Text type="secondary">{t('peek.payment.none')}</Text>}
        {rows.map((r, i) => (
          <Flex key={i} justify="space-between" gap={12}>
            <Text>{t(r.kind)} · {r.method} · {fmtDate(r.at)}</Text>
            <Text style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{money(r.amount)}</Text>
          </Flex>
        ))}
        <Flex justify="space-between" style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 8 }}>
          <Text type="secondary">{t('peek.payment.outstanding')}</Text>
          <Text style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{money(total - rows.reduce((n, r) => n + r.amount, 0))}</Text>
        </Flex>
      </Flex>
    ) : (
      <Flex vertical gap={8} style={{ paddingTop: 12 }}>
        <Text>{t('orders.col.payment')}：{t(`orders.paymentStatus.${o.payment}` as MessageKey)}</Text>
        <Text type="secondary" style={{ fontSize: 13 }}>{t('peek.payment.restricted')}</Text>
      </Flex>
    );

    const d = o.delivery;
    const delivery = (
      <div style={{ paddingTop: 12, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px 16px' }}>
        {[
          [t('peek.field.customerRequestedDate'), d.scheduledDate || o.customerRequestedDate ? fmtDate(o.customerRequestedDate, 'detail') : '—'],
          [t('peek.field.scheduledDate'), d.scheduledDate ? `${fmtDate(d.scheduledDate, 'detail')}${d.timeSlot ? ` · ${t(`followups.slot.${d.timeSlot}` as MessageKey)}` : ''}` : t('orders.notScheduled')],
          [t('peek.field.completedDate'), d.completedDate ? fmtDate(d.completedDate, 'detail') : '—'],
          [t('peek.field.customerRequestedNote'), o.customerRequestedNote || '—'],
        ].map(([label, value]) => (
          <Flex key={label} vertical gap={2}>
            <Text type="secondary" style={{ fontSize: 12 }}>{label}</Text>
            <Text style={{ fontWeight: 500 }}>{value}</Text>
          </Flex>
        ))}
      </div>
    );

    return [
      { key: 'items', label: t('peek.tab.items'), content: items },
      { key: 'payments', label: t('peek.tab.payments'), content: payments },
      { key: 'delivery', label: t('peek.tab.delivery'), content: delivery },
    ];
  },

  activities: (o, { ops }) => ops.activities.filter((a) => a.orderId === o.orderNo),
};

// 其餘 model（採購單 / 包件 / 商品）等訂單 review 完先逐個加
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const PEEK_CONFIGS: Partial<Record<PeekModel, PeekConfig<any>>> = {
  order: orderConfig,
};
