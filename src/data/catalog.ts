import type { Product, ProductStatus, SourcingType, Stock } from '../types';
import type { MessageKey } from '../i18n';

/* =================================================================
 * 產品目錄 —— 示範資料
 * 真實店有 5,241 個 SKU，密集畫面一定要喺呢個量級度試過先算數，
 * 所以呢度用固定 seed 生成同樣數量，唔係擺十幾行交差。
 * 換真 API 嘅時候，淨係掉走呢個檔案就得。
 * ===============================================================*/

export const TOTAL_SKU = 5241;

/** mulberry32：細細粒、夠快、同一個 seed 每次出同一批貨 */
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

interface CategorySpec {
  key: string;
  label: string;
  prefix: string;
  /** 售價區間 */
  price: [number, number];
  forms: string[];
  /** 呢個分類真係會用嘅材質（唔限制就會生成「陶瓷餐椅」呢啲鬼嘢） */
  materials: string[];
  /** 廠家發貨表上嘅叫法（簡體），同我哋出街名對照 */
  factory: string;
  /** 廠家型號字頭（見 docs 術語表：Y 原木色 / H 胡桃色 / K 黑胡桃 / X 煙熏） */
  codePrefix: string;
  /** 一件貨拆幾多個包件（床 = 床架 + 床頭 + 鋪板） */
  packages: number;
}

const CATEGORIES: CategorySpec[] = [
  { key: 'sofa', label: '梳化', prefix: 'SF', price: [3800, 22800], forms: ['單座位', '兩座位', '三座位', 'L 形', '腳踏'], materials: ['布藝', '真皮', '藤織', '亞麻'], factory: '沙发', codePrefix: 'S', packages: 2 },
  { key: 'table', label: '餐檯', prefix: 'TB', price: [2800, 16800], forms: ['120cm', '140cm', '160cm', '180cm', '伸縮'], materials: ['橡木', '胡桃木', '松木', '雲石'], factory: '餐桌', codePrefix: 'Y', packages: 2 },
  { key: 'chair', label: '餐椅', prefix: 'CH', price: [480, 3280], forms: ['直背', '扶手', '高腳', '摺疊'], materials: ['橡木', '胡桃木', '松木', '藤織', '布藝'], factory: '餐椅', codePrefix: 'Y', packages: 1 },
  { key: 'bed', label: '床架', prefix: 'BD', price: [3200, 14800], forms: ['Single', 'Double', 'Queen', 'King'], materials: ['橡木', '胡桃木', '松木', '布藝', '真皮'], factory: '床架', codePrefix: 'Y', packages: 3 },
  { key: 'mattress', label: '床褥', prefix: 'MT', price: [1800, 12800], forms: ['Single', 'Double', 'Queen', 'King'], materials: ['布藝', '亞麻'], factory: '床垫', codePrefix: 'M', packages: 1 },
  { key: 'wardrobe', label: '衣櫃', prefix: 'WD', price: [4200, 18800], forms: ['雙門', '三門', '趟門', '開放式'], materials: ['橡木', '胡桃木', '松木'], factory: '衣柜', codePrefix: 'Y', packages: 3 },
  { key: 'shelf', label: '書架', prefix: 'BK', price: [880, 6800], forms: ['三層', '四層', '五層', '轉角'], materials: ['橡木', '胡桃木', '松木'], factory: '书架', codePrefix: 'Y', packages: 2 },
  { key: 'cabinet', label: '地櫃', prefix: 'CB', price: [1800, 13800], forms: ['120cm', '160cm', '200cm', '240cm'], materials: ['橡木', '胡桃木', '松木', '藤織'], factory: '餐边柜', codePrefix: 'Y', packages: 1 },
  { key: 'coffee', label: '茶几', prefix: 'CT', price: [980, 5800], forms: ['圓形', '長方', '嵌套', '大理石面'], materials: ['橡木', '胡桃木', '雲石', '藤織'], factory: '茶几', codePrefix: 'Y', packages: 1 },
  { key: 'side', label: '邊几', prefix: 'SD', price: [580, 2880], forms: ['45cm', '60cm', '90cm', 'C 形'], materials: ['橡木', '胡桃木', '雲石', '黃銅', '藤織'], factory: '边几', codePrefix: 'Y', packages: 1 },
  { key: 'lamp', label: '燈飾', prefix: 'LP', price: [280, 4200], forms: ['檯燈', '座地燈', '吊燈', '壁燈'], materials: ['藤織', '黃銅', '陶瓷', '亞麻'], factory: '灯具', codePrefix: 'D', packages: 1 },
  { key: 'rug', label: '地毯', prefix: 'RG', price: [680, 6800], forms: ['120x180', '160x230', '200x290', '240x340'], materials: ['亞麻', '布藝'], factory: '地毯', codePrefix: 'D', packages: 1 },
  { key: 'mirror', label: '鏡', prefix: 'MR', price: [480, 3800], forms: ['圓鏡 60cm', '全身鏡 70cm', '掛鏡 90cm'], materials: ['橡木', '胡桃木', '黃銅', '藤織'], factory: '镜子', codePrefix: 'D', packages: 1 },
  { key: 'storage', label: '收納', prefix: 'ST', price: [120, 1680], forms: ['藤籃', '布箱', '層架', '掛袋'], materials: ['藤織', '布藝', '亞麻'], factory: '收纳', codePrefix: 'D', packages: 1 },
  { key: 'bedding', label: '寢具', prefix: 'BL', price: [180, 2280], forms: ['被套組', '床笠', '枕袋', '薄被'], materials: ['亞麻', '布藝'], factory: '床品', codePrefix: 'D', packages: 1 },
  { key: 'decor', label: '家品', prefix: 'AC', price: [80, 1280], forms: ['花樽', '花盆', '托盤', '擺設', '掛鐘'], materials: ['陶瓷', '黃銅', '藤織'], factory: '饰品', codePrefix: 'D', packages: 1 },
];

