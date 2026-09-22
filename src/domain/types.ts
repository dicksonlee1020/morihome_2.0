/**
 * Operational core types.
 * SPEC REF: docs/design/erp-redesign-spec.md §2.4 (stock movement), §2.5
 * (delivery), §3 (the one state machine), §4 (derivation rules).
 *
 * INVARIANT 1: PackageUnit.location is the single source of truth, and the only
 *   way to change it is a StockMove going assigned -> done. Nothing in this
 *   module exposes a writer for it.
 * INVARIANT 2: derived values (delivery status, procurement status, sellable
 *   quantity, activity overdue) have no setters and no storage. They live in
 *   derive.ts as pure functions.
 */

/* ---------------------------------------------------------------- locations */

/** Seed locations, §2.4. */
export type LocationKey =
  | 'supplier'
  | 'cnWarehouse'
  | 'transit'
  | 'hkWarehouse'
  | 'showroom'
  | 'customer'
  | 'returnArea'
  | 'stockLoss';

export type LocationUsage = 'supplier' | 'internal' | 'transit' | 'customer' | 'loss';

export const LOCATION_USAGE: Record<LocationKey, LocationUsage> = {
  supplier: 'supplier',
  cnWarehouse: 'internal',
  transit: 'transit',
  hkWarehouse: 'internal',
  showroom: 'internal',
  customer: 'customer',
  returnArea: 'internal',
  stockLoss: 'loss',
};

/** In Hong Kong and therefore schedulable, §4 lineStatus. */
export const IN_HK: LocationKey[] = ['hkWarehouse', 'showroom'];

/** Still upstream of Hong Kong, §4 lineStatus. */
export const UPSTREAM: LocationKey[] = ['supplier', 'cnWarehouse', 'transit'];

/* ------------------------------------------------------------ package units */

export interface PackageUnit {
  id: string;
  packageCode: string;
  /** null = stock (not committed to an order line), §2.4 */
  orderLineId: string | null;
  /** INVARIANT 1: written only by a StockMove reaching done. */
  location: LocationKey;
  /** When it landed at its current internal location; drives escalation. */
  arrivedAt: string | null;
}

/* --------------------------------------------------------------- stock move */

/** §3 — the only state machine in the system. */
export type StockMoveState =
  | 'draft'
  | 'waiting'
  | 'confirmed'
  | 'assigned'
  | 'done'
  | 'cancelled';

export type StockMoveType =
  | 'purchaseReceipt'
  | 'transit'
  | 'arrivalQc'
  | 'deliverToCustomer'
  | 'internalTransfer'
  | 'stocktakeAdjustment'
  | 'writeOff'
  | 'openingBalance';

export interface StockMove {
  id: string;
  type: StockMoveType;
  /** §3: system-computed except for the human confirmation into done. */
  state: StockMoveState;
  from: LocationKey;
  to: LocationKey;
  scheduledDate: string | null;
  doneDate: string | null;
  packageUnitIds: string[];
}

/* ------------------------------------------------------------- order / line */

export interface OrderLine {
  id: string;
  orderId: string;
  /** Product or custom item, shown as-is; never translated. */
  itemName: string;
  qty: number;
}

/** Fixtures use a pseudonym plus a district only — never real customer data. */
export interface CustomerRef {
  id: string;
  alias: string;
  district: string;
}

export interface SalesOrder {
  id: string;
  orderNo: string;
  customer: CustomerRef;
  /** §2.1 — what the customer asked for, kept apart from scheduledDate. */
  customerRequestedDate: string | null;
  customerRequestedNote: string;
}

/* ------------------------------------------------------------ delivery side */

export type TimeSlot = 'morning' | 'afternoon' | 'evening' | 'flexible';

/**
 * §2.5 — a delivery order exists before it has a date. A null scheduledDate is
 * the normal "arrived, not booked yet" case, not a missing value to fix.
 */
export interface DeliveryOrder {
  id: string;
  orderId: string;
  scheduledDate: string | null;
  timeSlot: TimeSlot | null;
  completedDate: string | null;
}

/* ------------------------------------------------------------------ activity */

/**
 * §2.5 — follow-up to-dos. Chained through nextActivityId, so "couldn't reach
 * the customer" closes one activity and opens the next instead of editing it.
 *
 * TODO(spec): the kind list is not enumerated in the spec. These four cover the
 * procurement/logistics follow-up screen; confirm the full list with Alex/Ocean.
 */
export type ActivityKind =
  | 'scheduleDelivery'
  | 'confirmArrival'
  | 'chaseSupplier'
  | 'chasePayment';

export type ActivityFeedback = 'unreachable' | 'customerPostponed' | 'scheduled';

export interface Activity {
  id: string;
  kind: ActivityKind;
  orderId: string;
  dueDate: string;
  owner: string;
  feedback: ActivityFeedback | null;
  note: string;
  doneAt: string | null;
  /** Set when this activity was closed by opening a follow-on one. */
  nextActivityId: string | null;
  /** Which attempt in the chain this is; 1 for the first. */
  seq: number;
}

/** §4 lineStatus results. */
export type LineStatus =
  | 'notProcured'
  | 'inTransit'
  | 'readyToSchedule'
  | 'partiallyDelivered'
  | 'delivered';

/** §4 activityState results. */
export type ActivityState = 'done' | 'overdue' | 'today' | 'planned';
