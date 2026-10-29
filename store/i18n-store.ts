import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import en from '@/messages/en.json';
import bn from '@/messages/bn.json';

export type Locale = 'en' | 'bn';

const messages: Record<Locale, Record<string, Record<string, string>>> = {
  en,
  bn,
};

type I18nState = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
};

export const useI18nStore = create<I18nState>()(
  persist(
    (set) => ({
      locale: 'en',
      setLocale: (locale) => set({ locale }),
    }),
    { name: 'i18n-locale' }
  )
);

export function t(key: string, locale: Locale, params?: Record<string, string | number>): string {
  const parts = key.split('.');
  let value: any = messages[locale];
  for (const part of parts) {
    if (value && typeof value === 'object' && part in value) {
      value = value[part];
    } else {
      return key;
    }
  }
  if (typeof value !== 'string') return key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      value = value.replace(`{${k}}`, String(v));
    }
  }
  return value;
}
