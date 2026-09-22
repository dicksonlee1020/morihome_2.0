/**
 * Morihome ERP — 設計系統 Theme
 * =================================================================
 * 用法：喺 App 最外層包一層 ConfigProvider
 *
 *   import { ConfigProvider } from 'antd';
 *   import { moriTheme } from './theme';
 *
 *   <ConfigProvider theme={moriTheme}>
 *     <App />
 *   </ConfigProvider>
 *
 * 密集模式（產品 / 庫存 / 上架 backlog 畫面）：
 *
 *   import { moriThemeCompact } from './theme';
 *   <ConfigProvider theme={moriThemeCompact}> ... </ConfigProvider>
 *
 * 手機自動覆寫：用檔案最底 useMoriTheme() 就得，唔使自己判斷闊度。
 *
 * 改任何顏色 / 尺寸，改呢個檔案就夠，唔使郁畫面。
 * -----------------------------------------------------------------
 * 版本 0.1 · 2026-09-22 · 待 Ocean 確認
 */

import { theme as antdTheme } from 'antd';
import type { ThemeConfig } from 'antd';

/* =================================================================
 * 1. 色彩
 * ===============================================================*/

export const colors = {
  // 品牌 — 來源：Canva Brand Kit「mori home」
  primary: '#506D53', // 主色：按鈕、連結、選中態、focus
  primaryHover: '#425A45',
  primarySubtle: '#EDF2EE', // 選中行底色、淡標籤
  wood: '#A18064', // 木棕：圖示、分隔、裝飾 —— 禁止用喺內文（對比度 3.3:1，唔過 AA）
  warm: '#F3F2EE', // 暖米白：登入頁、空狀態等品牌感畫面
  sand: '#E4D0B5', // 沙色：次要面板

  // 中性 — 來源：現有 Shopify 網站，同事已經睇慣
  text: '#232323',
  textSecondary: '#727272',
  textMuted: '#969696',
  textDisabled: '#C1C1C1',
  border: '#E8E8E8',
  borderStrong: '#CBCBCB',
  bgHover: '#F8F8F8',
  bgApp: '#F1F1F1',
  surface: '#FFFFFF',

  // 功能 — 新增
  // ⚠️ success 特登用鮮綠，同品牌綠 #506D53 明度差夠大，
  //    掃表格時「已送貨」同「主按鈕」分得出。詳見決策記錄。
  success: '#16A34A',
  successBg: '#E8F5EC',
  error: '#D72C0D', // 文字用呢個（過 AA）
  errorBg: '#FDECEA',
  warning: '#FFBB49', // seed，antd 會自己推導深淺
  warningText: '#8A5A00', // 自訂：warning 文字要咁深先過 AA
  warningBg: '#FFF4DC',
} as const;

/* =================================================================
 * 2. 字體
 * ===============================================================*/

export const fontFamily =
  '"Noto Sans TC", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

export const fontFamilyCode =
  'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

/* =================================================================
 * 3. 舒適模式（預設）
 *    用喺：訂單、客戶、採購、送貨，以及所有手機畫面
 * ===============================================================*/

