import { colors } from '../theme';
import type { MessageKey } from '../i18n';
import type {
  Channel,
  Order,
  OrderStatus,
  PaymentStatus,
} from '../types';

/** Status colours come from the theme; labels are i18n keys, never text. */
export const STATUS_META: Record<
  OrderStatus,
  { labelKey: MessageKey; color: string; bg: string }
> = {
  pending: { labelKey: 'orders.status.pending', color: colors.warningText, bg: colors.warningBg },
  confirmed: { labelKey: 'orders.status.confirmed', color: colors.primary, bg: colors.primarySubtle },
  preparing: { labelKey: 'orders.status.preparing', color: colors.wood, bg: colors.sand },
  ready: { labelKey: 'orders.status.ready', color: colors.primary, bg: colors.primarySubtle },
  delivered: { labelKey: 'orders.status.delivered', color: colors.success, bg: colors.successBg },
  cancelled: { labelKey: 'orders.status.cancelled', color: colors.textSecondary, bg: colors.bgHover },
};

export const PAYMENT_META: Record<
  PaymentStatus,
  { labelKey: MessageKey; color: string; bg: string }
> = {
  unpaid: { labelKey: 'orders.paymentStatus.unpaid', color: colors.error, bg: colors.errorBg },
  deposit: { labelKey: 'orders.paymentStatus.deposit', color: colors.warningText, bg: colors.warningBg },
  paid: { labelKey: 'orders.paymentStatus.paid', color: colors.success, bg: colors.successBg },
  refunded: { labelKey: 'orders.paymentStatus.refunded', color: colors.textSecondary, bg: colors.bgHover },
};

export const CHANNEL_META: Record<Channel, { labelKey: MessageKey }> = {
  shopify: { labelKey: 'orders.channel.shopify' },
  whatsapp: { labelKey: 'orders.channel.whatsapp' },
  showroom: { labelKey: 'orders.channel.showroom' },
  phone: { labelKey: 'orders.channel.phone' },
};

export const STATUS_ORDER: OrderStatus[] = [
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'delivered',
  'cancelled',
];

