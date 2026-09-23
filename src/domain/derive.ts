import dayjs from 'dayjs';
import { today } from './clock';
import { IN_HK, UPSTREAM } from './types';
import type {
  Activity,
  ActivityState,
  DeliveryOrder,
  LineStatus,
  PackageUnit,
} from './types';

/**
 * SPEC REF §4 — every value here is computed on read. None of these has a
 * setter, a database column or a write API (INVARIANT 2). Caching a result is
 * allowed; treating the cache as the truth is not.
 */

/**
 * §4:
 *   no PackageUnit                    -> notProcured
 *   any unit at supplier/CN/transit   -> inTransit
 *   all units in HK/showroom          -> readyToSchedule
 *   some units at the customer        -> partiallyDelivered
 *   all units at the customer         -> delivered
 *
 * The order matters and follows the spec: a line with one box still in transit
 * reads inTransit even if another box already reached the customer, because
 * "三件齊晒先約得客" is the rule the screen has to enforce.
 */
export function lineStatus(units: Pick<PackageUnit, 'location'>[]): LineStatus {
  if (units.length === 0) return 'notProcured';
  if (units.some((u) => UPSTREAM.includes(u.location))) return 'inTransit';
  if (units.every((u) => IN_HK.includes(u.location))) return 'readyToSchedule';
  if (units.every((u) => u.location === 'customer')) return 'delivered';
  if (units.some((u) => u.location === 'customer')) return 'partiallyDelivered';
  // Everything else is sitting in the return area or written off; it is not
  // schedulable and not delivered, so the line still needs procurement work.
  return 'notProcured';
}

const LINE_RANK: Record<LineStatus, number> = {
  notProcured: 0,
  inTransit: 1,
  readyToSchedule: 2,
  partiallyDelivered: 3,
  delivered: 4,
};

/**
 * §4 orderDeliveryStatus = min(lineStatus); if some lines are delivered and
 * others are not, the order reads partiallyDelivered.
 */
export function orderDeliveryStatus(lines: LineStatus[]): LineStatus {
  if (lines.length === 0) return 'notProcured';
  const lowest = lines.reduce((a, b) => (LINE_RANK[a] <= LINE_RANK[b] ? a : b));
  const anyDelivered = lines.some((s) => s === 'delivered');
  const anyUndelivered = lines.some((s) => s !== 'delivered');
  if (anyDelivered && anyUndelivered) return 'partiallyDelivered';
  return lowest;
}

/** §4: doneAt -> done; due < today -> overdue; due = today -> today; else planned. */
export function activityState(activity: Activity): ActivityState {
  if (activity.doneAt) return 'done';
  const due = dayjs(activity.dueDate).startOf('day');
  const now = today();
  if (due.isBefore(now)) return 'overdue';
  if (due.isSame(now)) return 'today';
  return 'planned';
}

/** §4 可售 = units in HK/showroom with no order line attached. */
export function sellableQty(units: PackageUnit[]): number {
  return units.filter((u) => u.orderLineId == null && IN_HK.includes(u.location))
    .length;
}

/**
 * §4 escalation threshold. A setting, not a constant in code.
 *
 * TODO(settings): move to the settings table once it exists; spec says the
 * default is 14 days and that it is configurable.
 */
export const ESCALATION_DAYS_DEFAULT = 14;

/** Longest time any unit of the line has been sitting in Hong Kong. */
export function daysInHk(units: Pick<PackageUnit, 'location' | 'arrivedAt'>[]): number | null {
  const arrivals = units
    .filter((u) => IN_HK.includes(u.location) && u.arrivedAt)
    .map((u) => today().diff(dayjs(u.arrivedAt!).startOf('day'), 'day'));
  return arrivals.length ? Math.max(...arrivals) : null;
}

/**
 * §4 escalation: schedulable AND not booked AND days in HK >= threshold.
 * Flags the boss and paints the row red in the pipeline view.
 */
export function isEscalated(
  units: PackageUnit[],
  delivery: DeliveryOrder | undefined,
  thresholdDays = ESCALATION_DAYS_DEFAULT
): boolean {
  if (lineStatus(units) !== 'readyToSchedule') return false;
  if (delivery?.scheduledDate) return false;
  const days = daysInHk(units);
  return days != null && days >= thresholdDays;
}

/* ----------------------------------------------------------- order bucket */

/**
 * CLAUDE.md DoD: the order list's status column IS this bucket, shared with
 * 我的跟進. Six values, all derived — no manual 待確認/已確認 chain exists.
 *
 *   未採購   no PackageUnit on any line (requirement not yet ordered)
 *   備貨中   any unit still at supplier / CN warehouse / in transit
 *   待約     all units in HK, no scheduledDate
 *   已約     all units in HK, scheduledDate set
 *   部分送達 some units with the customer
 *   已完成   every unit with the customer
 */
export type OrderBucket =
  | 'notProcured'
  | 'preparing'
  | 'toSchedule'
  | 'scheduled'
  | 'partiallyDelivered'
  | 'completed';

export const ORDER_BUCKETS: OrderBucket[] = [
  'notProcured',
  'preparing',
  'toSchedule',
  'scheduled',
  'partiallyDelivered',
  'completed',
];

export function orderBucket(units: Pick<PackageUnit, 'location'>[], delivery: Pick<DeliveryOrder, 'scheduledDate'> | null): OrderBucket {
  const status = lineStatus(units);
  switch (status) {
    case 'notProcured':
      return 'notProcured';
    case 'inTransit':
      return 'preparing';
    case 'partiallyDelivered':
      return 'partiallyDelivered';
    case 'delivered':
      return 'completed';
    case 'readyToSchedule':
      return delivery?.scheduledDate ? 'scheduled' : 'toSchedule';
  }
}
