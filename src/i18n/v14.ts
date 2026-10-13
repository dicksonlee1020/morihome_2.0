import { useLocale } from './hooks';
import dictionary from './v14Texts.json';
export function useV14Text() {
  const { locale } = useLocale();
  return (text: string) => locale === 'zh-Hans' ? (dictionary as Record<string, string>)[text] ?? text : text;
}
