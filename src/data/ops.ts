import { useSyncExternalStore } from 'react';
import { packagesPerUnit, products, stockedProducts } from './catalog';
import { DEMO_TODAY } from '../domain/clock';
import { IN_HK, UPSTREAM } from '../domain/types';
import type { LocationKey, StockMove } from '../domain/types';
import type { Product } from '../types';

/* =================================================================
 * 採購 → 庫存等候 → 在庫包件 嘅示範資料同狀態
 *
 * SPEC REF §2.3（ProcurementRequirement / PurchaseOrder / SupplierShipment）、
 * §2.4（PackageUnit / StockMove）、§4（推導規則）。
 *
 * INVARIANT 1：Pkg.location 只喺 completeMove() 度寫，而 completeMove 只會
 *   由一張 assigned move 轉 done 觸發。冇其他 API 寫呢個欄位。
 * INVARIANT 2：需求狀態、等候進度、幾件發咗 —— 全部係 function，冇 setter。
 * INVARIANT 3：moves 係 append-only；done 咗嘅 move 唔會改。
 *
 * Ocean feedback 2026-09-23（docs/backlog.md B-01 至 B-05）：
 *   B-01 需求按供應商 group、每供應商一份採購表
 *   B-02 上載訂貨確認 → orderedAt 有值 → 「已訂」推導出嚟
 *   B-03 上載供應商發貨表 → 逐件開 move → 燈自動著
 *   B-04 等候列表按訂單收埋，右邊顯示幾件發咗
 *   B-05 庫存 = 在庫包件；三數字只留畀儲定貨款
 * ===============================================================*/

export interface CustomerRef {
  alias: string;
  district: string;
}

export type RequirementStatus = 'open' | 'inPurchaseOrder' | 'ordered';

export interface Requirement {
  id: string;
  orderNo: string;
  customer: CustomerRef;
  sku: string;
  qty: number;
  supplier: string;
  /** §2.3 sourcing：系統按可售建議「用存貨」定「訂新貨」 */
  sourcing: 'orderNew' | 'useStock';
  createdAt: string;
  purchaseOrderId: string | null;
}

export interface PurchaseLine {
  requirementId: string;
  sku: string;
  qty: number;
}

export interface PurchaseOrder {
  id: string;
  /** 例如 0922單；同一日第二張加 -2 */
  batchNo: string;
  supplier: string;
  createdAt: string;
  lines: PurchaseLine[];
  /** B-02：上載訂貨確認先有值；「已訂」由呢個欄位推導 */
  orderedAt: string | null;
  supplierOrderNo: string | null;
  confirmationFile: string | null;
  estimatedReady: string | null;
}

export interface Pkg {
  id: string;
  packageCode: string;
  sku: string;
  /** null = 存貨（冇指定客單） */
  orderNo: string | null;
  customer: CustomerRef | null;
  purchaseOrderId: string | null;
  /** INVARIANT 1 */
  location: LocationKey;
  arrivedAt: string | null;
  /** 供應商發貨表對上嘅物流單號（JH… / SF…） */
  deliveryNoteNo: string | null;
}

export interface ShipmentRow {
  packageCode: string;
  shippedAt: string;
  deliveryNoteNo: string;
}

export interface ShipmentResult {
  matched: { row: ShipmentRow; pkg: Pkg }[];
  unmatched: { row: ShipmentRow; reason: 'notFound' | 'alreadyShipped' }[];
}

interface OpsState {
  requirements: Requirement[];
  purchaseOrders: PurchaseOrder[];
  packages: Pkg[];
  moves: StockMove[];
  seq: number;
}

/* ------------------------------------------------------------- fixtures */

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T,>(rng: () => number, arr: readonly T[]) =>
  arr[Math.floor(rng() * arr.length)];

