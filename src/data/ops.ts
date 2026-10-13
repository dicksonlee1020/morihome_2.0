import dayjs from 'dayjs';
import { useSyncExternalStore } from 'react';
import { readStoredSession } from '../auth/AuthProvider';
import type { FieldClass } from '../config/permissions';
import { DEMO_TODAY } from '../domain/clock';
import { lineStatus } from '../domain/derive';
import type {
  Activity,
  LocationKey,
  StockMove,
  TimeSlot,
} from '../domain/types';
import { IN_HK, UPSTREAM } from '../domain/types';
import type { Product } from '../types';
import { packagesPerUnit, products, stockedProducts } from './catalog';

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
  stockException?: boolean;
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
export type RequirementStatus =
  | 'open'
  | 'inPurchaseOrder'
  | 'ordered'
  | 'partialConfirmed'
  | 'confirmationDeferred'
  | 'stockAssigned'
  | 'cancelled'
  | 'superseded';
export interface Requirement {
  purpose?: 'customerOrder' | 'restock' | 'display' | 'aftersales' | 'other';
  replenish?: boolean;
  cancelledAt?: string | null;
  supersededAt?: string | null;
  linkedOrderNo?: string | null;
  parentRequirementId?: string;
  originalRequestedQty?: number;
  confirmedQty?: number;
  remainingRequirementId?: string | null;
  confirmationAt?: string;
  confirmationActor?: string;
  id: string;
  orderNo: string;
  lineId: string | null;
  customer: CustomerRef | null;
  sku: string;
  qty: number;
  supplier: string;
  /** §2.3 sourcing：系統按可售建議「用存貨」定「訂新貨」 */
  sourcing: 'orderNew' | 'useStock' | 'useHKStock' | 'useCNStock';
  createdAt: string;
  purchaseOrderId: string | null;
}
export interface PurchaseLine {
  requirementId: string;
  sku: string;
  qty: number;
}
export interface PurchaseOrder {
  deliveryRoute?: 'viaCN' | 'directHK' | 'directCustomer';
  revision?: number;
  confirmationState?: 'confirmed' | 'partial' | 'unconfirmed';
  confirmedAt?: string;
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
  unitId?: string;
  procurementRequirementId?: string;
  procurementReference?: string | null;
  allocationRequirementId?: string | null;
  allocationPurpose?: Requirement['purpose'];
  requirementId?: string;
  linkedOrderNo?: string | null;
  exception?: string | null;
  quarantined?: boolean;
  shippedAt?: string | null;
  receiptHistory?: ReceiptEvent[];
  receivingException?: ReceivingException | null;
  cnReceivedAt?: string;
  hkReceivedAt?: string;
  customerReceivedAt?: string;
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
export type UnmatchedReason =
  'orderNotFound' | 'modelNotFound' | 'alreadyShipped' | 'qtyExceeds';
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
  unmatched: {
    row: ShipmentRow;
    reason: UnmatchedReason;
  }[];
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
  | {
      event: 'fieldChange';
      field: string;
      from: string;
      to: string;
      fieldClass?: FieldClass;
    }
  | {
      event: 'approval';
      approvalType: string;
      decision: 'approved' | 'rejected';
      detail: string;
    }
  | {
      event: 'attachment';
      fileName: string;
      fieldClass?: FieldClass;
    }
  | {
      event: 'shopifySync';
      detail: string;
      field?: string;
      from?: string;
      to?: string;
    };
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
  consequence:
    'readyToSchedule' | 'partial' | 'delivered' | 'shipped' | 'transit' | null;
}
export interface OpsState {
  ownerTransfers?: Record<string, { to: string; actor: string; at: string }>;
  safetyStock?: Record<string, number>;
  receipts?: ReceiptRecord[];
  unexpectedReceipts?: UnexpectedReceipt[];
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
const pick = <T>(rng: () => number, arr: readonly T[]) =>
  arr[Math.floor(rng() * arr.length)];
const between = (rng: () => number, min: number, max: number) =>
  min + rng() * (max - min);

/** 化名（CLAUDE.md：fixture 唔准用真客資料） */
const ALIASES = [
  '陳女士',
  '李先生',
  '黃太',
  '張小姐',
  '何先生',
  '林太',
  '吳女士',
  '鄭先生',
  '梁太',
  '周小姐',
  '徐先生',
  '馬女士',
  '羅先生',
  '唐小姐',
  '施太',
  '馮先生',
  '袁小姐',
  '曾先生',
  '蔡女士',
  '謝先生',
];

/** 地區跟 Alex 份 Excel 合同號出現頻率（將軍澳 / 屯門 / 元朗 最多） */
const DISTRICTS = [
  '將軍澳',
  '將軍澳',
  '將軍澳',
  '屯門',
  '屯門',
  '屯門',
  '元朗',
  '元朗',
  '元朗',
  '半山',
  '半山',
  '灣仔',
  '灣仔',
  '荃灣',
  '荃灣',
  '大埔',
  '大埔',
  '馬鞍山',
  '北角',
  '愉景灣',
  '大圍',
  '啟德',
  '何文田',
  '跑馬地',
  '大角咀',
  '青衣',
  '堅尼地城',
  '沙田',
  '東涌',
  '觀塘',
  '天水圍',
  '火炭',
  '粉嶺',
  '荔枝角',
  '中環',
  '柴灣',
  '西營盤',
  '紅磡',
  '黃竹坑',
  '西貢',
  '淺水灣',
  '大坑',
  '太古城',
  '上環',
  '深水埗',
  '土瓜灣',
  '錦田',
  '九龍塘',
];
const NOTES = [
  '',
  '',
  '',
  '星期六日先收',
  '要拆舊床',
  '大廈唔夠位上樓梯',
  '夜晚七點後',
  '先 call 再送',
  '村屋，入村 100 米',
];
const SALES = ['Wilson', 'Steve'];
const COURIERS = ['中通快递', '中通快递', '德邦快递', '京东物流', '顺丰速运'];
const DAY = 86_400_000;
const TODAY_MS = Date.parse(DEMO_TODAY);
const daysAgo = (n: number) =>
  new Date(TODAY_MS - n * DAY).toISOString().slice(0, 10);
const mmdd = (iso: string) => iso.slice(5).replace('-', '');
const bySku = new Map(products.map((p) => [p.sku, p]));
export const productOf = (sku: string): Product | undefined => bySku.get(sku);
const orderable = products.filter(
  (p) => p.status === 'active' && p.sourcingType !== 'stocked',
);
function buildFixtures(): OpsState {
  let rng = mulberry32(20260923);
  let state: any = {
    orders: [],
    requirements: [],
    purchaseOrders: [],
    packages: [],
    moves: [],
    moveConsequences: [],
    activities: [],
    comments: [],
    audit: [],
    seq: 1,
  };
  let orderSeq = 3480;
  let reqSeq = 1;
  let pkgSeq = 1;
  let moveSeq = 1;
  let hbSeq = 5100;
  let phone = () =>
    `${pick(rng, [`5`, `6`, `9`])}${String(Math.floor(between(rng, 100, 999)))} ${String(Math.floor(between(rng, 1e3, 9999)))}`;
  let c = (e: any) =>
    `HB${e.replace(/-/g, ``)}${String(hbSeq++).padStart(8, `0`)}`;
  let l = (t: any) =>
    `JH${t.replace(/-/g, ``)}0${String(Math.floor(between(rng, 1e4, 99999)))}`;
  let courier = () =>
    `${pick(rng, COURIERS)} ${String(Math.floor(between(rng, 1e11, 999999999999)))}`;
  let newOrder = (r: any, i: any = {}) => {
    orderSeq += 1;
    let a: any[] = [];
    let o = rng() < 0.55 ? 1 : rng() < 0.75 ? 2 : 3;
    for (let t = 0; t < o; t++) {
      let r = pick(rng, orderable);
      a.push({
        id: `L${orderSeq}-${t + 1}`,
        sku: r.sku,
        qty: rng() < 0.85 ? 1 : 2,
        price: r.price,
      });
    }
    let c: any = {
      id: `O${orderSeq}`,
      orderNo: `PO${orderSeq}`,
      customer: {
        alias: pick(rng, ALIASES),
        district: pick(rng, DISTRICTS),
        phone: phone(),
      },
      channel:
        rng() < 0.55
          ? `shopify`
          : rng() < 0.7
            ? `showroom`
            : rng() < 0.9
              ? `whatsapp`
              : `phone`,
      createdAt: daysAgo(r),
      customerRequestedDate:
        i.requestedDate === undefined
          ? rng() < 0.4
            ? daysAgo(-Math.floor(between(rng, 3, 30)))
            : null
          : i.requestedDate,
      customerRequestedNote: pick(rng, NOTES),
      payment: i.payment ?? (rng() < 0.8 ? `deposit` : `unpaid`),
      assignee: pick(rng, SALES),
      lines: a,
      delivery: {
        scheduledDate: null,
        timeSlot: null,
        completedDate: null,
      },
    };
    state.orders.push(c);
    return c;
  };
  let addRequirements = (e: any) =>
    e.lines.map((n: any) => {
      let i = bySku.get(n.sku);
      let a: any = {
        id: `PR-${e.createdAt.replace(/-/g, ``)}-${String(reqSeq++).padStart(3, `0`)}`,
        orderNo: e.orderNo,
        lineId: n.id,
        customer: e.customer,
        sku: n.sku,
        qty: n.qty,
        supplier: i!.supplier,
        sourcing: `orderNew`,
        createdAt: e.createdAt,
        purchaseOrderId: null,
        purpose: `customerOrder`,
      };
      state.requirements.push(a);
      return a;
    });
  let addPackages = (e: any, n: any, r: any, a: any, o: any) => {
    let s = bySku.get(e.sku);
    let c: any[] = [];
    for (let l = 0; l < e.qty; l++)
      s!.packageStems.forEach((s: any) => {
        let u: any = {
          id: `PKG-${String(pkgSeq++).padStart(5, `0`)}`,
          stem: s,
          unitId: `${e.id}-U${l + 1}`,
          procurementRequirementId: e.id,
          procurementReference: e.orderNo,
          allocationRequirementId: e.id,
          allocationPurpose: `customerOrder`,
          packageCode: o
            ? `${s}-${e.orderNo.slice(2)}${e.qty > 1 ? `-${l + 1}` : ``}`
            : null,
          sku: e.sku,
          orderNo: e.orderNo,
          lineId: e.lineId,
          purchaseOrderId: n,
          location: r,
          arrivedAt: a,
          deliveryNoteNo: null,
          logisticsNo: null,
        };
        state.packages.push(u);
        c.push(u);
      });
    return c;
  };
  let addDoneMove = (e: any, n: any, r: any, i: any, o: any) => {
    state.moves.push({
      id: `SM-${String(moveSeq++).padStart(5, `0`)}`,
      type: e,
      state: `done`,
      from: n,
      to: r,
      scheduledDate: o,
      doneDate: o,
      packageUnitIds: i,
    });
  };
  let makePos = (e: any, n: any, r: any) => {
    let i = new Map<any, any>();
    for (let a of e) {
      let e = i.get(a.supplier);
      if (!e) {
        let o = state.purchaseOrders.filter(
          (e: any) => e.createdAt === n,
        ).length;
        e = {
          id: `PUR-${String(state.purchaseOrders.length + 1).padStart(4, `0`)}`,
          batchNo: `PB-${n.replace(/-/g, ``)}-${String(o + 1).padStart(2, `0`)}`,
          supplier: a.supplier,
          createdAt: n,
          lines: [],
          orderedAt: (r == null ? undefined : r.orderedAt) ?? null,
          supplierOrderNo: r ? c(r.orderedAt) : null,
          confirmationFile: r ? `订货确认-${mmdd(r.orderedAt)}.pdf` : null,
          estimatedReady: (r == null ? undefined : r.estimatedReady) ?? null,
          deliveryRoute: `viaCN`,
          revision: 1,
          parentPurchaseOrderId: null,
        };
        i.set(a.supplier, e);
        state.purchaseOrders.push(e);
      }
      e.lines.push({
        requirementId: a.id,
        sku: a.sku,
        qty: a.qty,
      });
      a.purchaseOrderId = e.id;
    }
    return i;
  };
  for (let t = 0; t < 30; t++) {
    let t = 20 + Math.floor(rng() * 50);
    let n = newOrder(t, {
      payment: `paid`,
    });
    let r = addRequirements(n);
    let i = makePos(r, daysAgo(t - 1), {
      orderedAt: daysAgo(t - 2),
      estimatedReady: daysAgo(t - 9),
    });
    let a = daysAgo(Math.max(1, t - 18));
    n.delivery = {
      scheduledDate: a,
      timeSlot: pick(rng, [`morning`, `afternoon`, `evening`]),
      completedDate: a,
    };
    for (let e of r) {
      let n = addPackages(
        e,
        i.get(e.supplier).id,
        `customer`,
        daysAgo(t - 13),
        true,
      ).map((e: any) => e.id);
      addDoneMove(
        `purchaseReceipt`,
        `supplier`,
        `cnWarehouse`,
        n,
        daysAgo(t - 9),
      );
      addDoneMove(`transit`, `cnWarehouse`, `transit`, n, daysAgo(t - 11));
      addDoneMove(`arrivalQc`, `transit`, `hkWarehouse`, n, daysAgo(t - 13));
      addDoneMove(`deliverToCustomer`, `hkWarehouse`, `customer`, n, a);
    }
  }
  for (let t = 0; t < 5; t++) {
    let t = 18 + Math.floor(rng() * 15);
    let r = newOrder(t);
    r.lines.push({
      id: `L${orderSeq}-x`,
      sku: pick(rng, orderable).sku,
      qty: 1,
      price: 0,
    });
    let i = addRequirements(r);
    let a = makePos(i, daysAgo(t - 1), {
      orderedAt: daysAgo(t - 2),
      estimatedReady: daysAgo(t - 9),
    });
    let o = daysAgo(3 + Math.floor(rng() * 5));
    r.delivery = {
      scheduledDate: o,
      timeSlot: `afternoon`,
      completedDate: null,
    };
    i.forEach((e: any, n: any) => {
      let r = n === i.length - 1;
      let s = addPackages(
        e,
        a.get(e.supplier).id,
        r ? `hkWarehouse` : `customer`,
        daysAgo(t - 13),
        true,
      ).map((e: any) => e.id);
      addDoneMove(
        `purchaseReceipt`,
        `supplier`,
        `cnWarehouse`,
        s,
        daysAgo(t - 9),
      );
      addDoneMove(`arrivalQc`, `transit`, `hkWarehouse`, s, daysAgo(t - 13));
      if (!r) {
        addDoneMove(`deliverToCustomer`, `hkWarehouse`, `customer`, s, o);
      }
    });
  }
  for (let t = 0; t < 26; t++) {
    let n = 10 + Math.floor(rng() * 30);
    let r = newOrder(n);
    let i = addRequirements(r);
    let a = makePos(i, daysAgo(n - 1), {
      orderedAt: daysAgo(n - 2),
      estimatedReady: daysAgo(n - 9),
    });
    let o = daysAgo(Math.max(1, n - 12));
    if (t % 2 == 0) {
      r.delivery = {
        scheduledDate: daysAgo(-Math.floor(between(rng, 1, 10))),
        timeSlot: pick(rng, [`morning`, `afternoon`, `evening`, `flexible`]),
        completedDate: null,
      };
    }
    for (let t of i) {
      let r = addPackages(
        t,
        a.get(t.supplier).id,
        rng() < 0.08 ? `showroom` : `hkWarehouse`,
        o,
        true,
      ).map((e: any) => e.id);
      addDoneMove(
        `purchaseReceipt`,
        `supplier`,
        `cnWarehouse`,
        r,
        daysAgo(n - 8),
      );
      addDoneMove(`transit`, `cnWarehouse`, `transit`, r, daysAgo(n - 10));
      addDoneMove(`arrivalQc`, `transit`, `hkWarehouse`, r, o);
    }
  }
  for (let t = 0; t < 24; t++) {
    let t = 6 + Math.floor(rng() * 16);
    let n = addRequirements(newOrder(t));
    let r = daysAgo(t - 1);
    let i = makePos(n, r, {
      orderedAt: r,
      estimatedReady: daysAgo(t - 9),
    });
    for (let t of n) {
      let n = rng();
      let r = n < 0.45 ? `supplier` : n < 0.8 ? `cnWarehouse` : `transit`;
      let a = addPackages(t, i.get(t.supplier).id, r, null, r !== `supplier`);
      if (r !== `supplier`) {
        let t = daysAgo(1 + Math.floor(rng() * 5));
        let n = l(t);
        let i = courier();
        a.forEach((e: any) => {
          e.deliveryNoteNo = n;
          e.logisticsNo = i;
        });
        addDoneMove(
          `purchaseReceipt`,
          `supplier`,
          `cnWarehouse`,
          a.map((e: any) => e.id),
          t,
        );
        if (r === `transit`) {
          addDoneMove(
            `transit`,
            `cnWarehouse`,
            `transit`,
            a.map((e: any) => e.id),
            daysAgo(0),
          );
        }
      }
    }
  }
  for (let t = 0; t < 8; t++)
    makePos(
      addRequirements(newOrder(3 + Math.floor(rng() * 4))),
      daysAgo(3),
      null,
    );
  for (let t = 0; t < 16; t++) addRequirements(newOrder(Math.floor(rng() * 6)));
  for (let n of stockedProducts) {
    let r = (r: any, a: any) => {
      for (let o = 0; o < r; o++) {
        let r = daysAgo(5 + Math.floor(rng() * 120));
        let s: any[] = [];
        n.packageStems.forEach((e: any) => {
          let c: any = {
            id: `PKG-${String(pkgSeq++).padStart(5, `0`)}`,
            stem: e,
            unitId: `OPEN-${n.sku}-${a}-${o + 1}`,
            procurementReference: null,
            allocationRequirementId: null,
            allocationPurpose: a === `showroom` ? `display` : `restock`,
            packageCode: `${e}-S${String(o + 1).padStart(3, `0`)}`,
            sku: n.sku,
            orderNo: null,
            lineId: null,
            purchaseOrderId: null,
            location: a,
            arrivedAt: r,
            deliveryNoteNo: null,
            logisticsNo: null,
          };
          state.packages.push(c);
          s.push(c.id);
        });
        addDoneMove(`openingBalance`, `supplier`, a, s, r);
      }
    };
    r(n.stock.main, `hkWarehouse`);
    r(n.stock.shop, `showroom`);
    if (n.stock.inTransit > 0) {
      r(Math.min(2, n.stock.inTransit), `cnWarehouse`);
    }
  }
  let g = (e: any, t: any) => `${e}T${t}:00+08:00`;
  let ACTORS: any = {
    purchaseReceipt: `u-alex`,
    transit: `u-alex`,
    arrivalQc: `u-alex`,
    deliverToCustomer: `u-hang`,
    openingBalance: `u-alex`,
  };
  let TIMES: any = {
    purchaseReceipt: `11:20`,
    transit: `09:05`,
    arrivalQc: `15:40`,
    deliverToCustomer: `14:32`,
  };
  for (let e of state.moves) {
    if (e.type === `openingBalance`) continue;
    let n = new Set<any>(e.packageUnitIds);
    let r: any[] = [
      ...new Set(
        state.packages
          .filter((e: any) => n.has(e.id))
          .map((e: any) => e.orderNo)
          .filter((e: any) => !!e),
      ),
    ];
    for (let n of r) {
      let r = state.packages.filter((e: any) => e.orderNo === n);
      let i = state.moves.filter(
        (t: any) => t.doneDate <= e.doneDate && t.id <= e.id,
      );
      let a = new Map<any, any>(r.map((e: any) => [e.id, `supplier`]));
      for (let e of i)
        for (let t of e.packageUnitIds)
          if (a.has(t)) {
            a.set(t, e.to);
          }
      let o = [...a.values()].filter((e: any) => IN_HK.includes(e)).length;
      let s = [...a.values()].filter((e: any) => e === `customer`).length;
      let c =
        e.type === `deliverToCustomer`
          ? s === r.length
            ? `delivered`
            : `partial`
          : e.type === `arrivalQc`
            ? o === r.length
              ? `readyToSchedule`
              : null
            : e.type === `transit`
              ? `transit`
              : `shipped`;
      state.moveConsequences.push({
        moveId: e.id,
        ts: g(e.doneDate, TIMES[e.type] ?? `10:00`),
        actorId: ACTORS[e.type] ?? `u-alex`,
        orderNo: n,
        inHk: e.type === `deliverToCustomer` ? s : o,
        total: r.length,
        consequence: c,
      });
    }
  }
  let auditSeq = 1;
  let commentSeq = 1;
  let actSeq = 1;
  let audit = (e: any, n: any, r: any, i: any) =>
    state.audit.push({
      id: `AL-${String(auditSeq++).padStart(5, `0`)}`,
      ts: e,
      userId: n,
      model: `order`,
      recordId: r,
      payload: i,
    });
  let comment = (e: any, n: any, r: any, i: any, a: any = []) =>
    state.comments.push({
      id: `CM-${String(commentSeq++).padStart(5, `0`)}`,
      model: `order`,
      recordId: r,
      authorId: n,
      body: i,
      mentions: a,
      attachments: [],
      createdAt: e,
      editedAt: null,
      deletedAt: null,
    });
  for (let e of state.orders) {
    let n = e.lines.reduce((e: any, t: any) => e + t.qty * t.price, 0);
    audit(g(e.createdAt, `10:02`), `u-system`, e.orderNo, {
      event: `shopifySync`,
      detail: `#${e.orderNo.slice(2)} · HK$${n.toLocaleString(`en-HK`)}`,
    });
    if (e.payment !== `unpaid`) {
      audit(g(e.createdAt, `10:02`), `u-system`, e.orderNo, {
        event: `shopifySync`,
        detail: `deposit`,
        field: `payment`,
        from: `unpaid`,
        to: `deposit`,
      });
    }
    let r = state.packages.filter((t: any) => t.orderNo === e.orderNo);
    if (
      r.length > 0 &&
      r.every((e: any) => IN_HK.includes(e.location)) &&
      !e.delivery.scheduledDate
    ) {
      let n = r.map((e: any) => e.arrivedAt).sort()[0];
      let i = daysAgo(
        Math.max(
          -2,
          Math.min(6, Math.floor((TODAY_MS - Date.parse(n)) / DAY) - 2),
        ),
      );
      state.activities.push({
        id: `ACT-${String(actSeq++).padStart(4, `0`)}`,
        kind: `scheduleDelivery`,
        orderId: e.orderNo,
        dueDate: i,
        owner: `Alex`,
        feedback: null,
        note: ``,
        doneAt: null,
        nextActivityId: null,
        seq: 1,
      });
    } else if (e.delivery.scheduledDate) {
      let n = daysAgo(
        Math.max(
          1,
          Math.floor((TODAY_MS - Date.parse(e.delivery.scheduledDate)) / DAY) +
            3,
        ),
      );
      state.activities.push({
        id: `ACT-${String(actSeq++).padStart(4, `0`)}`,
        kind: `scheduleDelivery`,
        orderId: e.orderNo,
        dueDate: n,
        owner: `Alex`,
        feedback: `scheduled`,
        note: ``,
        doneAt: n,
        nextActivityId: null,
        seq: 1,
      });
    }
  }
  [...state.orders]
    .sort((e: any, t: any) => t.createdAt.localeCompare(e.createdAt))
    .slice(0, 8)
    .forEach((e: any, t: any) => {
      let n = e.createdAt;
      audit(g(n, `11:40`), `u-wilson`, e.orderNo, {
        event: `fieldChange`,
        field: `customerRequestedDate`,
        from: daysAgo(-6),
        to: daysAgo(-19),
      });
      audit(g(n, `11:42`), `u-wilson`, e.orderNo, {
        event: `fieldChange`,
        field: `customerRequestedNote`,
        from: ``,
        to: `星期六日先收`,
      });
      audit(g(n, `11:44`), `u-wilson`, e.orderNo, {
        event: `fieldChange`,
        field: `channel`,
        from: `shopify`,
        to: `whatsapp`,
      });
      comment(
        g(n, `11:52`),
        `u-wilson`,
        e.orderNo,
        `@Alex 客話可能改地址，約之前問清楚`,
        [`u-alex`],
      );
      audit(
        g(
          daysAgo(
            Math.max(0, Math.floor((TODAY_MS - Date.parse(n)) / DAY) - 1),
          ),
          `16:10`,
        ),
        `u-manman`,
        e.orderNo,
        {
          event: `fieldChange`,
          field: `costPrice`,
          from: `¥1,559.83`,
          to: `¥1,612.00`,
          fieldClass: `COST`,
        },
      );
      if (t % 2 == 0) {
        audit(g(n, `17:25`), `u-manman`, e.orderNo, {
          event: `attachment`,
          fileName: `FPS-入數截圖.jpg`,
          fieldClass: `FINANCE_DETAIL`,
        });
      }
      if (t % 3 == 0) {
        audit(g(daysAgo(0), `09:30`), `u-system`, e.orderNo, {
          event: `shopifySync`,
          detail: `amount`,
          field: `amount`,
          from: `HK$9,240`,
          to: `HK$9,560`,
        });
      }
      if (t === 1) {
        audit(g(daysAgo(0), `10:15`), `u-ocean`, e.orderNo, {
          event: `approval`,
          approvalType: `writeOff`,
          decision: `approved`,
          detail: `1`,
        });
      }
      if (t === 2) {
        comment(
          g(daysAgo(0), `08:55`),
          `u-alex`,
          e.orderNo,
          `今日先 call 客確認上樓梯闊度，下午覆。`,
        );
      }
    });
  let toSchedule = state.activities.filter((e: any) => !e.doneAt).slice(0, 3);
  for (let e of toSchedule) {
    let n: any = {
      ...e,
      id: `${e.id}-p`,
      feedback: `unreachable`,
      doneAt: daysAgo(1),
      nextActivityId: e.id,
      dueDate: daysAgo(1),
    };
    state.activities.push(n);
    e.seq = 2;
  }
  state.seq = state.purchaseOrders.length + 1;
  return state;
}

/* ---------------------------------------------------------------- store */

let opsState: OpsState = moriSeedReceiving(buildFixtures());
const listeners = new Set<() => void>();
function commit(next: any) {
  const transfers = next.ownerTransfers ?? {};
  const packages = next.packages.map((p: Pkg) => {
    const ex = p.receivingException;
    const transfer = ex?.status === 'open' ? transfers[ex.owner] : null;
    return transfer ? { ...p, receivingException: { ...ex, owner: transfer.to, updatedAt: transfer.at } } : p;
  });
  const reconciled = moriReconcileTasks({ ...next, packages });
  opsState = { ...reconciled, activities: reconciled.activities.map((a: Activity) => {
    const transfer = !a.doneAt ? transfers[a.owner] : null;
    return transfer ? { ...a, owner: transfer.to, history: [...(a.history ?? []), { at: transfer.at, action: 'reassigned', fromOwner: a.owner, toOwner: transfer.to, actor: transfer.actor, reason: 'account_inactive' }] } : a;
  }) };
  listeners.forEach((e: any) => e());
}
export function useOps(): OpsState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => opsState,
    () => opsState,
  );
}

