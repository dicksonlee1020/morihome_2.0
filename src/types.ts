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