/** 化名 + 地區，唔用真客資料（CLAUDE.md） */
const ALIASES = [
  '陳女士', '李先生', '黃太', '張小姐', '何先生', '林太',
  '吳女士', '鄭先生', '梁太', '周小姐', '徐先生', '馬女士',
  '羅先生', '唐小姐', '施太', '馮先生', '袁小姐', '曾先生',
];

const DISTRICTS = [
  '將軍澳', '沙田', '荃灣', '元朗', '太古', '何文田',
  '大埔', '屯門', '西貢', '紅磡', '鰂魚涌', '天水圍',
  '觀塘', '九龍灣', '葵涌', '藍田', '馬鞍山', '青衣',
];

const DAY = 86_400_000;
const TODAY_MS = Date.parse(DEMO_TODAY);
const daysAgo = (n: number) => new Date(TODAY_MS - n * DAY).toISOString().slice(0, 10);

const bySku = new Map(products.map((p) => [p.sku, p]));
export const productOf = (sku: string): Product | undefined => bySku.get(sku);

const orderable = products.filter(
  (p) => p.status === 'active' && p.sourcingType !== 'stocked' && p.price >= 800
);

function buildFixtures(): OpsState {
  const rng = mulberry32(20260923);
  const state: OpsState = { requirements: [], purchaseOrders: [], packages: [], moves: [], seq: 1 };
  let orderSeq = 12990;
  let reqSeq = 1;
  let pkgSeq = 1;
  let moveSeq = 1;

  const newOrder = () => {
    orderSeq += 1;
    return {
      orderNo: `PO${orderSeq}`,
      customer: { alias: pick(rng, ALIASES), district: pick(rng, DISTRICTS) },
    };
  };

  const addRequirements = (order: ReturnType<typeof newOrder>, ageDays: number) => {
    const lines = 1 + Math.floor(rng() * 3);
    const reqs: Requirement[] = [];
    for (let i = 0; i < lines; i++) {
      const p = pick(rng, orderable);
      const r: Requirement = {
        id: `REQ-${String(reqSeq++).padStart(4, '0')}`,
        orderNo: order.orderNo,
        customer: order.customer,
        sku: p.sku,
        qty: rng() < 0.8 ? 1 : 2,
        supplier: p.supplier,
        sourcing: 'orderNew',
        createdAt: daysAgo(ageDays),
        purchaseOrderId: null,
      };
      reqs.push(r);
      state.requirements.push(r);
    }
    return reqs;
  };

  const addPackagesFor = (r: Requirement, poId: string | null, location: LocationKey, arrivedAt: string | null) => {
    const p = bySku.get(r.sku)!;
    const parts = packagesPerUnit(p.categoryKey);
    const out: Pkg[] = [];
    for (let u = 0; u < r.qty; u++) {
      for (let k = 0; k < parts; k++) {
        const pkg: Pkg = {
          id: `PKG-${String(pkgSeq++).padStart(5, '0')}`,
          packageCode: `${p.supplierCode}-${r.orderNo.slice(2)}${parts > 1 ? String.fromCharCode(65 + k) : ''}${r.qty > 1 ? u + 1 : ''}`,
          sku: r.sku,
          orderNo: r.orderNo,
          customer: r.customer,
          purchaseOrderId: poId,
          location,
          arrivedAt,
          deliveryNoteNo: null,
        };
        state.packages.push(pkg);
        out.push(pkg);
      }
    }
    return out;
  };

  const addDoneMove = (type: StockMove['type'], from: LocationKey, to: LocationKey, pkgIds: string[], doneDate: string) => {
    state.moves.push({
      id: `SM-${String(moveSeq++).padStart(5, '0')}`,
      type,
      state: 'done',
      from,
      to,
      scheduledDate: doneDate,
      doneDate,
      packageUnitIds: pkgIds,
    });
  };

  // 1. 未採購：需求剛由訂單生成，等採購同事 group 落供應商
  for (let i = 0; i < 16; i++) addRequirements(newOrder(), Math.floor(rng() * 6));

  // 2. 已生成採購表、未落單（等同事揀咗供應商 click 落單）
  const poBySupplier = new Map<string, PurchaseOrder>();
  for (let i = 0; i < 8; i++) {
    for (const r of addRequirements(newOrder(), 3 + Math.floor(rng() * 4))) {
      let po = poBySupplier.get(r.supplier);
      if (!po) {
        po = {
          id: `PUR-${String(state.purchaseOrders.length + 1).padStart(4, '0')}`,
          batchNo: `0919單${poBySupplier.size ? `-${poBySupplier.size + 1}` : ''}`,
          supplier: r.supplier,
          createdAt: daysAgo(3),
          lines: [],
          orderedAt: null,
          supplierOrderNo: null,
          confirmationFile: null,
          estimatedReady: null,
        };
        poBySupplier.set(r.supplier, po);
        state.purchaseOrders.push(po);
      }
      po.lines.push({ requirementId: r.id, sku: r.sku, qty: r.qty });
      r.purchaseOrderId = po.id;
    }
  }

  // 3. 已落單（有訂貨確認）：包件已生成，一部分廠已發貨 → 庫存等候
  const orderedPos = new Map<string, PurchaseOrder>();
  for (let i = 0; i < 22; i++) {
    const age = 8 + Math.floor(rng() * 20);
    for (const r of addRequirements(newOrder(), age)) {
      let po = orderedPos.get(r.supplier);
      if (!po) {
        const n = state.purchaseOrders.length + 1;
        po = {
          id: `PUR-${String(n).padStart(4, '0')}`,
          batchNo: `0908單${orderedPos.size ? `-${orderedPos.size + 1}` : ''}`,
          supplier: r.supplier,
          createdAt: daysAgo(14),
          lines: [],
          orderedAt: daysAgo(13),
          supplierOrderNo: `HB2026090800${String(5100 + n).padStart(6, '0')}`,
          confirmationFile: `订货确认-0908-${n}.pdf`,
          estimatedReady: daysAgo(-4),
        };
        orderedPos.set(r.supplier, po);
        state.purchaseOrders.push(po);
      }
      po.lines.push({ requirementId: r.id, sku: r.sku, qty: r.qty });
      r.purchaseOrderId = po.id;
      // 每件貨獨立擲：廠會分批發，所以同一張單有啲包件發咗有啲未
      const roll = rng();
      const location: LocationKey = roll < 0.45 ? 'supplier' : roll < 0.8 ? 'cnWarehouse' : 'transit';
      const pkgs = addPackagesFor(r, po.id, location, null);
      if (location !== 'supplier') {
        const shipped = daysAgo(2 + Math.floor(rng() * 6));
        const note = `JH2026091${Math.floor(rng() * 9)}0${String(Math.floor(rng() * 90000) + 10000)}`;
        pkgs.forEach((k) => (k.deliveryNoteNo = note));
        addDoneMove('purchaseReceipt', 'supplier', 'cnWarehouse', pkgs.map((k) => k.id), shipped);
        if (location === 'transit') addDoneMove('transit', 'cnWarehouse', 'transit', pkgs.map((k) => k.id), daysAgo(1));
      }
    }
  }

  // 4. 已到港：客單包件喺香港倉 / 陳列室等約送貨 → 庫存頁
  for (let i = 0; i < 24; i++) {
    const age = 2 + Math.floor(rng() * 24);
    const n = state.purchaseOrders.length + 1;
    const po: PurchaseOrder = {
      id: `PUR-${String(n).padStart(4, '0')}`,
      batchNo: `0825單-${i + 1}`,
      supplier: '',
      createdAt: daysAgo(age + 14),
      lines: [],
      orderedAt: daysAgo(age + 13),
      supplierOrderNo: `HB2026082500${String(4800 + n).padStart(6, '0')}`,
      confirmationFile: `订货确认-0825-${n}.pdf`,
      estimatedReady: daysAgo(age + 2),
    };
    state.purchaseOrders.push(po);
    for (const r of addRequirements(newOrder(), age + 14)) {
      po.supplier = po.supplier || r.supplier;
      po.lines.push({ requirementId: r.id, sku: r.sku, qty: r.qty });
      r.purchaseOrderId = po.id;
      const arrived = daysAgo(age);
      const pkgs = addPackagesFor(r, po.id, rng() < 0.1 ? 'showroom' : 'hkWarehouse', arrived);
      const ids = pkgs.map((k) => k.id);
      addDoneMove('purchaseReceipt', 'supplier', 'cnWarehouse', ids, daysAgo(age + 6));
      addDoneMove('transit', 'cnWarehouse', 'transit', ids, daysAgo(age + 2));
      addDoneMove('arrivalQc', 'transit', 'hkWarehouse', ids, arrived);
    }
  }

  // 5. 存貨：儲定貨款嘅在倉數逐件變包件（orderNo = null）
  for (const p of stockedProducts) {
    const parts = packagesPerUnit(p.categoryKey);
    const make = (count: number, location: LocationKey) => {
      for (let u = 0; u < count; u++) {
        const arrived = daysAgo(5 + Math.floor(rng() * 120));
        const ids: string[] = [];
        for (let k = 0; k < parts; k++) {
          const pkg: Pkg = {
            id: `PKG-${String(pkgSeq++).padStart(5, '0')}`,
            packageCode: `${p.supplierCode}-S${String(u + 1).padStart(3, '0')}${parts > 1 ? String.fromCharCode(65 + k) : ''}`,
            sku: p.sku,
            orderNo: null,
            customer: null,
            purchaseOrderId: null,
            location,
            arrivedAt: arrived,
            deliveryNoteNo: null,
          };
          state.packages.push(pkg);
          ids.push(pkg.id);
        }
        addDoneMove('openingBalance', 'supplier', location, ids, arrived);
      }
    };
    make(p.stock.main, 'hkWarehouse');
    make(p.stock.shop, 'showroom');
  }

  state.seq = state.purchaseOrders.length + 1;
  return state;
}

