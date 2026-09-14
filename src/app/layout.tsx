import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { ConfigProvider } from "@/lib/store/config";
import { LanguageProvider } from "@/lib/store/language";
import { SiteSettingsProvider } from "@/lib/store/siteSettings";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import VisitorTracker from "@/components/VisitorTracker";
import FacebookPixelTracker from "@/components/FacebookPixelTracker";
import { getConfig, getCategories, getFacebookPixelId } from "@/lib/api";
import { getServerLocale } from "@/lib/i18n/server";
import { isRtl } from "@/lib/i18n/t";
import { getSiteSettings } from "@/lib/settings/store.server";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

export async function generateMetadata(): Promise<Metadata> {
  const [config, siteSettings, locale] = await Promise.all([getConfig().catch(() => null), getSiteSettings(), getServerLocale()]);
  const name = siteSettings.siteName?.[locale] || config?.ecommerce_name || "AlMarwah";
  return {
    title: { default: name, template: `%s — ${name}` },
    description: `Shop quality cleaning products and household essentials in Qatar — ${name}.`,
  };
}

// Admin-configured colors (see /admin) override the site's default CSS
// variables via a small inline <style> tag — only the keys an admin has
// actually changed are emitted, so anything untouched keeps globals.css's
// own default exactly as-is.
function themeOverrideCss(theme: Awaited<ReturnType<typeof getSiteSettings>>["theme"]): string | null {
  if (!theme) return null;
  const map: Record<string, string | undefined> = {
    "--am-primary": theme.primary,
    "--am-primary-dark": theme.primaryDark,
    "--am-primary-light": theme.primaryLight,
    "--am-bg": theme.bg,
    "--am-bg-alt": theme.bgAlt,
    "--am-text": theme.text,
  };
  const declarations = Object.entries(map)
    .filter(([, v]) => !!v)
    .map(([k, v]) => `${k}:${v};`)
    .join("");
  return declarations ? `:root{${declarations}}` : null;
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Locale has to be known BEFORE fetching categories (not just alongside
  // them) — this is the global set used everywhere Header/Footer show
  // category names (the nav pill row, the footer's Shop list), so fetching
  // it without the locale header was the one place still silently serving
  // English category names even after the language switch, regardless of
  // what any individual page did.
  const locale = await getServerLocale();
  const [config, categories, remotePixelId, siteSettings] = await Promise.all([
    getConfig().catch(() => null),
    getCategories(locale).catch(() => []),
    getFacebookPixelId(),
    getSiteSettings(),
  ]);
  // The dashboard's own Facebook Pixel field (if the admin has set one)
  // takes priority over the backend's own /fb.txt file — see
  // SiteSettings.facebookPixelId's docblock.
  const pixelId = siteSettings.facebookPixelId?.trim() || remotePixelId;
  const dir = isRtl(locale) ? "rtl" : "ltr";

  // The public API being unreachable at build/request time is the one case
  // worth failing loudly for — every page depends on config for currency,
  // image base URLs, and branch data.
  if (!config) {
    return (
      <html lang={locale} dir={dir} className={`${poppins.variable} h-full antialiased`}>
        <body className="min-h-full flex items-center justify-center bg-am-bg text-am-text p-8 text-center">
          <div>
            <h1 className="text-xl font-bold mb-2">Store temporarily unavailable</h1>
            <p className="text-am-text-muted">We couldn&apos;t reach the store service. Please try again shortly.</p>
          </div>
        </body>
      </html>
    );
  }

  const themeCss = themeOverrideCss(siteSettings.theme);

  return (
    <html lang={locale} dir={dir} className={`${poppins.variable} h-full antialiased`}>
      <head>{themeCss && <style dangerouslySetInnerHTML={{ __html: themeCss }} />}</head>
      <body className="min-h-full flex flex-col">
        <LanguageProvider locale={locale}>
          <SiteSettingsProvider settings={siteSettings}>
            <ConfigProvider config={config} categories={categories.sort((a, b) => a.priority - b.priority)}>
              <Suspense fallback={null}>
                <VisitorTracker />
                <FacebookPixelTracker pixelId={pixelId} />
              </Suspense>
              <Header />
              <main className="flex-1">{children}</main>
              <Footer />
            </ConfigProvider>
          </SiteSettingsProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