export const moriTheme: ThemeConfig = {
  algorithm: antdTheme.defaultAlgorithm,

  token: {
    // 顏色
    colorPrimary: colors.primary,
    colorSuccess: colors.success,
    colorError: colors.error,
    colorWarning: colors.warning,
    colorInfo: colors.primary, // 特登同 primary 一樣 —— 唔想多一隻藍色出嚟

    colorTextBase: colors.text,
    colorBgBase: colors.surface,
    colorTextSecondary: colors.textSecondary,
    colorTextTertiary: colors.textMuted,
    colorTextQuaternary: colors.textDisabled,

    colorBorder: colors.borderStrong,
    colorBorderSecondary: colors.border,
    colorBgLayout: colors.bgApp,
    colorBgContainer: colors.surface,

    // 字體
    fontFamily,
    fontFamilyCode,
    fontSize: 14,
    // 中文字形比拉丁字母複雜，12px 喺 Windows 會糊。
    // 所以最細一級設 13px，12px 只留畀英文 / 數字。
    fontSizeSM: 13,
    fontSizeLG: 16,
    fontSizeHeading1: 24,
    fontSizeHeading2: 20,
    fontSizeHeading3: 16,
    lineHeight: 1.5,

    // 形狀
    borderRadius: 6, // 控件：網站 5px、Polaris 8px、Ant 6px —— 取中
    borderRadiusLG: 10, // 卡片：同網站 custom CSS 一致
    borderRadiusSM: 4,

    // 尺寸（比 antd 預設 32px 高 4px —— 中文字形佔高多啲）
    controlHeight: 36,
    controlHeightSM: 28,
    controlHeightLG: 44,

    // 間距：4px 制
    padding: 16,
    paddingSM: 12,
    paddingXS: 8,
    paddingLG: 24,
    margin: 16,

    // 陰影
    boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
    boxShadowSecondary: '0 4px 6px -2px rgba(26,26,26,0.20)',

    // 動效
    motionDurationFast: '0.1s',
    motionDurationMid: '0.2s',
    wireframe: false,
  },

  components: {
    Table: {
      headerBg: colors.bgHover,
      headerColor: colors.textSecondary,
      headerSplitColor: 'transparent',
      rowHoverBg: colors.bgHover,
      rowSelectedBg: colors.primarySubtle,
      rowSelectedHoverBg: colors.primarySubtle,
      borderColor: colors.border,
      cellPaddingBlock: 12,
      cellPaddingInline: 16,
    },

    Button: {
      fontWeight: 500,
      primaryShadow: 'none',
      defaultShadow: 'none',
      dangerShadow: 'none',
    },

    Card: {
      borderRadiusLG: 10,
      paddingLG: 16,
      headerFontSize: 16,
    },

    Tag: {
      borderRadiusSM: 999, // 狀態標籤做藥丸形
      defaultBg: colors.bgHover,
      defaultColor: colors.textSecondary,
    },

    Layout: {
      bodyBg: colors.bgApp,
      headerBg: colors.surface,
      siderBg: colors.surface,
      headerHeight: 56,
    },

    Menu: {
      itemSelectedBg: colors.primarySubtle,
      itemSelectedColor: colors.primary,
      itemHoverBg: colors.bgHover,
      itemBorderRadius: 6,
    },

    Input: { paddingInline: 12 },
    Select: { optionSelectedBg: colors.primarySubtle },
    Form: { labelColor: colors.textSecondary, itemMarginBottom: 20 },
    Modal: { borderRadiusLG: 10, titleFontSize: 18 },
    Alert: { withDescriptionPadding: '16px' },
  },
};

/* =================================================================
 * 4. 密集模式
 *    用喺：產品（5,241 SKU）、庫存、上架 backlog
 *    同舒適模式係同一套顏色同組件 —— 只係間距、字級、高度唔同
 * ===============================================================*/

export const moriThemeCompact: ThemeConfig = {
  ...moriTheme,
  algorithm: [antdTheme.defaultAlgorithm, antdTheme.compactAlgorithm],

  token: {
    ...moriTheme.token,
    fontSize: 13,
    controlHeight: 28,
    controlHeightSM: 24,
    padding: 12,
    paddingSM: 8,
    margin: 12,
  },

  components: {
    ...moriTheme.components,
    Table: {
      ...moriTheme.components?.Table,
      cellPaddingBlock: 6,
      cellPaddingInline: 12,
    },
    Card: {
      ...moriTheme.components?.Card,
      paddingLG: 12,
    },
  },
};

/* =================================================================
 * 5. 手機覆寫
 *    Ocean 用 iPhone Pro、Alex 用 Android。
 *    768px 以下一律用舒適模式，可點擊元素最少 48px 高
 *    （取 Android 48dp 同 iOS 44pt 之中大嗰個）。
 *
 *    用法：
 *      const theme = useMoriTheme(isDenseScreen);
 *      <ConfigProvider theme={theme}> ... </ConfigProvider>
 * ===============================================================*/

import { useEffect, useState } from 'react';

export const MOBILE_BREAKPOINT = 768;
export const TOUCH_TARGET_MIN = 48;

export const moriThemeMobile: ThemeConfig = {
  ...moriTheme,
  token: {
    ...moriTheme.token,
    controlHeight: TOUCH_TARGET_MIN,
    controlHeightSM: 40,
    controlHeightLG: 52,
  },
  components: {
    ...moriTheme.components,
    Table: {
      ...moriTheme.components?.Table,
      cellPaddingBlock: 14,
      cellPaddingInline: 16,
    },
  },
};

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.innerWidth <= MOBILE_BREAKPOINT
  );

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return isMobile;
}

/**
 * 揀 theme 嘅唯一入口。
 * dense = true 代表呢個畫面預設用密集模式（產品 / 庫存 / 上架）。
 * 手機一律強制返舒適 —— dense 會被忽略。
 */
export function useMoriTheme(dense = false): ThemeConfig {
  const isMobile = useIsMobile();
  if (isMobile) return moriThemeMobile;
  return dense ? moriThemeCompact : moriTheme;
}

export default moriTheme;