/* ---------------------------------------------------------------- store */

let state: OpsState = buildFixtures();
const listeners = new Set<() => void>();

function commit(next: OpsState) {
  state = next;
  listeners.forEach((l) => l());
}

export function useOps(): OpsState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state
  );
}

/** 測試用：重置到初始 fixture */
export function _resetOps() {
  commit(buildFixtures());
}

export const getOps = () => state;

/* -------------------------------------------------------------- actions */

/** B-01：揀咗供應商同需求，出一份採購表（draft PurchaseOrder） */
export function createPurchaseOrder(supplier: string, requirementIds: string[]): PurchaseOrder {
  const ids = new Set(requirementIds);
  const lines = state.requirements
    .filter((r) => ids.has(r.id) && r.supplier === supplier && r.purchaseOrderId === null)
    .map((r) => ({ requirementId: r.id, sku: r.sku, qty: r.qty }));
  const mmdd = DEMO_TODAY.slice(5).replace('-', '');
  const sameDay = state.purchaseOrders.filter((po) => po.createdAt === DEMO_TODAY).length;
  const po: PurchaseOrder = {
    id: `PUR-${String(state.seq).padStart(4, '0')}`,
    batchNo: `${mmdd}單${sameDay ? `-${sameDay + 1}` : ''}`,
    supplier,
    createdAt: DEMO_TODAY,
    lines,
    orderedAt: null,
    supplierOrderNo: null,
    confirmationFile: null,
    estimatedReady: null,
  };
  const lineIds = new Set(lines.map((l) => l.requirementId));
  commit({
    ...state,
    seq: state.seq + 1,
    purchaseOrders: [...state.purchaseOrders, po],
    requirements: state.requirements.map((r) =>
      lineIds.has(r.id) ? { ...r, purchaseOrderId: po.id } : r
    ),
  });
  return po;
}

