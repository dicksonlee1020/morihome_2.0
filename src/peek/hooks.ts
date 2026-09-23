import { useCallback, useContext, useEffect, useState } from 'react';
import type { PeekModel } from '../data/ops';
import { PeekContext } from './PeekContext';
import type { PeekContextValue } from './PeekContext';

export function usePeek(): PeekContextValue {
  const ctx = useContext(PeekContext);
  if (!ctx) throw new Error('usePeek outside PeekProvider');
  return ctx;
}

/** 列表頁：交出而家顯示緊（篩選 + 排序後）嘅 id 順序，畀 ↑↓ 用 */
export function useRegisterPeekList(model: PeekModel, ids: string[]) {
  const { registerList } = usePeek();
  const key = ids.join('\u0000');
  useEffect(() => {
    registerList(model, ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, key, registerList]);
}

const WIDTH_KEY = 'morihome.peekWidth';
export const PEEK_MIN = 440;
export const PEEK_MAX = 720;
export const PEEK_DEFAULT = 520;

/** 桌面闊度 520，可拖 440–720，per-user 記住（§1） */
export function usePeekWidth(): [number, (w: number) => void] {
  const [width, setWidth] = useState(() => {
    try {
      const n = Number(localStorage.getItem(WIDTH_KEY));
      return n >= PEEK_MIN && n <= PEEK_MAX ? n : PEEK_DEFAULT;
    } catch {
      return PEEK_DEFAULT;
    }
  });
  const set = useCallback((w: number) => {
    const clamped = Math.min(PEEK_MAX, Math.max(PEEK_MIN, Math.round(w)));
    setWidth(clamped);
    try {
      localStorage.setItem(WIDTH_KEY, String(clamped));
    } catch {
      // fine
    }
  }, []);
  return [width, set];
}
