import { beforeEach, describe, expect, it } from 'vitest';
import {
  _resetOps,
  applyShipment,
  confirmOrdered,
  createPurchaseOrder,
  demoShipmentRows,
  getOps,
  hkPackages,
  matchShipment,
  parseShipmentText,
  requirementStatus,
  waitingGroups,
} from './ops';

beforeEach(() => _resetOps());

describe('fixtures', () => {
  it('cover every stage Ocean described: open, in a purchase order, ordered, waiting, in HK', () => {
    const s = getOps();
    const statuses = s.requirements.map((r) => requirementStatus(r, s.purchaseOrders));
    expect(statuses).toContain('open');
    expect(statuses).toContain('inPurchaseOrder');
    expect(statuses).toContain('ordered');
    expect(waitingGroups(s).length).toBeGreaterThan(10);
    expect(hkPackages(s).length).toBeGreaterThan(100);
    // stock packages carry no order; customer packages always do
    expect(s.packages.some((k) => k.orderNo === null)).toBe(true);
    expect(s.packages.filter((k) => k.orderNo && !k.customer)).toHaveLength(0);
  });

  it('keeps the package table at a size a table can render', () => {
    expect(getOps().packages.length).toBeLessThan(4000);
  });
});

describe('B-01 / B-02 purchasing', () => {
  it('groups open requirements of one supplier into a draft purchase order', () => {
    const s = getOps();
    const open = s.requirements.filter((r) => requirementStatus(r, s.purchaseOrders) === 'open');
    const supplier = open[0].supplier;
    const ids = open.filter((r) => r.supplier === supplier).map((r) => r.id);
    const po = createPurchaseOrder(supplier, [...ids, open.find((r) => r.supplier !== supplier)!.id]);
    expect(po.lines.map((l) => l.requirementId)).toEqual(ids);
    const after = getOps();
    for (const id of ids) {
      const r = after.requirements.find((x) => x.id === id)!;
      expect(requirementStatus(r, after.purchaseOrders)).toBe('inPurchaseOrder');
    }
  });

  it('derives "ordered" from the uploaded confirmation, and creates packages at the supplier', () => {
    const s = getOps();
    const po = s.purchaseOrders.find((p) => !p.orderedAt)!;
    const before = s.packages.length;
    confirmOrdered(po.id, { supplierOrderNo: 'HB2026092300009999', confirmationFile: 'x.pdf', estimatedReady: null });
    const after = getOps();
    const r = after.requirements.find((x) => x.purchaseOrderId === po.id)!;
    expect(requirementStatus(r, after.purchaseOrders)).toBe('ordered');
    const created = after.packages.slice(before);
    expect(created.length).toBeGreaterThan(0);
    expect(created.every((k) => k.location === 'supplier' && k.purchaseOrderId === po.id)).toBe(true);
    // a second upload must not double the packages
    confirmOrdered(po.id, { supplierOrderNo: 'dup', confirmationFile: 'y.pdf', estimatedReady: null });
    expect(getOps().packages.length).toBe(after.packages.length);
  });
});

describe('B-03 shipment sheet', () => {
  it('moves matched packages only through a done StockMove (invariant 1), never by editing location', () => {
    const rows = demoShipmentRows(5);
    const result = matchShipment(rows);
    expect(result.matched).toHaveLength(5);
    expect(result.unmatched.map((u) => u.reason).sort()).toEqual(['alreadyShipped', 'notFound']);
    const movesBefore = getOps().moves.length;
    applyShipment(result);
    const after = getOps();
    for (const m of result.matched) {
      const k = after.packages.find((x) => x.id === m.pkg.id)!;
      expect(k.location).toBe('cnWarehouse');
      expect(k.deliveryNoteNo).toBe(rows[0].deliveryNoteNo);
    }
    const added = after.moves.slice(movesBefore);
    expect(added.length).toBeGreaterThan(0);
    expect(added.every((mv) => mv.state === 'done' && mv.from === 'supplier' && mv.to === 'cnWarehouse')).toBe(true);
    expect(added.flatMap((mv) => mv.packageUnitIds).sort()).toEqual(result.matched.map((m) => m.pkg.id).sort());
  });

  it('lights the waiting list automatically: shipped count is derived from package locations', () => {
    const g0 = waitingGroups(getOps()).find((g) => g.shipped < g.total)!;
    const pending = g0.lines.flatMap((l) => l.packages).filter((k) => k.location === 'supplier');
    const rows = pending.map((k) => ({ packageCode: k.packageCode, shippedAt: '2026-09-22', deliveryNoteNo: 'JH1' }));
    applyShipment(matchShipment(rows));
    const g1 = waitingGroups(getOps()).find((g) => g.orderNo === g0.orderNo)!;
    expect(g1.shipped).toBe(g1.total);
    expect(g1.allShipped).toBe(true);
  });

  it('reads the factory sheet in any of the three header spellings', () => {
    const zh = '包件编码,发货日期,物流单号\nY84Q09-13023A,2026-09-20,JH123\n';
    const tw = '包件編碼\t發貨日期\t物流單號\nY84Q09-13023A\t2026-09-20\tJH123\n';
    const en = 'packageCode,shippedAt,deliveryNoteNo\nY84Q09-13023A,2026-09-20,JH123\n';
    for (const text of [zh, tw, en]) {
      expect(parseShipmentText(text)).toEqual([
        { packageCode: 'Y84Q09-13023A', shippedAt: '2026-09-20', deliveryNoteNo: 'JH123' },
      ]);
    }
    expect(parseShipmentText('foo,bar\n1,2')).toEqual([]);
  });
});