/**
 * B-05：備貨表揀咗款就出採購需求（purpose = 存貨，§2.1）。
 * 訂單號用 STK-日期 代替，客人欄留空。
 */
export function createStockRequirements(items: { sku: string; qty: number }[]): number {
  const mmdd = DEMO_TODAY.slice(5).replace('-', '');
  let seq = state.requirements.length + 1;
  const added: Requirement[] = [];
  for (const it of items) {
    const p = bySku.get(it.sku);
    if (!p || it.qty <= 0) continue;
    added.push({
      id: `REQ-${String(seq++).padStart(4, '0')}`,
      orderNo: `STK-${mmdd}`,
      customer: { alias: '', district: '' },
      sku: it.sku,
      qty: it.qty,
      supplier: p.supplier,
      sourcing: 'orderNew',
      createdAt: DEMO_TODAY,
      purchaseOrderId: null,
    });
  }
  commit({ ...state, requirements: [...state.requirements, ...added] });
  return added.length;
}

/** 存貨需求冇客人：alias 留空 */
export const isStockRequirement = (r: Requirement) => r.customer.alias === '';

/**
 * B-02：上載訂貨確認。寫 orderedAt / supplierOrderNo / 附件；「已訂」由此推導。
 * 同時為每行生成包件（喺 supplier 位置）。
 * TODO(Q12)：包件係咪喺落單時就建立、包件編碼由邊個定 —— 呢度假設落單即建，
 * 編碼 = 廠家型號 + 訂單號 + 件序，等 Alex 確認。
 */
