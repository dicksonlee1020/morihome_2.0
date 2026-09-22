import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { LOCALE_STORAGE_KEY, LocaleContext } from './context';
import type { Translate } from './context';
import { messages } from './messages';
import type { Locale } from './messages';

/**
 * Language is a per-user setting (CLAUDE.md). Persisted locally for now.
 * TODO: read and write it from the user profile once accounts land.
 */
function readStoredLocale(): Locale {
  if (typeof window === 'undefined') return 'zh-Hant';
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored && stored in messages) return stored as Locale;
  } catch {
    // private mode or blocked storage — fall back to the base locale
  }
  return 'zh-Hant';
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readStoredLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      // failing to remember the choice must not break the app
    }
  }, []);

  const t = useCallback<Translate>(
    (key, params) => {
      const table = messages[locale] as Record<string, string>;
      const base = messages['zh-Hant'] as Record<string, string>;
      const raw = table[key] ?? base[key] ?? key;
      if (!params) return raw;
      return raw.replace(/\{(\w+)\}/g, (match, name: string) =>
        name in params ? String(params[name]) : match
      );
    },
    [locale]
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <LocaleContext value={value}>{children}</LocaleContext>;
}
