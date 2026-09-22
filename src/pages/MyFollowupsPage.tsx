import { useMemo, useState } from 'react';
import {
  App,
  Button,
  Card,
  Col,
  DatePicker,
  Flex,
  Input,
  Modal,
  Popover,
  Row,
  Segmented,
  Select,
  Space,
  Statistic,
  Table,
  Tooltip,
  Typography,
} from 'antd';
import type { TableColumnsType } from 'antd';
import { PhoneOutlined, CalendarOutlined, ClockCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { OWNERS, followupRows } from '../data/followups';
import type { FollowupRow } from '../data/followups';
import {
  ESCALATION_DAYS_DEFAULT,
  activityState,
  daysInHk,
  isEscalated,
  lineStatus,
} from '../domain/derive';
import { DEMO_TODAY, today } from '../domain/clock';
import type {
  ActivityKind,
  ActivityState,
  LineStatus,
  TimeSlot,
} from '../domain/types';
import { colors, useIsMobile } from '../theme';
import { useT } from '../i18n';
import type { MessageKey, Translate } from '../i18n';
import { Pill } from '../components/Pill';
import { CardList } from '../components/CardList';
import { useTableHeight } from '../utils/useTableHeight';
import { useDensity } from '../utils/useDensity';
import type { Tone } from '../utils/tones';

const { Text, Title } = Typography;

/**
 * SPEC REF §6 "我的跟進（採購/物流）：逾期/今日/本週；行內完成「已約/打唔通/客延後」".
 * Derivation comes from §4; nothing on this screen writes a derived value.
 *
 * TODO(prototype): docs/prototype/morihome-erp-prototype.html is not in the
 * repo yet. Layout and copy were taken from the spec; reconcile once it lands.
 */

/**
 * How long to wait before the next attempt after a failed call.
 * TODO(spec): not specified anywhere. One day is the cheapest assumption —
 * confirm the real cadence with Alex/Ocean.
 */
const UNREACHABLE_RETRY_DAYS = 1;

const SLOTS: TimeSlot[] = ['morning', 'afternoon', 'evening', 'flexible'];

const STATE_TONE: Record<ActivityState, Tone> = {
  overdue: 'error',
  today: 'warning',
  planned: 'muted',
  done: 'success',
};

const LINE_TONE: Record<LineStatus, Tone> = {
  notProcured: 'muted',
  inTransit: 'brand',
  readyToSchedule: 'success',
  partiallyDelivered: 'warning',
  delivered: 'muted',
};

type Bucket = 'overdue' | 'today' | 'week' | 'later' | 'done' | 'all';

const kindKey = (k: ActivityKind): MessageKey =>
  `followups.kind.${k}` as MessageKey;
const stateKey = (s: ActivityState): MessageKey =>
  `followups.state.${s}` as MessageKey;
const lineKey = (s: LineStatus): MessageKey =>
  `followups.line.${s}` as MessageKey;
const slotKey = (s: TimeSlot): MessageKey => `followups.slot.${s}` as MessageKey;

/** Which bucket an activity falls in, from its derived state. */
function bucketOf(row: FollowupRow): Exclude<Bucket, 'all'> {
  const state = activityState(row.activity);
  if (state === 'done') return 'done';
  if (state === 'overdue') return 'overdue';
  if (state === 'today') return 'today';
  return dayjs(row.activity.dueDate).isAfter(today().endOf('week'))
    ? 'later'
    : 'week';
}

export function MyFollowupsPage() {
  const { message } = App.useApp();
  const isMobile = useIsMobile();
  const t = useT();
  const tableHeight = useTableHeight(430);
  const { wc } = useDensity();

  const [rows, setRows] = useState<FollowupRow[]>(followupRows);
  const [bucket, setBucket] = useState<Bucket>('overdue');
  const [owner, setOwner] = useState<string>('all');
  const [keyword, setKeyword] = useState('');
  const [selected, setSelected] = useState<React.Key[]>([]);

  const counts = useMemo(() => {
    const base: Record<string, number> = {
      overdue: 0, today: 0, week: 0, later: 0, done: 0, all: rows.length,
    };
    for (const r of rows) base[bucketOf(r)]++;
    return base;
  }, [rows]);

  const escalatedCount = useMemo(
    () => rows.filter((r) => isEscalated(r.units, r.delivery)).length,
    [rows]
  );

  const visible = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return rows.filter((r) => {
      if (bucket !== 'all' && bucketOf(r) !== bucket) return false;
      if (owner !== 'all' && r.activity.owner !== owner) return false;
      if (!kw) return true;
      return (
        r.order.orderNo.toLowerCase().includes(kw) ||
        r.order.customer.alias.includes(kw) ||
        r.order.customer.district.includes(kw) ||
        r.items.some((i) => i.toLowerCase().includes(kw))
      );
    });
  }, [rows, bucket, owner, keyword]);

  /** Replace one row and drop the selection that referenced it. */
  const applyRow = (id: string, next: (row: FollowupRow) => FollowupRow) => {
    setRows((prev) => prev.map((r) => (r.activity.id === id ? next(r) : r)));
    setSelected((prev) => prev.filter((k) => k !== id));
  };

  /**
   * §4: 「已約」= scheduledDate 有值. Booking writes the delivery order's own
   * date, then closes the activity. The activity's state stays derived.
   */
  const schedule = (row: FollowupRow, date: Dayjs, slot: TimeSlot) => {
    applyRow(row.activity.id, (r) => ({
      ...r,
      delivery: {
        ...r.delivery,
        scheduledDate: date.format('YYYY-MM-DD'),
        timeSlot: slot,
      },
      activity: { ...r.activity, feedback: 'scheduled', doneAt: DEMO_TODAY },
    }));
    message.success(
      t('followups.schedule.done', {
        order: row.order.orderNo,
        date: date.format('YYYY-MM-DD'),
        slot: t(slotKey(slot)),
      })
    );
  };

  /**
   * §4: 「打唔通」= Activity feedback + 自動下次. One click — the current
   * activity closes with feedback and a follow-on activity opens, chained
   * through nextActivityId (§2.5). The old one is never edited in place.
   */
  const markUnreachable = (row: FollowupRow) => {
    const nextId = `${row.activity.id}-n${row.activity.seq + 1}`;
    const nextDue = today().add(UNREACHABLE_RETRY_DAYS, 'day');
    applyRow(row.activity.id, (r) => ({
      ...r,
      activity: {
        ...r.activity,
        id: nextId,
        dueDate: nextDue.format('YYYY-MM-DD'),
        seq: r.activity.seq + 1,
        feedback: 'unreachable',
        doneAt: null,
        nextActivityId: null,
      },
    }));
    message.success(
      t('followups.unreachable.done', {
        order: row.order.orderNo,
        date: nextDue.format('YYYY-MM-DD'),
      })
    );
  };

  /** Customer asked to be called back later: same chaining, customer's date. */
  const postpone = (row: FollowupRow, due: Dayjs, note: string) => {
    const nextId = `${row.activity.id}-p${row.activity.seq + 1}`;
    applyRow(row.activity.id, (r) => ({
      ...r,
      activity: {
        ...r.activity,
        id: nextId,
        dueDate: due.format('YYYY-MM-DD'),
        seq: r.activity.seq + 1,
        feedback: 'customerPostponed',
        note,
        doneAt: null,
        nextActivityId: null,
      },
    }));
    message.success(
      t('followups.postpone.done', {
        order: row.order.orderNo,
        date: due.format('YYYY-MM-DD'),
      })
    );
  };

  /** Bulk: push the due date out a day. Plain rescheduling, not feedback. */
  const bulkPostpone = () => {
    const ids = new Set(selected.map(String));
    setRows((prev) =>
      prev.map((r) =>
        ids.has(r.activity.id)
          ? {
              ...r,
              activity: {
                ...r.activity,
                dueDate: dayjs(r.activity.dueDate)
                  .add(1, 'day')
                  .format('YYYY-MM-DD'),
              },
            }
          : r
      )
    );
    message.success(t('followups.bulk.done', { n: ids.size }));
    setSelected([]);
  };

  const columns: TableColumnsType<FollowupRow> = [
    {
      title: t('followups.col.due'),
      key: 'due',
      width: wc(96),
      fixed: isMobile ? undefined : 'left',
      sorter: (a, b) => a.activity.dueDate.localeCompare(b.activity.dueDate),
      defaultSortOrder: 'ascend',
      render: (_, r) => {
        const state = activityState(r.activity);
        return (
          <Flex vertical gap={2}>
            <Text style={{ whiteSpace: 'nowrap' }}>
              {dayjs(r.activity.dueDate).format('MM-DD')}
            </Text>
            <Pill tone={STATE_TONE[state]} dot>
              {t(stateKey(state))}
            </Pill>
          </Flex>
        );
      },
    },
    {
      title: t('followups.col.kind'),
      key: 'kind',
      width: wc(104),
      render: (_, r) => (
        <Flex vertical gap={2}>
          <Text style={{ whiteSpace: 'nowrap' }}>{t(kindKey(r.activity.kind))}</Text>
          {r.activity.seq > 1 && (
            <Text type="secondary" style={{ whiteSpace: 'nowrap' }}>
              {t('followups.attempts', { n: r.activity.seq })}
            </Text>
          )}
        </Flex>
      ),
    },
    {
      title: t('followups.col.order'),
      key: 'order',
      width: wc(96),
      render: (_, r) => (
        <Text style={{ color: colors.primary, fontWeight: 500, cursor: 'pointer' }}>
          {r.order.orderNo}
        </Text>
      ),
    },
    {
      title: t('followups.col.customer'),
      key: 'customer',
      width: wc(124),
      render: (_, r) => (
        <Flex vertical gap={2}>
          <Text>{r.order.customer.alias}</Text>
          <Text type="secondary">{r.order.customer.district}</Text>
        </Flex>
      ),
    },
    {
      title: t('followups.col.progress'),
      key: 'progress',
      width: wc(150),
      render: (_, r) => <ProgressCell row={r} t={t} />,
    },
    {
      title: t('followups.col.requested'),
      key: 'requested',
      width: wc(130),
      responsive: ['xl'],
      render: (_, r) => (
        <Flex vertical gap={2}>
          <Text type={r.order.customerRequestedDate ? undefined : 'secondary'}>
            {r.order.customerRequestedDate ?? '—'}
          </Text>
          {r.order.customerRequestedNote && (
            <Text type="secondary" ellipsis>
              {r.order.customerRequestedNote}
            </Text>
          )}
        </Flex>
      ),
    },
    {
      title: t('followups.col.scheduled'),
      key: 'scheduled',
      width: wc(112),
      render: (_, r) =>
        r.delivery.scheduledDate ? (
          <Flex vertical gap={2}>
            <Text>{r.delivery.scheduledDate}</Text>
            {r.delivery.timeSlot && (
              <Text type="secondary">{t(slotKey(r.delivery.timeSlot))}</Text>
            )}
          </Flex>
        ) : (
          <Text type="secondary">{t('followups.notScheduled')}</Text>
        ),
    },
    {
      title: t('followups.col.owner'),
      key: 'owner',
      width: wc(80),
      responsive: ['xxl'],
      render: (_, r) => <Text type="secondary">{r.activity.owner}</Text>,
    },
    {
      title: t('followups.col.actions'),
      key: 'actions',
      width: wc(276),
      fixed: isMobile ? undefined : 'right',
      // A closed activity has nothing left to act on — the next one in the
      // chain carries the work (§2.5).
      render: (_, r) =>
        activityState(r.activity) === 'done' ? null : (
          <RowActions
            row={r}
            t={t}
            isMobile={false}
            onSchedule={schedule}
            onUnreachable={markUnreachable}
            onPostpone={postpone}
          />
        ),
    },
  ];

  const bucketOptions: { value: Bucket; label: string }[] = (
    ['overdue', 'today', 'week', 'later', 'done', 'all'] as Bucket[]
  ).map((b) => ({
    value: b,
    label: `${t(`followups.bucket.${b}` as MessageKey)} ${counts[b]}`,
  }));

  return (
    <Flex vertical gap={16}>
      <Flex align="center" justify="space-between" wrap gap={12}>
        <Flex vertical gap={2}>
          <Title level={1} style={{ margin: 0 }}>
            {t('followups.title')}
          </Title>
          <Text type="secondary">
            {t('followups.subtitle', {
              owner: owner === 'all' ? t('followups.owner.all') : owner,
              date: DEMO_TODAY,
            })}
          </Text>
        </Flex>
      </Flex>

      <Row gutter={[12, 12]}>
        {(
          [
            { key: 'overdue', value: counts.overdue, tone: colors.error },
            { key: 'today', value: counts.today, tone: colors.warningText },
            { key: 'week', value: counts.week, tone: undefined },
          ] as { key: Bucket; value: number; tone?: string }[]
        ).map((s) => (
          <Col key={s.key} xs={12} lg={6}>
            <Card size="small">
              <Statistic
                title={t(`followups.bucket.${s.key}` as MessageKey)}
                value={s.value}
                styles={{
                  content: { fontSize: 24, fontWeight: 600, color: s.tone },
                }}
              />
            </Card>
          </Col>
        ))}
        <Col xs={12} lg={6}>
          <Card size="small">
            <Tooltip
              title={t('followups.escalatedHint', {
                threshold: ESCALATION_DAYS_DEFAULT,
              })}
            >
              <span>
                <Statistic
                  title={t('followups.escalated', { n: ESCALATION_DAYS_DEFAULT })}
                  value={escalatedCount}
                  styles={{
                    content: { fontSize: 24, fontWeight: 600, color: colors.error },
                  }}
                />
              </span>
            </Tooltip>
          </Card>
        </Col>
      </Row>

      <Card
        styles={{ body: { paddingTop: 12 } }}
        title={
          isMobile ? (
            <Select
              value={bucket}
              onChange={setBucket}
              options={bucketOptions}
              style={{ width: '100%' }}
            />
          ) : (
            <Segmented
              value={bucket}
              onChange={(v) => setBucket(v as Bucket)}
              options={bucketOptions}
            />
          )
        }
        extra={
          !isMobile && (
            <Text type="secondary">
              {t('followups.count', { n: visible.length })}
            </Text>
          )
        }
      >
        <Flex vertical gap={12}>
          <Flex gap={8} wrap>
            <Input
              allowClear
              placeholder={t('followups.search')}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              style={{ width: isMobile ? '100%' : 260 }}
            />
            <Select
              value={owner}
              onChange={setOwner}
              style={{ width: isMobile ? '100%' : 150 }}
              options={[
                { value: 'all', label: t('followups.owner.all') },
                ...OWNERS.map((o) => ({ value: o, label: o })),
              ]}
            />
          </Flex>

          {selected.length > 0 && (
            <Flex
              align="center"
              justify="space-between"
              wrap
              gap={8}
              style={{
                padding: '6px 12px',
                background: colors.primarySubtle,
                borderRadius: 6,
              }}
            >
              <Text>{t('followups.bulk.selected', { n: selected.length })}</Text>
              <Space>
                <Button size="small" onClick={bulkPostpone}>
                  {t('followups.bulk.postpone')}
                </Button>
                <Button size="small" type="text" onClick={() => setSelected([])}>
                  {t('followups.bulk.clear')}
                </Button>
              </Space>
            </Flex>
          )}

          {isMobile ? (
            <CardList
              items={visible}
              rowKey={(r) => r.activity.id}
              pageSize={8}
              emptyText={t('followups.empty')}
              renderItem={(r) => (
                <FollowupCard
                  row={r}
                  t={t}
                  onSchedule={schedule}
                  onUnreachable={markUnreachable}
                  onPostpone={postpone}
                />
              )}
            />
          ) : (
            <Table<FollowupRow>
              rowKey={(r) => r.activity.id}
              columns={columns}
              dataSource={visible}
              // 124 fixtures; virtual scrolling keeps the "100+ rows without
              // lag" acceptance rule true as the list grows.
              virtual
              scroll={{ x: wc(1000), y: tableHeight }}
              pagination={false}
              rowSelection={{
                selectedRowKeys: selected,
                onChange: setSelected,
                columnWidth: wc(48),
              }}
            />
          )}
        </Flex>
      </Card>
    </Flex>
  );
}

