import { beforeEach, describe, expect, it } from 'vitest';
import { _resetOps, getOps, packagesOfOrder, updateOrder } from './ops';
import { orderBucket } from '../domain/derive';
import { groupByDay, mergeFieldChanges, timelineFor } from './timeline';
import type { TimelineItem } from './timeline';

beforeEach(() => _resetOps());

const src = () => {
  const s = getOps();
  return { audit: s.audit, comments: s.comments, activities: s.activities, moveConsequences: s.moveConsequences, moveTypes: new Map(s.moves.map((m) => [m.id, m.type])) };
};
const newest = () => [...getOps().orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

describe('timeline union (side-peek §3.1)', () => {
  it('covers all seven event kinds across the fixture', () => {
    const kinds = new Set<string>();
    for (const o of getOps().orders) for (const it of timelineFor(src(), 'order', o.orderNo, 'owner')) kinds.add(it.kind);
    expect([...kinds].sort()).toEqual(['activity', 'approval', 'attachment', 'comment', 'fieldChange', 'shopifySync', 'stockMove']);
  });

  it('shows the derived consequence on the arrival event: packages n/n in HK → ready to schedule', () => {
    const s = getOps();
    const order = s.orders.find((o) => orderBucket(packagesOfOrder(s, o.orderNo), o.delivery) === 'toSchedule')!;
    const items = timelineFor(src(), 'order', order.orderNo, 'ops');
    const arrival = items.find((i) => i.kind === 'stockMove' && i.moveType === 'arrivalQc');
    expect(arrival && arrival.kind === 'stockMove' && arrival.consequence).toBe('readyToSchedule');
    expect(arrival && arrival.kind === 'stockMove' && arrival.inHk === arrival.total).toBe(true);
  });

  it('merges one person’s field changes within 5 minutes into one item', () => {
    const items = timelineFor(src(), 'order', newest().orderNo, 'owner');
    const merged = items.find((i) => i.kind === 'fieldChange' && i.changes.length === 3);
    expect(merged && merged.kind === 'fieldChange' && merged.actorId).toBe('u-wilson');
  });

  it('keeps an @mention comment with the mentioned user id', () => {
    const items = timelineFor(src(), 'order', newest().orderNo, 'sales');
    const c = items.find((i) => i.kind === 'comment' && i.body.includes('@Alex'));
    expect(c && c.kind === 'comment' && c.mentions).toEqual(['u-alex']);
  });

  it('strips COST field changes for roles without the field class (whole row gone, not masked)', () => {
    const id = newest().orderNo;
    const forFinance = timelineFor(src(), 'order', id, 'finance');
    const forSales = timelineFor(src(), 'order', id, 'sales');
    const cost = (items: TimelineItem[]) => items.filter((i) => i.kind === 'fieldChange' && i.changes.some((c) => c.field === 'costPrice'));
    expect(cost(forFinance)).toHaveLength(1);
    expect(cost(forSales)).toHaveLength(0);
    expect(forSales.some((i) => i.kind === 'attachment')).toBe(false);
  });

  it('driver sees logistics events and comments only', () => {
    const s = getOps();
    const order = s.orders.find((o) => orderBucket(packagesOfOrder(s, o.orderNo), o.delivery) === 'scheduled')!;
    const items = timelineFor(src(), 'order', order.orderNo, 'driver');
    expect(items.every((i) => i.kind === 'stockMove' || i.kind === 'comment')).toBe(true);
  });

  it('inline edits write one audit entry per field and merge in the timeline', () => {
    const o = newest();
    updateOrder(o.orderNo, { customerRequestedNote: '要拆舊床', assignee: 'Steve' }, 'u-steve');
    const items = timelineFor(src(), 'order', o.orderNo, 'owner');
    const first = items[0];
    expect(first.kind === 'fieldChange' && first.actorId === 'u-steve' && first.changes.length === 2).toBe(true);
  });

  it('groups by day, newest first', () => {
    const items = timelineFor(src(), 'order', newest().orderNo, 'owner');
    const groups = groupByDay(items);
    expect(groups[0].label.kind).toBe('today');
    expect(groups.map((g) => g.key)).toEqual([...groups.map((g) => g.key)].sort().reverse());
  });

  it('mergeFieldChanges leaves different actors apart', () => {
    const at = '2026-09-22T11:40:00+08:00';
    const a: TimelineItem = { id: '1', kind: 'fieldChange', at, actorId: 'u-a', changes: [{ field: 'x', from: '1', to: '2' }] };
    const b: TimelineItem = { id: '2', kind: 'fieldChange', at, actorId: 'u-b', changes: [{ field: 'y', from: '1', to: '2' }] };
    expect(mergeFieldChanges([a, b])).toHaveLength(2);
  });
});
