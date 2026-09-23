import { useSyncExternalStore } from 'react';
import { packagesPerUnit, products, stockedProducts } from './catalog';
import { DEMO_TODAY } from '../domain/clock';
import { IN_HK, UPSTREAM } from '../domain/types';
import type { Activity, LocationKey, StockMove, TimeSlot } from '../domain/types';
import type { FieldClass } from '../config/permissions';
import type { Product } from '../types';

/* =================================================================
 * 營運核心示範資料 + store：訂單 → 採購需求 → 採購單 → 包件 → StockMove
 *
 * SPEC REF §2.1（SalesOrder）、§2.3（ProcurementRequirement / PurchaseOrder /
 * SupplierShipment / 供應商文件對數）、§2.4（PackageUnit / StockMove）、§4。
 *
 * INVARIANT 1：Pkg.location 只喺 completeMove() 度寫，而 completeMove 只會
 *   由一張 assigned move 轉 done 觸發。冇其他 API 寫呢個欄位。
 * INVARIANT 2：訂單狀態、需求狀態、等候進度 —— 全部係 function，冇 setter。
 * INVARIANT 3：moves 係 append-only；done 咗嘅 move 唔會改。
 *
 * 編號同格式跟 Alex 份營運 Excel：合同號 `PO3562` + 地區、批次 `0903单`、
 * 供應商單號 `HB2026090400056197`、發貨單 `JH20260904044395`、
 * 物流 `中通快递 302316090643`、包件 `Y09BB0025150` + `PF150200001`（床拆三件）。
 * 客人一律化名 + 化名電話，地區先係真（Excel 合同號本身就係地區）。
 *
 * CLAUDE.md DoD：供應商發貨表對數 match key = HB 單號 + 廠商型號/品名 + 數量；
 * 我哋嘅包件編碼係 match 成功後先派，唔會假設供應商文件有。
 * ===============================================================*/

export interface CustomerRef {
  alias: string;
  district: string;
  /** 化名電話，格式跟香港 8 位 */
  phone: string;
}

export type Channel = 'shopify' | 'showroom' | 'whatsapp' | 'phone';
export type PaymentState = 'unpaid' | 'deposit' | 'paid';

export interface OrderLine {
  id: string;
  sku: string;
  qty: number;
  /** 成交價（港幣） */
  price: number;
}

export interface DeliveryInfo {
  scheduledDate: string | null;
  timeSlot: TimeSlot | null;
  completedDate: string | null;
}

/** §2.1 — 現有 Order 加欄位；狀態冇欄位，由包件推導（derive.orderBucket） */
export interface SalesOrder {
  id: string;
  /** 合同號：PO + 4 位數（Shopify 訂單號），地區另存 */
  orderNo: string;
  customer: CustomerRef;
  channel: Channel;
  createdAt: string;
  customerRequestedDate: string | null;
  customerRequestedNote: string;
  payment: PaymentState;
  assignee: string;
  lines: OrderLine[];
  delivery: DeliveryInfo;
}

export type RequirementStatus = 'open' | 'inPurchaseOrder' | 'ordered';

export interface Requirement {
  id: string;
  orderNo: string;
  lineId: string | null;
  customer: CustomerRef | null;
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
  /** 例如 0903单；同一日第二張加 -2 */
  batchNo: string;
  supplier: string;
  createdAt: string;
  lines: PurchaseLine[];
  /** 上載訂貨確認先有值；「已訂」由呢個欄位推導（§2.3 SupplierConfirmation） */
  orderedAt: string | null;
  supplierOrderNo: string | null;
  confirmationFile: string | null;
  estimatedReady: string | null;
}

export interface Pkg {
  id: string;
  /** null = 未派碼：廠未發貨，發貨表對到先派（CLAUDE.md DoD） */
  packageCode: string | null;
  /** 廠家包件字頭（Y09BB0025150 / PF150200001），派碼時用 */
  stem: string;
  sku: string;
  /** null = 存貨（冇指定客單） */
  orderNo: string | null;
  lineId: string | null;
  purchaseOrderId: string | null;
  /** INVARIANT 1 */
  location: LocationKey;
  arrivedAt: string | null;
  /** 供應商發貨單號（JH…）同快遞單（中通 / 順豐 / 京東） */
  deliveryNoteNo: string | null;
  logisticsNo: string | null;
}

/** 供應商發貨表一行：佢哋嘅單號、型號、件數 —— 冇我哋嘅編碼 */
export interface ShipmentRow {
  supplierOrderNo: string;
  supplierCode: string;
  supplierName: string;
  qty: number;
  shippedAt: string;
  deliveryNoteNo: string;
  logisticsNo: string;
}

export type UnmatchedReason = 'orderNotFound' | 'modelNotFound' | 'alreadyShipped' | 'qtyExceeds';

export interface ShipmentMatch {
  row: ShipmentRow;
  purchaseOrder: PurchaseOrder;
  product: Product;
  /** 對到嘅包件（未派碼），件數 = qty × 每件包件數 */
  packages: Pkg[];
  /** 行上要求嘅件數多過未發貨嘅件數 */
  short: number;
}

export interface ShipmentResult {
  matched: ShipmentMatch[];
  unmatched: { row: ShipmentRow; reason: UnmatchedReason }[];
}

/* ------------------------------------------------ timeline sources (side-peek §3.1) */

export type PeekModel = 'order' | 'purchaseOrder' | 'package' | 'product';

/** side-peek-spec §5 Comment */
export interface Comment {
  id: string;
  model: PeekModel;
  recordId: string;
  authorId: string;
  body: string;
  mentions: string[];
  attachments: string[];
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
}

/**
 * rbac-spec §9.7 AuditLog（append-only）。欄位變更、審批、附件、Shopify 同步都係
 * AuditLog 事件；含 COST / FINANCE_DETAIL 欄位嘅事件帶 fieldClass，序列化層剝除。
 */
