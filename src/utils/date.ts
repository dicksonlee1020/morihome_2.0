import dayjs from 'dayjs';
import { today } from '../domain/clock';

/**
 * CLAUDE.md UI 規範：全 app 一個日期 formatter，唔准 inline format。
 *   列表 `MM-DD`（跨年先 `YYYY-MM-DD`）
 *   詳情 `YYYY年M月D日`
 */
export function fmtDate(value: any, _mode: any = `list`) {
  if (!value) return `—`;
  let n = dayjs(value);
  return n.isValid() ? n.format(`YYYY-MM-DD`) : value;
}

/** 排序用：ISO 字串直接比較就得，null 排最後 */
export const cmpDate = (
  a: string | null | undefined,
  b: string | null | undefined,
) => (a ?? '9999').localeCompare(b ?? '9999');

/** 時間線：今日只顯示 HH:mm，其餘跟列表 formatter（side-peek §3.2） */
export function fmtWhen(iso: any) {
  if (!iso) return `—`;
  let t = dayjs(iso);
  return t.isValid()
    ? t.isSame(today(), `day`)
      ? `今日 ${t.format(`HH:mm`)}`
      : t.isSame(today().subtract(1, `day`), `day`)
        ? `昨日 ${t.format(`HH:mm`)}`
        : t.format(`YYYY-MM-DD HH:mm`)
    : iso;
}
