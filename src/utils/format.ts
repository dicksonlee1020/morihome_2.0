export const money = (n: number) =>
  `HK$${Math.round(n).toLocaleString('en-HK')}`;

/** 密集畫面用：慳位，唔要 HK$ 前綴 */
export const amount = (n: number) => Math.round(n).toLocaleString('en-HK');

export const percent = (n: number) => `${Math.round(n * 100)}%`;