/** 測試用：重置到初始 fixture */
export function _resetOps() {
  commit(buildFixtures());
}
export const getOps = () => opsState;

/* -------------------------------------------------------------- actions */

/** B-01：揀咗供應商同需求，出一份採購表（draft PurchaseOrder） */
export function createPurchaseOrder(
  supplier: string,
  requirementIds: string[],
): PurchaseOrder | null {
  let ids = new Set<any>(requirementIds);
  let lines = opsState.requirements
    .filter(
      (t: any) =>
        ids.has(t.id) &&
        t.supplier === supplier &&
        t.purchaseOrderId === null &&
        !t.cancelledAt &&
        !t.supersededAt,
    )
    .map((e: any) => ({
      requirementId: e.id,
      sku: e.sku,
      qty: e.qty,
    }));
  let sameDay = opsState.purchaseOrders.filter(
    (e: any) => e.createdAt === DEMO_TODAY,
  ).length;
  let a: any = {
    id: `PUR-${String(opsState.seq).padStart(4, `0`)}`,
    batchNo: `PB-${DEMO_TODAY.replace(/-/g, ``)}-${String(sameDay + 1).padStart(2, `0`)}`,
    supplier,
    createdAt: DEMO_TODAY,
    lines,
    orderedAt: null,
    supplierOrderNo: null,
    confirmationFile: null,
    estimatedReady: null,
    deliveryRoute: `viaCN`,
    revision: 1,
    parentPurchaseOrderId: null,
  };
  let lineIds = new Set<any>(lines.map((e: any) => e.requirementId));
  commit({
    ...opsState,
    seq: opsState.seq + 1,
    purchaseOrders: [...opsState.purchaseOrders, a],
    requirements: opsState.requirements.map((e: any) =>
      lineIds.has(e.id)
        ? {
            ...e,
            purchaseOrderId: a.id,
          }
        : e,
    ),
  });
  return a;
}

