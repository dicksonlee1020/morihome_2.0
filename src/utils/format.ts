export const money = (e: any) => {
  let t = Number(e ?? 0);
  let n = Math.abs(t - Math.round(t)) > 0.0001;
  return `HK$${t.toLocaleString(`en-HK`, {
    minimumFractionDigits: n ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
};

/** 密集畫面用：慳位，唔要 HK$ 前綴 */
export const amount = (n: number) => Math.round(n).toLocaleString('en-HK');
export const percent = (e: any) =>
  `${(Math.round(e * 1e3) / 10).toLocaleString(`en-HK`, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  })}%`;
let moriPhoneFormat = (e: any) => {
  if (!e) return `—`;
  let t = String(e).replace(/\D/g, ``);
  return t.startsWith(`852`) && t.length >= 11
    ? `+852 ${t.slice(-8, -4)} ${t.slice(-4)}`
    : t.length === 8
      ? `+852 ${t.slice(0, 4)} ${t.slice(4)}`
      : String(e);
};
export { moriPhoneFormat };