/** Derived line progress plus the escalation flag (§4). */
function ProgressCell({ row, t }: { row: FollowupRow; t: Translate }) {
  const status = lineStatus(row.units);
  const days = daysInHk(row.units);
  const escalated = isEscalated(row.units, row.delivery);

  return (
    <Flex vertical gap={2} align="flex-start">
      <Pill tone={LINE_TONE[status]} dot>
        {t(lineKey(status))}
      </Pill>
      {days != null && (
        <Text
          type={escalated ? undefined : 'secondary'}
          style={
            escalated
              ? { color: colors.error, fontWeight: 500, whiteSpace: 'nowrap' }
              : { whiteSpace: 'nowrap' }
          }
        >
          {t('followups.inHkDays', { n: days })}
        </Text>
      )}
    </Flex>
  );
}

interface ActionProps {
  row: FollowupRow;
  t: Translate;
  isMobile: boolean;
  onSchedule: (row: FollowupRow, date: Dayjs, slot: TimeSlot) => void;
  onUnreachable: (row: FollowupRow) => void;
  onPostpone: (row: FollowupRow, due: Dayjs, note: string) => void;
}

/**
 * The three inline actions from §6. Booking and postponing open in place —
 * acceptance rule: "「已約」揀日期時段唔跳頁".
 */
