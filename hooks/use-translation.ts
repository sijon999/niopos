import { useCallback } from 'react';
import { useI18nStore, t, type Locale } from '@/store/i18n-store';

export function useTranslation() {
  const locale = useI18nStore((s) => s.locale);
  const setLocale = useI18nStore((s) => s.setLocale);
  const translate = useCallback(
    (key: string, params?: Record<string, string | number>) => t(key, locale, params),
    [locale]
  );

  return { t: translate, locale, setLocale };
}
