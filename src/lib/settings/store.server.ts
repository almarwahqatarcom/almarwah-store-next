// Server-only. Persists admin-configurable site overrides through the real
// Laravel backend (StorefrontController::getSettings/updateSettings — see
// that controller's docblock) instead of a local file on this app's own
// disk. A local file (the original design, and briefly a SITE_DATA_DIR
// variant of it) only works on a single always-on server with a
// persistent disk it fully controls; this app is actually deployed on a
// serverless host with neither — every deploy replaces the filesystem
// entirely, and even within one deploy, separate requests can land on
// separate, isolated instances with no shared disk between them. Confirmed
// live: an admin's saved logo/links were empty again after the very next
// deploy. Routing storage through the Laravel backend (which already has
// one real, shared database every instance talks to) fixes both — a save
// survives redeploys, and is visible to every instance immediately.
import { API_BASE } from "@/lib/api";

const STOREFRONT_API_SECRET = process.env.STOREFRONT_API_SECRET ?? "";

function authHeaders(): Record<string, string> {
  return { "X-Storefront-Internal-Secret": STOREFRONT_API_SECRET };
}

export interface SiteSettings {
  theme?: {
    primary?: string;
    primaryDark?: string;
    primaryLight?: string;
    bg?: string;
    bgAlt?: string;
    text?: string;
  };
  // A data: URI (uploaded logo, kept inline rather than as a separate file
  // to avoid needing file-storage infra for one small image) or an
  // external image URL. Falls back to the live backend's own logo
  // (config.ecommerce_logo) when unset.
  logoUrl?: string;
  // A second, independent logo shown above the site name in the footer's
  // first column (Footer.tsx) — genuinely a different image from the
  // header's own logoUrl above in real use (a wordmark in the header vs.
  // a compact emblem/seal in the footer is a common real design pattern),
  // not just an alias for it. Falls back to showing nothing extra (just
  // the site name text, as before) when unset — never falls back to
  // logoUrl, since an admin who only ever sets ONE logo almost certainly
  // means the header one, not "also put it in the footer too".
  footerLogoUrl?: string;
  // Overrides the live backend's own config.ecommerce_name everywhere the
  // header/footer/page-title show the store's name — same "override, with
  // a real fallback" pattern as logoUrl above. Per-locale since the
  // backend's own ecommerce_name has no Arabic translation of its own.
  siteName?: { en?: string; ar?: string };
  // Overrides the header's small "Since 2003 · Qatar" line under the name
  // (a static translation string, not something the backend provides at
  // all, so this is a plain free-text override rather than a fallback).
  tagline?: { en?: string; ar?: string };
  footerBgColor?: string;
  addressOverride?: string;
  // Real store links — rendered as "Get it on Google Play" / "Download on
  // the App Store" badges in the footer (Footer.tsx), under Get In Touch.
  // Either can be set independently; a badge only renders when its own
  // URL is actually set, so a fresh install shows neither rather than a
  // dead link to nowhere.
  googlePlayUrl?: string;
  appStoreUrl?: string;
  // The browser tab icon — a data: URI (uploaded via the same
  // LogoUploadField control as the header/footer logos) or an external
  // image URL. Rendered via generateMetadata()'s `icons` field in
  // layout.tsx. Falls back to Next's own default /favicon.ico convention
  // (the app already ships one under src/app/) when unset.
  faviconUrl?: string;
  // Overrides the live backend's own pixel id (normally read from a plain
  // text file it hosts at /fb.txt — see getFacebookPixelId() in api.ts).
  // Set here, it takes priority everywhere that file's value is used
  // (see layout.tsx) — the same "admin override, real fallback" pattern as
  // logoUrl/siteName. Just the raw numeric id (e.g. "1234567890123456"),
  // not a full snippet — FacebookPixelTracker.tsx already builds and
  // fires the standard fbq() init/PageView calls from the id alone.
  facebookPixelId?: string;
  // Rendered as sanitized HTML on /policy — see src/lib/sanitize.ts, the
  // same sanitizer already used for product descriptions.
  policy?: { en?: string; ar?: string };
  // Gates the "✨ Before You Go / You Might Also Like" cross-sell modal
  // (SuggestedProductsModal.tsx) — shown from the cart page, both on demand
  // and automatically when hovering "Proceed to Checkout". Missing/undefined
  // means enabled, so existing installs keep today's always-on behavior
  // until an admin explicitly turns it off.
  suggestedProductsEnabled?: boolean;
  // Gates /api/track-visit's actual write (see src/lib/analytics/) — off
  // means visits are simply not recorded, full stop. Missing/undefined
  // defaults to enabled once this ships, same "on unless explicitly turned
  // off" default as suggestedProductsEnabled above.
  visitorTrackingEnabled?: boolean;
  // Gates the small fixed-footer "slide" upsell bar (FooterUpsellBar.tsx)
  // shown on product and category pages — 4 related products in a slim,
  // auto-advancing bar the visitor can dismiss. Missing/undefined means
  // enabled, same "on unless explicitly turned off" default as the other
  // boolean feature toggles above.
  footerUpsellEnabled?: boolean;
  countdownPromos?: CountdownPromo[];
  exitOffer?: ExitOffer;
  seo?: SeoSettings;
  updatedAt?: string;
}