function RowActions({
  row,
  t,
  isMobile,
  onSchedule,
  onUnreachable,
  onPostpone,
}: ActionProps) {
  const [open, setOpen] = useState<'schedule' | 'postpone' | null>(null);
  const size = isMobile ? 'middle' : 'small';
  const close = () => setOpen(null);

  const scheduleForm = (
    <ScheduleForm
      row={row}
      t={t}
      onSubmit={(date, slot) => {
        onSchedule(row, date, slot);
        close();
      }}
      onCancel={close}
    />
  );

  const postponeForm = (
    <PostponeForm
      t={t}
      onSubmit={(due, note) => {
        onPostpone(row, due, note);
        close();
      }}
      onCancel={close}
    />
  );

  const scheduleButton = (
    <Button
      size={size}
      type="primary"
      icon={<CalendarOutlined />}
      onClick={() => setOpen('schedule')}
    >
      {t('followups.action.schedule')}
    </Button>
  );

  const unreachableButton = (
    <Button size={size} icon={<PhoneOutlined />} onClick={() => onUnreachable(row)}>
      {t('followups.action.unreachable')}
    </Button>
  );

  const postponeButton = (
    <Button
      size={size}
      icon={<ClockCircleOutlined />}
      onClick={() => setOpen('postpone')}
    >
      {t('followups.action.postponed')}
    </Button>
  );

  // On a phone a popover has nowhere to go, so the same form opens in a modal.
  // Neither one navigates away from the list — acceptance rule
  // 「已約」揀日期時段唔跳頁.
  if (isMobile) {
    return (
      <>
        <Flex gap={8} wrap>
          {scheduleButton}
          {unreachableButton}
          {postponeButton}
        </Flex>
        <Modal
          open={open === 'schedule'}
          onCancel={close}
          title={t('followups.schedule.title')}
          footer={null}
          destroyOnHidden
        >
          {scheduleForm}
        </Modal>
        <Modal
          open={open === 'postpone'}
          onCancel={close}
          title={t('followups.postpone.title')}
          footer={null}
          destroyOnHidden
        >
          {postponeForm}
        </Modal>
      </>
    );
  }

  return (
    <Space size={4}>
      <Popover
        open={open === 'schedule'}
        onOpenChange={(next) => !next && close()}
        trigger="click"
        placement="bottomRight"
        title={t('followups.schedule.title')}
        content={scheduleForm}
        destroyOnHidden
      >
        {scheduleButton}
      </Popover>
      {unreachableButton}
      <Popover
        open={open === 'postpone'}
        onOpenChange={(next) => !next && close()}
        trigger="click"
        placement="bottomRight"
        title={t('followups.postpone.title')}
        content={postponeForm}
        destroyOnHidden
      >
        {postponeButton}
      </Popover>
    </Space>
  );
}