export type AuditEvent =
  | { event: 'fieldChange'; field: string; from: string; to: string; fieldClass?: FieldClass }
  | { event: 'approval'; approvalType: string; decision: 'approved' | 'rejected'; detail: string }
  | { event: 'attachment'; fileName: string; fieldClass?: FieldClass }
  | { event: 'shopifySync'; detail: string; field?: string; from?: string; to?: string };

export interface AuditEntry {
  id: string;
  ts: string;
  userId: string;
  model: PeekModel;
  recordId: string;
  payload: AuditEvent;
}

/** 移動事件寫入時已由推導引擎計好嘅後果（§3.1：唔係 render 時重算） */
export interface MoveConsequence {
  moveId: string;
  ts: string;
  actorId: string;
  orderNo: string;
  /** 例：「包件 3/3 在港 → 可安排送貨」 */
  inHk: number;
  total: number;
  consequence: 'readyToSchedule' | 'partial' | 'delivered' | 'shipped' | 'transit' | null;
}

interface OpsState {
  orders: SalesOrder[];
  requirements: Requirement[];
  purchaseOrders: PurchaseOrder[];
  packages: Pkg[];
  moves: StockMove[];
  moveConsequences: MoveConsequence[];
  activities: Activity[];
  comments: Comment[];
  audit: AuditEntry[];
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
const pick = <T,>(rng: () => number, arr: readonly T[]) => arr[Math.floor(rng() * arr.length)];
const between = (rng: () => number, min: number, max: number) => min + rng() * (max - min);

/** 化名（CLAUDE.md：fixture 唔准用真客資料） */
const ALIASES = [
  '陳女士', '李先生', '黃太', '張小姐', '何先生', '林太', '吳女士', '鄭先生', '梁太', '周小姐',
  '徐先生', '馬女士', '羅先生', '唐小姐', '施太', '馮先生', '袁小姐', '曾先生', '蔡女士', '謝先生',
];

/** 地區跟 Alex 份 Excel 合同號出現頻率（將軍澳 / 屯門 / 元朗 最多） */
const DISTRICTS = [
  '將軍澳', '將軍澳', '將軍澳', '屯門', '屯門', '屯門', '元朗', '元朗', '元朗', '半山', '半山', '灣仔', '灣仔',
  '荃灣', '荃灣', '大埔', '大埔', '馬鞍山', '北角', '愉景灣', '大圍', '啟德', '何文田', '跑馬地', '大角咀',
  '青衣', '堅尼地城', '沙田', '東涌', '觀塘', '天水圍', '火炭', '粉嶺', '荔枝角', '中環', '柴灣', '西營盤',
  '紅磡', '黃竹坑', '西貢', '淺水灣', '大坑', '太古城', '上環', '深水埗', '土瓜灣', '錦田', '九龍塘',
];

const NOTES = ['', '', '', '星期六日先收', '要拆舊床', '大廈唔夠位上樓梯', '夜晚七點後', '先 call 再送', '村屋，入村 100 米'];
const SALES = ['Wilson', 'Steve'];
const COURIERS = ['中通快递', '中通快递', '德邦快递', '京东物流', '顺丰速运'];

const DAY = 86_400_000;
const TODAY_MS = Date.parse(DEMO_TODAY);
const daysAgo = (n: number) => new Date(TODAY_MS - n * DAY).toISOString().slice(0, 10);
const mmdd = (iso: string) => iso.slice(5).replace('-', '');

const bySku = new Map(products.map((p) => [p.sku, p]));
export const productOf = (sku: string): Product | undefined => bySku.get(sku);

const orderable = products.filter((p) => p.status === 'active' && p.sourcingType !== 'stocked');

function buildFixtures(): OpsState {
  const rng = mulberry32(20260923);
  const state: OpsState = { orders: [], requirements: [], purchaseOrders: [], packages: [], moves: [], moveConsequences: [], activities: [], comments: [], audit: [], seq: 1 };
  let orderSeq = 3480;
  let reqSeq = 1;
  let pkgSeq = 1;
  let moveSeq = 1;
  let hbSeq = 5100;

  const phone = () => `${pick(rng, ['5', '6', '9'])}${String(Math.floor(between(rng, 100, 999)))} ${String(Math.floor(between(rng, 1000, 9999)))}`;
  const hb = (orderedAt: string) => `HB${orderedAt.replace(/-/g, '')}${String(hbSeq++).padStart(8, '0')}`;
  const jh = (shippedAt: string) => `JH${shippedAt.replace(/-/g, '')}0${String(Math.floor(between(rng, 10000, 99999)))}`;
  const courier = () => `${pick(rng, COURIERS)} ${String(Math.floor(between(rng, 100000000000, 999999999999)))}`;

  const newOrder = (ageDays: number, opts: { requestedDate?: string | null; payment?: PaymentState } = {}): SalesOrder => {
    orderSeq += 1;
    const lines: OrderLine[] = [];
    const n = rng() < 0.55 ? 1 : rng() < 0.75 ? 2 : 3;
    for (let i = 0; i < n; i++) {
      const p = pick(rng, orderable);
      lines.push({ id: `L${orderSeq}-${i + 1}`, sku: p.sku, qty: rng() < 0.85 ? 1 : 2, price: p.price });
    }
    const o: SalesOrder = {
      id: `O${orderSeq}`,
      orderNo: `PO${orderSeq}`,
      customer: { alias: pick(rng, ALIASES), district: pick(rng, DISTRICTS), phone: phone() },
      channel: rng() < 0.55 ? 'shopify' : rng() < 0.7 ? 'showroom' : rng() < 0.9 ? 'whatsapp' : 'phone',
      createdAt: daysAgo(ageDays),
      customerRequestedDate: opts.requestedDate === undefined ? (rng() < 0.4 ? daysAgo(-Math.floor(between(rng, 3, 30))) : null) : opts.requestedDate,
      customerRequestedNote: pick(rng, NOTES),
      payment: opts.payment ?? (rng() < 0.8 ? 'deposit' : 'unpaid'),
      assignee: pick(rng, SALES),
      lines,
      delivery: { scheduledDate: null, timeSlot: null, completedDate: null },
    };
    state.orders.push(o);
    return o;
  };

  const addRequirements = (o: SalesOrder) =>
    o.lines.map((l) => {
      const p = bySku.get(l.sku)!;
      const r: Requirement = {
        id: `REQ-${String(reqSeq++).padStart(4, '0')}`,
        orderNo: o.orderNo,
        lineId: l.id,
        customer: o.customer,
        sku: l.sku,
        qty: l.qty,
        supplier: p.supplier,
        sourcing: 'orderNew',
        createdAt: o.createdAt,
        purchaseOrderId: null,
      };
      state.requirements.push(r);
      return r;
    });

  const addPackages = (r: Requirement, poId: string, location: LocationKey, arrivedAt: string | null, coded: boolean) => {
    const p = bySku.get(r.sku)!;
    const out: Pkg[] = [];
    for (let u = 0; u < r.qty; u++) {
      p.packageStems.forEach((stem) => {
        const pkg: Pkg = {
          id: `PKG-${String(pkgSeq++).padStart(5, '0')}`,
          stem,
          packageCode: coded ? `${stem}-${r.orderNo.slice(2)}${r.qty > 1 ? `-${u + 1}` : ''}` : null,
          sku: r.sku,
          orderNo: r.orderNo,
          lineId: r.lineId,
          purchaseOrderId: poId,
          location,
          arrivedAt,
          deliveryNoteNo: null,
          logisticsNo: null,
        };
        state.packages.push(pkg);
        out.push(pkg);
      });
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

  /** 同一批需求按供應商開採購單，一日一批：0903单、0903单-2 */
  const makePos = (reqs: Requirement[], createdAt: string, ordered: { orderedAt: string; estimatedReady: string } | null) => {
    const map = new Map<string, PurchaseOrder>();
    for (const r of reqs) {
      let po = map.get(r.supplier);
      if (!po) {
        const sameDay = state.purchaseOrders.filter((x) => x.createdAt === createdAt).length;
        po = {
          id: `PUR-${String(state.purchaseOrders.length + 1).padStart(4, '0')}`,
          batchNo: `${mmdd(createdAt)}单${sameDay ? `-${sameDay + 1}` : ''}`,
          supplier: r.supplier,
          createdAt,
          lines: [],
          orderedAt: ordered?.orderedAt ?? null,
          supplierOrderNo: ordered ? hb(ordered.orderedAt) : null,
          confirmationFile: ordered ? `订货确认-${mmdd(ordered.orderedAt)}.pdf` : null,
          estimatedReady: ordered?.estimatedReady ?? null,
        };
        map.set(r.supplier, po);
        state.purchaseOrders.push(po);
      }
      po.lines.push({ requirementId: r.id, sku: r.sku, qty: r.qty });
      r.purchaseOrderId = po.id;
    }
    return map;
  };

  // 1. 已完成（近兩個月送咗嘅單）—— 訂單頁要有歷史
  for (let i = 0; i < 30; i++) {
    const age = 20 + Math.floor(rng() * 50);
    const o = newOrder(age, { payment: 'paid' });
    const reqs = addRequirements(o);
    const pos = makePos(reqs, daysAgo(age - 1), { orderedAt: daysAgo(age - 2), estimatedReady: daysAgo(age - 9) });
    const completed = daysAgo(Math.max(1, age - 18));
    o.delivery = { scheduledDate: completed, timeSlot: pick(rng, ['morning', 'afternoon', 'evening']), completedDate: completed };
    for (const r of reqs) {
      const pkgs = addPackages(r, pos.get(r.supplier)!.id, 'customer', daysAgo(age - 13), true);
      const ids = pkgs.map((k) => k.id);
      addDoneMove('purchaseReceipt', 'supplier', 'cnWarehouse', ids, daysAgo(age - 9));
      addDoneMove('transit', 'cnWarehouse', 'transit', ids, daysAgo(age - 11));
      addDoneMove('arrivalQc', 'transit', 'hkWarehouse', ids, daysAgo(age - 13));
      addDoneMove('deliverToCustomer', 'hkWarehouse', 'customer', ids, completed);
    }
  }

  // 2. 部分送達（分批送）
  for (let i = 0; i < 5; i++) {
    const age = 18 + Math.floor(rng() * 15);
    const o = newOrder(age);
    o.lines.push({ id: `L${orderSeq}-x`, sku: pick(rng, orderable).sku, qty: 1, price: 0 });
    const reqs = addRequirements(o);
    const pos = makePos(reqs, daysAgo(age - 1), { orderedAt: daysAgo(age - 2), estimatedReady: daysAgo(age - 9) });
    const delivered = daysAgo(3 + Math.floor(rng() * 5));
    o.delivery = { scheduledDate: delivered, timeSlot: 'afternoon', completedDate: null };
    reqs.forEach((r, idx) => {
      const last = idx === reqs.length - 1;
      const pkgs = addPackages(r, pos.get(r.supplier)!.id, last ? 'hkWarehouse' : 'customer', daysAgo(age - 13), true);
      const ids = pkgs.map((k) => k.id);
      addDoneMove('purchaseReceipt', 'supplier', 'cnWarehouse', ids, daysAgo(age - 9));
      addDoneMove('arrivalQc', 'transit', 'hkWarehouse', ids, daysAgo(age - 13));
      if (!last) addDoneMove('deliverToCustomer', 'hkWarehouse', 'customer', ids, delivered);
    });
  }

  // 3. 已到港：未約（部分在港 ≥ 14 日 → 升級）同已約
  for (let i = 0; i < 26; i++) {
    const age = 10 + Math.floor(rng() * 30);
    const o = newOrder(age);
    const reqs = addRequirements(o);
    const pos = makePos(reqs, daysAgo(age - 1), { orderedAt: daysAgo(age - 2), estimatedReady: daysAgo(age - 9) });
    const arrived = daysAgo(Math.max(1, age - 12));
    if (i % 2 === 0) o.delivery = { scheduledDate: daysAgo(-Math.floor(between(rng, 1, 10))), timeSlot: pick(rng, ['morning', 'afternoon', 'evening', 'flexible']), completedDate: null };
    for (const r of reqs) {
      const pkgs = addPackages(r, pos.get(r.supplier)!.id, rng() < 0.08 ? 'showroom' : 'hkWarehouse', arrived, true);
      const ids = pkgs.map((k) => k.id);
      addDoneMove('purchaseReceipt', 'supplier', 'cnWarehouse', ids, daysAgo(age - 8));
      addDoneMove('transit', 'cnWarehouse', 'transit', ids, daysAgo(age - 10));
      addDoneMove('arrivalQc', 'transit', 'hkWarehouse', ids, arrived);
    }
  }

  // 4. 備貨中：已落單，廠分批發，部分到大陸倉 / 上港車 —— 庫存等候
  for (let i = 0; i < 24; i++) {
    const age = 6 + Math.floor(rng() * 16);
    const o = newOrder(age);
    const reqs = addRequirements(o);
    const orderedAt = daysAgo(age - 1);
    const pos = makePos(reqs, orderedAt, { orderedAt, estimatedReady: daysAgo(age - 9) });
    for (const r of reqs) {
      const roll = rng();
      const location: LocationKey = roll < 0.45 ? 'supplier' : roll < 0.8 ? 'cnWarehouse' : 'transit';
      const pkgs = addPackages(r, pos.get(r.supplier)!.id, location, null, location !== 'supplier');
      if (location !== 'supplier') {
        const shipped = daysAgo(1 + Math.floor(rng() * 5));
        const note = jh(shipped);
        const lg = courier();
        pkgs.forEach((k) => {
          k.deliveryNoteNo = note;
          k.logisticsNo = lg;
        });
        addDoneMove('purchaseReceipt', 'supplier', 'cnWarehouse', pkgs.map((k) => k.id), shipped);
        if (location === 'transit') addDoneMove('transit', 'cnWarehouse', 'transit', pkgs.map((k) => k.id), daysAgo(0));
      }
    }
  }

  // 5. 採購表已生成、未落單
  for (let i = 0; i < 8; i++) {
    const age = 3 + Math.floor(rng() * 4);
    const o = newOrder(age);
    makePos(addRequirements(o), daysAgo(3), null);
  }

  // 6. 未採購：剛落嘅單
  for (let i = 0; i < 16; i++) addRequirements(newOrder(Math.floor(rng() * 6)));

  // 7. 存貨：儲定貨款嘅在倉數逐件變包件（orderNo = null，編碼 stem-S001）
  for (const p of stockedProducts) {
    const make = (count: number, location: LocationKey) => {
      for (let u = 0; u < count; u++) {
        const arrived = daysAgo(5 + Math.floor(rng() * 120));
        const ids: string[] = [];
        p.packageStems.forEach((stem) => {
          const pkg: Pkg = {
            id: `PKG-${String(pkgSeq++).padStart(5, '0')}`,
            stem,
            packageCode: `${stem}-S${String(u + 1).padStart(3, '0')}`,
            sku: p.sku,
            orderNo: null,
            lineId: null,
            purchaseOrderId: null,
            location,
            arrivedAt: arrived,
            deliveryNoteNo: null,
            logisticsNo: null,
          };
          state.packages.push(pkg);
          ids.push(pkg.id);
        });
        addDoneMove('openingBalance', 'supplier', location, ids, arrived);
      }
    };
    make(p.stock.main, 'hkWarehouse');
    make(p.stock.shop, 'showroom');
  }

  /* ---- side-peek §3.1：時間線來源。移動後果喺「事件發生時」計好寫入 payload ---- */
  const at = (date: string, hhmm: string) => `${date}T${hhmm}:00+08:00`;
  const ACTORS: Record<string, string> = { purchaseReceipt: 'u-alex', transit: 'u-alex', arrivalQc: 'u-alex', deliverToCustomer: 'u-hang', openingBalance: 'u-alex' };
  const TIMES: Record<string, string> = { purchaseReceipt: '11:20', transit: '09:05', arrivalQc: '15:40', deliverToCustomer: '14:32' };
  for (const mv of state.moves) {
    if (mv.type === 'openingBalance') continue;
    const pkgIds = new Set(mv.packageUnitIds);
    const orderNos = [...new Set(state.packages.filter((k) => pkgIds.has(k.id)).map((k) => k.orderNo).filter((x): x is string => !!x))];
    for (const orderNo of orderNos) {
      const all = state.packages.filter((k) => k.orderNo === orderNo);
      // 事件當時嘅位置：呢張 move 之後（fixture 按時序生成，所以計「到此 move 為止」嘅狀態）
      const doneUpTo = state.moves.filter((m) => m.doneDate! <= mv.doneDate! && m.id <= mv.id);
      const loc = new Map<string, LocationKey>(all.map((k) => [k.id, 'supplier' as LocationKey]));
      for (const m of doneUpTo) for (const id of m.packageUnitIds) if (loc.has(id)) loc.set(id, m.to);
      const inHk = [...loc.values()].filter((l) => IN_HK.includes(l)).length;
      const atCustomer = [...loc.values()].filter((l) => l === 'customer').length;
      const consequence =
        mv.type === 'deliverToCustomer' ? (atCustomer === all.length ? 'delivered' : 'partial')
        : mv.type === 'arrivalQc' ? (inHk === all.length ? 'readyToSchedule' : null)
        : mv.type === 'transit' ? 'transit' : 'shipped';
      state.moveConsequences.push({ moveId: mv.id, ts: at(mv.doneDate!, TIMES[mv.type] ?? '10:00'), actorId: ACTORS[mv.type] ?? 'u-alex', orderNo, inHk: mv.type === 'deliverToCustomer' ? atCustomer : inHk, total: all.length, consequence });
    }
  }

  let auditSeq = 1;
  let commentSeq = 1;
  let actSeq = 1;
  const audit = (ts: string, userId: string, recordId: string, payload: AuditEvent) =>
    state.audit.push({ id: `AL-${String(auditSeq++).padStart(5, '0')}`, ts, userId, model: 'order', recordId, payload });
  const comment = (createdAt: string, authorId: string, recordId: string, body: string, mentions: string[] = []) =>
    state.comments.push({ id: `CM-${String(commentSeq++).padStart(5, '0')}`, model: 'order', recordId, authorId, body, mentions, attachments: [], createdAt, editedAt: null, deletedAt: null });

  for (const o of state.orders) {
    const total = o.lines.reduce((n, l) => n + l.qty * l.price, 0);
    // 每張單都由 Shopify 同步建立（Q16 未答之前訂單入口一律係 Shopify）
    audit(at(o.createdAt, '10:02'), 'u-system', o.orderNo, { event: 'shopifySync', detail: `#${o.orderNo.slice(2)} · HK$${total.toLocaleString('en-HK')}` });
    if (o.payment !== 'unpaid') audit(at(o.createdAt, '10:02'), 'u-system', o.orderNo, { event: 'shopifySync', detail: 'deposit', field: 'payment', from: 'unpaid', to: 'deposit' });
    // 待辦：待約嘅單有一條未完成 Activity；已約嘅有一條已完成（feedback = scheduled）
    const units = state.packages.filter((k) => k.orderNo === o.orderNo);
    const allHk = units.length > 0 && units.every((k) => IN_HK.includes(k.location));
    if (allHk && !o.delivery.scheduledDate) {
      const arrived = units.map((k) => k.arrivedAt!).sort()[0];
      const due = daysAgo(Math.max(-2, Math.min(6, Math.floor((TODAY_MS - Date.parse(arrived)) / DAY) - 2)));
      state.activities.push({ id: `ACT-${String(actSeq++).padStart(4, '0')}`, kind: 'scheduleDelivery', orderId: o.orderNo, dueDate: due, owner: 'Alex', feedback: null, note: '', doneAt: null, nextActivityId: null, seq: 1 });
    } else if (o.delivery.scheduledDate) {
      const doneAt = daysAgo(Math.max(1, Math.floor((TODAY_MS - Date.parse(o.delivery.scheduledDate)) / DAY) + 3));
      state.activities.push({ id: `ACT-${String(actSeq++).padStart(4, '0')}`, kind: 'scheduleDelivery', orderId: o.orderNo, dueDate: doneAt, owner: 'Alex', feedback: 'scheduled', note: '', doneAt, nextActivityId: null, seq: 1 });
    }
  }

  // 展示用嘅事件：最新 8 張單（訂單頁一開就見）+ 每種 §3.1 事件都有
  const newest = [...state.orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8);
  newest.forEach((o, i) => {
    const d = o.createdAt;
    // 同一人 5 分鐘內連續改 3 個欄位 → 時間線合併做一條
    audit(at(d, '11:40'), 'u-wilson', o.orderNo, { event: 'fieldChange', field: 'customerRequestedDate', from: daysAgo(-6), to: daysAgo(-19) });
    audit(at(d, '11:42'), 'u-wilson', o.orderNo, { event: 'fieldChange', field: 'customerRequestedNote', from: '', to: '星期六日先收' });
    audit(at(d, '11:44'), 'u-wilson', o.orderNo, { event: 'fieldChange', field: 'channel', from: 'shopify', to: 'whatsapp' });
    // @mention 留言
    comment(at(d, '11:52'), 'u-wilson', o.orderNo, '@Alex 客話可能改地址，約之前問清楚', ['u-alex']);
    // COST 欄位變更：sales / ops / content / driver 整條唔見
    audit(at(daysAgo(Math.max(0, Math.floor((TODAY_MS - Date.parse(d)) / DAY) - 1)), '16:10'), 'u-manman', o.orderNo, { event: 'fieldChange', field: 'costPrice', from: '¥1,559.83', to: '¥1,612.00', fieldClass: 'COST' });
    if (i % 2 === 0) audit(at(d, '17:25'), 'u-manman', o.orderNo, { event: 'attachment', fileName: 'FPS-入數截圖.jpg', fieldClass: 'FINANCE_DETAIL' });
    if (i % 3 === 0) audit(at(daysAgo(0), '09:30'), 'u-system', o.orderNo, { event: 'shopifySync', detail: 'amount', field: 'amount', from: 'HK$9,240', to: 'HK$9,560' });
    if (i === 1) audit(at(daysAgo(0), '10:15'), 'u-ocean', o.orderNo, { event: 'approval', approvalType: 'writeOff', decision: 'approved', detail: '1' });
    if (i === 2) comment(at(daysAgo(0), '08:55'), 'u-alex', o.orderNo, '今日先 call 客確認上樓梯闊度，下午覆。');
  });
  // 待約單：打唔通 → 自動排下次（Activity 鏈）
  const toSchedule = state.activities.filter((a) => !a.doneAt).slice(0, 3);
  for (const a of toSchedule) {
    const prev: Activity = { ...a, id: `${a.id}-p`, feedback: 'unreachable', doneAt: daysAgo(1), nextActivityId: a.id, dueDate: daysAgo(1) };
    state.activities.push(prev);
    a.seq = 2;
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
  const sameDay = state.purchaseOrders.filter((po) => po.createdAt === DEMO_TODAY).length;
  const po: PurchaseOrder = {
    id: `PUR-${String(state.seq).padStart(4, '0')}`,
    batchNo: `${mmdd(DEMO_TODAY)}单${sameDay ? `-${sameDay + 1}` : ''}`,
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
    requirements: state.requirements.map((r) => (lineIds.has(r.id) ? { ...r, purchaseOrderId: po.id } : r)),
  });
  return po;
}

/** 備貨表揀咗款就出採購需求（purpose = 存貨，§2.1）。冇客人。 */
export function createStockRequirements(items: { sku: string; qty: number }[]): number {
  let seq = state.requirements.length + 1;
  const added: Requirement[] = [];
  for (const it of items) {
    const p = bySku.get(it.sku);
    if (!p || it.qty <= 0) continue;
    added.push({
      id: `REQ-${String(seq++).padStart(4, '0')}`,
      orderNo: `備貨${mmdd(DEMO_TODAY)}`,
      lineId: null,
      customer: null,
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

export const isStockRequirement = (r: Requirement) => r.customer === null;

/**
 * §2.3 SupplierConfirmation：上載訂貨確認。寫 orderedAt / supplierOrderNo / 附件；
 * 「已訂」由此推導。同時為每行生成包件（喺 supplier 位置，**未派碼**）。
 * TODO(Q12/Q18)：文件形式同包件邊個入未定；呢度假設落單即建包件、編碼等發貨表對到先派。
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
    for (let u = 0; u < line.qty; u++) {
      p.packageStems.forEach((stem) => {
        packages.push({
          id: `PKG-${String(pkgSeq++).padStart(5, '0')}`,
          stem,
          packageCode: null,
          sku: line.sku,
          orderNo: r.orderNo,
          lineId: r.lineId,
          purchaseOrderId: po.id,
          location: 'supplier',
          arrivedAt: null,
          deliveryNoteNo: null,
          logisticsNo: null,
        });
      });
    }
  }
  commit({
    ...state,
    purchaseOrders: state.purchaseOrders.map((p) =>
      p.id === poId
        ? { ...p, orderedAt: DEMO_TODAY, supplierOrderNo: input.supplierOrderNo, confirmationFile: input.confirmationFile, estimatedReady: input.estimatedReady }
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
      ids.has(k.id) ? { ...k, location: move.to, arrivedAt: IN_HK.includes(move.to) ? doneDate : k.arrivedAt } : k
    ),
  };
}

const norm = (v: string) => v.trim().toUpperCase().replace(/\s+/g, '');

/**
 * §2.3 ShipmentStatement 對數 —— 淨係計，唔改任何嘢；applyShipment 先寫。
 * Match key（CLAUDE.md DoD）：HB 單號 → 採購單；型號（或廠家品名）→ 採購行；數量 → 幾多件。
 * 對唔到嘅分四種原因交人手。
 */
export function matchShipment(rows: ShipmentRow[]): ShipmentResult {
  const result: ShipmentResult = { matched: [], unmatched: [] };
  const taken = new Set<string>();
  for (const row of rows) {
    if (!row.supplierOrderNo && !row.supplierCode && !row.supplierName) continue;
    const po = state.purchaseOrders.find((p) => p.orderedAt && p.supplierOrderNo && norm(p.supplierOrderNo) === norm(row.supplierOrderNo));
    if (!po) {
      result.unmatched.push({ row, reason: 'orderNotFound' });
      continue;
    }
    const code = norm(row.supplierCode);
    const name = row.supplierName.trim();
    const line = po.lines.find((l) => {
      const p = bySku.get(l.sku);
      if (!p) return false;
      if (code && norm(p.supplierCode) === code) return true;
      return !code && name && (p.supplierName === name || p.supplierName.includes(name));
    });
    if (!line) {
      result.unmatched.push({ row, reason: 'modelNotFound' });
      continue;
    }
    const product = bySku.get(line.sku)!;
    const per = packagesPerUnit(product);
    const pending = state.packages.filter(
      (k) => k.purchaseOrderId === po.id && k.sku === line.sku && k.location === 'supplier' && !taken.has(k.id)
    );
    if (pending.length === 0) {
      result.unmatched.push({ row, reason: 'alreadyShipped' });
      continue;
    }
    const wantUnits = Math.max(1, Math.floor(row.qty || 1));
    const units = Math.min(wantUnits, Math.floor(pending.length / per));
    if (units === 0) {
      result.unmatched.push({ row, reason: 'qtyExceeds' });
      continue;
    }
    const packages = pending.slice(0, units * per);
    packages.forEach((k) => taken.add(k.id));
    result.matched.push({ row, purchaseOrder: po, product, packages, short: wantUnits - units });
  }
  return result;
}

/**
 * 套用發貨表。每張發貨單開一張 採購收貨 move（供應商 → 大陸倉）assigned → done，
 * 同時派我哋嘅包件編碼。燈自動著係因為位置變咗，唔係改咗狀態值。
 */
export function applyShipment(result: ShipmentResult): number {
  let s = state;
  let moveSeq = state.moves.length + 1;
  const byNote = new Map<string, ShipmentMatch[]>();
  for (const m of result.matched) {
    const key = `${m.row.deliveryNoteNo}|${m.row.shippedAt}`;
    byNote.set(key, [...(byNote.get(key) ?? []), m]);
  }
  let count = 0;
  for (const group of byNote.values()) {
    const meta = new Map<string, { code: string; note: string; lg: string }>();
    for (const m of group) {
      const orderKey = m.packages[0]?.orderNo?.slice(2) ?? 'S';
      const multi = m.packages.length / packagesPerUnit(m.product) > 1;
      m.packages.forEach((k, i) => {
        const unit = Math.floor(i / packagesPerUnit(m.product)) + 1;
        meta.set(k.id, { code: `${k.stem}-${orderKey}${multi ? `-${unit}` : ''}`, note: m.row.deliveryNoteNo, lg: m.row.logisticsNo });
      });
    }
    const move: StockMove = {
      id: `SM-${String(moveSeq++).padStart(5, '0')}`,
      type: 'purchaseReceipt',
      state: 'assigned',
      from: 'supplier',
      to: 'cnWarehouse',
      scheduledDate: group[0].row.shippedAt,
      doneDate: null,
      packageUnitIds: [...meta.keys()],
    };
    s = completeMove(s, move, group[0].row.shippedAt);
    s = {
      ...s,
      packages: s.packages.map((k) => {
        const m = meta.get(k.id);
        return m ? { ...k, packageCode: k.packageCode ?? m.code, deliveryNoteNo: m.note, logisticsNo: m.lg || null } : k;
      }),
    };
    count += meta.size;
  }
  commit(s);
  return count;
}

/**
 * 示範用：扮源氏 send 嚟嘅「已發貨」表 —— 揀幾張已落單嘅採購單，每行 HB 單號 + 型號 + 件數，
 * 第一行件數多過落單（對到但有差額），再夾兩行對唔到（HB 打錯、型號唔喺呢張單）。
 */
export function demoShipmentRows(limit = 8): ShipmentRow[] {
  const rows: ShipmentRow[] = [];
  const shippedAt = DEMO_TODAY;
  const note = `JH${shippedAt.replace(/-/g, '')}0${String(10000 + Math.floor(Math.random() * 89999))}`;
  const lg = `中通快递 30231${String(6000000000 + Math.floor(Math.random() * 999999999))}`;
  const pending = state.packages.filter((k) => k.location === 'supplier' && k.purchaseOrderId);
  const seen = new Set<string>();
  for (const k of pending) {
    const key = `${k.purchaseOrderId}|${k.sku}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const po = state.purchaseOrders.find((p) => p.id === k.purchaseOrderId)!;
    const p = bySku.get(k.sku)!;
    const units = pending.filter((x) => x.purchaseOrderId === po.id && x.sku === k.sku).length / packagesPerUnit(p);
    rows.push({ supplierOrderNo: po.supplierOrderNo!, supplierCode: p.supplierCode, supplierName: p.supplierName, qty: Math.max(1, Math.floor(units)), shippedAt, deliveryNoteNo: note, logisticsNo: lg });
    if (rows.length >= limit) break;
  }
  const first = rows[0];
  if (first) {
    // 第一行廠方報多 3 件（我哋只落咗 first.qty）→ 對到但標「少發 / 多報」；再夾兩行對唔到
    rows[0] = { ...first, qty: first.qty + 3 };
    rows.push({ ...first, supplierOrderNo: 'HB2026090100000000' });
    rows.push({ ...first, supplierCode: 'Y99Z99999', supplierName: 'Y99Z99 不存在的型号' });
  }
  return rows;
}

/**
 * 讀廠家發貨表（CSV / TSV，第一行係欄名）。欄名認繁簡英三種寫法。
 * Excel 檔要先另存 CSV；真正接 xlsx 留畀後台（Q17：格式係咪逐家唔同）。
 */
export function parseShipmentText(text: string): ShipmentRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const sep = lines[0].includes('\t') ? '\t' : ',';
  const header = lines[0].split(sep).map((h) => h.trim().replace(/^"|"$/g, '').toLowerCase());
  const find = (...names: string[]) => header.findIndex((h) => names.some((n) => h.includes(n)));
  const hbIdx = find('订单号', '訂單號', '订货单', 'hb', 'supplierorder', 'order');
  const codeIdx = find('型号', '型號', 'sku', 'model', 'code');
  const nameIdx = find('名称', '名稱', '品名', 'name');
  const qtyIdx = find('数量', '數量', 'qty', 'quantity');
  const dateIdx = find('发货日期', '發貨日期', '发货', '發貨', 'shipped', 'date');
  const noteIdx = find('发货单', '發貨單', 'jh', 'note');
  const lgIdx = find('物流', '快递', '快遞', 'tracking', 'logistics');
  if (hbIdx < 0 || (codeIdx < 0 && nameIdx < 0)) return [];
  return lines.slice(1).map((l) => {
    const c = l.split(sep).map((x) => x.trim().replace(/^"|"$/g, ''));
    return {
      supplierOrderNo: c[hbIdx] ?? '',
      supplierCode: codeIdx >= 0 ? (c[codeIdx] ?? '') : '',
      supplierName: nameIdx >= 0 ? (c[nameIdx] ?? '') : '',
      qty: qtyIdx >= 0 ? Number(c[qtyIdx]) || 1 : 1,
      shippedAt: (dateIdx >= 0 && c[dateIdx]) || DEMO_TODAY,
      deliveryNoteNo: (noteIdx >= 0 && c[noteIdx]) || '',
      logisticsNo: (lgIdx >= 0 && c[lgIdx]) || '',
    };
  });
}

/* ---------------------------------------------- side-peek actions (§2, §3.3) */

export function addComment(model: PeekModel, recordId: string, authorId: string, body: string, mentions: string[]): Comment {
  const c: Comment = {
    id: `CM-${String(state.comments.length + 1).padStart(5, '0')}`,
    model,
    recordId,
    authorId,
    body,
    mentions,
    attachments: [],
    createdAt: nowIso(),
    editedAt: null,
    deletedAt: null,
  };
  commit({ ...state, comments: [...state.comments, c] });
  return c;
}

/** 摘要欄 inline edit：只改可改欄位，每個欄位一條 AuditLog（時間線會按 5 分鐘合併） */
export function updateOrder(orderNo: string, patch: Partial<Pick<SalesOrder, 'customerRequestedDate' | 'customerRequestedNote' | 'channel' | 'assignee'>>, actorId: string) {
  const o = state.orders.find((x) => x.orderNo === orderNo);
  if (!o) return;
  const entries: AuditEntry[] = [];
  let seq = state.audit.length + 1;
  for (const [field, to] of Object.entries(patch) as [keyof typeof patch, string | null][]) {
    const from = o[field] ?? '';
    if ((to ?? '') === from) continue;
    entries.push({ id: `AL-${String(seq++).padStart(5, '0')}`, ts: nowIso(), userId: actorId, model: 'order', recordId: orderNo, payload: { event: 'fieldChange', field, from: String(from), to: String(to ?? '') } });
  }
  if (entries.length === 0) return;
  commit({
    ...state,
    orders: state.orders.map((x) => (x.orderNo === orderNo ? { ...x, ...patch } : x)),
    audit: [...state.audit, ...entries],
  });
}

/** 待辦條「完成」：關閉 Activity（feedback = scheduled 由約期動作寫；呢度係一般完成） */
export function completeActivity(id: string, feedback: Activity['feedback'] = null) {
  commit({ ...state, activities: state.activities.map((a) => (a.id === id ? { ...a, doneAt: DEMO_TODAY, feedback } : a)) });
}

/** 待辦條「改期」：關舊開新，鏈式接續（§2.5 nextActivityId），舊嘅唔改 */
export function rescheduleActivity(id: string, due: string, note: string, feedback: 'customerPostponed' | 'unreachable' = 'customerPostponed'): Activity | null {
  const a = state.activities.find((x) => x.id === id);
  if (!a || a.doneAt) return null;
  const next: Activity = { ...a, id: `${a.id}-r${a.seq + 1}`, dueDate: due, note, seq: a.seq + 1, feedback: null, doneAt: null, nextActivityId: null };
  commit({
    ...state,
    activities: [...state.activities.map((x) => (x.id === id ? { ...x, doneAt: DEMO_TODAY, feedback, nextActivityId: next.id } : x)), next],
  });
  return next;
}

/** 「已約」：寫 scheduledDate（送貨單欄位），關閉待辦 —— 狀態由推導轉「已約」 */
export function scheduleOrder(orderNo: string, date: string, slot: TimeSlot, actorId: string) {
  const o = state.orders.find((x) => x.orderNo === orderNo);
  if (!o) return;
  const entry: AuditEntry = { id: `AL-${String(state.audit.length + 1).padStart(5, '0')}`, ts: nowIso(), userId: actorId, model: 'order', recordId: orderNo, payload: { event: 'fieldChange', field: 'scheduledDate', from: o.delivery.scheduledDate ?? '', to: `${date} ${slot}` } };
  commit({
    ...state,
    orders: state.orders.map((x) => (x.orderNo === orderNo ? { ...x, delivery: { ...x.delivery, scheduledDate: date, timeSlot: slot } } : x)),
    activities: state.activities.map((a) => (a.orderId === orderNo && !a.doneAt ? { ...a, doneAt: DEMO_TODAY, feedback: 'scheduled' as const } : a)),
    audit: [...state.audit, entry],
  });
}

/** 示範時鐘：今日 + 而家嘅時分（DEMO_TODAY 固定，時間跟真時鐘） */
export const nowIso = () => `${DEMO_TODAY}T${new Date().toTimeString().slice(0, 8)}+08:00`;

/* -------------------------------------------------------------- derived */

export const requirementStatus = (r: Requirement, pos: PurchaseOrder[]): RequirementStatus => {
  if (!r.purchaseOrderId) return 'open';
  const po = pos.find((p) => p.id === r.purchaseOrderId);
  return po?.orderedAt ? 'ordered' : 'inPurchaseOrder';
};

/** 一張訂單嘅所有包件（§4 推導用） */
export const packagesOfOrder = (s: OpsState, orderNo: string) => s.packages.filter((k) => k.orderNo === orderNo);

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
  orderedAt: string;
  estimatedReady: string | null;
  /** §4：全部包件都離開咗供應商 = 廠已發齊 */
  allShipped: boolean;
}

/** B-04：等候列表按訂單 group；「幾件發咗」= 已離開 supplier 嘅包件數 */
export function waitingGroups(s: OpsState): WaitingGroup[] {
  const poById = new Map(s.purchaseOrders.map((p) => [p.id, p]));
  const orderByNo = new Map(s.orders.map((o) => [o.orderNo, o]));
  const groups = new Map<string, WaitingGroup>();
  for (const k of s.packages) {
    if (!k.orderNo || !k.purchaseOrderId || !UPSTREAM.includes(k.location)) continue;
    const po = poById.get(k.purchaseOrderId);
    const order = orderByNo.get(k.orderNo);
    if (!po?.orderedAt || !order) continue;
    let g = groups.get(k.orderNo);
    if (!g) {
      g = { orderNo: k.orderNo, customer: order.customer, purchaseOrder: po, lines: [], total: 0, shipped: 0, orderedAt: po.orderedAt, estimatedReady: po.estimatedReady, allShipped: false };
      groups.set(k.orderNo, g);
    }
    let line = g.lines.find((l) => l.sku === k.sku);
    if (!line) {
      line = { sku: k.sku, qty: 0, packages: [], shipped: 0 };
      g.lines.push(line);
    }
    line.packages.push(k);
    if (k.location !== 'supplier') {
      line.shipped += 1;
      g.shipped += 1;
    }
    g.total += 1;
  }
  for (const g of groups.values()) {
    g.allShipped = g.shipped === g.total;
    for (const l of g.lines) {
      const p = bySku.get(l.sku);
      l.qty = p ? l.packages.length / packagesPerUnit(p) : l.packages.length;
    }
  }
  return [...groups.values()].sort((a, b) => a.orderedAt.localeCompare(b.orderedAt));
}

/** 庫存頁 = 而家喺香港嘅包件 */
export const hkPackages = (s: OpsState) => s.packages.filter((k) => IN_HK.includes(k.location));
