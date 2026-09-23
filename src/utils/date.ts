import dayjs from 'dayjs';
import { today } from '../domain/clock';

/**
 * CLAUDE.md UI 規範：全 app 一個日期 formatter，唔准 inline format。
 *   列表 `MM-DD`（跨年先 `YYYY-MM-DD`）
 *   詳情 `YYYY年M月D日`
 */
export function fmtDate(value: string | null | undefined, mode: 'list' | 'detail' = 'list'): string {
  if (!value) return '—';
  const d = dayjs(value);
  if (!d.isValid()) return value;
  if (mode === 'detail') return d.format('YYYY年M月D日');
  return d.year() === today().year() ? d.format('MM-DD') : d.format('YYYY-MM-DD');
}

/** 排序用：ISO 字串直接比較就得，null 排最後 */
export const cmpDate = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? '9999').localeCompare(b ?? '9999');