function ScheduleForm({
  row,
  t,
  onSubmit,
  onCancel,
}: {
  row: FollowupRow;
  t: Translate;
  onSubmit: (date: Dayjs, slot: TimeSlot) => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState<Dayjs | null>(
    row.order.customerRequestedDate
      ? dayjs(row.order.customerRequestedDate)
      : today().add(2, 'day')
  );
  const [slot, setSlot] = useState<TimeSlot>('flexible');

  const requested = row.order.customerRequestedNote || row.order.customerRequestedDate;

  return (
    <Flex vertical gap={12} style={{ width: 280 }}>
      {requested && (
        <Text type="secondary">
          {t('followups.schedule.requestedHint', {
            text: [row.order.customerRequestedDate, row.order.customerRequestedNote]
              .filter(Boolean)
              .join(' · '),
          })}
        </Text>
      )}
      <Flex vertical gap={4}>
        <Text type="secondary">{t('followups.schedule.date')}</Text>
        <DatePicker
          value={date}
          onChange={setDate}
          allowClear={false}
          style={{ width: '100%' }}
        />
      </Flex>
      <Flex vertical gap={4}>
        <Text type="secondary">{t('followups.schedule.slot')}</Text>
        <Segmented
          block
          value={slot}
          onChange={(v) => setSlot(v as TimeSlot)}
          options={SLOTS.map((s) => ({ value: s, label: t(slotKey(s)) }))}
        />
      </Flex>
      <Flex gap={8} justify="flex-end">
        <Button size="small" onClick={onCancel}>
          {t('followups.action.cancel')}
        </Button>
        <Button
          size="small"
          type="primary"
          disabled={!date}
          onClick={() => date && onSubmit(date, slot)}
        >
          {t('followups.action.confirm')}
        </Button>
      </Flex>
    </Flex>
  );
}

function PostponeForm({
  t,
  onSubmit,
  onCancel,
}: {
  t: Translate;
  onSubmit: (due: Dayjs, note: string) => void;
  onCancel: () => void;
}) {
  const [due, setDue] = useState<Dayjs | null>(today().add(3, 'day'));
  const [note, setNote] = useState('');

  return (
    <Flex vertical gap={12} style={{ width: 280 }}>
      <Flex vertical gap={4}>
        <Text type="secondary">{t('followups.postpone.nextDue')}</Text>
        <DatePicker
          value={due}
          onChange={setDue}
          allowClear={false}
          style={{ width: '100%' }}
        />
      </Flex>
      <Flex vertical gap={4}>
        <Text type="secondary">{t('followups.postpone.note')}</Text>
        <Input.TextArea
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('followups.postpone.notePlaceholder')}
        />
      </Flex>
      <Flex gap={8} justify="flex-end">
        <Button size="small" onClick={onCancel}>
          {t('followups.action.cancel')}
        </Button>
        <Button
          size="small"
          type="primary"
          disabled={!due}
          onClick={() => due && onSubmit(due, note)}
        >
          {t('followups.action.confirm')}
        </Button>
      </Flex>
    </Flex>
  );
}