export function confirmOrdered(
  poId: string,
  input: { supplierOrderNo: string; confirmationFile: string; estimatedReady: string | null }
) {
  const po = state.purchaseOrders.find((p) => p.id === poId);
  if (!po || po.orderedAt) return;
  const reqById = new Map(state.requirements.map((r) => [r.id, r]));
  let pkgSeq = state.packages.length + 1;
  const packages: Pkg[] = [];
  for (const line of po.lines) {
    const r = reqById.get(line.requirementId);
    const p = bySku.get(line.sku);
    if (!r || !p) continue;
    const parts = packagesPerUnit(p.categoryKey);
    for (let u = 0; u < line.qty; u++) {
      for (let k = 0; k < parts; k++) {
        packages.push({
          id: `PKG-${String(pkgSeq++).padStart(5, '0')}`,
          packageCode: `${p.supplierCode}-${r.orderNo.slice(2)}${parts > 1 ? String.fromCharCode(65 + k) : ''}${line.qty > 1 ? u + 1 : ''}`,
          sku: line.sku,
          orderNo: r.orderNo,
          customer: r.customer,
          purchaseOrderId: po.id,
          location: 'supplier',
          arrivedAt: null,
          deliveryNoteNo: null,
        });
      }
    }
  }
  commit({
    ...state,
    purchaseOrders: state.purchaseOrders.map((p) =>
      p.id === poId
        ? {
            ...p,
            orderedAt: DEMO_TODAY,
            supplierOrderNo: input.supplierOrderNo,
            confirmationFile: input.confirmationFile,
            estimatedReady: input.estimatedReady,
          }
        : p
    ),
    packages: [...state.packages, ...packages],
  });
}

/**
 * INVARIANT 1：呢個係全個 store 唯一寫 Pkg.location 嘅地方，而且只接受一張
 * assigned move。Move 一 done 就唔會再改（INVARIANT 3）。
 */
function completeMove(s: OpsState, move: StockMove, doneDate: string): OpsState {
  if (move.state !== 'assigned') throw new Error('only an assigned move can be completed');
  const ids = new Set(move.packageUnitIds);
  const done: StockMove = { ...move, state: 'done', doneDate };
  return {
    ...s,
    moves: [...s.moves, done],
    packages: s.packages.map((k) =>
      ids.has(k.id)
        ? { ...k, location: move.to, arrivedAt: IN_HK.includes(move.to) ? doneDate : k.arrivedAt }
        : k
    ),
  };
}

