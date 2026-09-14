// Server-only. Persists admin-configurable site overrides to a JSON file
// on disk — deliberately simple (no database) since this app runs as a
// single, always-on Node process on a real server (not a stateless
// serverless deploy), so a local file survives restarts and is shared by
// every request/visitor, which is the whole point of an admin dashboard:
// changes here must affect what every customer sees, not just localStorage
// in the admin's own browser.
import { promises as fs } from "fs";
import path from "path";

const FILE_PATH = path.join(process.cwd(), "data", "site-settings.json");

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
  countdownPromos?: CountdownPromo[];
  exitOffer?: ExitOffer;
  updatedAt?: string;
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
    const raw = await fs.readFile(FILE_PATH, "utf8");
    return JSON.parse(raw) as SiteSettings;
  } catch {
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
    updatedAt: new Date().toISOString(),
  };
  await fs.mkdir(path.dirname(FILE_PATH), { recursive: true });
  await fs.writeFile(FILE_PATH, JSON.stringify(next, null, 2), "utf8");
  return next;
}
