export type SupportedLang = "es" | "en" | "pt" | "fr" | "de" | "it" | "zh" | "ja" | "ru" | "ar" | "ko" | "hi";

export const LANG_LABELS: Record<SupportedLang, string> = {
  es: "Español",
  en: "English",
  pt: "Português",
  fr: "Français",
  de: "Deutsch",
  it: "Italiano",
  zh: "中文",
  ja: "日本語",
  ru: "Русский",
  ar: "العربية",
  ko: "한국어",
  hi: "हिन्दी",
};

export type TranslationDict = Record<string, string>;

import { es } from "./es";
import { en } from "./en";
import { pt } from "./pt";

const allTranslations: Record<SupportedLang, TranslationDict> = {
  es,
  en,
  pt,
  fr: en,
  de: en,
  it: en,
  zh: en,
  ja: en,
  ru: en,
  ar: en,
  ko: en,
  hi: en,
};

let currentLang: SupportedLang = "es";

export function setLang(lang: SupportedLang) {
  currentLang = lang;
}

export function t(key: string): string {
  return allTranslations[currentLang]?.[key] || allTranslations.es[key] || key;
}
