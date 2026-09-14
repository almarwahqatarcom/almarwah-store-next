"use client";

// Meta (Facebook) Pixel integration. The id itself is fetched server-side
// (src/lib/api.ts's getFacebookPixelId(), from https://admin.almarwah.qa/fb.txt
// — a client-side fetch of that file is blocked by CORS, confirmed live) and
// passed in here via initFacebookPixel(); this module just injects the
// standard fbq bootstrap once given a real id and exposes the track*()
// helpers used across the site. Every track*() call is a safe no-op
// whenever no valid id was ever passed in (file still holds the "add later"
// placeholder, fetch failed, etc.) — nothing needs to guard against calling
// them before that.

// This store only ever sells in Qatari Riyal (confirmed throughout this
// project — Doha/Qatar business, +974 numbers, ر.ق. symbol everywhere);
// StoreConfig has a currency *symbol* but no ISO currency *code*, which is
// what Meta's `currency` param needs, so it's a fixed constant here rather
// than derived from config.
const PIXEL_CURRENCY = "QAR";

declare global {
  interface Window {
    fbq?: FbqFunction;
    _fbq?: unknown;
  }
}

type FbqFunction = {
  (...args: unknown[]): void;
  callMethod?: (...args: unknown[]) => void;
  queue?: unknown[];
  push?: FbqFunction;
  loaded?: boolean;
  version?: string;
};

let pixelId: string | null = null;

function injectPixelScript(id: string) {
  if (window.fbq) return;

  const fbq: FbqFunction = function (...args: unknown[]) {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue!.push(args);
  };
  window.fbq = fbq;
  window._fbq = fbq;
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.queue = [];

  const script = document.createElement("script");
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(script);

  const noscriptImg = document.createElement("img");
  noscriptImg.height = 1;
  noscriptImg.width = 1;
  noscriptImg.style.display = "none";
  noscriptImg.src = `https://www.facebook.com/tr?id=${id}&ev=PageView&noscript=1`;
  document.body.appendChild(noscriptImg);

  window.fbq("init", id);
  window.fbq("track", "PageView");
}

/** Call once, given the id resolved server-side (see FacebookPixelTracker). A falsy/invalid id is a safe no-op. Idempotent. */
export function initFacebookPixel(id: string | null | undefined) {
  if (!id || pixelId) return;
  pixelId = id;
  injectPixelScript(id);
}

function track(event: string, params?: Record<string, unknown>) {
  if (!pixelId || typeof window === "undefined" || !window.fbq) return;
  window.fbq("track", event, params);
}

/** Fired once by initFacebookPixel() itself on load; call this again on every subsequent client-side route change (App Router navigations don't reload the page, so fbevents.js never sees them on its own). */
export function trackPageView() {
  track("PageView");
}

export function trackViewContent(params: { content_ids: (string | number)[]; content_name?: string; value?: number }) {
  track("ViewContent", { ...params, content_type: "product", currency: PIXEL_CURRENCY });
}

export function trackAddToCart(params: { content_ids: (string | number)[]; content_name?: string; value?: number }) {
  track("AddToCart", { ...params, content_type: "product", currency: PIXEL_CURRENCY });
}

export function trackInitiateCheckout(params: { value?: number; num_items?: number; content_ids?: (string | number)[] }) {
  track("InitiateCheckout", { ...params, currency: PIXEL_CURRENCY });
}

export function trackPurchase(params: { value: number; content_ids?: (string | number)[] }) {
  track("Purchase", { ...params, currency: PIXEL_CURRENCY });
}
