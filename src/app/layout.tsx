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
import GoogleAnalyticsTracker from "@/components/GoogleAnalyticsTracker";
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
  const seo = siteSettings.seo;
  const title = seo?.defaultTitle?.trim() || name;
  const description = seo?.defaultDescription?.trim() || `Shop quality cleaning products and household essentials in Qatar — ${name}.`;
  return {
    // Without this, Next.js resolves every relative Open Graph/Twitter
    // image URL (and any page's own relative metadata) against
    // http://localhost:3000 in production — silently breaking social-share
    // previews site-wide. This was entirely unset before. Falls back to
    // the same known-live domain sitemap.ts/robots.ts use.
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://shop.almarwah.qa"),
    title: { default: title, template: `%s — ${name}` },
    description,
    openGraph: { title, description, siteName: name, locale, type: "website" },
    twitter: { card: "summary_large_image", title, description },
    // Renders <meta name="google-site-verification" content="..."> when
    // set — the officially supported way to do Search Console's "HTML tag"
    // ownership verification through Next's metadata API rather than
    // hand-writing the tag. Omitted entirely (not even an empty tag) when
    // unset, matching every other admin override's "no value, no trace"
    // behavior in this file.
    ...(seo?.googleSiteVerification?.trim() ? { verification: { google: seo.googleSiteVerification.trim() } } : {}),
  };
}

// Admin-configured colors (see /admin) override the site's default CSS
// variables via a small inline <style> tag — only the keys an admin has
// actually changed are emitted, so anything untouched keeps globals.css's
// own default exactly as-is.
//
// The admin form's color fields include a free-text input alongside the
// <input type="color"> picker (so a real hex code can be pasted directly),
// which means this string is NOT guaranteed to already be a safe CSS value
// by the time it gets here — the admin dashboard has no field-level
// validation on save. Since this value is injected via
// dangerouslySetInnerHTML into a raw <style> tag on every single page, an
// unvalidated value could break out of the CSS declaration entirely (e.g.
// "red;}</style><script>...") — low severity in practice (only the admin
// account can trigger it), but still worth closing off as real
// defense-in-depth rather than trusting free-text admin input verbatim in
// server-rendered HTML. Anything that doesn't look like a plain CSS color
// (hex, rgb()/rgba(), hsl()/hsla(), or a bare word like "gold") is dropped
// silently, same as if the field had been left blank.
const SAFE_CSS_COLOR = /^(#[0-9a-fA-F]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%]+\)|[a-zA-Z]+)$/;

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
    .filter(([, v]) => !!v && SAFE_CSS_COLOR.test(v!.trim()))
    .map(([k, v]) => `${k}:${v!.trim()};`)
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
  const gaId = siteSettings.seo?.googleAnalyticsId?.trim() || null;
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
                <GoogleAnalyticsTracker gaId={gaId} />
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