const MATERIALS = [
  { label: '橡木', code: 'OAK', mul: 1.25, factory: '白橡木' },
  { label: '胡桃木', code: 'WNT', mul: 1.4, factory: '黑胡桃' },
  { label: '松木', code: 'PIN', mul: 0.85, factory: '松木' },
  { label: '藤織', code: 'RTN', mul: 1.0, factory: '藤编' },
  { label: '布藝', code: 'BCL', mul: 0.95, factory: '布艺' },
  { label: '真皮', code: 'LTH', mul: 1.7, factory: '真皮' },
  { label: '亞麻', code: 'LIN', mul: 0.9, factory: '亚麻' },
  { label: '雲石', code: 'MRB', mul: 1.55, factory: '大理石' },
  { label: '黃銅', code: 'BRS', mul: 1.15, factory: '黄铜' },
  { label: '陶瓷', code: 'CRM', mul: 0.8, factory: '陶瓷' },
];

const COLORS = ['米白', '原木', '炭灰', '奶茶', '墨綠', '焦糖', '淺灰', '深啡', '米棕', '霧藍'];
/** 廠家嘅顏色叫法，同 COLORS 一一對應 */
const FACTORY_COLORS = ['米白色', '原木色', '炭灰色', '奶茶色', '墨绿色', '焦糖色', '浅灰色', '深棕色', '米棕色', '雾霾蓝'];

/**
 * 儲定貨嘅款只佔目錄一小部分：Ocean（2026-09-23）講明基本上見貨賣貨，
 * 存貨得幾件常賣款。呢個比例係假設，備貨款清單要 Ocean 定。
 */
const STOCKED_SHARE = 0.02;
const CUSTOM_SHARE = 0.12;

export const SERIES = ['森原', '木栖', '晨光', '北岸', '簡白', '織日'];

export const SUPPLIERS = [
  '順德 · 永豐木業',
  '東莞 · 明軒家具',
  '越南 · Anh Phat',
  '台中 · 合宜木工',
  '佛山 · 恒發軟體',
  '本地 · 訂造工房',
];

export const WAREHOUSES = [
  { key: 'main', label: '葵涌倉' },
  { key: 'shop', label: '門市' },
] as const;

const pick = <T,>(rng: () => number, arr: readonly T[]) =>
  arr[Math.floor(rng() * arr.length)];

const between = (rng: () => number, min: number, max: number) =>
  min + rng() * (max - min);

/** 日期由 2026-09-22 向後數，避免每次開檔案資料都郁 */
const TODAY_MS = Date.UTC(2026, 8, 22);
const DAY = 86_400_000;