// Site-wide SEO/analytics controls — everything here is genuinely global
// (the homepage's own title/description, plus tracking snippets that fire
// on every page), not per-product/per-category metadata: those already
// come from real backend data (see product/[id]/page.tsx and
// category/[id]/page.tsx's own generateMetadata()), so there's nothing for
// an admin to usefully override there beyond what the catalog itself says.
export interface SeoSettings {
  // Falls back to config.ecommerce_name / the generic description in
  // layout.tsx's generateMetadata() when unset — same "admin override,
  // real fallback" pattern as siteName/tagline above.
  defaultTitle?: string;
  defaultDescription?: string;
  // GA4 "Measurement ID" (starts with "G-"), from Google Analytics →
  // Admin → Data Streams → your web stream. Loads gtag.js client-side —
  // see GoogleAnalyticsTracker.tsx — the same "admin sets just the id,
  // the app builds the real snippet" pattern as the Facebook Pixel.
  googleAnalyticsId?: string;
  // The bare verification code Google Search Console gives you for the
  // "HTML tag" ownership-verification method (Settings → Ownership
  // verification → HTML tag → just the `content="..."` value, not the
  // whole <meta> tag) — rendered via Next's built-in `verification.google`
  // metadata field, which is the officially supported way to emit that tag
  // without hand-writing it into <head>.
  googleSiteVerification?: string;
  // Microsoft Clarity project id (Clarity → Settings → Setup → the id in
  // the snippet URL, e.g. https://www.clarity.ms/tag/XXXXXXXXXX — just
  // that trailing id, not the whole snippet). Loads clarity.js client-side
  // — see ClarityTracker.tsx/clarity.ts — the same "admin sets just the
  // id, the app builds the real snippet" pattern as GA/the Facebook Pixel.
  // Deliberately storefront-only, never on /admin itself — see
  // ClarityTracker.tsx's own docblock for the honest limits of that.
  microsoftClarityId?: string;
}

