import { colors } from '../theme';

export type Tone = 'success' | 'warning' | 'error' | 'brand' | 'muted';

/** 功能色配對，一律由 theme 出 */
export const TONES: Record<Tone, { color: string; bg: string }> = {
  success: { color: colors.success, bg: colors.successBg },
  warning: { color: colors.warningText, bg: colors.warningBg },
  error: { color: colors.error, bg: colors.errorBg },
  brand: { color: colors.primary, bg: colors.primarySubtle },
  muted: { color: colors.textSecondary, bg: colors.bgHover },
};
