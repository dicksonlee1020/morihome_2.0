/**
 * Build src/data/fixtures/items.json from Alex's operations workbook.
 *
 *   node scripts/build-fixtures.mjs <path-to-xlsx>
 *
 * The workbook itself is never committed (it carries live order numbers and
 * follow-up notes). Only the product vocabulary comes through: the factory's
 * model code, name, spec, CNY price and how a unit splits into packages.
 * No customer field is read at all.
 */
import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';
import * as OpenCC from 'opencc-js';

const src = process.argv[2];
if (!src) throw new Error('usage: node scripts/build-fixtures.mjs <xlsx>');
const wb = XLSX.readFile(src);
const s2t = OpenCC.Converter({ from: 'cn', to: 'tw' });

const CAT_RULES = [
  ['mattress', /床垫|床褥/],
  ['bed', /床|牀/],
  ['sofa', /沙发/],
  ['wardrobe', /衣柜/],
  ['desk', /书桌|化妆桌|工作台|电脑桌/],
  ['table', /餐桌|圆桌|方桌|餐台|伸缩桌|折叠桌|岛台/],
  ['chair', /椅|凳/],
  ['shelf', /书架|置物架|书柜|层架|挂衣架|衣帽架/],
  ['coffee', /茶几/],
  ['side', /边几|边桌|床头柜/],
  ['cabinet', /柜/],
  ['mirror', /镜/],
  ['lamp', /灯/],
  ['storage', /收纳|箱|篮/],
];
const categoryOf = (name) => CAT_RULES.find(([, re]) => re.test(name))?.[0] ?? 'decor';

const items = new Map();
const pkgs = new Map();
const stockedCodes = new Set();
let cur = null;
for (const sheet of ['已發貨', '到大陸倉', '要上港車', '已發貨到香港', 'KT備貨', '陳列中', '旺角', 'KT']) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: '' });
  for (const r of rows.slice(1)) {
    const code = String(r[0]).trim();
    const name = String(r[1]).trim();
    const spec = String(r[2]).trim();
    const rawPrice = r[4];
    const contract = String(r[7]).trim();
    const pkg = String(r[9]).trim().replace(/\(.*\)$/, '').replace(/（.*）$/, '');
    if (/^[A-Z]{1,2}\d/.test(code) && name) {
      cur = code;
      const price = typeof rawPrice === 'number' ? rawPrice : parseFloat(String(rawPrice).replace(/[￥¥,]/g, '')) || null;
      const it = items.get(code) ?? { code, name, spec, priceCny: price, seen: 0 };
      if (!it.priceCny && price) it.priceCny = price;
      if (!it.spec && spec) it.spec = spec;
      it.seen += 1;
      items.set(code, it);
      if (!pkgs.has(code)) pkgs.set(code, new Set());
      if (/^備/.test(contract)) stockedCodes.add(code);
    } else if (code) {
      cur = null;
    }
    if (cur && pkg && /^[A-Z]/.test(pkg)) pkgs.get(cur).add(pkg);
  }
}

const factory = [...items.values()]
  .filter((i) => i.priceCny && i.priceCny > 50 && i.name.length > 6)
  // stocked lines first (the restock sheet needs them), then by how often Alex handled the item
  .sort((a, b) => Number(stockedCodes.has(b.code)) - Number(stockedCodes.has(a.code)) || b.seen - a.seen)
  .slice(0, 600)
  .map((i) => {
    const stems = [...pkgs.get(i.code)].filter((p) => p.length >= 6).slice(0, 4);
    // "Y09BB0025 和素·低铺大板床…" → own name drops the code, converts to Traditional
    const own = s2t(i.name.replace(/^[A-Z0-9]+\s*/, '').replace(/【[^】]*】/g, '').replace(/\s+/g, ' ').trim());
    return {
      supplier: '源氏',
      supplierCode: i.code,
      supplierName: i.name,
      ownName: own,
      spec: i.spec,
      priceCny: Math.round(i.priceCny),
      packages: stems.length ? stems : [i.code.replace(/T\d?$/, '')],
      category: categoryOf(i.name),
      sourcingType: stockedCodes.has(i.code) ? 'stocked' : 'orderOnDemand',
    };
  });

// 永偉 (custom beds) and 小敏 (retro sofas / chairs): names already Traditional.
const custom = [];
for (const [sheet, col] of [['訂貨', 0], ['要上港車', 0], ['KT', 0]]) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: '' });
  for (const r of rows.slice(1)) {
    const sup = String(r[col]).trim();
    const name = String(r[1]).replace(/\s+/g, ' ').trim();
    const spec = String(r[2]).trim();
    if (!['永偉', '小敏', '實木訂製', '老王'].includes(sup) || name.length < 4) continue;
    if (custom.some((c) => c.supplierName === name)) continue;
    custom.push({
      supplier: sup,
      supplierCode: '',
      supplierName: name,
      ownName: name,
      spec,
      priceCny: null,
      packages: [],
      category: /床/.test(name) ? 'bed' : /沙發|梳化|沙发/.test(name) ? 'sofa' : /椅|凳/.test(name) ? 'chair' : /桌|枱/.test(name) ? 'table' : /櫃|柜/.test(name) ? 'cabinet' : 'decor',
      sourcingType: sup === '永偉' || sup === '實木訂製' ? 'custom' : 'orderOnDemand',
    });
  }
}

// Mattresses: brand + model + size, from the 床褥 sheets.
const mattress = new Map();
for (const sheet of ['床褥訂貨', '床褥到KT']) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: '' });
  for (const r of rows.slice(1)) {
    const brand = String(r[0]).trim();
    const model = String(r[2]).trim();
    const size = String(r[3]).trim();
    const thick = r[4];
    if (!brand || !model || !size || brand.length > 6) continue;
    const key = `${brand}|${model}|${size}|${thick}`;
    if (!mattress.has(key)) mattress.set(key, { brand, model, size, thick });
  }
}
const mattresses = [...mattress.values()].slice(0, 40).map((m) => ({
  supplier: m.brand === 'MEI' ? 'MEI 美夢詩' : m.brand,
  supplierCode: '',
  supplierName: `${m.model} ${m.size}${m.thick ? ` ${m.thick}"` : ''}`,
  ownName: `${m.model} 床褥 ${m.size}${m.thick ? ` ${m.thick}吋` : ''}`,
  spec: m.size,
  priceCny: null,
  packages: [],
  category: 'mattress',
  sourcingType: 'orderOnDemand',
}));

const out = [...factory, ...custom.slice(0, 80), ...mattresses];
fs.mkdirSync(path.join('src', 'data', 'fixtures'), { recursive: true });
fs.writeFileSync(path.join('src', 'data', 'fixtures', 'items.json'), JSON.stringify(out));
const byCat = {};
for (const i of out) byCat[i.category] = (byCat[i.category] ?? 0) + 1;
console.log(`items: ${out.length} (factory ${factory.length}, custom ${Math.min(custom.length, 80)}, mattress ${mattresses.length})`, byCat, 'stocked:', out.filter((i) => i.sourcingType === 'stocked').length);
