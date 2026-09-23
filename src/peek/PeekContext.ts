import { createContext } from 'react';
import type { PeekModel } from '../data/ops';

export interface PeekTarget {
  model: PeekModel;
  id: string;
}

export interface Crumb extends PeekTarget {
  title: string;
}

export interface PeekContextValue {
  target: PeekTarget | null;
  /** 喺 peek 入面撳關聯紀錄 → 換內容，有「‹ 返回」麵包屑 */
  stack: Crumb[];
  open: (target: PeekTarget) => void;
  push: (target: PeekTarget, fromTitle: string) => void;
  back: () => void;
  close: () => void;
  next: () => void;
  prev: () => void;
  hasNext: boolean;
  hasPrev: boolean;
  registerList: (model: PeekModel, ids: string[]) => void;
  /** Enter / 「開全頁」：暫時只彈提示（全頁詳情未建） */
  onOpenFull: React.MutableRefObject<(() => void) | null>;
}

export const PeekContext = createContext<PeekContextValue | null>(null);

