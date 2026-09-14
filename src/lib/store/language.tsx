"use client";

import { createContext, useCallback, useContext } from "react";
import { useRouter } from "next/navigation";
import { t as translate, LOCALE_COOKIE, isRtl } from "@/lib/i18n/t";
import type { Locale, TranslationKey } from "@/lib/i18n/translations";

interface LanguageContextValue {
  locale: Locale;
  t: (key: TranslationKey) => string;
  isRtl: boolean;
  setLocale: (locale: Locale) => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

// The server-rendered <html lang/dir> and every server component's text
// come from the `am-locale` cookie (see src/lib/i18n/server.ts); this
// provider receives that SAME value as a prop from the root layout so
// client components render in agreement with the server on first paint —
// no hydration mismatch, no flash of the other language.
export function LanguageProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const router = useRouter();

  const setLocale = useCallback(
    (next: Locale) => {
      // 1 year, matches how long a customer's language preference should
      // reasonably stick without asking again.
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; SameSite=Lax`;
      // Re-runs every server component in the current tree (including the
      // root layout, which re-reads the cookie and passes the new locale
      // back down here) — the App Router equivalent of a locale switch
      // without a full page reload.
      router.refresh();
    },
    [router]
  );

  const value: LanguageContextValue = {
    locale,
    t: (key) => translate(locale, key),
    isRtl: isRtl(locale),
    setLocale,
  };

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
