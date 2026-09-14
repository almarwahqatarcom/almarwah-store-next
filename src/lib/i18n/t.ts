import { translations, type Locale, type TranslationKey } from "./translations";

// Plain function, not a hook — works identically in server components (the
// vast majority of pages here fetch data server-side) and client
// components alike. Falls back to the English string (never the raw key)
// if a translation is somehow missing, so a gap in the dictionary shows up
// as English text rather than a broken "cart.title"-looking string.
export function t(locale: Locale, key: TranslationKey): string {
  return translations[locale][key] ?? translations.en[key] ?? key;
}

export const LOCALE_COOKIE = "am-locale";

export function isRtl(locale: Locale): boolean {
  return locale === "ar";
}

// Detects genuine Arabic script in a string. Used to tell a real Arabic
// product translation apart from a silent English fallback: the backend
// (Helpers::product_data_formatting()) only ever overwrites `name`/
// `description` with a translation's value when an `ar` row actually
// exists for that product — otherwise the original (English) column value
// passes through untouched. English text essentially never contains
// characters in the Arabic Unicode block, so "no Arabic characters in a
// field returned while browsing in Arabic" is a reliable, source-verified
// signal that no real translation exists for that field, not a guess.
export function hasArabicText(value: string | null | undefined): boolean {
  return !!value && /[؀-ۿ]/.test(value);
}
