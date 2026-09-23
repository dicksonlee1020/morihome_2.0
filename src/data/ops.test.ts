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
  packagesOfOrder,
  parseShipmentText,
  productOf,
  requirementStatus,
  waitingGroups,
} from './ops';
import { ORDER_BUCKETS, orderBucket } from '../domain/derive';

beforeEach(() => _resetOps());

describe('fixtures', () => {
  it('cover every derived order bucket the DoD names', () => {
    const s = getOps();
    const seen = new Set(s.orders.map((o) => orderBucket(packagesOfOrder(s, o.orderNo), o.delivery)));
    for (const b of ORDER_BUCKETS) expect(seen.has(b), b).toBe(true);
  });

  it('use realistic numbering and pseudonymous customers', () => {
    const s = getOps();
    expect(s.orders.every((o) => /^PO\d{4}$/.test(o.orderNo))).toBe(true);
    expect(s.purchaseOrders.filter((p) => p.orderedAt).every((p) => /^HB\d{16}$/.test(p.supplierOrderNo!))).toBe(true);
    expect(s.purchaseOrders.every((p) => /^\d{4}单(-\d+)?$/.test(p.batchNo))).toBe(true);
    expect(s.orders.every((o) => /^[5-9]\d{3} \d{4}$/.test(o.customer.phone))).toBe(true);
    // packages still at the supplier carry no code yet: the code is assigned when the shipment matches
    expect(s.packages.filter((k) => k.location === 'supplier').every((k) => k.packageCode === null)).toBe(true);
    expect(s.packages.filter((k) => k.location !== 'supplier').every((k) => k.packageCode)).toBe(true);
    expect(waitingGroups(s).length).toBeGreaterThan(10);
    expect(hkPackages(s).length).toBeGreaterThan(50);
  });
});

describe('purchasing', () => {
  it('groups open requirements of one supplier into a draft purchase order', () => {
    const s = getOps();
    const open = s.requirements.filter((r) => requirementStatus(r, s.purchaseOrders) === 'open');
    const supplier = open[0].supplier;
    const ids = open.filter((r) => r.supplier === supplier).map((r) => r.id);
    const other = open.find((r) => r.supplier !== supplier);
    const po = createPurchaseOrder(supplier, other ? [...ids, other.id] : ids);
    expect(po.lines.map((l) => l.requirementId)).toEqual(ids);
    const after = getOps();
    for (const id of ids) {
      const r = after.requirements.find((x) => x.id === id)!;
      expect(requirementStatus(r, after.purchaseOrders)).toBe('inPurchaseOrder');
    }
  });

  it('derives "ordered" from the uploaded confirmation and creates uncoded packages at the supplier', () => {
    const s = getOps();
    const po = s.purchaseOrders.find((p) => !p.orderedAt)!;
    const before = s.packages.length;
    confirmOrdered(po.id, { supplierOrderNo: 'HB2026092300009999', confirmationFile: 'x.pdf', estimatedReady: null });
    const after = getOps();
    const r = after.requirements.find((x) => x.purchaseOrderId === po.id)!;
    expect(requirementStatus(r, after.purchaseOrders)).toBe('ordered');
    const created = after.packages.slice(before);
    expect(created.length).toBeGreaterThan(0);
    expect(created.every((k) => k.location === 'supplier' && k.packageCode === null && k.purchaseOrderId === po.id)).toBe(true);
    confirmOrdered(po.id, { supplierOrderNo: 'dup', confirmationFile: 'y.pdf', estimatedReady: null });
    expect(getOps().packages.length).toBe(after.packages.length);
  });
});

