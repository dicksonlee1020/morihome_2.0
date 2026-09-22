import { use } from 'react';
import { LocaleContext } from './context';
import type { LocaleContextValue, Translate } from './context';

export function useLocale(): LocaleContextValue {
  const ctx = use(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used inside <LocaleProvider>');
  return ctx;
}

/** Shorthand for components that only need the translate function. */
export function useT(): Translate {
  return useLocale().t;
}
