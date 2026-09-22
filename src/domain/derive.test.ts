import { describe, expect, it } from 'vitest';
import {
  activityState,
  daysInHk,
  isEscalated,
  lineStatus,
  orderDeliveryStatus,
  sellableQty,
} from './derive';
import { DEMO_TODAY } from './clock';
import type { Activity, DeliveryOrder, LocationKey, PackageUnit } from './types';

let seq = 0;
const unit = (
  location: LocationKey,
  opts: { orderLineId?: string | null; arrivedAt?: string | null } = {}
): PackageUnit => ({
  id: `u${++seq}`,
  packageCode: `PKG-${seq}`,
  orderLineId: opts.orderLineId === undefined ? 'line-1' : opts.orderLineId,
  location,
  arrivedAt: opts.arrivedAt ?? null,
});

const activity = (over: Partial<Activity>): Activity => ({
  id: 'a1',
  kind: 'scheduleDelivery',
  orderId: 'o1',
  dueDate: DEMO_TODAY,
  owner: 'Alex',
  feedback: null,
  note: '',
  doneAt: null,
  nextActivityId: null,
  seq: 1,
  ...over,
});

describe('lineStatus (spec §4)', () => {
  it('reads notProcured with no package units', () => {
    expect(lineStatus([])).toBe('notProcured');
  });

  it.each<LocationKey>(['supplier', 'cnWarehouse', 'transit'])(
    'reads inTransit when any unit is still at %s',
    (loc) => {
      expect(lineStatus([unit('hkWarehouse'), unit(loc)])).toBe('inTransit');
    }
  );

  it('reads readyToSchedule only when every unit is in HK', () => {
    expect(lineStatus([unit('hkWarehouse'), unit('showroom')])).toBe(
      'readyToSchedule'
    );
  });

  it('keeps a part-shipped line in transit — 三件齊晒先約得客', () => {
    // One box delivered, one still crossing the border: the line is NOT
    // partiallyDelivered, because the spec checks upstream units first.
    expect(lineStatus([unit('customer'), unit('transit')])).toBe('inTransit');
  });

  it('reads partiallyDelivered when some units landed at the customer', () => {
    expect(lineStatus([unit('customer'), unit('hkWarehouse')])).toBe(
      'partiallyDelivered'
    );
  });

  it('reads delivered when every unit is at the customer', () => {
    expect(lineStatus([unit('customer'), unit('customer')])).toBe('delivered');
  });

  it('does not call written-off stock deliverable', () => {
    expect(lineStatus([unit('stockLoss')])).toBe('notProcured');
  });
});

describe('orderDeliveryStatus (spec §4)', () => {
  it('takes the least advanced line', () => {
    expect(orderDeliveryStatus(['readyToSchedule', 'inTransit'])).toBe(
      'inTransit'
    );
  });

  it('reads partiallyDelivered when some lines are delivered and some are not', () => {
    expect(orderDeliveryStatus(['delivered', 'readyToSchedule'])).toBe(
      'partiallyDelivered'
    );
  });

  it('reads delivered only when every line is delivered', () => {
    expect(orderDeliveryStatus(['delivered', 'delivered'])).toBe('delivered');
  });
});

describe('activityState (spec §4)', () => {
  it('is done once doneAt is set, whatever the due date', () => {
    expect(activityState(activity({ dueDate: '2020-01-01', doneAt: DEMO_TODAY })))
      .toBe('done');
  });

  it('is overdue before today', () => {
    expect(activityState(activity({ dueDate: '2026-09-21' }))).toBe('overdue');
  });

  it('is today on the due date', () => {
    expect(activityState(activity({ dueDate: DEMO_TODAY }))).toBe('today');
  });

  it('is planned after today', () => {
    expect(activityState(activity({ dueDate: '2026-09-30' }))).toBe('planned');
  });
});

describe('sellableQty (spec §4)', () => {
  it('counts only unreserved units sitting in HK', () => {
    const units = [
      unit('hkWarehouse', { orderLineId: null }),
      unit('showroom', { orderLineId: null }),
      unit('hkWarehouse'), // committed to an order line
      unit('transit', { orderLineId: null }), // not in HK yet
    ];
    expect(sellableQty(units)).toBe(2);
  });
});

describe('escalation (spec §4)', () => {
  const booked: DeliveryOrder = {
    id: 'd1',
    orderId: 'o1',
    scheduledDate: '2026-09-25',
    timeSlot: 'morning',
    completedDate: null,
  };
  const unbooked: DeliveryOrder = { ...booked, scheduledDate: null, timeSlot: null };

  it('measures days in HK from the longest-waiting unit', () => {
    const units = [
      unit('hkWarehouse', { arrivedAt: '2026-09-01' }),
      unit('hkWarehouse', { arrivedAt: '2026-09-20' }),
    ];
    expect(daysInHk(units)).toBe(21);
  });

  it('fires once a schedulable, unbooked line passes the threshold', () => {
    const units = [unit('hkWarehouse', { arrivedAt: '2026-09-01' })];
    expect(isEscalated(units, unbooked)).toBe(true);
  });

  it('does not fire when the delivery is already booked', () => {
    const units = [unit('hkWarehouse', { arrivedAt: '2026-09-01' })];
    expect(isEscalated(units, booked)).toBe(false);
  });

  it('does not fire while any unit is still upstream', () => {
    const units = [
      unit('hkWarehouse', { arrivedAt: '2026-09-01' }),
      unit('transit'),
    ];
    expect(isEscalated(units, unbooked)).toBe(false);
  });

  it('does not fire below the threshold', () => {
    const units = [unit('hkWarehouse', { arrivedAt: '2026-09-18' })];
    expect(isEscalated(units, unbooked)).toBe(false);
  });
});
