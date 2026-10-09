import {
  CalendarOutlined,
  ClockCircleOutlined,
  PhoneOutlined,
  ShoppingCartOutlined,
} from '@ant-design/icons';
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
import dayjs from 'dayjs';
import * as React from 'react';
import { useAuth as MoriUseAuth } from '../auth/hooks';
import { CardList } from '../components/CardList';
import { DataTableCard } from '../components/DataTableCard';
import { FilterChip } from '../components/FilterChip';
import { Pill } from '../components/Pill';
import { OWNERS } from '../data/followups';
import {
  commit,
  MORI_TASK_TYPES,
  moriCompleteOtherTask,
  moriOpenReceivingTask,
  moriOrderShortage,
  moriReceiptBlocked,
  moriRescheduleActivity,
  moriUpdateActivity,
  moriWorkbenchRows,
  nowIso,
  opsState,
  productOf,
  scheduleOrder,
  useOps,
} from '../data/ops';
import { DEMO_TODAY, today } from '../domain/clock';
import {
  activityState,
  daysInHk,
  isEscalated,
  lineStatus,
} from '../domain/derive';
import type { ActivityKind, TimeSlot } from '../domain/types';
import type { MessageKey } from '../i18n';
import { useT as MoriUseT } from '../i18n/hooks';
import { usePeek } from '../peek/hooks';
import { colors, useIsMobile } from '../theme';
import { fmtDate } from '../utils/date';
import { useDensity } from '../utils/useDensity';
import { useMockLoading } from '../utils/useMockLoading';
import { useTablePagination } from '../utils/useTablePagination';
const { Text, Title } = Typography;

/** Action Inbox derived from canonical activities; due/SLA is separate from workflow state.
 * An unsuccessful contact attempt stays on the same task and defaults to tomorrow.
 */
const SLOTS: TimeSlot[] = ['morning', 'afternoon', 'evening', 'flexible'];
type Bucket = 'overdue' | 'today' | 'week' | 'later' | 'done';
const BUCKETS: Bucket[] = ['overdue', 'today', 'week', 'later', 'done'];
const kindKey = (k: ActivityKind): MessageKey =>
  `followups.kind.${k}` as MessageKey;
/** Which bucket an activity falls in, from its derived state. */

function bucketOf(row: any) {
  let state = activityState(row.activity);
  if (state === `done`) return `done`;
  if (state === `overdue`) return `overdue`;
  if (state === `today`) return `today`;
  let n = dayjs(row.activity.dueDate).startOf(`day`);
  let r = today().startOf(`day`);
  return n.diff(r, `day`) <= 7 ? `week` : `later`;
}
const slotKey = (s: TimeSlot): MessageKey =>
  `followups.slot.${s}` as MessageKey;
