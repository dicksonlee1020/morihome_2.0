import { theme } from 'antd';

/**
 * Screens ask the theme which density they are rendering at, instead of taking
 * it as a prop. The density is decided by the outermost ConfigProvider — which
 * is also where the phone override happens — so a prop would drift out of sync
 * with what actually renders.
 *
 * Column widths need scaling because the two modes are two font sizes apart:
 * a width that fits a header in dense mode wraps it in comfortable mode.
 */
const SCALE = 1.2;

export function useDensity() {
  const { token } = theme.useToken();
  const dense = token.fontSize <= 13;

  return {
    dense,
    /** Widths measured on a dense screen (products, inventory). */
    w: (n: number) => (dense ? n : Math.round(n * SCALE)),
    /** Widths measured on a comfortable screen (orders, follow-ups). */
    wc: (n: number) => (dense ? Math.round(n / SCALE) : n),
  };
}