describe('shipment statement matching (HB + model + qty)', () => {
  it('matches on the supplier order number, model and quantity — never on our package code', () => {
    const rows = demoShipmentRows(4);
    const result = matchShipment(rows);
    expect(result.matched).toHaveLength(4);
    expect(result.unmatched.map((u) => u.reason).sort()).toEqual(['modelNotFound', 'orderNotFound']);
    // the factory claimed 3 units more than we ordered: matched to what exists, remainder flagged
    expect(result.matched[0].short).toBe(3);
    for (const m of result.matched) {
      expect(m.purchaseOrder.supplierOrderNo).toBe(m.row.supplierOrderNo);
      expect(m.product.supplierCode).toBe(m.row.supplierCode);
      expect(m.packages.every((k) => k.packageCode === null && k.location === 'supplier')).toBe(true);
    }
  });

  it('applies through a done StockMove (invariant 1) and only then assigns package codes', () => {
    const result = matchShipment(demoShipmentRows(3));
    const movesBefore = getOps().moves.length;
    applyShipment(result);
    const after = getOps();
    for (const m of result.matched) {
      for (const k of m.packages) {
        const now = after.packages.find((x) => x.id === k.id)!;
        expect(now.location).toBe('cnWarehouse');
        expect(now.packageCode).toMatch(new RegExp(`^${k.stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-`));
        expect(now.deliveryNoteNo).toBe(m.row.deliveryNoteNo);
      }
    }
    const added = after.moves.slice(movesBefore);
    expect(added.length).toBeGreaterThan(0);
    expect(added.every((mv) => mv.state === 'done' && mv.from === 'supplier' && mv.to === 'cnWarehouse')).toBe(true);
    expect(added.flatMap((mv) => mv.packageUnitIds).sort()).toEqual(result.matched.flatMap((m) => m.packages.map((k) => k.id)).sort());
  });

  it('lights the waiting list automatically: shipped count is derived from package locations', () => {
    const g0 = waitingGroups(getOps()).find((g) => g.shipped < g.total)!;
    const rows = g0.lines
      .filter((l) => l.packages.some((k) => k.location === 'supplier'))
      .map((l) => {
        const p = productOf(l.sku)!;
        const units = l.packages.filter((k) => k.location === 'supplier').length / Math.max(1, p.packageStems.length);
        return { supplierOrderNo: g0.purchaseOrder.supplierOrderNo!, supplierCode: p.supplierCode, supplierName: p.supplierName, qty: units, shippedAt: '2026-09-22', deliveryNoteNo: 'JH1', logisticsNo: '' };
      });
    applyShipment(matchShipment(rows));
    const g1 = waitingGroups(getOps()).find((g) => g.orderNo === g0.orderNo)!;
    expect(g1.shipped).toBe(g1.total);
    expect(g1.allShipped).toBe(true);
  });

  it('reads the factory sheet in Simplified, Traditional or English headers', () => {
    const zh = '订单号,型号,名称,数量,发货日期,发货单号,物流单号\nHB2026090400056197,Y09AA0000040,Y09AA0000 摩卡·床头柜0.4米,1,2026-09-20,JH123,中通快递 302316090643\n';
    const tw = '供應商訂單號\t型號\t名稱\t數量\t發貨日期\t發貨單號\t物流單號\nHB2026090400056197\tY09AA0000040\tY09AA0000 摩卡·床头柜0.4米\t1\t2026-09-20\tJH123\t中通快递 302316090643\n';
    const en = 'supplierOrderNo,model,name,qty,shipped,note,tracking\nHB2026090400056197,Y09AA0000040,Y09AA0000 摩卡·床头柜0.4米,1,2026-09-20,JH123,中通快递 302316090643\n';
    for (const text of [zh, tw, en]) {
      expect(parseShipmentText(text)).toEqual([
        { supplierOrderNo: 'HB2026090400056197', supplierCode: 'Y09AA0000040', supplierName: 'Y09AA0000 摩卡·床头柜0.4米', qty: 1, shippedAt: '2026-09-20', deliveryNoteNo: 'JH123', logisticsNo: '中通快递 302316090643' },
      ]);
    }
    expect(parseShipmentText('foo,bar\n1,2')).toEqual([]);
  });
});
