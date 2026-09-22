import { Tag } from 'antd';
import type { ReactNode } from 'react';
import { colors } from '../theme';
import { TONES } from '../utils/tones';
import type { Tone } from '../utils/tones';

interface PillProps {
  children: ReactNode;
  /** 用功能色，唔使自己配 color/bg */
  tone?: Tone;
  /** 文字色，預設跟 theme 嘅 Tag default */
  color?: string;
  /** 底色，預設跟 theme 嘅 Tag default */
  bg?: string;
  /** 落個小圓點，掃表格時狀態欄更易認 */
  dot?: boolean;
}

/**
 * 狀態藥丸。顏色只可以由 theme 嘅 colors 傳入 ——
 * 圓角同預設色都喺 theme.components.Tag 度定咗。
 */
export function Pill({ children, tone, color, bg, dot }: PillProps) {
  const t = tone ? TONES[tone] : undefined;
  return (
    <Tag
      variant="filled"
      style={{
        color: color ?? t?.color ?? colors.textSecondary,
        background: bg ?? t?.bg ?? colors.bgHover,
        marginInlineEnd: 0,
        paddingInline: 10,
        fontWeight: 500,
      }}
    >
      {dot && (
        <span
          aria-hidden
          style={{
            display: 'inline-block',
            width: 6,
            height: 6,
            borderRadius: 999,
            background: 'currentColor',
            marginInlineEnd: 6,
            verticalAlign: 'middle',
          }}
        />
      )}
      {children}
    </Tag>
  );
}
