import { productOf } from '../data/ops';
import type { PurchaseOrder, Requirement } from '../data/ops';

/**
 * 採購表（畀供應商嘅 Excel）。用廠家嘅型號同叫法，唔用我哋出街名；
 * 訂單號留一欄畀廠家喺發貨表寫返嚟對數。
 * 欄名係廠家睇嘅資料（簡體），唔屬 UI string key。
 */
/** SheetJS 係 400KB+，只有撳「下載採購表」先載入，唔入首屏 bundle。 */
export async function downloadPurchaseSheet(po: PurchaseOrder, requirements: Requirement[]) {
  const XLSX = await import('xlsx');
  const reqById = new Map(requirements.map((r) => [r.id, r]));
  const rows = po.lines.map((l, i) => {
    const p = productOf(l.sku);
    const r = reqById.get(l.requirementId);
    return {
      序号: i + 1,
      型号: p?.supplierCode ?? '',
      品名: p?.supplierName ?? l.sku,
      数量: l.qty,
      订单号: r?.orderNo ?? '',
      备注: '',
    };
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 6 }, { wch: 12 }, { wch: 40 }, { wch: 6 }, { wch: 12 }, { wch: 20 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '采购单');
  const meta = XLSX.utils.aoa_to_sheet([
    ['采购批次', po.batchNo],
    ['供应商', po.supplier],
    ['日期', po.createdAt],
    ['行数', po.lines.length],
  ]);
  XLSX.utils.book_append_sheet(wb, meta, '信息');
  // 自己開 blob 落檔名：XLSX.writeFile 喺部分瀏覽器會掉咗中文檔名
  const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  // 檔名只用 ASCII：部分瀏覽器（同 headless Chromium）會將非 ASCII 檔名掉成 "download"。
  // 批次同供應商都寫咗喺「信息」sheet 入面。
  a.download = `Morihome-PO-${po.batchNo.replace('單', '')}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