function buildProducts(): Product[] {
  const rng = mulberry32(20260922);
  const out: Product[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < TOTAL_SKU; i++) {
    const cat = pick(rng, CATEGORIES);
    // 注意：抽籤要喺 find 外面做。擺喺 predicate 入面嘅話，
    // 每 check 一個材質就會重新抽一次，十次九次一個都對唔上。
    const materialLabel = pick(rng, cat.materials);
    const material =
      MATERIALS.find((m) => m.label === materialLabel) ?? MATERIALS[0];
    const form = pick(rng, cat.forms);
    const color = pick(rng, COLORS);

    // SKU 要唯一，撞到就加後綴
    let sku = `${cat.prefix}-${material.code}-${String(
      Math.floor(between(rng, 100, 999))
    )}`;
    while (seen.has(sku)) sku = `${sku.slice(0, -1)}${Math.floor(rng() * 10)}`;
    seen.add(sku);

    const basePrice = between(rng, cat.price[0], cat.price[1]) * material.mul;
    const price = Math.round(basePrice / 20) * 20;
    const margin = between(rng, 0.34, 0.62); // 毛利率
    const cost = Math.round((price * (1 - margin)) / 10) * 10;

    const r = rng();
    const status: ProductStatus =
      r < 0.74 ? 'active' : r < 0.9 ? 'draft' : 'archived';

    const sr = rng();
    const sourcingType: SourcingType =
      sr < STOCKED_SHARE ? 'stocked' : sr < STOCKED_SHARE + CUSTOM_SHARE ? 'custom' : 'orderOnDemand';

    // 只有儲定貨款先會有在倉數同安全存量；其餘款嘅貨到港即屬某張客單，
    // 由包件（src/data/ops.ts）而唔係呢度嘅數字表示。
    const ceiling = price > 8000 ? 4 : price > 3000 ? 10 : 24;
    let stock: Stock = { main: 0, shop: 0, reserved: 0, inTransit: 0, safetyStock: 0, countedAt: '' };
    if (sourcingType === 'stocked') {
      const s = rng();
      // 一成斷貨、兩成偏低、其餘正常 —— 備貨表要有嘢提醒，但唔可以成張表都紅
      const onHandMain =
        s < 0.1 ? 0 : s < 0.3 ? Math.floor(between(rng, 1, Math.max(2, ceiling * 0.25))) : Math.floor(between(rng, ceiling * 0.4, ceiling));
      const onHandShop = rng() < 0.35 && price < 8000 ? Math.floor(between(rng, 0, 4)) : 0;
      const hand = onHandMain + onHandShop;
      const reserved =
        hand > 0 && rng() < 0.35
          ? Math.min(hand, Math.max(1, Math.floor(hand * between(rng, 0.1, 0.5))))
          : 0;
      const inTransit = rng() < 0.3 ? Math.floor(between(rng, 1, ceiling)) : 0;
      const safetyStock = Math.max(1, Math.floor(between(rng, 1, ceiling * 0.3)));
      stock = {
        main: onHandMain,
        shop: onHandShop,
        reserved,
        inTransit,
        safetyStock,
        countedAt: new Date(TODAY_MS - Math.floor(between(rng, 1, 180)) * DAY).toISOString().slice(0, 10),
      };
    }

    // 廠家型號：字頭跟顏色（Y 原木 / H 胡桃 / K 黑胡桃），後面 2 位數 + 字母 + 2 位數
    const codeHead =
      material.label === '胡桃木' ? 'H' : material.label === '真皮' ? 'K' : cat.codePrefix;
    const supplierCode = `${codeHead}${String(Math.floor(between(rng, 10, 99)))}${String.fromCharCode(65 + Math.floor(rng() * 26))}${String(Math.floor(between(rng, 10, 99))).padStart(2, '0')}`;
    const supplierName = `${material.factory}${cat.factory} ${form} ${FACTORY_COLORS[COLORS.indexOf(color)]}`;

    out.push({
      sku,
      name: `${material.label}${cat.label} · ${form}`,
      variant: color,
      category: cat.label,
      categoryKey: cat.key,
      series: pick(rng, SERIES),
      supplier: pick(rng, SUPPLIERS),
      supplierCode,
      supplierName,
      sourcingType,
      cost,
      price,
      status,
      stock,
      updatedAt: new Date(TODAY_MS - Math.floor(between(rng, 0, 120)) * DAY)
        .toISOString()
        .slice(0, 10),
    });
  }
  return out;
}

export const products = buildProducts();

/** 一件貨拆幾多個包件，按分類；生成包件同採購用 */
export const packagesPerUnit = (categoryKey: string) =>
  CATEGORIES.find((c) => c.key === categoryKey)?.packages ?? 1;

/** 儲定貨款：備貨表淨係入呢啲 */
export const stockedProducts = products.filter((p) => p.sourcingType === 'stocked');

export const CATEGORY_OPTIONS = CATEGORIES.map((c) => ({
  value: c.label,
  label: c.label,
}));

export const PRODUCT_STATUS_META: Record<
  ProductStatus,
  { labelKey: MessageKey; tone: 'success' | 'warning' | 'muted' }
> = {
  active: { labelKey: 'products.status.active', tone: 'success' },
  draft: { labelKey: 'products.status.draft', tone: 'warning' },
  archived: { labelKey: 'products.status.archived', tone: 'muted' },
};