/** 對發貨表：淨係計，唔改任何嘢；applyShipment 先寫 */
export function matchShipment(rows: ShipmentRow[]): ShipmentResult {
  const byCode = new Map(state.packages.map((k) => [k.packageCode.toUpperCase(), k]));
  const result: ShipmentResult = { matched: [], unmatched: [] };
  const seen = new Set<string>();
  for (const row of rows) {
    const code = row.packageCode.trim().toUpperCase();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    const pkg = byCode.get(code);
    if (!pkg) result.unmatched.push({ row, reason: 'notFound' });
    else if (pkg.location !== 'supplier') result.unmatched.push({ row, reason: 'alreadyShipped' });
    else result.matched.push({ row, pkg });
  }
  return result;
}

/**
 * B-03：套用發貨表。每個對到嘅包件開一張 採購收貨 move（供應商 → 大陸倉），
 * assigned → done。燈之所以「自動著」，係因為位置變咗，唔係因為改咗狀態值。
 */
export function applyShipment(result: ShipmentResult): number {
  let s = state;
  let moveSeq = state.moves.length + 1;
  // 同一張物流單嘅包件行同一張 move，方便睇流水帳
  const byNote = new Map<string, { row: ShipmentRow; pkg: Pkg }[]>();
  for (const m of result.matched) {
    const key = `${m.row.deliveryNoteNo}|${m.row.shippedAt}`;
    byNote.set(key, [...(byNote.get(key) ?? []), m]);
  }
  for (const group of byNote.values()) {
    const move: StockMove = {
      id: `SM-${String(moveSeq++).padStart(5, '0')}`,
      type: 'purchaseReceipt',
      state: 'assigned',
      from: 'supplier',
      to: 'cnWarehouse',
      scheduledDate: group[0].row.shippedAt,
      doneDate: null,
      packageUnitIds: group.map((g) => g.pkg.id),
    };
    const noteByPkg = new Map(group.map((g) => [g.pkg.id, g.row.deliveryNoteNo]));
    s = completeMove(s, move, group[0].row.shippedAt);
    s = {
      ...s,
      packages: s.packages.map((k) =>
        noteByPkg.has(k.id) ? { ...k, deliveryNoteNo: noteByPkg.get(k.id)! } : k
      ),
    };
  }
  commit(s);
  return result.matched.length;
}

/**
 * 示範用：扮廠家 send 嚟嘅「已發貨」表 —— 抽一批仲喺供應商嘅包件，
 * 再夾兩行對唔到嘅（打錯編碼、重複發貨），畀同事睇對數結果點樣顯示。
 */
export function demoShipmentRows(limit = 12): ShipmentRow[] {
  const note = `JH${DEMO_TODAY.replace(/-/g, '')}0${String(Math.floor(Math.random() * 90000) + 10000)}`;
  const rows = state.packages
    .filter((k) => k.location === 'supplier')
    .slice(0, limit)
    .map((k) => ({ packageCode: k.packageCode, shippedAt: DEMO_TODAY, deliveryNoteNo: note }));
  const shipped = state.packages.find((k) => k.location === 'cnWarehouse');
  rows.push({ packageCode: 'Y99Z99-00000', shippedAt: DEMO_TODAY, deliveryNoteNo: note });
  if (shipped) rows.push({ packageCode: shipped.packageCode, shippedAt: DEMO_TODAY, deliveryNoteNo: note });
  return rows;
}

/**
 * 讀廠家發貨表（CSV / TSV，第一行係欄名）。欄名認繁簡英三種寫法。
 * Excel 檔要先另存 CSV；真正接 xlsx 留畀後台。
 */
