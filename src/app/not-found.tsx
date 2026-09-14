import Link from "next/link";
import { getServerLocale } from "@/lib/i18n/server";
import { t } from "@/lib/i18n/t";

export default async function NotFound() {
  const locale = await getServerLocale();
  return (
    <div className="max-w-[560px] mx-auto px-5 py-24 text-center am-fade-in">
      <div className="text-6xl mb-5">🔍</div>
      <h1 className="text-2xl font-bold text-am-text mb-2.5">{t(locale, "notFound.title")}</h1>
      <p className="text-am-text-muted mb-8">{t(locale, "notFound.body")}</p>
      <Link
        href="/"
        className="inline-block bg-am-primary hover:bg-am-primary-dark text-white font-bold px-8 py-3.5 rounded-full transition-colors"
      >
        {t(locale, "notFound.backHome")}
      </Link>
    </div>
  );
}