/** 備貨表揀咗款就出採購需求（purpose = 存貨，§2.1）。冇客人。 */
export function createStockRequirements(items: any) {
  let seq = 0;
  for (let n of items) {
    let e = moriCreateManualRequirement({
      purpose: `restock`,
      sku: n.sku,
      qty: n.qty,
    });
    if (e) {
      seq += 1;
    }
  }
  return seq;
}
export const isStockRequirement = (r: Requirement) => r.customer === null;

/**
 * §2.3 SupplierConfirmation：上載訂貨確認。寫 orderedAt / supplierOrderNo / 附件；
 * 「已訂」由此推導。同時為每行生成包件（喺 supplier 位置，**未派碼**）。
 * TODO(Q12/Q18)：文件形式同包件邊個入未定；呢度假設落單即建包件、編碼等發貨表對到先派。
 */
export function confirmOrdered(id: any, values: any) {
  const po = opsState.purchaseOrders.find((p: any) => p.id === id);
  if (!po || po.orderedAt) return null;
  const selected = new Map<any, any>(
    (values.lineConfirmations || []).map((l: any) => [l.requirementId, l]),
  );
  if (!selected.size) throw Error(`請至少核對一行；確認量可為 0。`);
  for (const [id, l] of selected) {
    const line = po.lines.find((x: any) => x.requirementId === id);
    if (
      !line ||
      !Number.isInteger(l.confirmedQty) ||
      l.confirmedQty < 0 ||
      l.confirmedQty > line.qty ||
      !Number.isFinite(l.unitCost) ||
      l.unitCost < 0
    )
      throw Error(`確認量或採購價無效。`);
  }
  if ((values.lineConfirmations || []).length !== selected.size)
    throw Error(`同一需求不可重複確認。`);
  if (
    values.matchReview?.unmatched?.some(
      (r: any) => !r.resolved && (!r.followupReason?.trim() || !r.owner),
    )
  )
    throw Error(`未配對行需保留跟進原因及負責人。`);
  const actor = values.actor || `u-alex`;
  const at = nowIso();
  const requirements = opsState.requirements.map((r: any) => ({
    ...r,
  }));
  const packages: any[] = [...opsState.packages];
  const activities: any[] = [...opsState.activities];
  const date = DEMO_TODAY.replace(/-/g, ``);
  let next =
    opsState.requirements
      .filter((r: any) => r.id.startsWith(`PR-${date}-`))
      .reduce(
        (n: any, r: any) => Math.max(n, Number(r.id.split(`-`).at(-1)) || 0),
        0,
      ) + 1;
  const lines = po.lines.map((line: any) => {
    const input = selected.get(line.requirementId);
    const qty = input ? input.confirmedQty : 0;
    const req = requirements.find((r: any) => r.id === line.requirementId);
    const remaining = line.qty - qty;
    let residual = null;
    if (remaining > 0 && req) {
      const replenishment =
        req.replenish && [`useHKStock`, `useCNStock`].includes(req.sourcing);
      residual = {
        ...req,
        id: `PR-${date}-${String(next++).padStart(3, `0`)}`,
        qty: remaining,
        originalRequestedQty: undefined,
        confirmedQty: undefined,
        remainingRequirementId: undefined,
        purchaseOrderId: null,
        createdAt: DEMO_TODAY,
        parentRequirementId: req.id,
        originPurchaseOrderId: po.id,
        originBatchNo: po.batchNo,
        confirmationReason: input ? `部分確認餘量` : `未核對／未確認`,
        cancelledAt: null,
        supersededAt: null,
        sourcing: `orderNew`,
        replenish: false,
      };
      if (replenishment) {
        residual.customer = null;
        residual.purpose = `restock`;
        residual.orderNo = `補貨${req.orderNo}`;
        residual.lineId = null;
        residual.linkedOrderNo = req.orderNo;
      }
      requirements.push(residual);
    }
    if (req) {
      req.originalRequestedQty = line.qty;
      req.qty = qty;
      req.confirmedQty = qty;
      req.remainingRequirementId = residual?.id || null;
      req.confirmationAt = at;
      req.confirmationActor = actor;
    }
    if (qty > 0 && req) {
      const p = productOf(line.sku);
      const replenish =
        req.replenish && [`useHKStock`, `useCNStock`].includes(req.sourcing);
      for (let q = 0; q < qty; q++)
        for (const stem of p!.packageStems)
          packages.push({
            id: `PKG-${String(packages.length + 1).padStart(5, `0`)}`,
            stem,
            unitId: `${po.id}-${req.id}-U${q + 1}`,
            procurementRequirementId: req.id,
            procurementReference: replenish
              ? `補貨${req.orderNo}`
              : req.orderNo,
            allocationRequirementId:
              !replenish && moriPurpose(req) === `customerOrder`
                ? req.id
                : null,
            packageCode: null,
            sku: line.sku,
            orderNo:
              !replenish && moriPurpose(req) === `customerOrder`
                ? req.orderNo
                : null,
            lineId:
              !replenish && moriPurpose(req) === `customerOrder`
                ? req.lineId
                : null,
            purchaseOrderId: po.id,
            requirementId: req.id,
            location: `supplier`,
            arrivedAt: null,
            deliveryNoteNo: null,
            logisticsNo: null,
            allocationPurpose: replenish ? `restock` : moriPurpose(req),
            linkedOrderNo:
              req.linkedOrderNo ?? (replenish ? req.orderNo : null),
            allocationHistory: [],
          });
    }
    return {
      ...line,
      confirmedQty: qty,
      unitCost: input ? input.unitCost : null,
      reviewed: !!input,
      remainingQty: remaining,
      remainingRequirementId: residual?.id || null,
      confirmationSource: input?.confirmationSource || `manual`,
      supplierReference:
        input?.supplierReference || values.supplierOrderNo || po.batchNo,
    };
  });
  const review = values.matchReview || null;
  for (const row of review?.unmatched || []) {
    if (row.resolved) continue;
    activities.push({
      id: `CONF-${po.id}-${row.rowId}`,
      kind: `procurementException`,
      taskType: `procurementException`,
      orderId: opsState.orders.some((o: any) => o.orderNo === row.orderNo)
        ? row.orderNo
        : null,
      purchaseOrderId: po.id,
      sku: row.sku,
      description: `${po.batchNo} · ${row.label} · ${row.followupReason || row.reason}`,
      dueDate: row.followupDate || DEMO_TODAY,
      owner: row.owner || `Alex`,
      status: `open`,
      doneAt: null,
      feedback: null,
      note: row.followupReason || row.reason,
      nextActivityId: null,
      source: `workflow`,
      history: [],
      contactAttempts: [],
    });
  }
  const confirmationState = lines.every((l: any) => l.confirmedQty === l.qty)
    ? `confirmed`
    : lines.some((l: any) => l.confirmedQty > 0)
      ? `partial`
      : `unconfirmed`;
  const saved: any = {
    ...po,
    lines,
    orderedAt: DEMO_TODAY,
    confirmedAt: at,
    confirmationActor: actor,
    confirmationState,
    supplierOrderNo: values.supplierOrderNo || po.batchNo,
    confirmationFile: values.confirmationFile || null,
    estimatedReady: values.estimatedReady || null,
    deliveryRoute: values.deliveryRoute || `viaCN`,
    matchReview: review,
  };
  const audit: any = {
    id: `AL-${String(opsState.audit.length + 1).padStart(5, `0`)}`,
    ts: at,
    userId: actor,
    model: `purchaseOrder`,
    recordId: po.id,
    payload: {
      event: `supplierConfirmation`,
      batchNo: po.batchNo,
      sourceFile: saved.confirmationFile,
      lines: lines.map((l: any) => ({
        requirementId: l.requirementId,
        requestedQty: l.qty,
        confirmedQty: l.confirmedQty,
        unitCost: l.unitCost,
        remainingRequirementId: l.remainingRequirementId,
      })),
      unmatched: review?.unmatched || [],
    },
  };
  commit({
    ...opsState,
    requirements,
    packages,
    activities,
    purchaseOrders: opsState.purchaseOrders.map((p: any) =>
      p.id === id ? saved : p,
    ),
    audit: [...opsState.audit, audit],
  });
  return saved;
}

/**
 * INVARIANT 1：呢個係全個 store 唯一寫 Pkg.location 嘅地方，而且只接受一張
 * assigned move。Move 一 done 就唔會再改（INVARIANT 3）。
 */