export function parseShipmentText(text: string): ShipmentRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const sep = lines[0].includes('\t') ? '\t' : ',';
  const header = lines[0].split(sep).map((h) => h.trim().replace(/^"|"$/g, '').toLowerCase());
  const find = (...names: string[]) => header.findIndex((h) => names.some((n) => h.includes(n)));
  const codeIdx = find('包件编码', '包件編碼', '包件', 'packagecode', 'package');
  const dateIdx = find('发货日期', '發貨日期', '发货', '發貨', 'shipped', 'date');
  const noteIdx = find('物流单号', '物流單號', '单号', '單號', 'note', 'tracking');
  if (codeIdx < 0) return [];
  return lines.slice(1).map((l) => {
    const cells = l.split(sep).map((c) => c.trim().replace(/^"|"$/g, ''));
    return {
      packageCode: cells[codeIdx] ?? '',
      shippedAt: (dateIdx >= 0 && cells[dateIdx]) || DEMO_TODAY,
      deliveryNoteNo: (noteIdx >= 0 && cells[noteIdx]) || '',
    };
  });
}

/* -------------------------------------------------------------- derived */

export const requirementStatus = (r: Requirement, pos: PurchaseOrder[]): RequirementStatus => {
  if (!r.purchaseOrderId) return 'open';
  const po = pos.find((p) => p.id === r.purchaseOrderId);
  return po?.orderedAt ? 'ordered' : 'inPurchaseOrder';
};

export interface WaitingLine {
  sku: string;
  qty: number;
  packages: Pkg[];
  shipped: number;
}

export interface WaitingGroup {
  orderNo: string;
  customer: CustomerRef;
  purchaseOrder: PurchaseOrder;
  lines: WaitingLine[];
  total: number;
  shipped: number;
  /** 幾多件已經到大陸倉 / 上咗港車 */
  orderedAt: string;
  estimatedReady: string | null;
  /** §4：全部包件都離開咗供應商 = 廠已發齊 */
  allShipped: boolean;
}

/** B-04：等候列表按訂單 group；「幾件發咗」= 已離開 supplier 嘅包件數 */
export function waitingGroups(s: OpsState): WaitingGroup[] {
  const poById = new Map(s.purchaseOrders.map((p) => [p.id, p]));
  const groups = new Map<string, WaitingGroup>();
  for (const k of s.packages) {
    if (!k.orderNo || !k.purchaseOrderId || !UPSTREAM.includes(k.location)) continue;
    const po = poById.get(k.purchaseOrderId);
    if (!po?.orderedAt) continue;
    let g = groups.get(k.orderNo);
    if (!g) {
      g = {
        orderNo: k.orderNo,
        customer: k.customer!,
        purchaseOrder: po,
        lines: [],
        total: 0,
        shipped: 0,
        orderedAt: po.orderedAt,
        estimatedReady: po.estimatedReady,
        allShipped: false,
      };
      groups.set(k.orderNo, g);
    }
    let line = g.lines.find((l) => l.sku === k.sku);
    if (!line) {
      line = { sku: k.sku, qty: 0, packages: [], shipped: 0 };
      g.lines.push(line);
    }
    line.packages.push(k);
    const shipped = k.location !== 'supplier';
    if (shipped) {
      line.shipped += 1;
      g.shipped += 1;
    }
    g.total += 1;
  }
  for (const g of groups.values()) {
    g.allShipped = g.shipped === g.total;
    for (const l of g.lines) {
      const p = bySku.get(l.sku);
      l.qty = p ? l.packages.length / packagesPerUnit(p.categoryKey) : l.packages.length;
    }
  }
  return [...groups.values()].sort((a, b) => a.orderedAt.localeCompare(b.orderedAt));
}

/** B-05：庫存頁 = 而家喺香港嘅包件 */
export const hkPackages = (s: OpsState) => s.packages.filter((k) => IN_HK.includes(k.location));
