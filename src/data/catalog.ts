import items from './fixtures/items.json';
import type { Product, ProductStatus, SourcingType, Stock } from '../types';
import type { MessageKey } from '../i18n';

/* =================================================================
 * 產品目錄 —— 由 Alex 份營運 Excel 抽出嘅廠家目錄（scripts/build-fixtures.mjs）
 *
 * 681 件：600 件源氏（有型號、廠家品名、規格、人民幣價、包件拆法）、
 * 永偉 / 小敏 / 實木訂製 嘅訂造同復古款、床褥品牌（MEI / 澳美斯 / 金寶麗…）。
 * 出街名 = 廠家品名去咗型號、簡轉繁；真出街名由 Shopify 同步層嚟，呢度先頂住。
 * 客戶資料一個都冇讀過；Excel 本身唔入 repo。
 * ===============================================================*/

interface FixtureItem {
  supplier: string;
  supplierCode: string;
  supplierName: string;
  ownName: string;
  spec: string;
  priceCny: number | null;
  packages: string[];
  category: string;
  sourcingType: SourcingType;
}

const CATEGORIES: { key: string; label: string; prefix: string; factory: string }[] = [
  { key: 'bed', label: '床架', prefix: 'BD', factory: '床架' },
  { key: 'mattress', label: '床褥', prefix: 'MT', factory: '床垫' },
  { key: 'sofa', label: '梳化', prefix: 'SF', factory: '沙发' },
  { key: 'wardrobe', label: '衣櫃', prefix: 'WD', factory: '衣柜' },
  { key: 'cabinet', label: '櫃', prefix: 'CB', factory: '柜' },
  { key: 'table', label: '餐檯', prefix: 'TB', factory: '餐桌' },
  { key: 'desk', label: '書桌', prefix: 'DK', factory: '书桌' },
  { key: 'chair', label: '椅凳', prefix: 'CH', factory: '椅' },
  { key: 'shelf', label: '層架', prefix: 'BK', factory: '架' },
  { key: 'coffee', label: '茶几', prefix: 'CT', factory: '茶几' },
  { key: 'side', label: '邊几 / 床頭櫃', prefix: 'SD', factory: '边几' },
  { key: 'mirror', label: '鏡', prefix: 'MR', factory: '镜' },
  { key: 'lamp', label: '燈飾', prefix: 'LP', factory: '灯' },
  { key: 'storage', label: '收納', prefix: 'ST', factory: '收纳' },
  { key: 'decor', label: '家品', prefix: 'AC', factory: '饰品' },
];

const categoryByKey = new Map(CATEGORIES.map((c) => [c.key, c]));

/** mulberry32：固定 seed，每次開都係同一批數 */
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
const between = (rng: () => number, min: number, max: number) => min + rng() * (max - min);

const TODAY_MS = Date.UTC(2026, 8, 22);
const DAY = 86_400_000;
const daysAgo = (rng: () => number, min: number, max: number) =>
  new Date(TODAY_MS - Math.floor(between(rng, min, max)) * DAY).toISOString().slice(0, 10);

/**
 * 人民幣 → 港幣成本用 1.08；售價 = 成本 × 2.75（spec Q5 提到嘅 priceMultiplier，用途未確認）。
 * 冇人民幣價嘅（永偉 / 小敏 / 床褥）按分類抽一個合理數。
 */
const FX = 1.08;
const PRICE_MULTIPLIER = 2.75;

const FALLBACK_PRICE: Record<string, [number, number]> = {
  bed: [6800, 14800],
  sofa: [7800, 22800],
  chair: [880, 3280],
  table: [4800, 16800],
  cabinet: [3200, 12800],
  mattress: [2800, 9800],
  decor: [280, 1280],
};

export const SERIES = ['和素', '柏林', '清里', '格林', '布拉格', '摩卡', '冉冉', '悠悠'];

