import { useEffect, useRef, useState } from 'react';
import { App, Button, DatePicker, Divider, Drawer, Dropdown, Flex, Input, Popover, Segmented, Select, Tabs, Tooltip, Typography } from 'antd';
import type { ReactNode } from 'react';
import { ArrowLeftOutlined, CalendarOutlined, CloseOutlined, DownOutlined, ExpandOutlined, LeftOutlined, MoreOutlined, UpOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { completeActivity, rescheduleActivity, useOps } from '../data/ops';
import { today } from '../domain/clock';
import type { Activity } from '../domain/types';
import { activityState } from '../domain/derive';
import { colors, useIsMobile } from '../theme';
import { fmtDate } from '../utils/date';
import { Pill } from '../components/Pill';
import { useT } from '../i18n';
import type { MessageKey, Translate } from '../i18n';
import { useAuth } from '../auth';
import { PEEK_MAX, PEEK_MIN, usePeek, usePeekWidth } from './hooks';
import { PEEK_CONFIGS } from './configs';
import type { PeekCtx, SummaryField } from './configs';
import { Timeline } from './Timeline';

const { Text, Title } = Typography;

/**
 * <RecordPeek /> — side-peek-spec §2 五層：Header / 待辦條 / 摘要 / 內容 tab / 時間線。
 * 一個組件，每個 model 一份 config（./configs）。掛喺 App 一次；邊個 model 由 usePeek() 決定。
 */
export function RecordPeek() {
  const { target, stack, back, close, next, prev, hasNext, hasPrev, onOpenFull } = usePeek();
  const t = useT();
  const { message } = App.useApp();
  const { user } = useAuth();
  const ops = useOps();
  const isMobile = useIsMobile();
  const [width, setWidth] = usePeekWidth();
  const dragging = useRef<{ startX: number; startW: number } | null>(null);

  // 拖左邊改闊度（§1：440–720）
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      setWidth(dragging.current.startW + (dragging.current.startX - e.clientX));
    };
    const onUp = () => (dragging.current = null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [setWidth]);

  const role = user?.role ?? 'sales';
  const config = target ? PEEK_CONFIGS[target.model] : null;
  const record = target && config ? config.load(ops, target.id) : null;
  const ctx: PeekCtx = { t, role, user, ops, message };

  const openFull = () => message.info(t('peek.fullPageNotBuilt'));
  useEffect(() => {
    onOpenFull.current = openFull;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.id]);

  const open = !!target;
  const body = !config || !record ? (
    <Text type="secondary">{t('peek.notFound')}</Text>
  ) : (
    <PeekBody model={target!.model} record={record} config={config} ctx={ctx} onOpenFull={openFull} />
  );

  const header = config && record && (
    <Flex align="center" gap={8} style={{ minWidth: 0 }}>
      {isMobile ? (
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={stack.length ? back : close} aria-label={t('peek.back')} />
      ) : stack.length > 0 ? (
        <Button type="text" size="small" icon={<LeftOutlined />} onClick={back}>{stack[stack.length - 1].title}</Button>
      ) : null}
      <span style={{ flexGrow: 1 }} />
      {!isMobile && (
        <>
          <Tooltip title={t('peek.prevRow')}><Button type="text" size="small" icon={<UpOutlined />} disabled={!hasPrev} onClick={prev} aria-label={t('peek.prevRow')} /></Tooltip>
          <Tooltip title={t('peek.nextRow')}><Button type="text" size="small" icon={<DownOutlined />} disabled={!hasNext} onClick={next} aria-label={t('peek.nextRow')} /></Tooltip>
          <Tooltip title={t('peek.openFull')}><Button type="text" size="small" icon={<ExpandOutlined />} onClick={openFull} aria-label={t('peek.openFull')} /></Tooltip>
          <Tooltip title={t('peek.close')}><Button type="text" size="small" icon={<CloseOutlined />} onClick={close} aria-label={t('peek.close')} /></Tooltip>
        </>
      )}
    </Flex>
  );

  return (
    <Drawer
      open={open}
      onClose={close}
      placement="right"
      size={isMobile ? '100%' : width}
      mask={false}
      closable={false}
      destroyOnHidden
      title={header}
      styles={{
        header: { padding: '8px 12px', borderBottom: `1px solid ${colors.border}` },
        body: { padding: 0, display: 'flex', flexDirection: 'column' },
        wrapper: { boxShadow: '-4px 0 12px -4px rgba(26,26,26,0.2)' },
      }}
    >
      {!isMobile && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-valuemin={PEEK_MIN}
          aria-valuemax={PEEK_MAX}
          aria-valuenow={width}
          onMouseDown={(e) => {
            dragging.current = { startX: e.clientX, startW: width };
            e.preventDefault();
          }}
          style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 6, cursor: 'col-resize', zIndex: 2 }}
        />
      )}
      {body}
    </Drawer>
  );
}

