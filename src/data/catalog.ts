import type { Product, ProductStatus, Stock } from '../types';
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
}

const CATEGORIES: CategorySpec[] = [
  { key: 'sofa', label: '梳化', prefix: 'SF', price: [3800, 22800], forms: ['單座位', '兩座位', '三座位', 'L 形', '腳踏'], materials: ['布藝', '真皮', '藤織', '亞麻'] },
  { key: 'table', label: '餐檯', prefix: 'TB', price: [2800, 16800], forms: ['120cm', '140cm', '160cm', '180cm', '伸縮'], materials: ['橡木', '胡桃木', '松木', '雲石'] },
  { key: 'chair', label: '餐椅', prefix: 'CH', price: [480, 3280], forms: ['直背', '扶手', '高腳', '摺疊'], materials: ['橡木', '胡桃木', '松木', '藤織', '布藝'] },
  { key: 'bed', label: '床架', prefix: 'BD', price: [3200, 14800], forms: ['Single', 'Double', 'Queen', 'King'], materials: ['橡木', '胡桃木', '松木', '布藝', '真皮'] },
  { key: 'mattress', label: '床褥', prefix: 'MT', price: [1800, 12800], forms: ['Single', 'Double', 'Queen', 'King'], materials: ['布藝', '亞麻'] },
  { key: 'wardrobe', label: '衣櫃', prefix: 'WD', price: [4200, 18800], forms: ['雙門', '三門', '趟門', '開放式'], materials: ['橡木', '胡桃木', '松木'] },
  { key: 'shelf', label: '書架', prefix: 'BK', price: [880, 6800], forms: ['三層', '四層', '五層', '轉角'], materials: ['橡木', '胡桃木', '松木'] },
  { key: 'cabinet', label: '地櫃', prefix: 'CB', price: [1800, 13800], forms: ['120cm', '160cm', '200cm', '240cm'], materials: ['橡木', '胡桃木', '松木', '藤織'] },
  { key: 'coffee', label: '茶几', prefix: 'CT', price: [980, 5800], forms: ['圓形', '長方', '嵌套', '大理石面'], materials: ['橡木', '胡桃木', '雲石', '藤織'] },
  { key: 'side', label: '邊几', prefix: 'SD', price: [580, 2880], forms: ['45cm', '60cm', '90cm', 'C 形'], materials: ['橡木', '胡桃木', '雲石', '黃銅', '藤織'] },
  { key: 'lamp', label: '燈飾', prefix: 'LP', price: [280, 4200], forms: ['檯燈', '座地燈', '吊燈', '壁燈'], materials: ['藤織', '黃銅', '陶瓷', '亞麻'] },
  { key: 'rug', label: '地毯', prefix: 'RG', price: [680, 6800], forms: ['120x180', '160x230', '200x290', '240x340'], materials: ['亞麻', '布藝'] },
  { key: 'mirror', label: '鏡', prefix: 'MR', price: [480, 3800], forms: ['圓鏡 60cm', '全身鏡 70cm', '掛鏡 90cm'], materials: ['橡木', '胡桃木', '黃銅', '藤織'] },
  { key: 'storage', label: '收納', prefix: 'ST', price: [120, 1680], forms: ['藤籃', '布箱', '層架', '掛袋'], materials: ['藤織', '布藝', '亞麻'] },
  { key: 'bedding', label: '寢具', prefix: 'BL', price: [180, 2280], forms: ['被套組', '床笠', '枕袋', '薄被'], materials: ['亞麻', '布藝'] },
  { key: 'decor', label: '家品', prefix: 'AC', price: [80, 1280], forms: ['花樽', '花盆', '托盤', '擺設', '掛鐘'], materials: ['陶瓷', '黃銅', '藤織'] },
];

const MATERIALS = [
  { label: '橡木', code: 'OAK', mul: 1.25 },
  { label: '胡桃木', code: 'WNT', mul: 1.4 },
  { label: '松木', code: 'PIN', mul: 0.85 },
  { label: '藤織', code: 'RTN', mul: 1.0 },
  { label: '布藝', code: 'BCL', mul: 0.95 },
  { label: '真皮', code: 'LTH', mul: 1.7 },
  { label: '亞麻', code: 'LIN', mul: 0.9 },
  { label: '雲石', code: 'MRB', mul: 1.55 },
  { label: '黃銅', code: 'BRS', mul: 1.15 },
  { label: '陶瓷', code: 'CRM', mul: 0.8 },
];

const COLORS = ['米白', '原木', '炭灰', '奶茶', '墨綠', '焦糖', '淺灰', '深啡', '米棕', '霧藍'];

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

    // 貴嘅大件貨唔會擺幾十件喺倉，平嘅家品先會。一成斷晒貨，三成偏低。
    const ceiling = price > 8000 ? 5 : price > 3000 ? 14 : 60;
    const s = rng();
    const onHandMain =
      s < 0.1
        ? 0
        : s < 0.4
          ? Math.floor(between(rng, 1, Math.max(2, ceiling * 0.2)))
          : Math.floor(between(rng, 1, ceiling));
    const onHandShop = rng() < 0.35 && price < 8000 ? Math.floor(between(rng, 0, 4)) : 0;
    // 預留量要跟在倉量走。獨立抽 0–8 嘅話，得一兩件貨嗰啲 SKU 會被食清，
    // 成張表有四成幾標住「缺貨」，睇落就假。
    const hand = onHandMain + onHandShop;
    const reserved =
      hand > 0 && rng() < 0.35
        ? Math.min(hand, Math.max(1, Math.floor(hand * between(rng, 0.1, 0.5))))
        : 0;
    const inTransit = rng() < 0.22 ? Math.floor(between(rng, 1, ceiling)) : 0;
    const safetyStock = Math.max(1, Math.floor(between(rng, 1, ceiling * 0.35)));

    const stock: Stock = {
      main: onHandMain,
      shop: onHandShop,
      reserved,
      inTransit,
      safetyStock,
      countedAt: new Date(
        TODAY_MS - Math.floor(between(rng, 1, 180)) * DAY
      )
        .toISOString()
        .slice(0, 10),
    };

    out.push({
      sku,
      name: `${material.label}${cat.label} · ${form}`,
      variant: color,
      category: cat.label,
      categoryKey: cat.key,
      series: pick(rng, SERIES),
      supplier: pick(rng, SUPPLIERS),
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