// A "don't abandon your cart" popup shown ON THE CHECKOUT PAGE ITSELF,
// once per browser session, after the visitor has sat there for
// `triggerSeconds` without placing the order — not a sitewide exit-intent
// popup (an earlier version of this feature fired on cursor-leaves-toward-
// the-tab-bar anywhere on the site; replaced because a checkout-abandonment
// timer is a much stronger, more specific signal of "about to leave without
// buying" than a mouse twitch on the homepage). The timer is a plain
// setTimeout started when checkout mounts; navigating away (including a
// successful purchase, which unmounts checkout entirely) cancels it via the
// effect's own cleanup, so it can only ever fire while genuinely still
// sitting on checkout, unpurchased. Same real-coupon caveat as
// CountdownPromo: this dashboard can advertise a code and apply it
// immediately (the visitor is already on checkout, so there's no "carry it
// to checkout" step needed) — it cannot create the underlying coupon in the
// actual backend, so `couponCode` must already exist there.
export interface ExitOffer {
  enabled: boolean;
  headline: { en: string; ar: string };
  body: { en: string; ar: string };
  couponCode: string;
  discountType: "percent" | "amount";
  discountValue: number;
  // Seconds spent on checkout, unpurchased, before the popup appears.
  triggerSeconds: number;
}

// A single admin-configured "countdown timer + coupon" promo, shown on the
// page of any product it targets (directly, or via one of its categories)
// while now is between startAt/endAt.
//
// IMPORTANT limitation, disclosed rather than silently assumed away: the
// real Laravel backend's Coupon model/CouponController (confirmed by
// reading both) has NO concept of "this code only applies to product X" —
// coupon_type is only 'default' | 'first_order' | 'free_delivery', and
// apply()/order-placement validate purely by code + limit + date window,
// against the whole cart. `couponCode` here must therefore already exist
// as a real coupon created in the actual admin.almarwah.qa panel — this
// dashboard cannot create backend coupons, only advertise one on the right
// product page. The "only works for the selected product(s)" promise is
// enforced as a client-side rule at checkout (see checkout/page.tsx's
// coupon handler) — a real guard for anyone using this website's checkout
// UI, but not a backend-level guarantee against calling the API directly.
export interface CountdownPromo {
  id: string;
  enabled: boolean;
  productIds: number[];
  categoryIds: number[];
  startAt: string; // ISO datetime
  endAt: string; // ISO datetime
  couponCode: string;
  // Purely informational — shown on the banner as "20% OFF" etc. Must match
  // whatever discount the real coupon (above) actually gives; this dashboard
  // has no way to enforce that they agree.
  discountType: "percent" | "amount";
  discountValue: number;
  design: 1 | 2 | 3 | 4;
  primaryText: { en: string; ar: string };
  secondaryText: { en: string; ar: string };
}

const EMPTY: SiteSettings = {};

export async function getSiteSettings(): Promise<SiteSettings> {
  try {
    // no-store: this is read on nearly every page render (logo, theme,
    // nav copy, …) and must reflect an admin's save immediately — a stale
    // cached read here is exactly the "saved but not showing" bug this
    // whole migration exists to fix, just moved from storage to caching.
    const res = await fetch(`${API_BASE}/storefront/settings`, {
      headers: authHeaders(),
      cache: "no-store",
    });
    if (!res.ok) return EMPTY;
    return (await res.json()) as SiteSettings;
  } catch {
    // Backend unreachable — same graceful "use defaults" fallback the
    // local-file version had for a missing/corrupt file.
    return EMPTY;
  }
}

export async function saveSiteSettings(patch: SiteSettings): Promise<SiteSettings> {
  const current = await getSiteSettings();
  const next: SiteSettings = {
    ...current,
    ...patch,
    theme: { ...current.theme, ...patch.theme },
    policy: { ...current.policy, ...patch.policy },
    siteName: { ...current.siteName, ...patch.siteName },
    tagline: { ...current.tagline, ...patch.tagline },
    seo: { ...current.seo, ...patch.seo },
    updatedAt: new Date().toISOString(),
  };
  // The merge above happens here, same as it always did — the backend
  // does a plain overwrite of whatever full object it's given (see
  // StorefrontController::updateSettings), it has no idea of this type's
  // shape and isn't meant to.
  const res = await fetch(`${API_BASE}/storefront/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(next),
  });
  if (!res.ok) {
    throw new Error(`Failed to save site settings (backend responded ${res.status})`);
  }
  return next;
}
