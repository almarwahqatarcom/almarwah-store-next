"use client";

import { useLanguage } from "@/lib/store/language";

// A simple, professional two-way toggle rather than a dropdown — there are
// only two languages, and a toggle makes the current one unambiguous at a
// glance without an extra click to open a menu.
export default function LanguageSwitcher() {
  const { locale, setLocale } = useLanguage();

  return (
    <div className="flex items-center rounded-full border border-am-border overflow-hidden text-[12px] font-bold shrink-0" role="group" aria-label="Language">
      <button
        onClick={() => setLocale("en")}
        className={`px-3 py-1.5 transition-colors ${locale === "en" ? "bg-am-primary text-white" : "text-am-text-muted hover:bg-am-bg"}`}
        aria-pressed={locale === "en"}
      >
        EN
      </button>
      <button
        onClick={() => setLocale("ar")}
        className={`px-3 py-1.5 transition-colors ${locale === "ar" ? "bg-am-primary text-white" : "text-am-text-muted hover:bg-am-bg"}`}
        aria-pressed={locale === "ar"}
      >
        عربي
      </button>
    </div>
  );
}
