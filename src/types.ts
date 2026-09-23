export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'delivered'
  | 'cancelled';

export type PaymentStatus = 'unpaid' | 'deposit' | 'paid' | 'refunded';

export type Channel = 'shopify' | 'whatsapp' | 'showroom' | 'phone';

export interface OrderItem {
  sku: string;
  name: string;
  qty: number;
  price: number;
}

export interface Order {
  id: string;
  customer: { name: string; phone: string };
  channel: Channel;
  createdAt: string;
  /** null = 未約到送貨日 */
  deliveryAt: string | null;
  items: OrderItem[];
  status: OrderStatus;
  payment: PaymentStatus;
  assignee: string;
  remark?: string;
}

export const orderTotal = (o: Order) =>
  o.items.reduce((sum, i) => sum + i.qty * i.price, 0);

export const orderQty = (o: Order) =>
  o.items.reduce((sum, i) => sum + i.qty, 0);

/* ===================== 產品 / 庫存 ===================== */

export type ProductStatus = 'active' | 'draft' | 'archived';

/**
 * SPEC REF §2.2 Variant.sourcingType. Ocean (2026-09-23): the shop rarely
 * holds stock — most lines are ordered against a sale — so only `stocked`
 * variants carry a safety stock and appear on the restock sheet.
 */
export type SourcingType = 'stocked' | 'orderOnDemand' | 'custom';

export interface Stock {
  /** 葵涌倉在倉數 */
  main: number;
  /** 門市陳列／現貨 */
  shop: number;
  /** 已被訂單預留，唔可以再賣 */
  reserved: number;
  /** 廠期／船期，未到倉 */
  inTransit: number;
  safetyStock: number;
  countedAt: string;
}

export interface Product {
  sku: string;
  name: string;
  variant: string;
  category: string;
  categoryKey: string;
  series: string;
  supplier: string;
  /**
   * SPEC REF §2.2 SupplierProduct. The factory's own model code and name for
   * the same item; the internal SKU never changes (INVARIANT 5), these are
   * attributes. Data, never translated.
   */
  supplierCode: string;
  supplierName: string;
  /** 廠家發貨表上一件貨拆成幾多個包件嘅編碼字頭（床 = 床架 + 床頭 + 鋪板） */
  packageStems: string[];
  sourcingType: SourcingType;
  cost: number;
  price: number;
  status: ProductStatus;
  stock: Stock;
  updatedAt: string;
}

export type StockState = 'out' | 'low' | 'ok';

export const onHand = (s: Stock) => s.main + s.shop;

/** 可售 = 在倉 − 已預留。落單睇嘅係呢個數，唔係在倉數。 */
export const sellable = (s: Stock) => Math.max(0, onHand(s) - s.reserved);

export const stockState = (s: Stock): StockState => {
  const avail = sellable(s);
  if (avail <= 0) return 'out';
  if (avail < s.safetyStock) return 'low';
  return 'ok';
};

export const margin = (p: Product) =>
  p.price > 0 ? (p.price - p.cost) / p.price : 0;