export function MyFollowupsPage() {
  let { message } = App.useApp();
  let isMobile = useIsMobile();
  let n = MoriUseT();
  let { user } = MoriUseAuth();
  let { wc: i } = useDensity();
  let store = useOps();
  let rows = React.useMemo(() => moriWorkbenchRows(store), [store]);
  let peek = usePeek();
  let [buckets, setBuckets] = React.useState<any>([]);
  let [owners, setOwners] = React.useState<any>([]);
  let [keyword, setKeyword] = React.useState<any>(``);
  let [selected, setSelected] = React.useState<any>([]);
  let [attentionOnly, setAttentionOnly] = React.useState<any>(false);
  let counts = React.useMemo(() => {
    let e: any = {
      overdue: 0,
      today: 0,
      week: 0,
      later: 0,
      done: 0,
      all: rows.length,
    };
    for (let t of rows) e[bucketOf(t)]++;
    return e;
  }, [rows]);
  let escalatedCount = React.useMemo(
    () => rows.filter(moriNeedsAttention).length,
    [rows],
  );
  let visible = React.useMemo(
    () =>
      rows
        .filter((t: any) => {
          let n = bucketOf(t);
          if (buckets.length > 0) {
            if (!buckets.includes(n)) return false;
          } else if (n === `done`) return false;
          if (owners.length > 0 && !owners.includes(t.activity.owner))
            return false;
          if (attentionOnly && !moriNeedsAttention(t)) return false;
          return moriSearchMatches(t, keyword);
        })
        .sort(
          (a: any, b: any) =>
            a.activity.dueDate.localeCompare(b.activity.dueDate) ||
            a.activity.id.localeCompare(b.activity.id),
        ),
    [rows, buckets, owners, keyword, attentionOnly],
  );
  let loading = useMockLoading();
  let pagination = useTablePagination(visible.length);
  let schedule = (task: any, date: any, slot: any) =>
    moriScheduleWithUndo(task, date, slot, user?.id || `u-system`, message, n);
  let markUnreachable = (task: any) => {
    const next = moriRescheduleActivity(
      task.activity.id,
      today().add(1, `day`).format(`YYYY-MM-DD`),
      ``,
      `unreachable`,
    );
    if (next)
      message.success(
        n(`followups.unreachable.done`, {
          order: task.order.orderNo || `—`,
          date: next.dueDate,
        }),
      );
  };
  let postpone = (task: any, date: any, note: any) => {
    const kind = task.activity.taskType || task.activity.kind;
    moriRescheduleActivity(
      task.activity.id,
      date.format(`YYYY-MM-DD`),
      note,
      [`scheduleDelivery`, `chasePayment`].includes(kind)
        ? `customerPostponed`
        : `followLater`,
    );
    message.success(
      n(`followups.postpone.done`, {
        order: task.order.orderNo || `—`,
        date: date.format(`YYYY-MM-DD`),
      }),
    );
  };
  let bulkPostpone = () => {
    let count = 0;
    for (const id of selected) {
      const a = opsState.activities.find((a: any) => a.id === id);
      if (!a || a.doneAt) continue;
      const date = dayjs(a.dueDate < DEMO_TODAY ? DEMO_TODAY : a.dueDate)
        .add(1, `day`)
        .format(`YYYY-MM-DD`);
      if (moriRescheduleActivity(id, date, ``, `followLater`)) count++;
    }
    message.success(
      n(`followups.bulk.done`, {
        n: count,
      }),
    );
    setSelected([]);
  };
  let A = (task: any) => {
    const kind = task.activity.taskType || task.activity.kind;
    if (kind === `other`) {
      const previous = moriCompleteOtherTask(task.activity.id);
      if (!previous) return;
      message.success({
        content: (
          <Flex align={`center`} gap={6}>
            {
              <span>
                {n(`followups.complete.done`, {
                  order: task.order.orderNo || `—`,
                })}
              </span>
            }
            <Button
              type={`link`}
              size={`small`}
              onClick={() => {
                moriUpdateActivity(previous.id, previous);
                message.destroy();
              }}
            >
              {n(`followups.action.undo`)}
            </Button>
          </Flex>
        ),
        duration: 8,
      });
      return;
    }
    if (kind === `chasePayment`) {
      peek.open({
        model: `order`,
        id: task.order.orderNo,
      });
      return;
    }
    peek.close();
    window.__MORI_NAVIGATE__?.(
      task.activity.source === `allocation`
        ? `inventory`
        : [`chaseSupplier`, `procurementException`].includes(kind)
          ? `purchasing`
          : `waiting`,
    );
  };
  let columns: any[] = [
    {
      title: n(`followups.col.due`),
      key: `due`,
      width: i(128),
      fixed: isMobile ? undefined : `left`,
      sorter: (e: any, t: any) =>
        e.activity.dueDate.localeCompare(t.activity.dueDate),
      defaultSortOrder: `ascend`,
      render: (_e: any, t: any) => {
        let r = moriDueMeta(t.activity, n);
        return (
          <Flex vertical={true} gap={4}>
            <Text
              style={{
                whiteSpace: `nowrap`,
                fontWeight: 500,
              }}
            >
              {fmtDate(t.activity.dueDate)}
            </Text>
            <Pill
              tone={
                r.tone as 'brand' | 'muted' | 'warning' | 'success' | 'error'
              }
              dot={true}
            >
              {r.label}
            </Pill>
          </Flex>
        );
      },
    },
    {
      title: n(`followups.col.kind`),
      key: `kind`,
      width: i(150),
      render: (_e: any, t: any) => (
        <Flex vertical={true} gap={3}>
          <Text
            style={{
              fontWeight: 600,
              whiteSpace: `nowrap`,
            }}
          >
            {t.activity.kind === `other`
              ? t.activity.description
              : n(kindKey(t.activity.kind))}
          </Text>
          {t.activity.seq > 1 && (
            <Text type={`secondary`}>
              {n(`followups.attempts`, {
                n: t.activity.seq,
              })}
            </Text>
          )}
        </Flex>
      ),
    },
    {
      title: n(`followups.col.order`),
      key: `order`,
      width: i(205),
      render: (_e: any, t: any) => (
        <Flex vertical={true} gap={3}>
          <Text
            style={{
              color: colors.primary,
              fontWeight: 600,
              cursor: `pointer`,
            }}
            onClick={() =>
              t.order.orderNo &&
              peek.open({
                model: `order`,
                id: t.order.orderNo,
              })
            }
          >
            {t.order.orderNo || `—`}
          </Text>
          <Text>
            {t.order.customer.alias}
            {` · `}
            {t.order.customer.district}
          </Text>
          <Text type={`secondary`} ellipsis={true}>
            {t.items.join(`、`)}
          </Text>
        </Flex>
      ),
    },
    {
      title: n(`followups.col.reason`),
      key: `reason`,
      width: i(250),
      render: (_e: any, t: any) => (
        <Flex vertical={true} gap={4} align={`flex-start`}>
          <Text>{moriReasonText(t, n)}</Text>
          {t.order.customerRequestedNote && (
            <Text type={`secondary`} ellipsis={true}>
              {t.order.customerRequestedNote}
            </Text>
          )}
        </Flex>
      ),
    },
    {
      title: n(`followups.col.taskStatus`),
      key: `taskStatus`,
      width: i(150),
      render: (_e: any, t: any) => <ProgressCell row={t} t={n} />,
    },
    {
      title: n(`followups.col.owner`),
      key: `owner`,
      width: i(92),
      render: (_e: any, t: any) => (
        <Text type={`secondary`}>{t.activity.owner}</Text>
      ),
    },
    {
      title: n(`followups.col.actions`),
      key: `actions`,
      width: i(276),
      fixed: isMobile ? undefined : `right`,
      render: (_e: any, t: any) =>
        activityState(t.activity) === `done` ? null : (
          <RowActions
            row={t}
            t={n}
            isMobile={false}
            onSchedule={schedule}
            onUnreachable={markUnreachable}
            onPostpone={postpone}
            onComplete={A}
          />
        ),
    },
  ];
  let bucketOptions = BUCKETS.map((e: any) => ({
    value: e,
    label: (
      <Flex
        justify={`space-between`}
        gap={12}
        style={{
          flexGrow: 1,
        }}
      >
        <Text>{n(`followups.bucket.${e}` as Parameters<typeof n>[0])}</Text>
        <Text type={`secondary`}>{counts[e]}</Text>
      </Flex>
    ),
  }));
  let ownerOptions = OWNERS.map((e: any) => ({
    value: e,
    label: e,
  }));
  let filtered =
    buckets.length > 0 || owners.length > 0 || keyword !== `` || attentionOnly;
  let activeCard = attentionOnly
    ? `attention`
    : buckets.length === 1 &&
        (buckets[0] === `overdue` || buckets[0] === `today`)
      ? buckets[0]
      : buckets.length === 0
        ? `open`
        : null;
  let selectCard = (e: any) => {
    if (e === `open`) {
      {
        setBuckets([]);
        setAttentionOnly(false);
      }
    } else {
      if (e === `attention`) {
        {
          setBuckets([]);
          setAttentionOnly(true);
        }
      } else {
        {
          setBuckets([e]);
          setAttentionOnly(false);
        }
      }
    }
  };
  return (
    <Flex vertical={true} gap={16}>
      <Flex align={`center`} justify={`space-between`} wrap={true} gap={12}>
        <Flex vertical={true} gap={2}>
          <Title
            level={1}
            style={{
              margin: 0,
            }}
          >
            {n(`followups.title`)}
          </Title>
          <Text type={`secondary`}>
            {n(`followups.subtitle`, {
              date: DEMO_TODAY,
            })}
          </Text>
        </Flex>
        <MoriManualTask />
      </Flex>
      <Row gutter={[12, 12]}>
        {[
          {
            key: `open`,
            title: n(`followups.stat.open`),
            value: counts.overdue + counts.today + counts.week + counts.later,
            tone: colors.primary,
          },
          {
            key: `overdue`,
            title: n(`followups.stat.overdue`),
            value: counts.overdue,
            tone: colors.error,
          },
          {
            key: `today`,
            title: n(`followups.stat.today`),
            value: counts.today,
            tone: colors.warningText,
          },
          {
            key: `attention`,
            title: n(`followups.stat.attention`),
            value: escalatedCount,
            tone: colors.error,
            hint: n(`followups.attentionHint`, {
              threshold: 14,
            }),
          },
        ].map((e: any) => {
          let t = activeCard === e.key;
          return (
            <Col xs={12} lg={6} key={e.key}>
              <Card
                size={`small`}
                role={`button`}
                tabIndex={0}
                aria-pressed={t}
                onKeyDown={(n: any) => {
                  if (n.key === `Enter` || n.key === ` `) {
                    n.preventDefault();
                    selectCard(e.key);
                  }
                }}
                onClick={() => selectCard(e.key)}
                style={{
                  cursor: `pointer`,
                  borderColor: t ? colors.primary : undefined,
                  boxShadow: t ? `0 0 0 1px ${colors.primary}` : undefined,
                }}
              >
                {e.hint ? (
                  <Tooltip title={e.hint}>
                    {
                      <span>
                        <Statistic
                          title={e.title}
                          value={e.value}
                          styles={{
                            content: {
                              fontSize: 24,
                              fontWeight: 600,
                              color: e.tone,
                            },
                          }}
                        />
                      </span>
                    }
                  </Tooltip>
                ) : (
                  <Statistic
                    title={e.title}
                    value={e.value}
                    styles={{
                      content: {
                        fontSize: 24,
                        fontWeight: 600,
                        color: e.tone,
                      },
                    }}
                  />
                )}
              </Card>
            </Col>
          );
        })}
      </Row>
      <DataTableCard
        filters={
          <>
            <FilterChip
              label={n(`followups.filter.bucket`)}
              options={bucketOptions}
              value={buckets}
              onChange={(e: any) => {
                setBuckets(e);
                setAttentionOnly(false);
              }}
            />
            <FilterChip
              label={n(`followups.filter.owner`)}
              options={ownerOptions}
              value={owners}
              onChange={setOwners}
            />
          </>
        }
        onClearFilters={
          filtered
            ? () => {
                setBuckets([]);
                setOwners([]);
                setKeyword(``);
                setAttentionOnly(false);
              }
            : undefined
        }
        search={{
          value: keyword,
          onChange: setKeyword,
          placeholder: n(`followups.search`),
        }}
        count={n(`followups.count`, {
          n: visible.length,
        })}
        selection={{
          count: selected.length,
          text: n(`followups.bulk.selected`, {
            n: selected.length,
          }),
          actions: (
            <Button size={`small`} onClick={bulkPostpone}>
              {n(`followups.bulk.postpone`)}
            </Button>
          ),
          onClear: () => setSelected([]),
        }}
        mobile={
          <CardList
            items={visible}
            rowKey={(e: any) => e.activity.id}
            pageSize={8}
            emptyText={n(`followups.empty`)}
            renderItem={(e: any) => (
              <FollowupCard
                row={e}
                t={n}
                onSchedule={schedule}
                onUnreachable={markUnreachable}
                onPostpone={postpone}
                onComplete={A}
              />
            )}
          />
        }
      >
        <Table
          loading={loading}
          rowKey={(e: any) => e.activity.id}
          columns={columns}
          dataSource={visible}
          pagination={pagination}
          scroll={{
            x: i(1220),
          }}
          rowSelection={{
            selectedRowKeys: selected,
            onChange: setSelected,
            columnWidth: i(48),
            getCheckboxProps: (e: any) => ({
              disabled: !!e.activity.doneAt,
            }),
          }}
        />
      </DataTableCard>
    </Flex>
  );
}

