import { theme } from 'antd';

/**
 * 畫面自己問返 theme 而家係邊個密度。
 * 唔用 props 傳，因為密度由最外層 ConfigProvider 決定 ——
 * 手機嗰次覆寫都係喺嗰度發生，傳 props 就會同實際渲染唔同步。
 */
export function useDensity() {
  const { token } = theme.useToken();
  const dense = token.fontSize <= 13;

  /** 欄闊：舒適模式字大成兩級，唔加闊欄頭就會直行 */
  const w = (n: number) => (dense ? n : Math.round(n * 1.2));

  return { dense, w };
}
