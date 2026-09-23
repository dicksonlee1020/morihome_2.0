import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { PeekModel } from '../data/ops';
import { PeekContext } from './PeekContext';
import type { Crumb, PeekContextValue, PeekTarget } from './PeekContext';

/**
 * side-peek-spec §1：一次只有一個 peek；URL `?peek=<model>:<id>` 同步
 * （copy link、reload 保留、瀏覽器返回鍵閂）；↑↓ / j k 切上下一行、Esc 閂、Enter 開全頁。
 * 頁面用 `useRegisterPeekList` 交出而家顯示緊嘅 id 順序，↑↓ 先知道跳去邊。
 */
const PARAM = 'peek';

function readUrl(): PeekTarget | null {
  try {
    const v = new URLSearchParams(window.location.search).get(PARAM);
    if (!v) return null;
    const [model, ...rest] = v.split(':');
    const id = rest.join(':');
    if (!model || !id) return null;
    return { model: model as PeekModel, id };
  } catch {
    return null;
  }
}

function writeUrl(target: PeekTarget | null, mode: 'push' | 'replace') {
  try {
    const url = new URL(window.location.href);
    if (target) url.searchParams.set(PARAM, `${target.model}:${target.id}`);
    else url.searchParams.delete(PARAM);
    const fn = mode === 'push' ? history.pushState : history.replaceState;
    fn.call(history, history.state, '', url.toString());
  } catch {
    // no history API (tests)
  }
}

const isTyping = (el: EventTarget | null) => {
  const tag = (el as HTMLElement | null)?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || (el as HTMLElement | null)?.isContentEditable === true;
};

export function PeekProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<PeekTarget | null>(readUrl);
  const [stack, setStack] = useState<Crumb[]>([]);
  const [list, setList] = useState<{ model: PeekModel; ids: string[] }>({ model: 'order', ids: [] });
  const onOpenFull = useRef<(() => void) | null>(null);

  // 瀏覽器返回 / 前進：跟 URL 走
  useEffect(() => {
    const onPop = () => {
      setTarget(readUrl());
      setStack([]);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const open = useCallback((t: PeekTarget) => {
    setStack([]);
    setTarget((cur) => {
      writeUrl(t, cur ? 'replace' : 'push');
      return t;
    });
  }, []);

  const push = useCallback((t: PeekTarget, fromTitle: string) => {
    setTarget((cur) => {
      if (cur) setStack((s) => [...s, { ...cur, title: fromTitle }]);
      writeUrl(t, 'replace');
      return t;
    });
  }, []);

  const back = useCallback(() => {
    setStack((s) => {
      const prev = s[s.length - 1];
      if (prev) {
        setTarget({ model: prev.model, id: prev.id });
        writeUrl({ model: prev.model, id: prev.id }, 'replace');
      }
      return s.slice(0, -1);
    });
  }, []);

  const close = useCallback(() => {
    setTarget(null);
    setStack([]);
    writeUrl(null, 'replace');
  }, []);

  const index = target && list.model === target.model ? list.ids.indexOf(target.id) : -1;
  const hasNext = index >= 0 && index < list.ids.length - 1;
  const hasPrev = index > 0;

  const next = useCallback(() => {
    if (!hasNext || !target) return;
    open({ model: target.model, id: list.ids[index + 1] });
  }, [hasNext, target, list.ids, index, open]);

  const prev = useCallback(() => {
    if (!hasPrev || !target) return;
    open({ model: target.model, id: list.ids[index - 1] });
  }, [hasPrev, target, list.ids, index, open]);

  const registerList = useCallback((model: PeekModel, ids: string[]) => {
    setList((cur) => (cur.model === model && cur.ids.length === ids.length && cur.ids.every((v, i) => v === ids[i]) ? cur : { model, ids }));
  }, []);

  // 鍵盤：peek 開住先生效；打緊字唔理
  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      } else if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        prev();
      } else if (e.key === 'Enter') {
        onOpenFull.current?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [target, close, next, prev]);

  const value = useMemo<PeekContextValue>(
    () => ({ target, stack, open, push, back, close, next, prev, hasNext, hasPrev, registerList, onOpenFull }),
    [target, stack, open, push, back, close, next, prev, hasNext, hasPrev, registerList]
  );

  return <PeekContext.Provider value={value}>{children}</PeekContext.Provider>;
}
