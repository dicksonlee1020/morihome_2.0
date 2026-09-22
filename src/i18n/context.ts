import { createContext } from 'react';
import type { Locale, MessageKey } from './messages';

export type Translate = (
  key: MessageKey,
  params?: Record<string, string | number>
) => string;

export interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translate;
}

export const LocaleContext = createContext<LocaleContextValue | null>(null);

export const LOCALE_STORAGE_KEY = 'morihome.locale';
