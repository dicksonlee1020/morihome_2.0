import { useSyncExternalStore } from 'react';

/**
 * B-07（Ocean 2026-09-23）：貨名有兩個 —— 我哋出街賣嘅名同廠家發貨表上嘅名。
 * 邊個做主顯示係 per-user 設定，同語言、密度一樣；呢度先用 localStorage 頂住，
 * 等 profile 設定表落地就搬過去。
 */
export type NameDisplay = 'own' | 'supplier';

export const NAME_DISPLAY_KEY = 'morihome.nameDisplay';

let current: NameDisplay = read();
const listeners = new Set<() => void>();

function read(): NameDisplay {
  try {
    return localStorage.getItem(NAME_DISPLAY_KEY) === 'supplier' ? 'supplier' : 'own';
  } catch {
    return 'own';
  }
}

export function setNameDisplay(mode: NameDisplay) {
  current = mode;
  try {
    localStorage.setItem(NAME_DISPLAY_KEY, mode);
  } catch {
    // private mode etc. — the choice just does not survive a reload
  }
  listeners.forEach((l) => l());
}

export function useNameDisplay(): NameDisplay {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => 'own'
  );
}