/** Derived line progress plus the escalation flag (§4). */

function ProgressCell({ row, t }: any) {
  let bucket = moriTaskStatusKey(row);
  return (
    <Pill
      tone={
        (moriTaskStatusTone[bucket as keyof typeof moriTaskStatusTone] ??
          `muted`) as 'brand' | 'muted' | 'warning' | 'success' | 'error'
      }
      dot={true}
    >
      {t(`followups.taskStatus.${bucket}`)}
    </Pill>
  );
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
  onComplete: open,
}: any) {
  let [setOpen, size] = React.useState<any>(null);
  let close = isMobile ? `middle` : `small`;
  let scheduleForm = () => size(null);
  let postponeForm = (
    <ScheduleForm
      row={row}
      t={t}
      onSubmit={(t: any, n: any) => {
        onSchedule(row, t, n);
        scheduleForm();
      }}
      onCancel={scheduleForm}
    />
  );
  let generic =
    row.activity.kind === `chaseSupplier` ||
    row.activity.kind === `confirmArrival`;
  let scheduleButton = (
    <PostponeForm
      t={t}
      generic={generic}
      onSubmit={(t: any, n: any) => {
        onPostpone(row, t, n);
        scheduleForm();
      }}
      onCancel={scheduleForm}
    />
  );
  let unreachableButton = (
    <Button
      size={close as 'small' | 'middle' | 'large'}
      type={`primary`}
      icon={<CalendarOutlined />}
      onClick={() => size(`schedule`)}
    >
      {t(`followups.action.schedule`)}
    </Button>
  );
  let postponeButton = (
    <Button
      size={close as 'small' | 'middle' | 'large'}
      icon={<PhoneOutlined />}
      onClick={() => onUnreachable(row)}
    >
      {t(`followups.action.unreachable`)}
    </Button>
  );
  let h = (
    <Button
      size={close as 'small' | 'middle' | 'large'}
      icon={<ClockCircleOutlined />}
      onClick={() => size(`postpone`)}
    >
      {t(
        generic ? `followups.action.followLater` : `followups.action.postponed`,
      )}
    </Button>
  );
  if (row.activity.source === `receiving`)
    return (
      <Button
        size={close as 'small' | 'middle' | 'large'}
        type={`primary`}
        onClick={() => moriOpenReceivingTask(row.activity)}
      >
        {t(`receiving.resolveAction`)}
      </Button>
    );
  if (
    row.activity.kind === `scheduleDelivery` &&
    (moriOrderShortage(row.order) || moriReceiptBlocked(row.order))
  )
    return (
      <Button
        size={close as 'small' | 'middle' | 'large'}
        type={`primary`}
        onClick={() => window.__MORI_NAVIGATE__?.(`inventory`)}
      >{`核對庫存缺口`}</Button>
    );
  if (row.activity.kind !== `scheduleDelivery`) {
    let r = (
      <Button
        size={close as 'small' | 'middle' | 'large'}
        type={`primary`}
        onClick={() => open && open(row)}
      >
        {row.activity.kind === `other`
          ? t(`followups.action.complete`)
          : t(`followups.action.review.${row.activity.kind}`)}
      </Button>
    );
    let i = row.activity.kind === `chasePayment`;
    return isMobile ? (
      <>
        <Flex gap={8} wrap={true}>
          {i ? [r, postponeButton, h] : [r, h]}
        </Flex>
        <Modal
          open={setOpen === `postpone`}
          onCancel={scheduleForm}
          title={t(
            generic
              ? `followups.followLater.title`
              : `followups.postpone.title`,
          )}
          footer={null}
          destroyOnHidden={true}
        >
          {scheduleButton}
        </Modal>
      </>
    ) : (
      <Space size={4}>
        {i
          ? [
              r,
              postponeButton,
              <Popover
                open={setOpen === `postpone`}
                onOpenChange={(e: any) => !e && scheduleForm()}
                trigger={`click`}
                placement={`bottomRight`}
                title={t(`followups.postpone.title`)}
                content={scheduleButton}
                destroyOnHidden={true}
              >
                {h}
              </Popover>,
            ]
          : [
              r,
              <Popover
                open={setOpen === `postpone`}
                onOpenChange={(e: any) => !e && scheduleForm()}
                trigger={`click`}
                placement={`bottomRight`}
                title={t(`followups.followLater.title`)}
                content={scheduleButton}
                destroyOnHidden={true}
              >
                {h}
              </Popover>,
            ]}
      </Space>
    );
  }
  return isMobile ? (
    <>
      <Flex gap={8} wrap={true}>
        {unreachableButton}
        {postponeButton}
        {h}
      </Flex>
      <Modal
        open={setOpen === `schedule`}
        onCancel={scheduleForm}
        title={t(`followups.schedule.title`)}
        footer={null}
        destroyOnHidden={true}
      >
        {postponeForm}
      </Modal>
      <Modal
        open={setOpen === `postpone`}
        onCancel={scheduleForm}
        title={t(`followups.postpone.title`)}
        footer={null}
        destroyOnHidden={true}
      >
        {scheduleButton}
      </Modal>
    </>
  ) : (
    <Space size={4}>
      <Popover
        open={setOpen === `schedule`}
        onOpenChange={(e: any) => !e && scheduleForm()}
        trigger={`click`}
        placement={`bottomRight`}
        title={t(`followups.schedule.title`)}
        content={postponeForm}
        destroyOnHidden={true}
      >
        {unreachableButton}
      </Popover>
      {postponeButton}
      <Popover
        open={setOpen === `postpone`}
        onOpenChange={(e: any) => !e && scheduleForm()}
        trigger={`click`}
        placement={`bottomRight`}
        title={t(`followups.postpone.title`)}
        content={scheduleButton}
        destroyOnHidden={true}
      >
        {h}
      </Popover>
    </Space>
  );
}
function ScheduleForm({ row, t, onSubmit, onCancel }: any) {
  let [date, setDate] = React.useState<any>(
    row.order.customerRequestedDate &&
      row.order.customerRequestedDate >= DEMO_TODAY
      ? dayjs(row.order.customerRequestedDate)
      : today().add(2, `day`),
  );
  let [slot, setSlot] = React.useState<any>(`flexible`);
  let requested =
    row.order.customerRequestedNote || row.order.customerRequestedDate;
  return (
    <Flex
      vertical={true}
      gap={12}
      style={{
        width: 280,
      }}
    >
      {requested && (
        <Text type={`secondary`}>
          {t(`followups.schedule.requestedHint`, {
            text: [
              row.order.customerRequestedDate,
              row.order.customerRequestedNote,
            ]
              .filter(Boolean)
              .join(` · `),
          })}
        </Text>
      )}
      <Flex vertical={true} gap={4}>
        <Text type={`secondary`}>{t(`followups.schedule.date`)}</Text>
        <DatePicker
          value={date}
          onChange={setDate}
          minDate={today()}
          allowClear={false}
          style={{
            width: `100%`,
          }}
        />
      </Flex>
      <Flex vertical={true} gap={4}>
        <Text type={`secondary`}>{t(`followups.schedule.slot`)}</Text>
        <Segmented
          block={true}
          value={slot}
          onChange={(e: any) => setSlot(e)}
          options={SLOTS.map((e: any) => ({
            value: e,
            label: t(slotKey(e)),
          }))}
        />
      </Flex>
      <Flex gap={8} justify={`flex-end`}>
        <Button size={`small`} onClick={onCancel}>
          {t(`followups.action.cancel`)}
        </Button>
        <Button
          size={`small`}
          type={`primary`}
          disabled={!date}
          onClick={() => date && onSubmit(date, slot)}
        >
          {t(`followups.action.confirm`)}
        </Button>
      </Flex>
    </Flex>
  );
}
function PostponeForm({ t: e, onSubmit, onCancel, generic: r = false }: any) {
  let [setDue, note] = React.useState<any>(today().add(3, `day`));
  let [setNote, s] = React.useState<any>(``);
  return (
    <Flex
      vertical={true}
      gap={12}
      style={{
        width: 280,
      }}
    >
      <Flex vertical={true} gap={4}>
        <Text type={`secondary`}>{e(`followups.postpone.nextDue`)}</Text>
        <DatePicker
          value={setDue}
          onChange={note}
          minDate={today()}
          allowClear={false}
          style={{
            width: `100%`,
          }}
        />
      </Flex>
      <Flex vertical={true} gap={4}>
        <Text type={`secondary`}>{e(`followups.postpone.note`)}</Text>
        <Input.TextArea
          rows={2}
          value={setNote}
          onChange={(e: any) => s(e.target.value)}
          placeholder={e(
            r
              ? `followups.followLater.notePlaceholder`
              : `followups.postpone.notePlaceholder`,
          )}
        />
      </Flex>
      <Flex gap={8} justify={`flex-end`}>
        <Button size={`small`} onClick={onCancel}>
          {e(`followups.action.cancel`)}
        </Button>
        <Button
          size={`small`}
          type={`primary`}
          disabled={!setDue}
          onClick={() => setDue && onSubmit(setDue, setNote)}
        >
          {e(`followups.action.confirm`)}
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
  onComplete: o,
}: any) {
  let peek = usePeek();
  let state = activityState(row.activity);
  let s = moriDueMeta(row.activity, t);
  return (
    <Card
      size={`small`}
      style={{
        width: `100%`,
      }}
    >
      <Flex vertical={true} gap={10}>
        <Flex align={`flex-start`} justify={`space-between`} gap={8}>
          <Flex vertical={true} gap={3}>
            <Text
              style={{
                fontWeight: 700,
                fontSize: 15,
              }}
            >
              {row.activity.kind === `other`
                ? row.activity.description
                : t(kindKey(row.activity.kind))}
            </Text>
            <Text
              type={`secondary`}
              style={{
                cursor: row.order.orderNo ? `pointer` : undefined,
              }}
              onClick={() =>
                row.order.orderNo &&
                peek.open({
                  model: `order`,
                  id: row.order.orderNo,
                })
              }
            >
              {row.order.orderNo || `—`}
              {` · `}
              {row.order.customer.alias}
              {` · `}
              {row.order.customer.district}
            </Text>
          </Flex>
          <Pill
            tone={s.tone as 'brand' | 'muted' | 'warning' | 'success' | 'error'}
            dot={true}
          >
            {s.label}
          </Pill>
        </Flex>
        <Text type={`secondary`}>{row.items.join(`、`)}</Text>
        <Flex vertical={true} gap={5}>
          <Flex justify={`space-between`} gap={8}>
            <Text type={`secondary`}>{t(`followups.col.reason`)}</Text>
            <Text>{moriReasonText(row, t)}</Text>
          </Flex>
          <Flex justify={`space-between`} gap={8} align={`center`}>
            <Text type={`secondary`}>{t(`followups.col.taskStatus`)}</Text>
            <ProgressCell row={row} t={t} />
          </Flex>
          <Flex justify={`space-between`} gap={8}>
            <Text type={`secondary`}>{t(`followups.col.due`)}</Text>
            <Text type={`secondary`}>
              {fmtDate(row.activity.dueDate)}
              {` · `}
              {row.activity.owner}
            </Text>
          </Flex>
        </Flex>
        {row.order.customerRequestedNote && (
          <Text
            style={{
              color: colors.warningText,
            }}
          >
            {t(`followups.schedule.requestedHint`, {
              text: row.order.customerRequestedNote,
            })}
          </Text>
        )}
        {state !== `done` && (
          <RowActions
            row={row}
            t={t}
            isMobile={true}
            onSchedule={onSchedule}
            onUnreachable={onUnreachable}
            onPostpone={onPostpone}
            onComplete={o}
          />
        )}
      </Flex>
    </Card>
  );
}
function moriNeedsAttention(e: any) {
  return (
    !e.activity.doneAt &&
    (e.activity.source === `receiving` ||
      isEscalated(e.units, e.delivery) ||
      e.activity.seq >= 3)
  );
}
function moriTaskStatusKey(e: any) {
  if (activityState(e.activity) === `done`) return `completed`;
  if (
    e.activity.kind === `scheduleDelivery` &&
    (moriOrderShortage(e.order) || moriReceiptBlocked(e.order))
  )
    return `awaitingStock`;
  if (e.activity.feedback === `unreachable`) return `retryContact`;
  if (e.activity.feedback === `customerPostponed`) return `customerPostponed`;
  if (e.activity.feedback === `scheduled`) return `scheduled`;
  switch (e.activity.kind) {
    case `scheduleDelivery`:
      return `pendingContact`;
    case `confirmArrival`:
      return `pendingReceiving`;
    case `chaseSupplier`:
      return `waitingSupplier`;
    case `chasePayment`:
      return `pendingPayment`;
    case `checkMissing`:
      return `pendingReceiving`;
    case `procurementException`:
      return `waitingSupplier`;
    case `other`:
      return `pendingAction`;
    default:
      return `pendingContact`;
  }
}
let moriTaskStatusTone = {
  pendingContact: `warning`,
  retryContact: `warning`,
  customerPostponed: `muted`,
  scheduled: `success`,
  pendingReceiving: `brand`,
  waitingSupplier: `warning`,
  pendingPayment: `warning`,
  completed: `success`,
  pendingAction: `warning`,
};
function moriReasonText(e: any, t: any) {
  if (e.activity.source === `receiving`) return e.activity.description;
  if (
    e.activity.kind === `scheduleDelivery` &&
    (moriOrderShortage(e.order) || moriReceiptBlocked(e.order))
  )
    return `客單仍有庫存缺口，請先重新分配或採購`;
  if (e.activity.source === `allocation`) return e.activity.description;
  if (e.activity.kind === `scheduleDelivery`) {
    let n = daysInHk(e.units);
    return n != null && n >= 14
      ? t(`followups.reason.hkOverdue`, {
          n,
        })
      : e.order.customerRequestedDate
        ? t(`followups.reason.customerRequested`, {
            date: e.order.customerRequestedDate,
          })
        : t(`followups.reason.readyToSchedule`);
  }
  if (
    e.activity.kind === `confirmArrival` &&
    e.units.some((p: any) => p.location === `customerTransit`)
  )
    return t(`receiving.awaitingSignature`);
  if (e.activity.kind === `confirmArrival`)
    return t(
      e.units.some((p: any) => p.location === `supplierTransit`)
        ? `followups.reason.awaitingArrival`
        : e.units.some((p: any) => p.location === `transit`)
          ? `followups.reason.awaitingHK`
          : `followups.reason.inCN`,
    );
  if (e.activity.kind === `chaseSupplier`)
    return lineStatus(e.units) === `notProcured`
      ? t(`followups.reason.notProcured`)
      : t(`followups.reason.supplierPending`);
  if (e.activity.kind === `chasePayment`)
    return t(`followups.reason.balancePending`);
  if (e.activity.kind === `procurementException`)
    return e.activity.description || e.activity.note || `—`;
  return `—`;
}
function moriDueMeta(e: any, t: any) {
  let n = activityState(e);
  if (n === `done`)
    return {
      label: t(`followups.taskStatus.completed`),
      tone: `success`,
    };
  let r = dayjs(e.dueDate).startOf(`day`);
  let i = today().startOf(`day`);
  let a = r.diff(i, `day`);
  return a < 0
    ? {
        label: t(`followups.due.overdueDays`, {
          n: Math.abs(a),
        }),
        tone: `error`,
      }
    : a === 0
      ? {
          label: t(`followups.due.today`),
          tone: `warning`,
        }
      : a === 1
        ? {
            label: t(`followups.due.tomorrow`),
            tone: `muted`,
          }
        : {
            label: t(`followups.due.inDays`, {
              n: a,
            }),
            tone: `muted`,
          };
}
function moriSearchMatches(e: any, t: any) {
  let n = t.trim().toLowerCase();
  if (!n) return true;
  let r = n.replace(/[\s\-+]/g, ``);
  let i: any[] = [
    e.activity.sourceRef,
    e.activity.packageId,
    e.activity.sku,
    e.order.orderNo,
    e.order.customer.alias,
    e.order.customer.district,
    e.order.customer.phone,
    ...(e.order.lines ?? []).flatMap((e: any) => [
      e.sku,
      productOf(e.sku)?.name,
    ]),
  ];
  return i.filter(Boolean).some((e: any) => {
    let t = String(e).toLowerCase();
    return t.includes(n) || t.replace(/[\s\-+]/g, ``).includes(r);
  });
}
function moriScheduleWithUndo(
  row: any,
  date: any,
  slot: any,
  user: any,
  message: any,
  t: any,
) {
  const iso = date.format(`YYYY-MM-DD`);
  if (iso < DEMO_TODAY) return;
  const order = opsState.orders.find(
    (o: any) => o.orderNo === row.order.orderNo,
  );
  if (!order) return;
  if (moriOrderShortage(order) || moriReceiptBlocked(order)) {
    message.error(`客單仍有庫存缺口，請先核對貨源。`);
    return;
  }
  const beforeDelivery: any = {
    ...order.delivery,
  };
  const beforeTasks = opsState.activities
    .filter(
      (a: any) =>
        a.orderId === order.orderNo &&
        (a.taskType || a.kind) === `scheduleDelivery`,
    )
    .map((a: any) => ({
      ...a,
    }));
  scheduleOrder(order.orderNo, iso, slot, user);
  message.success({
    content: (
      <Flex gap={6} wrap={true}>
        {t(`followups.schedule.done`, {
          order: order.orderNo,
          date: iso,
          slot: t(slotKey(slot)),
        })}
        <Button
          type={`link`}
          size={`small`}
          onClick={() => {
            const current = opsState.orders.find(
              (o: any) => o.orderNo === order.orderNo,
            );
            if (
              current?.delivery.scheduledDate !== iso ||
              current?.delivery.timeSlot !== slot
            )
              return;
            const audit: any = {
              id: `AL-${String(opsState.audit.length + 1).padStart(5, `0`)}`,
              ts: nowIso(),
              userId: user,
              model: `order`,
              recordId: order.orderNo,
              payload: {
                event: `fieldChange`,
                field: `scheduledDate`,
                from: iso + ` ` + slot,
                to: beforeDelivery.scheduledDate || `—`,
              },
            };
            commit({
              ...opsState,
              orders: opsState.orders.map((o: any) =>
                o.orderNo === order.orderNo
                  ? {
                      ...o,
                      delivery: beforeDelivery,
                    }
                  : o,
              ),
              activities: opsState.activities.map(
                (a: any) => beforeTasks.find((b: any) => b.id === a.id) || a,
              ),
              audit: [...opsState.audit, audit],
            });
            message.destroy();
          }}
        >
          {t(`followups.action.undo`)}
        </Button>
      </Flex>
    ),
    duration: 8,
  });
}
function MoriManualTask() {
  const t = MoriUseT();
  const store = useOps();
  const [opened, setOpened] = React.useState<any>(false);
  const [type, setType] = React.useState<any>(`scheduleDelivery`);
  const [order, setOrder] = React.useState<any>(null);
  const [owner, setOwner] = React.useState<any>(`Alex`);
  const [date, setDate] = React.useState<any>(today());
  const [description, setDescription] = React.useState<any>(``);
  const { message } = App.useApp();
  const field = (label: any, control: any) => (
    <Flex vertical={true} gap={4}>
      <Text type={`secondary`}>{label}</Text>
      {control}
    </Flex>
  );
  const create = () => {
    if (
      !date ||
      date.format(`YYYY-MM-DD`) < DEMO_TODAY ||
      (type !== `other` && !order) ||
      (type === `other` && !description.trim())
    )
      return;
    if (
      type !== `other` &&
      store.activities.some(
        (a: any) => a.orderId === order && a.taskType === type && !a.doneAt,
      )
    ) {
      message.info(t(`followups.manual.duplicate`));
      return;
    }
    if (type === `scheduleDelivery`) {
      const o = store.orders.find((o: any) => o.orderNo === order);
      if (
        !o ||
        o.delivery.scheduledDate ||
        lineStatus(store.packages.filter((p: any) => p.orderNo === order)) !==
          `readyToSchedule`
      ) {
        message.info(t(`followups.manual.notReady`));
        return;
      }
    }
    const id = `TASK-${DEMO_TODAY.replace(/-/g, ``)}-${String(store.activities.length + 1).padStart(4, `0`)}`;
    commit({
      ...opsState,
      activities: [
        ...opsState.activities,
        {
          id,
          kind: type,
          taskType: type,
          orderId: order,
          dueDate: date.format(`YYYY-MM-DD`),
          owner,
          description: type === `other` ? description.trim() : null,
          note: ``,
          feedback: null,
          doneAt: null,
          nextActivityId: null,
          seq: 1,
          status: `open`,
          source: `manual`,
          history: [],
          contactAttempts: [],
        },
      ],
    });
    setOpened(false);
    setDescription(``);
    message.success(t(`followups.manual.created`));
  };
  return (
    <>
      <Button icon={<ShoppingCartOutlined />} onClick={() => setOpened(true)}>
        {t(`followups.manual.add`)}
      </Button>
      <Modal
        open={opened}
        onCancel={() => setOpened(false)}
        title={t(`followups.manual.add`)}
        footer={null}
        width={440}
      >
        <Flex vertical={true} gap={12}>
          {field(
            t(`followups.col.kind`),
            <Select
              value={type}
              onChange={setType}
              options={MORI_TASK_TYPES.map((value: any) => ({
                value,
                label: t(`followups.kind.${value}` as Parameters<typeof t>[0]),
              }))}
            />,
          )}
          {type === `other` &&
            field(
              t(`followups.manual.description`),
              <Input.TextArea
                value={description}
                maxLength={200}
                onChange={(e: any) => setDescription(e.target.value)}
                rows={2}
              />,
            )}
          {field(
            t(`followups.manual.order`),
            <Select
              showSearch={true}
              optionFilterProp={`label`}
              allowClear={true}
              value={order}
              onChange={(value: any) => setOrder(value || null)}
              options={store.orders.map((o: any) => ({
                value: o.orderNo,
                label: o.orderNo + ` · ` + o.customer.alias,
              }))}
            />,
          )}
          {field(
            t(`followups.col.owner`),
            <Select
              value={owner}
              onChange={setOwner}
              options={OWNERS.map((value: any) => ({
                value,
                label: value,
              }))}
            />,
          )}
          {field(
            t(`followups.col.due`),
            <DatePicker
              value={date}
              onChange={setDate}
              minDate={today()}
              allowClear={false}
            />,
          )}
          <Flex gap={8} justify={`flex-end`}>
            <Button onClick={() => setOpened(false)}>
              {t(`followups.action.cancel`)}
            </Button>
            <Button
              type={`primary`}
              disabled={
                !date ||
                (type !== `other` && !order) ||
                (type === `other` && !description.trim())
              }
              onClick={create}
            >
              {t(`followups.action.confirm`)}
            </Button>
          </Flex>
        </Flex>
      </Modal>
    </>
  );
}
export { moriScheduleWithUndo, ProgressCell, RowActions };
