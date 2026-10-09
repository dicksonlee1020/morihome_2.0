import {
  moriInternalPrefix,
  moriPurpose,
  norm,
  opsState,
  productOf,
} from '../data/ops';
/**
 * 採購表（畀供應商嘅 Excel）。用廠家嘅型號同叫法，唔用我哋出街名；
 * 訂單號留一欄畀廠家喺發貨表寫返嚟對數。
 * 欄名係廠家睇嘅資料（簡體），唔屬 UI string key。
 */
/** SheetJS 係 400KB+，只有撳「下載採購表」先載入，唔入首屏 bundle。 */
export async function downloadPurchaseSheet(e: any, requirements: any) {
  let XLSX = await import('xlsx');
  let reqById = new Map<any, any>(requirements.map((e: any) => [e.id, e]));
  let rows = e.lines.map((e: any, t: any) => {
    let n = productOf(e.sku);
    let i = reqById.get(e.requirementId);
    return {
      序号: t + 1,
      型号: (n == null ? undefined : n.supplierCode) ?? ``,
      品名: (n == null ? undefined : n.supplierName) ?? e.sku,
      数量: e.qty,
      订单号: (i == null ? undefined : i.orderNo) ?? ``,
      用途:
        moriPurpose(i ?? {}) === `customerOrder`
          ? `客單`
          : moriInternalPrefix(moriPurpose(i ?? {})),
      备注: (i == null ? undefined : i.note) ?? ``,
    };
  });
  let a = XLSX.utils.json_to_sheet(rows);
  a[`!cols`] = [
    {
      wch: 6,
    },
    {
      wch: 12,
    },
    {
      wch: 40,
    },
    {
      wch: 6,
    },
    {
      wch: 16,
    },
    {
      wch: 10,
    },
    {
      wch: 24,
    },
  ];
  let o = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(o, a, `采购单`);
  let meta = XLSX.utils.aoa_to_sheet([
    [`采购批次`, e.batchNo],
    [`供应商`, e.supplier],
    [`日期`, e.createdAt],
    [`行数`, e.lines.length],
    [`版本`, e.revision ?? 1],
  ]);
  XLSX.utils.book_append_sheet(o, meta, `信息`);
  let bytes = XLSX.write(o, {
    type: `array`,
    bookType: `xlsx`,
  });
  let blob = new Blob([bytes], {
    type: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`,
  });
  let url = URL.createObjectURL(blob);
  let d = document.createElement(`a`);
  d.href = url;
  d.download = `Morihome-PO-${e.batchNo.replace(`單`, ``)}.xlsx`;
  document.body.appendChild(d);
  d.click();
  d.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1e3);
}
function moriExportPurchaseImage(e: any, t: any) {
  let n = new Map<any, any>(t.map((e: any) => [e.id, e]));
  let r = e.lines.map((t: any) => {
    let r = productOf(t.sku);
    let i = n.get(t.requirementId);
    return {
      code: (r == null ? undefined : r.supplierCode) ?? t.sku,
      name: (r == null ? undefined : r.supplierName) ?? t.sku,
      qty: t.qty,
      ref: (i == null ? undefined : i.orderNo) ?? ``,
    };
  });
  let i = 1080;
  let a = 160 + r.length * 64 + 70;
  let o = document.createElement(`canvas`);
  o.width = i;
  o.height = a;
  let s = o.getContext(`2d`);
  if (!s) return;
  s.fillStyle = `#ffffff`;
  s.fillRect(0, 0, i, a);
  s.fillStyle = `#1f2a22`;
  s.font = `700 32px Arial, "PingFang HK", "Microsoft JhengHei", sans-serif`;
  s.fillText(`Morihome 採購單`, 48, 56);
  s.font = `18px Arial, "PingFang HK", "Microsoft JhengHei", sans-serif`;
  s.fillStyle = `#555`;
  s.fillText(`${e.batchNo}   ${e.supplier}   ${e.createdAt}`, 48, 92);
  s.fillStyle = `#f3f2ee`;
  s.fillRect(40, 118, i - 80, 44);
  s.fillStyle = `#333`;
  s.font = `600 17px Arial, "PingFang HK", "Microsoft JhengHei", sans-serif`;
  s.fillText(`型號 / SKU`, 60, 146);
  s.fillText(`品名`, 300, 146);
  s.fillText(`數量`, 760, 146);
  s.fillText(`參考`, 860, 146);
  r.forEach((e: any, t: any) => {
    let n = 178 + t * 64;
    s.strokeStyle = `#e8e6e0`;
    s.beginPath();
    s.moveTo(40, n + 42);
    s.lineTo(i - 40, n + 42);
    s.stroke();
    s.fillStyle = `#333`;
    s.font = `16px Arial, "PingFang HK", "Microsoft JhengHei", sans-serif`;
    s.fillText(String(e.code).slice(0, 24), 60, n);
    s.fillText(String(e.name).slice(0, 34), 300, n);
    s.fillText(`× ${e.qty}`, 760, n);
    s.fillText(String(e.ref).slice(0, 18), 860, n);
  });
  s.fillStyle = `#888`;
  s.font = `14px Arial, "PingFang HK", "Microsoft JhengHei", sans-serif`;
  s.fillText(`由 Morihome ERP 產生`, 48, a - 28);
  o.toBlob((t: any) => {
    if (!t) return;
    let n = URL.createObjectURL(t);
    let r = document.createElement(`a`);
    r.href = n;
    r.download = `Morihome-PO-${e.batchNo.replace(`單`, ``)}.png`;
    document.body.appendChild(r);
    r.click();
    r.remove();
    setTimeout(() => URL.revokeObjectURL(n), 1e3);
  }, `image/png`);
}
function moriConfirmationNumber(value: any) {
  if (value === null || value === undefined || String(value).trim() === ``)
    return null;
  let n = Number(String(value).replace(/,/g, ``));
  return Number.isFinite(n) ? n : null;
}
function moriReadDelimited(text: any) {
  const rows: any[] = [];
  let row: any[] = [];
  let cell = ``;
  let quoted = false;
  const sep = text.split(/\r?\n/)[0].includes(`\t`) ? `\t` : `,`;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === `"`) {
      if (quoted && text[i + 1] === `"`) {
        cell += `"`;
        i++;
      } else quoted = !quoted;
    } else if (c === sep && !quoted) {
      row.push(cell);
      cell = ``;
    } else if ((c === `\n` || c === `\r`) && !quoted) {
      if (c === `\r` && text[i + 1] === `\n`) i++;
      row.push(cell);
      if (row.some((v: any) => v.trim())) rows.push(row);
      row = [];
      cell = ``;
    } else cell += c;
  }
  row.push(cell);
  if (row.some((v: any) => v.trim())) rows.push(row);
  if (rows.length < 2) return [];
  const headers = rows.shift().map((v: any) => v.replace(/^\uFEFF/, ``).trim());
  return rows.map((row: any) =>
    Object.fromEntries(headers.map((h: any, i: any) => [h, row[i] ?? ``])),
  );
}
function moriConfirmationRow(raw: any, index: any) {
  const entries = Object.entries(raw).map(([k, v]: any) => [
    k.toLowerCase().replace(/[\s_\-]/g, ``),
    v,
  ]);
  const get = (...names: string[]) => {
    const hit = entries.find(([k]: any) => names.includes(k));
    return hit ? hit[1] : ``;
  };
  return {
    rowId: `FILE-${index + 1}`,
    sku: String(
      get(
        `sku`,
        `型号`,
        `型號`,
        `model`,
        `货号`,
        `貨號`,
        `code`,
        `suppliercode`,
      ),
    ).trim(),
    name: String(get(`品名`, `名称`, `名稱`, `name`, `productname`)).trim(),
    orderNo: String(
      get(`orderno`, `customerorderno`, `訂單號`, `订单号`, `客單號`, `客单号`),
    ).trim(),
    requirementId: String(
      get(`requirementid`, `pr`, `需求編號`, `需求编号`),
    ).trim(),
    supplierReference: String(
      get(
        `supplierorderno`,
        `supplierreference`,
        `供應商參考`,
        `供应商参考`,
        `合同號`,
        `合同号`,
      ),
    ).trim(),
    qty: moriConfirmationNumber(
      get(
        `数量`,
        `數量`,
        `qty`,
        `quantity`,
        `confirmedqty`,
        `確認數量`,
        `确认数量`,
      ),
    ),
    cost: moriConfirmationNumber(
      get(
        `单价`,
        `單價`,
        `price`,
        `cost`,
        `unitcost`,
        `實際採購價`,
        `实际采购价`,
      ),
    ),
    label: ``,
  };
}
async function moriReviewConfirmationFile(file: any, po: any) {
  let raw: any[] = [];
  let error = null;
  const name = file.name.toLowerCase();
  try {
    if (/\.xlsx?$/.test(name)) {
      const x = await import('xlsx');
      const book = x.read(await file.arrayBuffer(), {
        type: `array`,
      });
      raw = x.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], {
        defval: ``,
      });
    } else if (/\.(csv|tsv|txt)$/.test(name))
      raw = moriReadDelimited(await file.text());
    else error = `此文件保留作確認憑證；請按原文件逐行人工確認。`;
  } catch {
    error = `無法讀取文件，請核對格式或逐行人工確認。`;
  }
  const review: any = {
    source: raw.length ? `file` : `manual`,
    fileName: file.name,
    matched: [],
    unmatched: [],
    error: error || (!raw.length ? `未讀到可配對資料，請逐行人工確認。` : null),
  };
  const used = new Set<any>();
  for (let i = 0; i < raw.length; i++) {
    let row = moriConfirmationRow(raw[i], i);
    row.label = row.sku || row.name || `第 ${i + 2} 行`;
    let candidates = po.lines.filter((line: any) => {
      let p = productOf(line.sku);
      const refOk =
        (!row.requirementId ||
          norm(row.requirementId) === norm(line.requirementId)) &&
        (!row.orderNo ||
          norm(row.orderNo) ===
            norm(
              opsState.requirements.find(
                (r: any) => r.id === line.requirementId,
              )?.orderNo || ``,
            ));
      const skuOk = row.sku
        ? norm(line.sku) === norm(row.sku) ||
          (p && norm(p.supplierCode) === norm(row.sku))
        : row.name && p && (row.name === p.supplierName || row.name === p.name);
      return refOk && skuOk;
    });
    let reason =
      candidates.length > 1
        ? `同 SKU 有多條需求，請選擇客單／PR`
        : !candidates.length
          ? `此批次找不到相符的客單／PR／SKU`
          : used.has(candidates[0]?.requirementId)
            ? `重複確認行，請核對`
            : null;
    if (
      !reason &&
      (row.qty === null ||
        !Number.isInteger(row.qty) ||
        row.qty < 0 ||
        row.qty > candidates[0].qty)
    )
      reason = `確認量缺漏或超出需求，請核對`;
    if (!reason && (row.cost === null || row.cost < 0))
      reason = `實際採購價缺漏，請核對`;
    if (reason)
      review.unmatched.push({
        ...row,
        reason,
        resolved: false,
      });
    else {
      used.add(candidates[0].requirementId);
      review.matched.push({
        ...row,
        requirementId: candidates[0].requirementId,
      });
    }
  }
  return review;
}
export { moriExportPurchaseImage, moriReviewConfirmationFile };