function completeMove(e: any, move: any, doneDate: any) {
  if (move.state !== `assigned`)
    throw Error(`only an assigned move can be completed`);
  let ids = new Set<any>(move.packageUnitIds);
  let done: any = {
    ...move,
    state: `done`,
    doneDate,
  };
  return {
    ...e,
    moves: [...e.moves, done],
    packages: e.packages.map((e: any) =>
      ids.has(e.id)
        ? {
            ...e,
            location: move.to,
            arrivedAt: [
              `cnWarehouse`,
              `transit`,
              `hkWarehouse`,
              `showroom`,
            ].includes(move.to)
              ? doneDate
              : e.arrivedAt,
          }
        : e,
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
  const result: ShipmentResult = {
    matched: [],
    unmatched: [],
  };
  const taken = new Set<any>();
  for (const row of rows) {
    if (!row.supplierOrderNo && !row.supplierCode && !row.supplierName)
      continue;
    const po = opsState.purchaseOrders.find(
      (p) =>
        p.orderedAt &&
        p.supplierOrderNo &&
        norm(p.supplierOrderNo) === norm(row.supplierOrderNo),
    );
    if (!po) {
      result.unmatched.push({
        row,
        reason: 'orderNotFound',
      });
      continue;
    }
    const code = norm(row.supplierCode);
    const name = row.supplierName.trim();
    const line = po.lines.find((l) => {
      const p = bySku.get(l.sku);
      if (!p) return false;
      if (code && norm(p.supplierCode) === code) return true;
      return (
        !code &&
        name &&
        (p.supplierName === name || p.supplierName.includes(name))
      );
    });
    if (!line) {
      result.unmatched.push({
        row,
        reason: 'modelNotFound',
      });
      continue;
    }
    const product = bySku.get(line.sku)!;
    const per = packagesPerUnit(product);
    const pending = opsState.packages.filter(
      (k) =>
        k.purchaseOrderId === po.id &&
        k.sku === line.sku &&
        k.location === 'supplier' &&
        !taken.has(k.id),
    );
    if (pending.length === 0) {
      result.unmatched.push({
        row,
        reason: 'alreadyShipped',
      });
      continue;
    }
    const wantUnits = Math.max(1, Math.floor(row.qty || 1));
    const units = Math.min(wantUnits, Math.floor(pending.length / per));
    if (units === 0) {
      result.unmatched.push({
        row,
        reason: 'qtyExceeds',
      });
      continue;
    }
    const packages = pending.slice(0, units * per);
    packages.forEach((k) => taken.add(k.id));
    result.matched.push({
      row,
      purchaseOrder: po,
      product,
      packages,
      short: wantUnits - units,
    });
  }
  return result;
}

/**
 * 套用發貨表。每張發貨單開一張 採購收貨 move（供應商 → 大陸倉）assigned → done，
 * 同時派我哋嘅包件編碼。燈自動著係因為位置變咗，唔係改咗狀態值。
 */
export function applyShipment(result: any) {
  for (const m of result.matched)
    for (const p of m.packages)
      if (
        opsState.packages.find((x: any) => x.id === p.id)?.location !==
        `supplier`
      )
        throw Error(`發貨資料已更新，請重新匯入核對。`);
  let t = opsState;
  let moveSeq = opsState.moves.length + 1;
  let byNote = new Map<any, any>();
  for (let t of result.matched) {
    let e = `${t.row.deliveryNoteNo}|${t.row.shippedAt}|${t.purchaseOrder.deliveryRoute ?? `viaCN`}`;
    byNote.set(e, [...(byNote.get(e) ?? []), t]);
  }
  let count = 0;
  for (let e of byNote.values()) {
    let r = new Map<any, any>();
    for (let t of e) {
      var z;
      let e =
        ((z = t.packages[0]) == null || (z = z.orderNo) == null
          ? undefined
          : z.slice(2)) ?? `S`;
      let n = t.packages.length / packagesPerUnit(t.product) > 1;
      t.packages.forEach((i: any, a: any) => {
        let o = Math.floor(a / packagesPerUnit(t.product)) + 1;
        r.set(i.id, {
          code: `${i.stem}-${e}${n ? `-${o}` : ``}`,
          note: t.row.deliveryNoteNo,
          lg: t.row.logisticsNo,
        });
      });
    }
    let a = e[0].purchaseOrder.deliveryRoute ?? `viaCN`;
    let o =
      a === `directCustomer`
        ? `customerTransit`
        : a === `directHK`
          ? `transit`
          : `supplierTransit`;
    let s: any = {
      id: `SM-${String(moveSeq++).padStart(5, `0`)}`,
      type: `purchaseShipment`,
      state: `assigned`,
      from: `supplier`,
      to: o,
      scheduledDate: e[0].row.shippedAt,
      doneDate: null,
      packageUnitIds: [...r.keys()],
    };
    t = completeMove(t, s, e[0].row.shippedAt);
    t = {
      ...t,
      packages: t.packages.map((e: any) => {
        let t = r.get(e.id);
        return t
          ? {
              ...e,
              packageCode: e.packageCode ?? t.code,
              shippedAt: s.scheduledDate,
              deliveryNoteNo: t.note,
              logisticsNo: t.lg || null,
            }
          : e;
      }),
    };
    count += r.size;
  }
  commit(t);
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
  const pending = opsState.packages.filter(
    (k) => k.location === 'supplier' && k.purchaseOrderId,
  );
  const seen = new Set<any>();
  for (const k of pending) {
    const key = `${k.purchaseOrderId}|${k.sku}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const po = opsState.purchaseOrders.find((p) => p.id === k.purchaseOrderId)!;
    const p = bySku.get(k.sku)!;
    const units =
      pending.filter((x) => x.purchaseOrderId === po.id && x.sku === k.sku)
        .length / packagesPerUnit(p);
    rows.push({
      supplierOrderNo: po.supplierOrderNo!,
      supplierCode: p.supplierCode,
      supplierName: p.supplierName,
      qty: Math.max(1, Math.floor(units)),
      shippedAt,
      deliveryNoteNo: note,
      logisticsNo: lg,
    });
    if (rows.length >= limit) break;
  }
  const first = rows[0];
  if (first) {
    // 第一行廠方報多 3 件（我哋只落咗 first.qty）→ 對到但標「少發 / 多報」；再夾兩行對唔到
    rows[0] = {
      ...first,
      qty: first.qty + 3,
    };
    rows.push({
      ...first,
      supplierOrderNo: 'HB2026090100000000',
    });
    rows.push({
      ...first,
      supplierCode: 'Y99Z99999',
      supplierName: 'Y99Z99 不存在的型号',
    });
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
  const header = lines[0]
    .split(sep)
    .map((h) => h.trim().replace(/^"|"$/g, '').toLowerCase());
  const find = (...names: string[]) =>
    header.findIndex((h) => names.some((n) => h.includes(n)));
  const hbIdx = find(
    '订单号',
    '訂單號',
    '订货单',
    'hb',
    'supplierorder',
    'order',
  );
  const codeIdx = find('型号', '型號', 'sku', 'model', 'code');
  const nameIdx = find('名称', '名稱', '品名', 'name');
  const qtyIdx = find('数量', '數量', 'qty', 'quantity');
  const dateIdx = find(
    '发货日期',
    '發貨日期',
    '发货',
    '發貨',
    'shipped',
    'date',
  );
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

export function addComment(
  model: PeekModel,
  recordId: string,
  authorId: string,
  body: string,
  mentions: string[],
): Comment {
  const c: Comment = {
    id: `CM-${String(opsState.comments.length + 1).padStart(5, '0')}`,
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
  commit({
    ...opsState,
    comments: [...opsState.comments, c],
  });
  return c;
}

/** 摘要欄 inline edit：只改可改欄位，每個欄位一條 AuditLog（時間線會按 5 分鐘合併） */
export function updateOrder(
  orderNo: string,
  patch: Partial<
    Pick<
      SalesOrder,
      'customerRequestedDate' | 'customerRequestedNote' | 'channel' | 'assignee'
    >
  >,
  actorId: string,
) {
  const o = opsState.orders.find((x) => x.orderNo === orderNo);
  if (!o) return;
  const entries: AuditEntry[] = [];
  let seq = opsState.audit.length + 1;
  for (const [field, to] of Object.entries(patch) as [
    keyof typeof patch,
    string | null,
  ][]) {
    const from = o[field] ?? '';
    if ((to ?? '') === from) continue;
    entries.push({
      id: `AL-${String(seq++).padStart(5, '0')}`,
      ts: nowIso(),
      userId: actorId,
      model: 'order',
      recordId: orderNo,
      payload: {
        event: 'fieldChange',
        field,
        from: String(from),
        to: String(to ?? ''),
      },
    });
  }
  if (entries.length === 0) return;
  commit({
    ...opsState,
    orders: opsState.orders.map((x) =>
      x.orderNo === orderNo
        ? {
            ...x,
            ...patch,
          }
        : x,
    ),
    audit: [...opsState.audit, ...entries],
  });
}

/** 待辦條「完成」：關閉 Activity（feedback = scheduled 由約期動作寫；呢度係一般完成） */
export function completeActivity(
  id: string,
  feedback: Activity['feedback'] = null,
) {
  commit({
    ...opsState,
    activities: opsState.activities.map((a) =>
      a.id === id
        ? {
            ...a,
            doneAt: DEMO_TODAY,
            feedback,
          }
        : a,
    ),
  });
}

/** 待辦條「改期」：關舊開新，鏈式接續（§2.5 nextActivityId），舊嘅唔改 */
export function rescheduleActivity(
  e: any,
  t: any,
  note: any,
  feedback: any = `customerPostponed`,
) {
  return moriRescheduleActivity(e, t, note, feedback);
}

/** 「已約」：寫 scheduledDate（送貨單欄位），關閉待辦 —— 狀態由推導轉「已約」 */
export function scheduleOrder(
  orderNo: any,
  date: any,
  slot: any,
  actorId: any,
) {
  let i = opsState.orders.find((t: any) => t.orderNo === orderNo);
  if (!i) return;
  if (
    moriReceiptBlocked(i) ||
    lineStatus(packagesOfOrder(opsState, orderNo)) !== `readyToSchedule`
  )
    return false;
  let entry: any = {
    id: `AL-${String(opsState.audit.length + 1).padStart(5, `0`)}`,
    ts: nowIso(),
    userId: actorId,
    model: `order`,
    recordId: orderNo,
    payload: {
      event: `fieldChange`,
      field: `scheduledDate`,
      from: i.delivery.scheduledDate ?? ``,
      to: `${date} ${slot}`,
    },
  };
  commit({
    ...opsState,
    orders: opsState.orders.map((r: any) =>
      r.orderNo === orderNo
        ? {
            ...r,
            delivery: {
              ...r.delivery,
              scheduledDate: date,
              timeSlot: slot,
            },
          }
        : r,
    ),
    activities: opsState.activities.map((t: any) =>
      t.orderId === orderNo &&
      (t.taskType || t.kind) === `scheduleDelivery` &&
      !t.doneAt
        ? {
            ...t,
            doneAt: DEMO_TODAY,
            status: `completed`,
            feedback: `scheduled`,
          }
        : t,
    ),
    audit: [...opsState.audit, entry],
  });
}

/** 示範時鐘：今日 + 而家嘅香港時分（DEMO_TODAY 固定，時間跟真時鐘，UTC+8） */
export const nowIso = () =>
  `${DEMO_TODAY}T${new Date(Date.now() + 8 * 3_600_000).toISOString().slice(11, 19)}+08:00`;

/* -------------------------------------------------------------- derived */

export const requirementStatus = (e: any, t: any) => {
  if (e.cancelledAt) return `cancelled`;
  if (e.supersededAt) return `superseded`;
  if (e.confirmationAt && e.confirmedQty === 0) return `confirmationDeferred`;
  if (e.remainingRequirementId) return `partialConfirmed`;
  if (e.sourcing === `useHKStock` || e.sourcing === `useCNStock`) {
    if (!e.replenish) return `stockAssigned`;
    if (!e.purchaseOrderId) return `open`;
    let n = t.find((t: any) => t.id === e.purchaseOrderId);
    return n != null && n.orderedAt ? `ordered` : `inPurchaseOrder`;
  }
  if (!e.purchaseOrderId) return `open`;
  let n = t.find((t: any) => t.id === e.purchaseOrderId);
  return n != null && n.orderedAt ? `ordered` : `inPurchaseOrder`;
};

/** 一張訂單嘅所有包件（§4 推導用） */
export const packagesOfOrder = (s: OpsState, orderNo: string) =>
  s.packages.filter((k) => k.orderNo === orderNo);
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
export function waitingGroups(e: OpsState): WaitingGroup[] {
  let poById = new Map<any, any>(e.purchaseOrders.map((e: any) => [e.id, e]));
  let orderByNo = new Map<any, any>(e.orders.map((e: any) => [e.orderNo, e]));
  let groups = new Map<any, any>();
  for (let i of e.packages) {
    let ref = moriProcurementRef(i);
    if (
      !ref ||
      !i.purchaseOrderId ||
      (!UPSTREAM.includes(i.location) && !moriOpenReceiptException(i))
    )
      continue;
    let e = poById.get(i.purchaseOrderId);
    let a = orderByNo.get(ref);
    let o = a
      ? a.customer
      : {
          alias:
            ref.startsWith(`備貨`) || ref.startsWith(`補貨`)
              ? `備貨`
              : ref.startsWith(`陳列`)
                ? `陳列`
                : ref.startsWith(`售後`)
                  ? `售後`
                  : `內部需求`,
          district: ``,
        };
    if (!(e != null && e.orderedAt)) continue;
    let s = `${ref}|${i.purchaseOrderId}`;
    let c = groups.get(s);
    if (!c) {
      {
        c = {
          key: s,
          orderNo: ref,
          customer: o,
          purchaseOrder: e,
          lines: [],
          total: 0,
          shipped: 0,
          orderedAt: e.orderedAt,
          estimatedReady: e.estimatedReady,
          allShipped: false,
        };
        groups.set(s, c);
      }
    }
    let l = c.lines.find((e: any) => e.sku === i.sku);
    if (!l) {
      {
        l = {
          sku: i.sku,
          qty: 0,
          packages: [],
          shipped: 0,
        };
        c.lines.push(l);
      }
    }
    l.packages.push(i);
    if (i.location !== `supplier`) {
      {
        l.shipped += 1;
        c.shipped += 1;
      }
    }
    c.total += 1;
  }
  for (let e of groups.values()) {
    e.allShipped = e.shipped === e.total;
    for (let t of e.lines) {
      let e = bySku.get(t.sku);
      t.qty = e ? t.packages.length / packagesPerUnit(e) : t.packages.length;
    }
  }
  return [...groups.values()].sort((e: any, t: any) =>
    e.orderedAt.localeCompare(t.orderedAt),
  );
}

/** 庫存頁 = 而家喺香港嘅包件 */
export const hkPackages = (e: OpsState) =>
  e.packages.filter((e: any) =>
    [`cnWarehouse`, `transit`, `hkWarehouse`, `showroom`].includes(e.location),
  );
function moriNextRequirementId() {
  let e = DEMO_TODAY.replace(/-/g, ``);
  let t =
    opsState.requirements
      .filter((t: any) => String(t.id).startsWith(`PR-${e}-`))
      .reduce(
        (e: any, t: any) =>
          Math.max(
            e,
            Number((String(t.id).match(/-(\d+)$/) || [0, 0])[1]) || 0,
          ),
        0,
      ) + 1;
  return `PR-${e}-${String(t).padStart(3, `0`)}`;
}
function moriPurpose(e: any) {
  return e.purpose ?? (e.customer === null ? `restock` : `customerOrder`);
}
function moriInternalPrefix(e: any) {
  return e === `display`
    ? `陳列`
    : e === `aftersales`
      ? `售後`
      : e === `other`
        ? `內部`
        : `備貨`;
}
function moriCreateManualRequirement(e: any) {
  let t = bySku.get(e.sku);
  if (!t || Number(e.qty) <= 0) return null;
  let n = e.purpose ?? `restock`;
  let r = moriInternalPrefix(n);
  let i =
    opsState.requirements.filter(
      (e: any) =>
        e.createdAt === DEMO_TODAY &&
        moriPurpose(e) === n &&
        e.customer === null,
    ).length + 1;
  let a: any = {
    id: moriNextRequirementId(),
    orderNo: `${r}${mmdd(DEMO_TODAY)}-${String(i).padStart(2, `0`)}`,
    lineId: null,
    customer: null,
    sku: e.sku,
    qty: Math.max(1, Number(e.qty) || 1),
    supplier: t.supplier,
    sourcing: `orderNew`,
    createdAt: DEMO_TODAY,
    purchaseOrderId: null,
    purpose: n,
    linkedOrderNo: (e.linkedOrderNo ?? ``).trim() || null,
    note: (e.note ?? ``).trim(),
    manual: true,
  };
  commit({
    ...opsState,
    requirements: [...opsState.requirements, a],
  });
  return a;
}
function moriCancelRequirement(e: any) {
  let t = opsState.requirements.find((t: any) => t.id === e);
  return (
    !(!t || t.purchaseOrderId) &&
    (commit({
      ...opsState,
      requirements: opsState.requirements.map((t: any) =>
        t.id === e
          ? {
              ...t,
              cancelledAt: DEMO_TODAY,
            }
          : t,
      ),
    }),
    true)
  );
}
function moriSupersedeRequirement(e: any, t: any) {
  let n = opsState.requirements.find((t: any) => t.id === e);
  let r = bySku.get(t);
  if (!n || !r || t === n.sku) return null;
  let i: any = {
    ...n,
    id: moriNextRequirementId(),
    sku: t,
    supplier: r.supplier,
    sourcing: `orderNew`,
    purchaseOrderId: null,
    replenish: false,
    createdAt: DEMO_TODAY,
    supersedesRequirementId: n.id,
    cancelledAt: null,
    supersededAt: null,
  };
  let a = opsState.packages.map((t: any) =>
    t.allocationRequirementId === e
      ? {
          ...t,
          orderNo: null,
          lineId: null,
          allocationRequirementId: null,
          allocationPurpose: `restock`,
          allocationHistory: [
            ...(t.allocationHistory ?? []),
            {
              at: DEMO_TODAY,
              from: n.orderNo,
              to: `備貨`,
              reason: `order-change`,
            },
          ],
        }
      : t,
  );
  commit({
    ...opsState,
    packages: a,
    requirements: [
      ...opsState.requirements.map((t: any) =>
        t.id === e
          ? {
              ...t,
              supersededAt: DEMO_TODAY,
            }
          : t,
      ),
      i,
    ],
  });
  return i;
}
function moriAppendToPurchaseOrder(e: any, t: any) {
  let n = opsState.purchaseOrders.find((t: any) => t.id === e);
  if (!n) return null;
  let r = new Set<any>(t);
  let i = opsState.requirements.filter(
    (e: any) =>
      r.has(e.id) &&
      e.supplier === n.supplier &&
      e.purchaseOrderId === null &&
      !e.cancelledAt &&
      !e.supersededAt &&
      requirementStatus(e, opsState.purchaseOrders) === `open`,
  );
  if (!i.length) return null;
  if (!n.orderedAt) {
    let e = i.map((e: any) => ({
      requirementId: e.id,
      sku: e.sku,
      qty: e.qty,
    }));
    let t = new Set<any>(i.map((e: any) => e.id));
    let r: any = {
      ...n,
      lines: [...n.lines, ...e],
    };
    commit({
      ...opsState,
      purchaseOrders: opsState.purchaseOrders.map((e: any) =>
        e.id === n.id ? r : e,
      ),
      requirements: opsState.requirements.map((e: any) =>
        t.has(e.id)
          ? {
              ...e,
              purchaseOrderId: n.id,
            }
          : e,
      ),
    });
    return r;
  }
  let a =
    opsState.purchaseOrders
      .filter((e: any) => e.parentPurchaseOrderId === n.id || e.id === n.id)
      .reduce((e: any, t: any) => Math.max(e, t.revision ?? 1), 1) + 1;
  let o: any = {
    id: `PUR-${String(opsState.seq).padStart(4, `0`)}`,
    batchNo: `${n.batchNo}-R${a}`,
    supplier: n.supplier,
    createdAt: DEMO_TODAY,
    lines: i.map((e: any) => ({
      requirementId: e.id,
      sku: e.sku,
      qty: e.qty,
    })),
    orderedAt: null,
    supplierOrderNo: null,
    confirmationFile: null,
    estimatedReady: null,
    deliveryRoute: n.deliveryRoute ?? `viaCN`,
    revision: a,
    parentPurchaseOrderId: n.id,
  };
  let s = new Set<any>(i.map((e: any) => e.id));
  commit({
    ...opsState,
    seq: opsState.seq + 1,
    purchaseOrders: [...opsState.purchaseOrders, o],
    requirements: opsState.requirements.map((e: any) =>
      s.has(e.id)
        ? {
            ...e,
            purchaseOrderId: o.id,
          }
        : e,
    ),
  });
  return o;
} // v12: physical package location, procurement provenance and allocation are independent.
// v12: physical package location, procurement provenance and allocation are independent.
function moriProcurementRef(p: any) {
  return p.procurementReference ?? p.orderNo ?? null;
}
function moriPackagePurpose(p: any, state: any = opsState) {
  if (p.allocationPurpose) return p.allocationPurpose;
  return state.orders.some((o: any) => o.orderNo === p.orderNo)
    ? `customerOrder`
    : p.location === `showroom`
      ? `display`
      : `restock`;
}
function moriFreePackage(p: any, state: any = opsState) {
  return (
    moriPackagePurpose(p, state) === `restock` &&
    !p.orderNo &&
    !p.allocationRequirementId &&
    !p.exception &&
    !p.quarantined
  );
}
function moriUnitGroups(packages: any, sku: any) {
  const product = productOf(sku);
  if (!product) return [];
  const expected = new Map<any, any>();
  for (const stem of product.packageStems)
    expected.set(stem, (expected.get(stem) || 0) + 1);
  const groups = new Map<any, any>();
  for (const p of packages.filter((p: any) => p.sku === sku)) {
    const key = p.unitId || p.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  return [...groups.values()].filter(
    (group: any) =>
      group.length === product.packageStems.length &&
      new Set(group.map((p: any) => p.location)).size === 1 &&
      [...expected].every(
        ([stem, n]: any) =>
          group.filter((p: any) => p.stem === stem).length === n,
      ),
  );
}
function moriAvailableUnits(sku: any, location: any, state: any = opsState) {
  return moriUnitGroups(
    state.packages.filter(
      (p: any) => p.location === location && moriFreePackage(p, state),
    ),
    sku,
  );
}
function moriAvailableStock(req: any) {
  return {
    hk: moriAvailableUnits(req.sku, `hkWarehouse`).length,
    cn: moriAvailableUnits(req.sku, `cnWarehouse`).length,
  };
}
function moriStockSummary(sku: any, state: any = opsState) {
  const product = productOf(sku);
  const packages = state.packages.filter((p: any) => p.sku === sku);
  const units = moriUnitGroups(packages, sku);
  const count = (locations: any) =>
    units.filter((g: any) => locations.includes(g[0].location)).length;
  const landed: any[] = [`hkWarehouse`, `cnWarehouse`, `showroom`];
  const availableHK = moriAvailableUnits(sku, `hkWarehouse`, state).length;
  const availableCN = moriAvailableUnits(sku, `cnWarehouse`, state).length;
  const restockUnits = units.filter((g: any) =>
    g.every((p: any) => moriFreePackage(p, state)),
  );
  const pending = state.requirements
    .filter(
      (r: any) =>
        r.sku === sku &&
        !r.cancelledAt &&
        !r.supersededAt &&
        (!r.purchaseOrderId ||
          !state.purchaseOrders.find((p: any) => p.id === r.purchaseOrderId)
            ?.orderedAt) &&
        (moriPurpose(r) === `restock` || r.replenish),
    )
    .reduce((n: any, r: any) => n + r.qty, 0);
  return {
    ...product?.stock,
    main: count([`hkWarehouse`]),
    cn: count([`cnWarehouse`]),
    shop: count([`showroom`]),
    reserved: units.filter(
      (g: any) =>
        landed.includes(g[0].location) &&
        g.every((p: any) => moriPackagePurpose(p, state) === `customerOrder`),
    ).length,
    availableHK,
    availableCN,
    display: units.filter(
      (g: any) =>
        landed.includes(g[0].location) &&
        g.every((p: any) => moriPackagePurpose(p, state) === `display`),
    ).length,
    inTransit: count([`supplierTransit`, `transit`]),
    incomingStock:
      restockUnits.filter((g: any) =>
        [`supplier`, `supplierTransit`, `cnWarehouse`, `transit`].includes(
          g[0].location,
        ),
      ).length + pending,
    stockValue: packages
      .filter((p: any) => landed.includes(p.location))
      .reduce((sum: any, p: any) => {
        const po = state.purchaseOrders.find(
          (o: any) => o.id === p.purchaseOrderId,
        );
        const line = po?.lines.find(
          (l: any) =>
            l.requirementId === (p.procurementRequirementId || p.requirementId),
        );
        return (
          sum +
          (line?.unitCost ?? product?.cost ?? 0) / packagesPerUnit(product!)
        );
      }, 0),
    safetyStock: state.safetyStock?.[sku] ?? product?.stock?.safetyStock ?? 0,
  };
}
function moriLiveProducts(state: any) {
  return products.map((p: any) => ({
    ...p,
    stock: moriStockSummary(p.sku, state),
  }));
}
function moriRestockProducts(state: any) {
  const skus = new Set<any>([
    ...state.packages
      .filter((p: any) => moriPackagePurpose(p, state) === `restock`)
      .map((p: any) => p.sku),
    ...state.requirements
      .filter((r: any) => moriPurpose(r) === `restock` || r.replenish)
      .map((r: any) => r.sku),
  ]);
  return moriLiveProducts(state).filter(
    (p: any) => p.sourcingType === `stocked` || skus.has(p.sku),
  );
}
function moriSetReplenish(e: any, t: any) {
  let n = opsState.requirements.find((t: any) => t.id === e);
  return (
    !(
      !n ||
      n.purchaseOrderId ||
      (n.sourcing !== `useHKStock` && n.sourcing !== `useCNStock`)
    ) &&
    (commit({
      ...opsState,
      requirements: opsState.requirements.map((n: any) =>
        n.id === e
          ? {
              ...n,
              replenish: t,
            }
          : n,
      ),
    }),
    true)
  );
}
function moriAllocationActor() {
  return readStoredSession()?.user?.id || `u-alex`;
}
function moriNextReqIn(state: any) {
  const prefix = `PR-${DEMO_TODAY.replace(/-/g, ``)}-`;
  const n =
    state.requirements
      .filter((r: any) => r.id.startsWith(prefix))
      .reduce(
        (m: any, r: any) => Math.max(m, Number(r.id.split(`-`).at(-1)) || 0),
        0,
      ) + 1;
  return prefix + String(n).padStart(3, `0`);
}
function moriAllocationChange(p: any, patch: any, actor: any, reason: any) {
  const before: any = {
    orderNo: p.orderNo || null,
    lineId: p.lineId || null,
    allocationRequirementId: p.allocationRequirementId || null,
    allocationPurpose: moriPackagePurpose(p),
  };
  const after: any = {
    ...before,
    ...patch,
  };
  return {
    ...p,
    ...patch,
    allocationHistory: [
      ...(p.allocationHistory || []),
      {
        at: nowIso(),
        actor,
        reason,
        from: before.orderNo || before.allocationPurpose,
        to: after.orderNo || after.allocationPurpose,
        before,
        after,
      },
    ],
  };
}
function moriAuditAllocation(
  state: any,
  ids: any,
  actor: any,
  reason: any,
  type: any,
) {
  state.audit.push({
    id: `AL-${String(state.audit.length + 1).padStart(5, `0`)}`,
    ts: nowIso(),
    userId: actor,
    model: `allocation`,
    recordId: ids[0],
    payload: {
      event: type,
      packageIds: ids,
      reason,
    },
  });
}
function moriIncompleteAllocation(
  orderNo: any,
  sku: any,
  state: any = opsState,
) {
  const parts = state.packages.filter(
    (p: any) => p.orderNo === orderNo && p.sku === sku,
  );
  return moriUnitGroups(parts, sku).flat().length !== parts.length;
}
function moriOrderCapacity(
  order: any,
  sku: any,
  state: any = opsState,
  excluded: any = [],
) {
  const skip = new Set<any>(excluded);
  const required = order.lines
    .filter((l: any) => l.sku === sku)
    .reduce((n: any, l: any) => n + l.qty, 0);
  const groups = moriUnitGroups(
    state.packages.filter(
      (p: any) => p.orderNo === order.orderNo && !skip.has(p.id),
    ),
    sku,
  );
  return {
    required,
    allocated: groups.length,
    remaining: Math.max(0, required - groups.length),
  };
}
function moriSetFulfilment(id: any, source: any) {
  const req = opsState.requirements.find((r: any) => r.id === id);
  if (
    !req ||
    req.purchaseOrderId ||
    req.cancelledAt ||
    req.supersededAt ||
    req.qty <= 0 ||
    ![`orderNew`, `useHKStock`, `useCNStock`].includes(source)
  )
    return false;
  const actor = moriAllocationActor();
  const owned = opsState.packages.filter(
    (p: any) => p.allocationRequirementId === id,
  );
  if (
    owned.some(
      (p: any) =>
        ![`hkWarehouse`, `cnWarehouse`, `showroom`].includes(p.location),
    )
  )
    return false;
  let state: any = {
    ...opsState,
    packages: opsState.packages.map((p: any) =>
      p.allocationRequirementId === id
        ? moriAllocationChange(
            p,
            {
              orderNo: null,
              lineId: null,
              allocationRequirementId: null,
              allocationPurpose: `restock`,
            },
            actor,
            `更改貨源，釋放原分配`,
          )
        : p,
    ),
    requirements: opsState.requirements.map((r: any) => ({
      ...r,
    })),
    audit: [...opsState.audit],
  };
  if (source !== `orderNew`) {
    const order = state.orders.find((o: any) => o.orderNo === req.orderNo);
    if (
      !order ||
      !req.customer ||
      moriIncompleteAllocation(order.orderNo, req.sku, state)
    )
      return false;
    const location = source === `useHKStock` ? `hkWarehouse` : `cnWarehouse`;
    const units = moriAvailableUnits(req.sku, location, state);
    if (
      units.length < req.qty ||
      moriOrderCapacity(order, req.sku, state).remaining < req.qty
    )
      return false;
    const ids = new Set<any>(
      units.slice(0, req.qty).flatMap((g: any) => g.map((p: any) => p.id)),
    );
    state.packages = state.packages.map((p: any) =>
      ids.has(p.id)
        ? moriAllocationChange(
            p,
            {
              orderNo: req.orderNo,
              lineId: req.lineId,
              allocationRequirementId: req.id,
              allocationPurpose: `customerOrder`,
            },
            actor,
            `按需求分配完整現貨`,
          )
        : p,
    );
  }
  state.requirements = state.requirements.map((r: any) =>
    r.id === id
      ? {
          ...r,
          sourcing: source,
          replenish: false,
        }
      : r,
  );
  moriAuditAllocation(
    state,
    state.packages
      .filter(
        (p: any) =>
          p.allocationRequirementId === id ||
          owned.some((o: any) => o.id === p.id),
      )
      .map((p: any) => p.id),
    actor,
    `更改需求 ${id} 貨源為 ${source}`,
    `fulfilmentSource`,
  );
  commit(state);
  return true;
}
function moriCoverRequirements(
  state: any,
  order: any,
  sku: any,
  units: any,
  _actor: any,
) {
  let remaining: any[] = [...units];
  const existing = state.requirements.filter(
    (r: any) =>
      r.orderNo === order.orderNo &&
      r.sku === sku &&
      !r.cancelledAt &&
      !r.supersededAt &&
      !r.purchaseOrderId &&
      r.sourcing === `orderNew` &&
      r.qty > 0,
  );
  for (const req of existing) {
    if (!remaining.length) break;
    const count = Math.min(req.qty, remaining.length);
    const assigned = remaining.splice(0, count);
    if (count < req.qty) {
      state.requirements.push({
        ...req,
        id: moriNextReqIn(state),
        qty: req.qty - count,
        createdAt: DEMO_TODAY,
        parentRequirementId: req.id,
        originBatchNo: undefined,
        confirmationReason: `現貨分配後餘量`,
        remainingRequirementId: null,
      });
      req.allocationOriginalQty = req.qty;
      req.qty = count;
    }
    req.sourcing =
      assigned[0][0].location === `cnWarehouse` ? `useCNStock` : `useHKStock`;
    req.replenish = false;
    const ids = new Set<any>(
      assigned.flatMap((g: any) => g.map((p: any) => p.id)),
    );
    state.packages = state.packages.map((p: any) =>
      ids.has(p.id)
        ? {
            ...p,
            allocationRequirementId: req.id,
            lineId: req.lineId,
          }
        : p,
    );
  }
  if (remaining.length) {
    const req: any = {
      id: moriNextReqIn(state),
      orderNo: order.orderNo,
      lineId: order.lines.find((l: any) => l.sku === sku)?.id,
      customer: order.customer,
      sku,
      qty: remaining.length,
      supplier: productOf(sku)!.supplier,
      sourcing:
        remaining[0][0].location === `cnWarehouse`
          ? `useCNStock`
          : `useHKStock`,
      createdAt: DEMO_TODAY,
      purchaseOrderId: null,
      purpose: `customerOrder`,
      note: `手動分配現貨`,
      replenish: false,
    };
    state.requirements.push(req);
    const ids = new Set<any>(
      remaining.flatMap((g: any) => g.map((p: any) => p.id)),
    );
    state.packages = state.packages.map((p: any) =>
      ids.has(p.id)
        ? {
            ...p,
            allocationRequirementId: req.id,
            lineId: req.lineId,
          }
        : p,
    );
  }
}
function moriEnsureSourceDemand(
  state: any,
  orderNo: any,
  sku: any,
  _actor: any,
) {
  const order = state.orders.find((o: any) => o.orderNo === orderNo);
  if (!order) return;
  const cap = moriOrderCapacity(order, sku, state);
  const pending = state.requirements
    .filter(
      (r: any) =>
        r.orderNo === orderNo &&
        r.sku === sku &&
        !r.cancelledAt &&
        !r.supersededAt &&
        r.sourcing === `orderNew` &&
        (!r.purchaseOrderId ||
          !state.purchaseOrders.find((p: any) => p.id === r.purchaseOrderId)
            ?.orderedAt),
    )
    .reduce((n: any, r: any) => n + r.qty, 0);
  if (cap.remaining > pending)
    state.requirements.push({
      id: moriNextReqIn(state),
      orderNo,
      lineId: order.lines.find((l: any) => l.sku === sku)?.id,
      customer: order.customer,
      sku,
      qty: cap.remaining - pending,
      supplier: productOf(sku)!.supplier,
      sourcing: `orderNew`,
      createdAt: DEMO_TODAY,
      purchaseOrderId: null,
      purpose: `customerOrder`,
      note: `原分配已調走，需重新決定貨源`,
      allocationShortage: true,
    });
  if (cap.remaining > 0) {
    const id = `ALLOC-GAP-${orderNo}-${sku}`;
    const task = state.activities.find((a: any) => a.id === id);
    const fields: any = {
      kind: `checkMissing`,
      taskType: `checkMissing`,
      orderId: orderNo,
      sku,
      description: `${sku} 調貨後缺 ${cap.remaining} 件；請重新分配或採購${order.delivery.scheduledDate ? `，已約 ${order.delivery.scheduledDate} 須覆核` : ``}`,
      dueDate: DEMO_TODAY,
      owner: `Alex`,
      doneAt: null,
      status: `open`,
      feedback: null,
      source: `allocation`,
      nextActivityId: null,
    };
    if (task) Object.assign(task, fields);
    else
      state.activities.push({
        id,
        ...fields,
        history: [],
        contactAttempts: [],
      });
    state.orders = state.orders.map((o: any) =>
      o.orderNo === orderNo
        ? {
            ...o,
            delivery: {
              ...o.delivery,
              stockException: true,
            },
          }
        : o,
    );
  }
}
function moriReallocatePackages(ids: any, target: any) {
  const selected = new Set<any>(ids);
  const packages = opsState.packages.filter((p: any) => selected.has(p.id));
  if (packages.length !== selected.size || !packages.length)
    throw Error(`請重新選擇有效包件。`);
  const skus: any[] = [...new Set(packages.map((p: any) => p.sku))];
  if (skus.length !== 1) throw Error(`請選擇相同 SKU。`);
  const sku = skus[0];
  const units = moriUnitGroups(packages, sku);
  if (units.flat().length !== packages.length)
    throw Error(`包件未成完整套裝，請選齊同一件貨品的全部包件。`);
  if (
    new Set(packages.map((p: any) => p.location)).size !== 1 ||
    packages.some(
      (p: any) =>
        ![`hkWarehouse`, `cnWarehouse`, `showroom`].includes(p.location),
    )
  )
    throw Error(`請選擇同一倉位已收貨的完整貨品。`);
  if (packages.some((p: any) => p.exception || p.quarantined))
    throw Error(`異常／隔離包件不可分配。`);
  if (![`order`, `restock`, `display`].includes(target.type))
    throw Error(`請選擇分配用途。`);
  if (!target.reason?.trim()) throw Error(`請填寫分配原因。`);
  const actor = target.actor || moriAllocationActor();
  const order =
    target.type === `order`
      ? opsState.orders.find((o: any) => o.orderNo === target.orderNo)
      : null;
  if (target.type === `order`) {
    if (!order || !order.lines.some((l: any) => l.sku === sku))
      throw Error(`目標客單沒有此 SKU。`);
    if (moriIncompleteAllocation(order.orderNo, sku))
      throw Error(`目標客單已有未齊包件，請先核對缺件，避免重複分配。`);
    if (packages.some((p: any) => p.orderNo === order.orderNo))
      throw Error(`所選貨品已分配給此客單。`);
    if (moriOrderCapacity(order, sku).remaining < units.length)
      throw Error(`目標客單剩餘需求不足，不能超額分配。`);
    if (
      opsState.requirements.some(
        (r: any) =>
          r.orderNo === order.orderNo &&
          r.sku === sku &&
          !r.cancelledAt &&
          !r.supersededAt &&
          r.purchaseOrderId &&
          !opsState.purchaseOrders.find((p: any) => p.id === r.purchaseOrderId)
            ?.orderedAt,
      )
    )
      throw Error(`目標客單已有待確認採購批次，請先核對採購承諾。`);
  }
  const changed = packages.filter(
    (p: any) =>
      p.orderNo !== (order?.orderNo || null) ||
      moriPackagePurpose(p) !== (order ? `customerOrder` : target.type),
  );
  if (!changed.length) throw Error(`所選貨品已是此分配用途。`);
  const sources: any[] = [
    ...new Set(packages.map((p: any) => p.orderNo).filter(Boolean)),
  ];
  let state: any = {
    ...opsState,
    requirements: opsState.requirements.map((r: any) => ({
      ...r,
    })),
    packages: opsState.packages.map((p: any) =>
      selected.has(p.id)
        ? {
            ...p,
            orderNo: order?.orderNo || null,
            lineId: order?.lines.find((l: any) => l.sku === sku)?.id || null,
            allocationRequirementId: null,
            allocationPurpose: order ? `customerOrder` : target.type,
          }
        : p,
    ),
    audit: [...opsState.audit],
    activities: opsState.activities.map((a: any) => ({
      ...a,
    })),
  };
  // Any source requirement whose stock was moved must no longer claim that stock is assigned.
  for (const source of sources) {
    for (const req of state.requirements.filter(
      (r: any) =>
        r.orderNo === source &&
        r.sku === sku &&
        [`useHKStock`, `useCNStock`].includes(r.sourcing),
    )) {
      const left = moriUnitGroups(
        state.packages.filter((p: any) => p.allocationRequirementId === req.id),
        sku,
      ).length;
      if (left < req.qty) {
        if (req.purchaseOrderId || req.replenish) {
          req.allocationLostQty = req.qty - left;
          req.allocationException = true;
        } else {
          const missing = req.qty - left;
          if (left > 0) {
            state.requirements.push({
              ...req,
              id: moriNextReqIn(state),
              qty: missing,
              sourcing: `orderNew`,
              replenish: false,
              allocationShortage: true,
            });
            req.qty = left;
          } else req.sourcing = `orderNew`;
        }
      }
    }
  }
  if (order) moriCoverRequirements(state, order, sku, units, actor);
  for (const source of sources)
    moriEnsureSourceDemand(state, source, sku, actor);
  state.packages = state.packages.map((p: any) => {
    if (!selected.has(p.id)) return p;
    const before = opsState.packages.find((x: any) => x.id === p.id);
    return moriAllocationChange(
      before,
      {
        orderNo: p.orderNo,
        lineId: p.lineId,
        allocationRequirementId: p.allocationRequirementId,
        allocationPurpose: p.allocationPurpose,
      },
      actor,
      target.reason.trim(),
    );
  });
  moriAuditAllocation(state, ids, actor, target.reason.trim(), `reallocation`);
  commit(state);
  return packages.length;
}
function moriSetSafetyStock(sku: any, value: any) {
  if (!Number.isInteger(value) || value < 0) return;
  commit({
    ...opsState,
    safetyStock: {
      ...(opsState.safetyStock || {}),
      [sku]: value,
    },
  });
}
function moriOrderShortage(order: any, state: any = opsState) {
  return [...new Set(order.lines.map((l: any) => l.sku))].some(
    (sku: any) => moriOrderCapacity(order, sku, state).remaining > 0,
  );
}
// v13 receiving: observed physical receipt, expected packages and allocations remain separate.
// v13 receiving: observed physical receipt, expected packages and allocations remain separate.
function moriSeedReceiving(state: any) {
  const candidates = state.purchaseOrders
    .filter(
      (po: any) =>
        po.orderedAt &&
        state.packages.some((p: any) => p.purchaseOrderId === po.id) &&
        state.packages
          .filter((p: any) => p.purchaseOrderId === po.id)
          .every((p: any) => p.location === `supplier`),
    )
    .slice(0, 3);
  for (let i = 0; i < candidates.length; i++) {
    const po = candidates[i];
    const route = i === 2 ? `directCustomer` : `viaCN`;
    const date = DEMO_TODAY;
    const ids = state.packages
      .filter((p: any) => p.purchaseOrderId === po.id)
      .map((p: any) => p.id);
    state = {
      ...state,
      purchaseOrders: state.purchaseOrders.map((o: any) =>
        o.id === po.id
          ? {
              ...o,
              deliveryRoute: route,
            }
          : o,
      ),
    };
    state = completeMove(
      state,
      {
        id: `SM-${String(state.moves.length + 1).padStart(5, `0`)}`,
        type: `purchaseShipment`,
        state: `assigned`,
        from: `supplier`,
        to: route === `directCustomer` ? `customerTransit` : `supplierTransit`,
        scheduledDate: date,
        doneDate: null,
        packageUnitIds: ids,
      },
      date,
    );
    state = {
      ...state,
      packages: state.packages.map((p: any) =>
        ids.includes(p.id)
          ? {
              ...p,
              packageCode: p.packageCode || `${p.stem}-${p.id}`,
              shippedAt: date,
              logisticsNo:
                route === `directCustomer`
                  ? `DEMO-DIRECT-0922`
                  : `DEMO-CN-0922-${i + 1}`,
              deliveryNoteNo: `JH-DEMO-0922-${i + 1}`,
            }
          : p,
      ),
    };
  }
  return state;
}
function moriReceiptStage(p: any, _state: any = opsState) {
  return p.location === `customerTransit`
    ? `customer`
    : p.location === `supplierTransit`
      ? `cn`
      : p.location === `transit`
        ? `hk`
        : p.receivingException?.stage || null;
}
function moriReceiptLocation(stage: any) {
  return (
    {
      cn: `cnWarehouse`,
      hk: `hkWarehouse`,
      customer: `customer`,
    } as Record<string, any>
  )[stage];
}
function moriOpenReceiptException(p: any) {
  return p.receivingException?.status === `open` ? p.receivingException : null;
}
function moriReceiptBlocked(order: any, state: any = opsState) {
  return state.packages.some(
    (p: any) =>
      p.orderNo === order.orderNo &&
      (p.exception || p.quarantined || p.location === `customerTransit`),
  );
}
function moriReceivingRows(state: any, stage: any) {
  return state.packages
    .filter(
      (p: any) =>
        moriReceiptStage(p, state) === stage ||
        p.receiptHistory?.some((h: any) => h.stage === stage),
    )
    .map((p: any) => ({
      p,
      po: state.purchaseOrders.find((o: any) => o.id === p.purchaseOrderId),
      order: state.orders.find((o: any) => o.orderNo === p.orderNo),
      exception: moriOpenReceiptException(p),
      last: [...(p.receiptHistory || [])]
        .reverse()
        .find((h: any) => h.stage === stage),
    }));
}
function moriReceivingSearch(row: any, query: any) {
  const q = query.trim().toLowerCase();
  return (
    !q ||
    [
      row.p.id,
      row.p.packageCode,
      row.p.stem,
      row.p.sku,
      productOf(row.p.sku)?.name,
      row.p.logisticsNo,
      row.p.deliveryNoteNo,
      row.p.procurementReference,
      row.p.orderNo,
      row.order?.customer.alias,
      row.order?.customer.phone,
      row.po?.batchNo,
      row.po?.supplierOrderNo,
    ]
      .filter(Boolean)
      .some((v: any) => String(v).toLowerCase().includes(q))
  );
}
function moriReceiptCanEdit(row: any, stage: any) {
  if ((row.p.exception || row.p.quarantined) && !row.exception) return false;
  return row.exception
    ? row.exception.stage === stage
    : moriReceiptStage(row.p) === stage &&
        [
          stage === `cn`
            ? `supplierTransit`
            : stage === `hk`
              ? `transit`
              : `customerTransit`,
        ].includes(row.p.location);
}
function moriReceiptTaskSync(state: any) {
  const activities = state.activities.map((a: any) => ({
    ...a,
  }));
  for (const p of state.packages) {
    const ex = moriOpenReceiptException(p);
    const id = `RCV-${p.id}`;
    const idx = activities.findIndex((a: any) => a.id === id);
    if (ex) {
      const old = idx >= 0 ? activities[idx] : {};
      const fields: any = {
        ...old,
        id,
        kind: `checkMissing`,
        taskType: `checkMissing`,
        source: `receiving`,
        packageId: p.id,
        orderId: p.orderNo || null,
        sku: p.sku,
        sourceRef: moriProcurementRef(p),
        description: `${p.packageCode || p.id} · ${p.sku} · ${ex.type === `short` ? `短少` : ex.type === `wrong` ? `錯件` : `破損`}：${ex.note}`,
        owner: ex.owner,
        dueDate: ex.dueDate,
        status: `open`,
        doneAt: null,
        feedback: null,
        nextActivityId: null,
        seq: old.seq || 1,
        history: old.history || [],
        contactAttempts: old.contactAttempts || [],
      };
      if (idx >= 0) activities[idx] = fields;
      else activities.push(fields);
    } else if (idx >= 0 && !activities[idx].doneAt)
      activities[idx] = {
        ...activities[idx],
        status: `completed`,
        doneAt: DEMO_TODAY,
        feedback: `completed`,
        completionSource: `businessRecord`,
        history: [
          ...(activities[idx].history || []),
          {
            at: nowIso(),
            action: `receiptResolved`,
          },
        ],
      };
  }
  return {
    ...state,
    activities,
  };
}
function moriReceiptMove(state: any, p: any, to: any, date: any, actor: any) {
  if (p.location === to) return state;
  return completeMove(
    state,
    {
      id: `SM-${String(state.moves.length + 1).padStart(5, `0`)}`,
      type:
        to === `customer`
          ? `deliverToCustomer`
          : to === `hkWarehouse`
            ? `arrivalQc`
            : `purchaseReceipt`,
      state: `assigned`,
      from: p.location,
      to,
      scheduledDate: date,
      doneDate: null,
      actorId: actor,
      packageUnitIds: [p.id],
    },
    date,
  );
}
function moriSaveReceipt(input: any) {
  const { stage, date, rows, owner, dueDate, recipient, proof } = input;
  const actor = input.actor || moriAllocationActor();
  if (![`cn`, `hk`, `customer`].includes(stage))
    throw Error(`請選擇收貨站點。`);
  const validDate = (d: any) =>
    /^\d{4}-\d{2}-\d{2}$/.test(d || ``) && dayjs(d).format(`YYYY-MM-DD`) === d;
  if (!validDate(date) || date > DEMO_TODAY)
    throw Error(`請填寫有效收貨日期，不可遲於示範今日 ${DEMO_TODAY}。`);
  if (!Array.isArray(rows) || !rows.length)
    throw Error(`請逐包選擇點貨結果；未點貨的包件不會被更新。`);
  if (new Set(rows.map((r: any) => r.id)).size !== rows.length)
    throw Error(`同一包件不可重複提交。`);
  const selected = rows.map((r: any) => {
    const p = opsState.packages.find((p: any) => p.id === r.id);
    if (!p) throw Error(`找不到包件，請重開清單。`);
    const ex = moriOpenReceiptException(p);
    if (
      !moriReceiptCanEdit(
        {
          p,
          exception: ex,
        },
        stage,
      )
    )
      throw Error(`包件狀態已更新，請重新核對；已收貨包件不可重複入庫。`);
    if (
      ![`received`, `short`, `wrong`, `damaged`, `followup`].includes(r.result)
    )
      throw Error(`請選擇有效點貨結果。`);
    if (ex && ![`received`, `followup`].includes(r.result))
      throw Error(`已有異常，請補收／驗收通過或更新跟進。`);
    if (!ex && r.result === `followup`) throw Error(`此包件未有待處理異常。`);
    if (
      stage === `customer` &&
      ![`received`, `short`, `followup`].includes(r.result)
    )
      throw Error(`直送簽收只處理已簽收或未收到；破損退換請另行跟進。`);
    const last = p.receiptHistory?.at(-1);
    if (date < (last?.date || p.shippedAt || `0000-00-00`))
      throw Error(`收貨日期不可早於上次處理／發貨日期。`);
    if ((r.result !== `received` || ex) && !r.note?.trim())
      throw Error(`異常或補收必須填寫原因／處理記錄。`);
    if (
      r.result !== `received` &&
      (!owner?.trim() || !validDate(dueDate) || dueDate < date)
    )
      throw Error(`異常必須有負責人及不早於收貨日的跟進日期。`);
    if (r.result === `wrong` && !r.observed?.trim())
      throw Error(`請記錄實際收到的錯件編碼／描述。`);
    if (
      ex?.type === `wrong` &&
      r.result === `received` &&
      r.wrongDisposition !== `returned`
    )
      throw Error(`請先確認錯件已退回，並在處理記錄填寫退回及補收資料。`);
    return {
      p,
      ex,
      r,
    };
  });
  if (stage === `customer`) {
    const orders = new Set<any>(selected.map((x: any) => x.p.orderNo));
    if (
      orders.size !== 1 ||
      ![...orders][0] ||
      !opsState.orders.some((o: any) => o.orderNo === [...orders][0])
    )
      throw Error(`每次只可確認同一客單的直送包件，請先按客單篩選。`);
    if (
      selected.some((x: any) => x.r.result === `received`) &&
      (!recipient?.trim() || !proof?.trim())
    )
      throw Error(`請填寫簽收人及簽收憑據／確認方式。`);
  }
  const receiptId = `RCPT-${DEMO_TODAY.replace(/-/g, ``)}-${String((opsState.receipts || []).length + 1).padStart(3, `0`)}`;
  const at = nowIso();
  let state: any = {
    ...opsState,
    packages: [...opsState.packages],
    moves: [...opsState.moves],
    audit: [...opsState.audit],
    unexpectedReceipts: [...(opsState.unexpectedReceipts || [])],
    receipts: [...(opsState.receipts || [])],
  };
  for (const { p, ex, r } of selected) {
    let exception = ex;
    let quarantined = p.quarantined || false;
    if (r.result === `received`) {
      state = moriReceiptMove(
        state,
        p,
        moriReceiptLocation(stage),
        date,
        actor,
      );
      exception = ex
        ? {
            ...ex,
            status: `resolved`,
            resolvedAt: at,
            resolvedBy: actor,
            resolution: r.note.trim(),
          }
        : null;
      quarantined = false;
      if (ex?.type === `wrong`)
        state.unexpectedReceipts = state.unexpectedReceipts.map((u: any) =>
          u.id === ex.unexpectedId
            ? {
                ...u,
                status: `returned`,
                receivedLocation: u.location,
                location: `returned`,
                returnedAt: at,
                returnedBy: actor,
                dispositionNote: r.note.trim(),
              }
            : u,
        );
    } else if (r.result === `followup`)
      exception = {
        ...ex,
        owner,
        dueDate,
        note: r.note.trim(),
        updatedAt: at,
      };
    else {
      let unexpectedId = null;
      if (r.result === `damaged`) {
        state = moriReceiptMove(
          state,
          p,
          moriReceiptLocation(stage),
          date,
          actor,
        );
        quarantined = true;
      }
      if (r.result === `wrong`) {
        unexpectedId = `UR-${receiptId}-${p.id}`;
        state.unexpectedReceipts.push({
          id: unexpectedId,
          expectedPackageId: p.id,
          sku: null,
          description: r.observed.trim(),
          location: moriReceiptLocation(stage),
          qty: 1,
          status: `quarantined`,
          receivedDate: date,
          receivedBy: actor,
          receiptId,
        });
      }
      exception = {
        type: r.result,
        status: `open`,
        stage,
        owner,
        dueDate,
        note: r.note.trim(),
        openedAt: at,
        openedBy: actor,
        unexpectedId,
      };
    }
    const event: any = {
      receiptId,
      stage,
      date,
      at,
      actor,
      result: r.result,
      note: r.note?.trim() || ``,
      observed: r.observed?.trim() || null,
      recipient: stage === `customer` ? recipient?.trim() || null : null,
      proof: stage === `customer` ? proof?.trim() || null : null,
      from: p.location,
      to: state.packages.find((x: any) => x.id === p.id).location,
      owner: exception?.owner || null,
      dueDate: exception?.dueDate || null,
    };
    state.packages = state.packages.map((x: any) =>
      x.id === p.id
        ? {
            ...x,
            receivingException: exception,
            exception:
              exception?.status === `open`
                ? `receiving:${exception.type}`
                : null,
            quarantined,
            receiptHistory: [...(x.receiptHistory || []), event],
            ...(r.result === `received`
              ? {
                  [stage === `cn`
                    ? `cnReceivedAt`
                    : stage === `hk`
                      ? `hkReceivedAt`
                      : `customerReceivedAt`]: date,
                }
              : {}),
          }
        : x,
    );
    state.audit.push({
      id: `AL-${String(state.audit.length + 1).padStart(5, `0`)}`,
      ts: at,
      userId: actor,
      model: `order`,
      recordId: p.orderNo || moriProcurementRef(p) || p.id,
      payload: {
        event: `fieldChange`,
        field: `packageReceipt`,
        from: `${p.packageCode || p.id} · ${p.location}`,
        to: `${event.to} · ${r.result} · ${event.note || `—`}`,
        receiptId,
        packageId: p.id,
      },
    });
  }
  state.receipts.push({
    id: receiptId,
    stage,
    date,
    at,
    actor,
    packageIds: rows.map((r: any) => r.id),
    results: rows.map((r: any) => ({
      ...r,
    })),
    recipient: recipient?.trim() || null,
    proof: proof?.trim() || null,
  });
  if (stage === `customer`) {
    const refs = new Set<any>(selected.map((x: any) => x.p.orderNo));
    state.orders = state.orders.map((o: any) =>
      refs.has(o.orderNo) &&
      state.packages
        .filter((p: any) => p.orderNo === o.orderNo)
        .every((p: any) => p.location === `customer` && !p.exception) &&
      !moriOrderShortage(o, state)
        ? {
            ...o,
            delivery: {
              ...o.delivery,
              completedDate: date,
            },
          }
        : o,
    );
  }
  commit(state);
  return receiptId;
}
function moriExportReceiving(rows: any, stage: any) {
  const cell = (v: any) => {
    let s = String(v ?? `—`);
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, `""`)}"`;
  };
  const head: any[] = [
    `站點`,
    `PB`,
    `採購來源`,
    `客單`,
    `SKU`,
    `包件 ID`,
    `包件編碼`,
    `物流單`,
    `發貨單`,
    `物理位置`,
    `點貨結果`,
    `異常原因`,
    `負責人`,
    `跟進日`,
    `實收錯件`,
    `最近處理日期`,
    `處理人`,
    `簽收人`,
    `簽收憑據`,
  ];
  const lines = rows.map(({ p, po, exception, last }: any) => [
    stage,
    po?.batchNo,
    moriProcurementRef(p),
    p.orderNo,
    p.sku,
    p.id,
    p.packageCode,
    p.logisticsNo,
    p.deliveryNoteNo,
    p.location,
    exception?.type || last?.result || `待點貨`,
    exception?.note || last?.note,
    exception?.owner,
    exception?.dueDate,
    (opsState.unexpectedReceipts || []).find(
      (u: any) => u.id === p.receivingException?.unexpectedId,
    )?.description,
    last?.date,
    last?.actor,
    last?.recipient,
    last?.proof,
  ]);
  const blob = new Blob(
    [
      `\uFEFF` +
        [head, ...lines].map((r: any) => r.map(cell).join(`,`)).join(`\r\n`),
    ],
    {
      type: `text/csv;charset=utf-8`,
    },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement(`a`);
  a.href = url;
  a.download = `Morihome-receiving-${stage}-${DEMO_TODAY}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function moriOpenReceivingTask(activity: any) {
  window.__MORI_RECEIVING_FOCUS__ = activity.packageId;
  window.__MORI_NAVIGATE__?.(`waiting`);
}
function moriManualShip(e: any, t: any, n: any) {
  let r = opsState.packages.filter(
    (r: any) =>
      moriProcurementRef(r) === e &&
      r.purchaseOrderId === t &&
      r.sku === n &&
      r.location === `supplier`,
  );
  if (!r.length) return 0;
  let i = opsState.purchaseOrders.find((e: any) => e.id === t);
  let a = (i == null ? undefined : i.deliveryRoute) ?? `viaCN`;
  let o =
    a === `directCustomer`
      ? `customerTransit`
      : a === `directHK`
        ? `transit`
        : `supplierTransit`;
  let s: any = {
    id: `SM-${String(opsState.moves.length + 1).padStart(5, `0`)}`,
    type: `purchaseShipment`,
    state: `assigned`,
    from: `supplier`,
    to: o,
    scheduledDate: DEMO_TODAY,
    doneDate: null,
    packageUnitIds: r.map((e: any) => e.id),
  };
  let c = completeMove(opsState, s, DEMO_TODAY);
  let l = 0;
  c = {
    ...c,
    packages: c.packages.map((t: any) => {
      if (!r.some((e: any) => e.id === t.id)) return t;
      l += 1;
      return {
        ...t,
        packageCode:
          t.packageCode ?? `${t.stem}-M${String(l).padStart(3, `0`)}`,
        shippedAt: DEMO_TODAY,
        deliveryNoteNo: t.deliveryNoteNo ?? `手動確認發貨`,
        logisticsNo: t.logisticsNo ?? null,
      };
    }),
  };
  commit(c);
  return r.length;
}
function moriTransferHK(e: any, t: any, n: any) {
  let r = opsState.packages.filter(
    (r: any) =>
      moriProcurementRef(r) === e &&
      r.purchaseOrderId === t &&
      r.sku === n &&
      r.location === `cnWarehouse`,
  );
  if (!r.length) return 0;
  if (
    r.some((p: any) => p.exception || p.quarantined) ||
    moriUnitGroups(r, n).flat().length !== r.length ||
    opsState.packages.some(
      (p: any) =>
        r.some((x: any) => x.unitId === p.unitId) &&
        (p.exception || p.quarantined || p.location !== `cnWarehouse`),
    )
  )
    throw Error(`請先收齊同套包件並處理異常，再安排上港車。`);
  let i: any = {
    id: `SM-${String(opsState.moves.length + 1).padStart(5, `0`)}`,
    type: `transit`,
    state: `assigned`,
    from: `cnWarehouse`,
    to: `transit`,
    scheduledDate: DEMO_TODAY,
    doneDate: null,
    packageUnitIds: r.map((e: any) => e.id),
  };
  commit(completeMove(opsState, i, DEMO_TODAY));
  return r.length;
}
let MORI_TASK_TYPES = [
  `scheduleDelivery`,
  `confirmArrival`,
  `chaseSupplier`,
  `chasePayment`,
  `checkMissing`,
  `procurementException`,
  `other`,
];
function moriReconcileTasks(state: any) {
  state = moriReceiptTaskSync(state);
  const activities = state.activities.map((a: any) => ({
    ...a,
    taskType: a.taskType || a.kind,
    status: a.doneAt ? `completed` : `open`,
    contactAttempts: a.contactAttempts || [],
    history: a.history || [],
  }));
  for (const order of state.orders) {
    const packages = state.packages.filter(
      (p: any) => p.orderNo === order.orderNo,
    );
    const bucket = lineStatus(packages, state);
    const needed: any[] = [];
    if (bucket === `readyToSchedule` && !order.delivery.scheduledDate)
      needed.push(`scheduleDelivery`);
    if (
      bucket === `notProcured` ||
      state.requirements.some(
        (r: any) =>
          r.orderNo === order.orderNo &&
          !r.cancelledAt &&
          !r.supersededAt &&
          [`open`, `inPurchaseOrder`].includes(
            requirementStatus(r, state.purchaseOrders),
          ),
      ) ||
      packages.some((p: any) => p.location === `supplier`)
    )
      needed.push(`chaseSupplier`);
    if (
      packages.some((p: any) =>
        [
          `supplierTransit`,
          `cnWarehouse`,
          `transit`,
          `customerTransit`,
        ].includes(p.location),
      )
    )
      needed.push(`confirmArrival`);
    if (
      order.payment !== `paid` &&
      [`readyToSchedule`, `partiallyDelivered`, `delivered`].includes(bucket)
    )
      needed.push(`chasePayment`);
    for (const kind of needed) {
      if (
        activities.some(
          (a: any) =>
            a.orderId === order.orderNo &&
            (a.taskType || a.kind) === kind &&
            !a.nextActivityId,
        )
      )
        continue;
      activities.push({
        id: `WB-${order.orderNo}-${kind}`,
        kind,
        taskType: kind,
        orderId: order.orderNo,
        dueDate:
          order.customerRequestedDate ||
          dayjs(order.createdAt)
            .add(kind === `chaseSupplier` ? 1 : 7, `day`)
            .format(`YYYY-MM-DD`),
        owner: kind === `chasePayment` ? `Ocean` : `Alex`,
        feedback: null,
        note: ``,
        doneAt: null,
        nextActivityId: null,
        seq: 1,
        status: `open`,
        contactAttempts: [],
        history: [],
        source: `workflow`,
      });
    }
    for (let i = 0; i < activities.length; i++) {
      const a = activities[i];
      if (a.orderId !== order.orderNo || a.doneAt) continue;
      const kind = a.taskType || a.kind;
      if (a.source === `receiving`) continue;
      if (a.source === `allocation` && kind === `checkMissing`) {
        if (moriOrderCapacity(order, a.sku, state).remaining === 0)
          activities[i] = {
            ...a,
            status: `completed`,
            doneAt: DEMO_TODAY,
            feedback: `completed`,
            completionSource: `businessRecord`,
          };
        continue;
      }
      const fulfilled =
        kind === `scheduleDelivery`
          ? !!order.delivery.scheduledDate
          : kind === `chasePayment`
            ? order.payment === `paid`
            : kind === `confirmArrival`
              ? bucket !== `inTransit` &&
                packages.length > 0 &&
                packages.every((p: any) =>
                  [`hkWarehouse`, `showroom`, `customer`].includes(p.location),
                )
              : kind === `chaseSupplier`
                ? state.requirements.filter(
                    (r: any) =>
                      r.orderNo === order.orderNo &&
                      !r.cancelledAt &&
                      !r.supersededAt,
                  ).length > 0 &&
                  state.requirements
                    .filter(
                      (r: any) =>
                        r.orderNo === order.orderNo &&
                        !r.cancelledAt &&
                        !r.supersededAt,
                    )
                    .every((r: any) =>
                      [
                        `ordered`,
                        `stockAssigned`,
                        `partialConfirmed`,
                        `confirmationDeferred`,
                      ].includes(requirementStatus(r, state.purchaseOrders)),
                    ) &&
                  !packages.some((p: any) => p.location === `supplier`)
                : false;
      if (fulfilled)
        activities[i] = {
          ...a,
          status: `completed`,
          doneAt: DEMO_TODAY,
          feedback: kind === `scheduleDelivery` ? `scheduled` : `completed`,
          completionSource: `businessRecord`,
        };
    }
  }
  return {
    ...state,
    activities,
    orders: state.orders.map((o: any) =>
      o.delivery.stockException && !moriOrderShortage(o, state)
        ? {
            ...o,
            delivery: {
              ...o.delivery,
              stockException: false,
            },
          }
        : o,
    ),
  };
}
function moriWorkbenchRows(state: any) {
  return state.activities
    .filter((a: any) => !a.nextActivityId)
    .map((activity: any) => {
      const order = state.orders.find(
        (o: any) => o.orderNo === activity.orderId,
      ) || {
        orderNo: null,
        customer: {
          alias: `—`,
          district: ``,
          phone: null,
        },
        lines:
          activity.sku && productOf(activity.sku)
            ? [
                {
                  sku: activity.sku,
                },
              ]
            : [],
        delivery: {
          scheduledDate: null,
          timeSlot: null,
        },
        customerRequestedDate: null,
        customerRequestedNote: null,
      };
      return {
        activity,
        order,
        delivery: order.delivery,
        units: state.packages.filter((p: any) =>
          activity.source === `receiving`
            ? p.id === activity.packageId
            : p.orderNo === activity.orderId,
        ),
        items: order.lines.map((l: any) => productOf(l.sku)?.name || l.sku),
      };
    });
}
function moriUpdateActivity(id: any, patch: any) {
  commit({
    ...opsState,
    activities: opsState.activities.map((a: any) =>
      a.id === id
        ? {
            ...a,
            ...patch,
          }
        : a,
    ),
  });
}
function moriRescheduleActivity(id: any, date: any, note: any, feedback: any) {
  const a = opsState.activities.find((a: any) => a.id === id);
  if (!a || a.doneAt || !date || date < DEMO_TODAY) return null;
  const event: any = {
    at: nowIso(),
    fromDueDate: a.dueDate,
    toDueDate: date,
    feedback,
    note: note || ``,
  };
  const contact =
    feedback === `unreachable` || feedback === `customerPostponed`;
  const next: any = {
    ...a,
    dueDate: date,
    note: note || ``,
    feedback,
    status: `open`,
    doneAt: null,
    seq: a.seq + (contact ? 1 : 0),
    history: [...(a.history || []), event],
    contactAttempts: contact
      ? [...(a.contactAttempts || []), event]
      : a.contactAttempts || [],
  };
  moriUpdateActivity(id, next);
  return next;
}
function moriCompleteOtherTask(id: any) {
  const a = opsState.activities.find((a: any) => a.id === id);
  if (!a || a.doneAt || (a.taskType || a.kind) !== `other`) return null;
  moriUpdateActivity(id, {
    doneAt: DEMO_TODAY,
    status: `completed`,
    feedback: `completed`,
  });
  return a;
}
export {
  commit,
  MORI_TASK_TYPES,
  moriAppendToPurchaseOrder,
  moriAvailableStock,
  moriCancelRequirement,
  moriCompleteOtherTask,
  moriCreateManualRequirement,
  moriExportReceiving,
  moriFreePackage,
  moriIncompleteAllocation,
  moriInternalPrefix,
  moriLiveProducts,
  moriManualShip,
  moriOpenReceiptException,
  moriOpenReceivingTask,
  moriOrderCapacity,
  moriOrderShortage,
  moriPackagePurpose,
  moriProcurementRef,
  moriPurpose,
  moriReallocatePackages,
  moriReceiptBlocked,
  moriReceiptCanEdit,
  moriReceiptStage,
  moriReceivingRows,
  moriReceivingSearch,
  moriReconcileTasks,
  moriRescheduleActivity,
  moriRestockProducts,
  moriSaveReceipt,
  moriSetFulfilment,
  moriSetReplenish,
  moriSetSafetyStock,
  moriSupersedeRequirement,
  moriTransferHK,
  moriUnitGroups,
  moriUpdateActivity,
  moriWorkbenchRows,
  norm,
  opsState,
};
export type ReceiptStage = 'cn' | 'hk' | 'customer';
export type ReceiptResult =
  'received' | 'short' | 'wrong' | 'damaged' | 'followup';
export interface ReceiptRowInput {
  id: string;
  result: ReceiptResult;
  note?: string;
  observed?: string;
  wrongDisposition?: 'returned';
}
export interface ReceiptInput {
  stage: ReceiptStage;
  date: string;
  rows: ReceiptRowInput[];
  owner?: string;
  dueDate?: string;
  recipient?: string;
  proof?: string;
  actor?: string;
}
export interface ReceiptEvent {
  receiptId: string;
  stage: ReceiptStage;
  date: string;
  at: string;
  actor: string;
  result: ReceiptResult;
  note: string;
  observed: string | null;
  recipient: string | null;
  proof: string | null;
  from: LocationKey;
  to: LocationKey;
  owner: string | null;
  dueDate: string | null;
}
export interface ReceivingException {
  type: 'short' | 'wrong' | 'damaged';
  status: 'open' | 'resolved';
  stage: ReceiptStage;
  owner: string;
  dueDate: string;
  note: string;
  openedAt: string;
  openedBy: string;
  unexpectedId: string | null;
  updatedAt?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolution?: string;
}
export interface ReceiptRecord {
  id: string;
  stage: ReceiptStage;
  date: string;
  at: string;
  actor: string;
  packageIds: string[];
  results: ReceiptRowInput[];
  recipient: string | null;
  proof: string | null;
}
export interface UnexpectedReceipt {
  id: string;
  expectedPackageId: string;
  sku: null;
  description: string;
  location: string;
  qty: number;
  status: 'quarantined' | 'returned';
  receivedDate: string;
  receivedBy: string;
  receiptId: string;
  receivedLocation?: string;
  returnedAt?: string;
  returnedBy?: string;
  dispositionNote?: string;
}
export { moriAvailableUnits, moriStockSummary };