function PeekBody<T>({ model, record, config, ctx, onOpenFull }: { model: string; record: T; config: (typeof PEEK_CONFIGS)[keyof typeof PEEK_CONFIGS]; record2?: never; ctx: PeekCtx; onOpenFull: () => void }) {
  const { t } = ctx;
  const cfg = config as unknown as {
    title: (r: T) => string;
    status: (r: T, ctx: PeekCtx) => { labelKey: MessageKey; tone: 'success' | 'warning' | 'error' | 'brand' | 'muted' };
    actions: (r: T, ctx: PeekCtx) => { key: string; label: string; icon?: ReactNode; primary?: boolean; onClick: () => void; content?: ReactNode }[];
    menu: (r: T, ctx: PeekCtx) => { key: string; label: string; onClick: () => void }[];
    summary: (r: T, ctx: PeekCtx) => SummaryField[];
    tabs: (r: T, ctx: PeekCtx) => { key: string; label: string; content: ReactNode }[];
    activities: (r: T, ctx: PeekCtx) => Activity[];
    recordId: (r: T) => string;
  };
  const status = cfg.status(record, ctx);
  const actions = cfg.actions(record, ctx);
  const menu = cfg.menu(record, ctx);
  const tabs = cfg.tabs(record, ctx);
  const open = cfg.activities(record, ctx).filter((a) => !a.doneAt);

  return (
    <Flex vertical style={{ height: '100%', minHeight: 0 }}>
      {/* 1. Header：編號 + 推導狀態 + 最多 3 個主要動作 + ⋯ + 開全頁 */}
      <Flex vertical gap={10} style={{ padding: '12px 16px', borderBottom: `1px solid ${colors.border}` }}>
        <Flex align="center" gap={10} wrap>
          <Title level={2} style={{ margin: 0, fontSize: 20 }}>{cfg.title(record)}</Title>
          <Pill tone={status.tone} dot>{t(status.labelKey)}</Pill>
        </Flex>
        <Flex gap={8} wrap align="center">
          {actions.slice(0, 3).map((a) =>
            a.content ? (
              <Popover key={a.key} trigger="click" placement="bottomLeft" content={a.content}>
                <Button type={a.primary ? 'primary' : 'default'} icon={a.icon}>{a.label}</Button>
              </Popover>
            ) : (
              <Button key={a.key} type={a.primary ? 'primary' : 'default'} icon={a.icon} onClick={a.onClick}>{a.label}</Button>
            )
          )}
          {menu.length > 0 && (
            <Dropdown trigger={['click']} menu={{ items: menu.map((m) => ({ key: m.key, label: m.label, onClick: m.onClick })) }}>
              <Button icon={<MoreOutlined />} aria-label={t('peek.more')} />
            </Dropdown>
          )}
          <span style={{ flexGrow: 1 }} />
          <Button type="text" size="small" icon={<ExpandOutlined />} onClick={onOpenFull}>{t('peek.openFull')}</Button>
        </Flex>
      </Flex>

      {/* 2. 待辦條：未完成 Activity，即場完成 / 改期（同「我的跟進」同一套） */}
      {open.length > 0 && (
        <Flex vertical gap={6} style={{ padding: '10px 16px', background: colors.warningBg, borderBottom: `1px solid ${colors.border}` }}>
          {open.map((a) => <ActivityBar key={a.id} activity={a} t={t} />)}
        </Flex>
      )}

      <div style={{ overflow: 'auto', flexGrow: 1, minHeight: 0 }}>
        {/* 3. 摘要：6–10 個關鍵欄位，兩欄；可編輯欄位 inline edit（受 RBAC） */}
        <div style={{ padding: '12px 16px', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px 16px' }}>
          {cfg.summary(record, ctx).map((f) => <SummaryCell key={f.key} field={f} />)}
        </div>
        <Divider style={{ margin: 0 }} />

        {/* 4. 內容 tab（按 model） */}
        <Tabs size="small" items={tabs.map((tab) => ({ key: tab.key, label: tab.label, children: <div style={{ padding: '0 16px 12px' }}>{tab.content}</div> }))} tabBarStyle={{ padding: '0 16px', margin: 0 }} />
        <Divider style={{ margin: 0 }} />

        {/* 5. 時間線 */}
        <div style={{ padding: '12px 16px' }}>
          <Timeline model={model as 'order'} recordId={cfg.recordId(record)} />
        </div>
      </div>
    </Flex>
  );
}

function SummaryCell({ field }: { field: SummaryField }) {
  const [editing, setEditing] = useState(false);
  const e = field.editable;
  const value = <Text style={{ fontWeight: 500, wordBreak: 'break-word' }}>{field.value}</Text>;
  return (
    <Flex vertical gap={2} style={{ minWidth: 0 }}>
      <Text type="secondary" style={{ fontSize: 12 }}>{field.label}</Text>
      {!e ? (
        value
      ) : editing ? (
        e.type === 'date' ? (
          <DatePicker
            autoFocus
            size="small"
            open
            value={e.value ? dayjs(e.value) : null}
            onChange={(d) => {
              e.onChange(d ? d.format('YYYY-MM-DD') : '');
              setEditing(false);
            }}
            onOpenChange={(o) => !o && setEditing(false)}
          />
        ) : e.type === 'select' ? (
          <Select
            autoFocus
            size="small"
            open
            value={e.value}
            options={e.options}
            onChange={(v) => {
              e.onChange(v);
              setEditing(false);
            }}
            onBlur={() => setEditing(false)}
          />
        ) : (
          <Input
            autoFocus
            size="small"
            defaultValue={e.value}
            onPressEnter={(ev) => {
              e.onChange((ev.target as HTMLInputElement).value);
              setEditing(false);
            }}
            onBlur={(ev) => {
              e.onChange(ev.target.value);
              setEditing(false);
            }}
          />
        )
      ) : (
        <Text
          style={{ fontWeight: 500, cursor: 'text', borderBottom: `1px dashed ${colors.borderStrong}`, wordBreak: 'break-word' }}
          onClick={() => setEditing(true)}
          title={field.editHint}
        >
          {field.value}
        </Text>
      )}
    </Flex>
  );
}

/** 待辦條一行：完成 / 打唔通（自動排明日）/ 改期（原地揀日期） */
function ActivityBar({ activity, t }: { activity: Activity; t: Translate }) {
  const { message } = App.useApp();
  const state = activityState(activity);
  const [due, setDue] = useState<Dayjs | null>(today().add(3, 'day'));
  const tone = state === 'overdue' ? 'error' : state === 'today' ? 'warning' : 'muted';
  return (
    <Flex align="center" justify="space-between" gap={8} wrap>
      <Flex gap={8} align="center" wrap>
        <CalendarOutlined style={{ color: colors.warningText }} />
        <Text style={{ fontWeight: 500 }}>{t(`followups.kind.${activity.kind}` as MessageKey)}</Text>
        <Pill tone={tone}>{t(`followups.state.${state}` as MessageKey)} · {fmtDate(activity.dueDate)}</Pill>
        <Text type="secondary">{activity.owner}</Text>
        {activity.seq > 1 && <Text type="secondary" style={{ fontSize: 13 }}>{t('peek.activity.attempt', { n: activity.seq })}</Text>}
      </Flex>
      <Flex gap={6}>
        <Button size="small" onClick={() => { completeActivity(activity.id); message.success(t('peek.activity.completed')); }}>{t('peek.activity.complete')}</Button>
        <Button
          size="small"
          onClick={() => {
            const next = rescheduleActivity(activity.id, today().add(1, 'day').format('YYYY-MM-DD'), '', 'unreachable');
            if (next) message.success(t('followups.unreachable.done', { order: activity.orderId, date: next.dueDate }));
          }}
        >
          {t('followups.action.unreachable')}
        </Button>
        <Popover
          trigger="click"
          placement="bottomRight"
          content={
            <Flex vertical gap={8} style={{ width: 240 }}>
              <DatePicker value={due} onChange={setDue} minDate={today()} />
              <Button
                type="primary"
                size="small"
                disabled={!due}
                onClick={() => {
                  if (!due) return;
                  rescheduleActivity(activity.id, due.format('YYYY-MM-DD'), '', 'customerPostponed');
                  message.success(t('peek.activity.rescheduled', { date: due.format('YYYY-MM-DD') }));
                }}
              >
                {t('peek.activity.reschedule')}
              </Button>
            </Flex>
          }
        >
          <Button size="small">{t('peek.activity.reschedule')}</Button>
        </Popover>
      </Flex>
    </Flex>
  );
}

/** 「已約」原地揀日期時段（唔跳頁） */
export function SchedulePopoverContent({ onSubmit, t }: { onSubmit: (date: string, slot: 'morning' | 'afternoon' | 'evening' | 'flexible') => void; t: Translate }) {
  const [date, setDate] = useState<Dayjs | null>(today().add(2, 'day'));
  const [slot, setSlot] = useState<'morning' | 'afternoon' | 'evening' | 'flexible'>('afternoon');
  return (
    <Flex vertical gap={8} style={{ width: 280 }}>
      <DatePicker value={date} onChange={setDate} minDate={today()} />
      <Segmented
        value={slot}
        onChange={(v) => setSlot(v as typeof slot)}
        options={(['morning', 'afternoon', 'evening', 'flexible'] as const).map((s) => ({ value: s, label: t(`followups.slot.${s}` as MessageKey) }))}
      />
      <Button type="primary" disabled={!date} onClick={() => date && onSubmit(date.format('YYYY-MM-DD'), slot)}>
        {t('followups.action.schedule')}
      </Button>
    </Flex>
  );
}