function buildProducts(): Product[] {
  const rng = mulberry32(20260923);
  const counters = new Map<string, number>();
  return (items as FixtureItem[]).map((it, idx) => {
    const cat = categoryByKey.get(it.category) ?? categoryByKey.get('decor')!;
    const n = (counters.get(cat.key) ?? 0) + 1;
    counters.set(cat.key, n);
    const sku = `${cat.prefix}-${String(n).padStart(4, '0')}`;

    const cost = it.priceCny
      ? Math.round((it.priceCny * FX) / 10) * 10
      : Math.round(between(rng, ...(FALLBACK_PRICE[cat.key] ?? [800, 4800])) * 0.4 / 10) * 10;
    const price = Math.round((cost * PRICE_MULTIPLIER) / 20) * 20;

    // 源氏標準款多數已上架；訂造同床褥款 draft 多啲（未上 Shopify）
    const r = rng();
    const status: ProductStatus =
      it.sourcingType === 'custom' ? (r < 0.5 ? 'draft' : 'active') : r < 0.82 ? 'active' : r < 0.94 ? 'draft' : 'archived';

    let stock: Stock = { main: 0, shop: 0, reserved: 0, inTransit: 0, safetyStock: 0, countedAt: '' };
    if (it.sourcingType === 'stocked') {
      const ceiling = price > 8000 ? 4 : price > 3000 ? 8 : 16;
      const s = rng();
      const main = s < 0.1 ? 0 : s < 0.3 ? Math.floor(between(rng, 1, Math.max(2, ceiling * 0.3))) : Math.floor(between(rng, ceiling * 0.4, ceiling));
      const shop = rng() < 0.4 ? Math.floor(between(rng, 0, 3)) : 0;
      const hand = main + shop;
      const reserved = hand > 0 && rng() < 0.35 ? Math.max(1, Math.floor(hand * between(rng, 0.1, 0.5))) : 0;
      stock = {
        main,
        shop,
        reserved,
        inTransit: rng() < 0.3 ? Math.floor(between(rng, 1, ceiling)) : 0,
        safetyStock: Math.max(1, Math.floor(between(rng, 1, ceiling * 0.3))),
        countedAt: daysAgo(rng, 1, 120),
      };
    }

    // 廠家系列名（和素·／柏林·）就係 series；冇嘅跟分類輪流派
    const seriesMatch = it.supplierName.match(/\s([一-龥]{2,4})·/);
    const series = seriesMatch ? seriesMatch[1] : SERIES[idx % SERIES.length];

    return {
      sku,
      name: it.ownName,
      variant: it.spec || '—',
      category: cat.label,
      categoryKey: cat.key,
      series,
      supplier: it.supplier,
      supplierCode: it.supplierCode || `${it.supplier}-${String(n).padStart(3, '0')}`,
      supplierName: it.supplierName,
      packageStems: it.packages.length ? it.packages : [it.supplierCode || sku],
      sourcingType: it.sourcingType,
      cost,
      price,
      status,
      stock,
      updatedAt: daysAgo(rng, 0, 120),
    };
  });
}

export const products = buildProducts();
export const TOTAL_SKU = products.length;

/** 儲定貨款：備貨表淨係入呢啲 */
export const stockedProducts = products.filter((p) => p.sourcingType === 'stocked');

/** 一件貨拆幾多個包件（由廠家發貨表嘅包件編碼數） */
export const packagesPerUnit = (p: Product) => Math.max(1, p.packageStems.length);

export const SUPPLIERS = [...new Set(products.map((p) => p.supplier))];

export const CATEGORY_OPTIONS = CATEGORIES.map((c) => ({ value: c.label, label: c.label }));

export const PRODUCT_STATUS_META: Record<
  ProductStatus,
  { labelKey: MessageKey; tone: 'success' | 'warning' | 'muted' }
> = {
  active: { labelKey: 'products.status.active', tone: 'success' },
  draft: { labelKey: 'products.status.draft', tone: 'warning' },
  archived: { labelKey: 'products.status.archived', tone: 'muted' },
};