export const orders: Order[] = [
  {
    id: 'MH-24091',
    customer: { name: '陳小姐', phone: '9123 4567' },
    channel: 'shopify',
    createdAt: '2026-09-21',
    deliveryAt: '2026-09-26',
    status: 'pending',
    payment: 'deposit',
    assignee: 'Ocean',
    remark: '客要求送貨前一日先 call',
    items: [
      { sku: 'SF-OAK-3S', name: '橡木三座位梳化 · 米白布', qty: 1, price: 8880 },
      { sku: 'CU-LN-45', name: '亞麻抱枕 45cm', qty: 2, price: 180 },
    ],
  },
  {
    id: 'MH-24090',
    customer: { name: 'Karen Lau', phone: '6288 1120' },
    channel: 'whatsapp',
    createdAt: '2026-09-21',
    deliveryAt: null,
    status: 'pending',
    payment: 'unpaid',
    assignee: 'Alex',
    remark: '等客覆實尺寸',
    items: [
      { sku: 'TB-WN-160', name: '胡桃木餐檯 160cm', qty: 1, price: 6480 },
      { sku: 'CH-WN-01', name: '胡桃木餐椅', qty: 4, price: 980 },
    ],
  },
  {
    id: 'MH-24088',
    customer: { name: '黃生', phone: '9876 2314' },
    channel: 'showroom',
    createdAt: '2026-09-20',
    deliveryAt: '2026-09-24',
    status: 'confirmed',
    payment: 'deposit',
    assignee: 'Ocean',
    items: [
      { sku: 'BD-OAK-QN', name: '橡木床架 Queen', qty: 1, price: 7200 },
      { sku: 'MT-LTX-QN', name: '乳膠床褥 Queen', qty: 1, price: 4580 },
    ],
  },
  {
    id: 'MH-24087',
    customer: { name: 'Jason Ho', phone: '5432 8890' },
    channel: 'shopify',
    createdAt: '2026-09-20',
    deliveryAt: '2026-09-23',
    status: 'preparing',
    payment: 'paid',
    assignee: 'Alex',
    items: [
      { sku: 'BK-PIN-5T', name: '松木五層書架', qty: 2, price: 1980 },
      { sku: 'LP-RT-01', name: '藤織檯燈', qty: 1, price: 760 },
    ],
  },
  {
    id: 'MH-24086',
    customer: { name: '李太', phone: '9011 7765' },
    channel: 'phone',
    createdAt: '2026-09-19',
    deliveryAt: '2026-09-22',
    status: 'ready',
    payment: 'paid',
    assignee: 'Ocean',
    remark: '大廈唔夠位上電梯，要行樓梯上 3 樓',
    items: [
      { sku: 'WD-OAK-2D', name: '橡木雙門衣櫃', qty: 1, price: 9800 },
    ],
  },
  {
    id: 'MH-24085',
    customer: { name: 'Michelle Tsang', phone: '6712 0098' },
    channel: 'shopify',
    createdAt: '2026-09-19',
    deliveryAt: '2026-09-21',
    status: 'ready',
    payment: 'deposit',
    assignee: 'Alex',
    items: [
      { sku: 'SF-BCL-2S', name: '布藝兩座位梳化 · 灰', qty: 1, price: 5880 },
      { sku: 'RG-JT-200', name: '黃麻地毯 200x290', qty: 1, price: 2280 },
    ],
  },
  {
    id: 'MH-24083',
    customer: { name: '鄭先生', phone: '9233 4401' },
    channel: 'showroom',
    createdAt: '2026-09-18',
    deliveryAt: '2026-09-20',
    status: 'delivered',
    payment: 'paid',
    assignee: 'Ocean',
    items: [
      { sku: 'TB-OAK-120', name: '橡木咖啡檯 120cm', qty: 1, price: 3280 },
      { sku: 'SD-OAK-90', name: '橡木邊几 90cm', qty: 2, price: 1180 },
    ],
  },
  {
    id: 'MH-24082',
    customer: { name: 'Winnie Chan', phone: '6099 3388' },
    channel: 'whatsapp',
    createdAt: '2026-09-18',
    deliveryAt: '2026-09-20',
    status: 'delivered',
    payment: 'paid',
    assignee: 'Alex',
    items: [
      { sku: 'CH-RT-AC', name: '藤織扶手椅', qty: 2, price: 2480 },
    ],
  },
  {
    id: 'MH-24081',
    customer: { name: '何小姐', phone: '9445 6612' },
    channel: 'shopify',
    createdAt: '2026-09-17',
    deliveryAt: '2026-09-19',
    status: 'delivered',
    payment: 'paid',
    assignee: 'Ocean',
    items: [
      { sku: 'MR-OAK-70', name: '橡木全身鏡 70cm', qty: 1, price: 2180 },
      { sku: 'HK-BR-04', name: '黃銅掛勾 四件裝', qty: 3, price: 320 },
    ],
  },
  {
    id: 'MH-24079',
    customer: { name: 'Ryan Wong', phone: '5188 2244' },
    channel: 'shopify',
    createdAt: '2026-09-16',
    deliveryAt: null,
    status: 'cancelled',
    payment: 'refunded',
    assignee: 'Alex',
    remark: '客改咗主意，已全數退款',
    items: [
      { sku: 'SF-LTH-3S', name: '真皮三座位梳化 · 焦糖', qty: 1, price: 16800 },
    ],
  },
  {
    id: 'MH-24078',
    customer: { name: '梁太', phone: '9667 1023' },
    channel: 'phone',
    createdAt: '2026-09-16',
    deliveryAt: '2026-09-25',
    status: 'confirmed',
    payment: 'deposit',
    assignee: 'Ocean',
    items: [
      { sku: 'TB-MRB-140', name: '雲石餐檯 140cm', qty: 1, price: 11800 },
      { sku: 'CH-BCL-02', name: '布藝餐椅 · 灰', qty: 6, price: 880 },
    ],
  },
  {
    id: 'MH-24077',
    customer: { name: 'Sandy Ip', phone: '6345 9901' },
    channel: 'showroom',
    createdAt: '2026-09-15',
    deliveryAt: '2026-09-27',
    status: 'preparing',
    payment: 'deposit',
    assignee: 'Alex',
    remark: '訂造尺寸，廠期 4 星期',
    items: [
      { sku: 'CB-CUS-240', name: '訂造地櫃 240cm', qty: 1, price: 13800 },
    ],
  },
  {
    id: 'MH-24075',
    customer: { name: '周生', phone: '9002 7788' },
    channel: 'whatsapp',
    createdAt: '2026-09-14',
    deliveryAt: '2026-09-18',
    status: 'delivered',
    payment: 'paid',
    assignee: 'Ocean',
    items: [
      { sku: 'BD-PIN-SG', name: '松木床架 Single', qty: 2, price: 3280 },
      { sku: 'MT-SPR-SG', name: '彈簧床褥 Single', qty: 2, price: 2180 },
    ],
  },
  {
    id: 'MH-24074',
    customer: { name: 'Tiffany Kwok', phone: '5566 3312' },
    channel: 'shopify',
    createdAt: '2026-09-13',
    deliveryAt: '2026-09-17',
    status: 'delivered',
    payment: 'paid',
    assignee: 'Alex',
    items: [
      { sku: 'PL-CR-M', name: '陶瓷花盆 M', qty: 4, price: 260 },
      { sku: 'VS-GL-28', name: '玻璃花樽 28cm', qty: 2, price: 380 },
    ],
  },
];