function FollowupCard({
  row,
  t,
  onSchedule,
  onUnreachable,
  onPostpone,
}: Omit<ActionProps, 'isMobile'>) {
  const state = activityState(row.activity);
  return (
    <Card size="small" style={{ width: '100%' }}>
      <Flex vertical gap={10}>
        <Flex align="center" justify="space-between" gap={8}>
          <Text style={{ fontWeight: 600 }}>{row.order.orderNo}</Text>
          <Pill tone={STATE_TONE[state]} dot>
            {t(stateKey(state))}
          </Pill>
        </Flex>

        <Flex vertical gap={2}>
          <Text>
            {row.order.customer.alias} · {row.order.customer.district}
          </Text>
          <Text type="secondary">{row.items.join('、')}</Text>
        </Flex>

        <Flex align="center" justify="space-between" gap={8} wrap>
          <ProgressCell row={row} t={t} />
          <Flex vertical gap={2} align="flex-end">
            <Text type="secondary">
              {t('followups.col.due')} {dayjs(row.activity.dueDate).format('MM-DD')}
            </Text>
            <Text type="secondary">
              {row.delivery.scheduledDate
                ? `${row.delivery.scheduledDate}${
                    row.delivery.timeSlot ? ` ${t(slotKey(row.delivery.timeSlot))}` : ''
                  }`
                : t('followups.notScheduled')}
            </Text>
          </Flex>
        </Flex>

        {row.order.customerRequestedNote && (
          <Text style={{ color: colors.warningText }}>
            {t('followups.schedule.requestedHint', {
              text: row.order.customerRequestedNote,
            })}
          </Text>
        )}

        {state !== 'done' && (
          <RowActions
            row={row}
            t={t}
            isMobile
            onSchedule={onSchedule}
            onUnreachable={onUnreachable}
            onPostpone={onPostpone}
          />
        )}
      </Flex>
    </Card>
  );
}
