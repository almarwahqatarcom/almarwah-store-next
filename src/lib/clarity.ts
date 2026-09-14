"use client";

// Microsoft Clarity — heatmaps + session recordings. Same "admin sets just
// the id, this module injects the real snippet" shape as fbPixel.ts/ga.ts.
// Unlike GA4, Clarity needs no manual per-route pageview call: once loaded
// it records the whole session continuously on its own (DOM mutations,
// scroll, clicks, route changes included), so there's no trackPageView()
// counterpart here — just init, plus the two custom signals a heatmap tool
// actually benefits from that it can't infer on its own: who a visitor is
// (identify) and that a specific, meaningful thing just happened (event/tag).

declare global {
  interface Window {
    clarity?: ((...args: unknown[]) => void) & { q?: unknown[] };
  }
}

let clarityId: string | null = null;

function injectClarityScript(id: string) {
  if (window.clarity) return;

  const clarityFn: NonNullable<Window["clarity"]> = function (...args: unknown[]) {
    (clarityFn.q = clarityFn.q || []).push(args);
  };
  window.clarity = clarityFn;

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.clarity.ms/tag/${id}`;
  document.head.appendChild(script);
}

/** Call once, given the id from admin settings. A falsy id is a safe no-op. Idempotent. */
export function initClarity(id: string | null | undefined) {
  if (!id || clarityId) return;
  clarityId = id;
  injectClarityScript(id);
}

/**
 * Tags the current session with an opaque customer identifier (their real
 * account id, never their name/phone/email — Clarity's own dashboard shows
 * this value in plain text, and it's meant for "find this specific
 * customer's sessions again", not for storing PII in a third-party tool).
 */
export function identifyClarityUser(customId: string) {
  if (!clarityId || typeof window === "undefined" || !window.clarity) return;
  window.clarity("identify", customId);
}

/** A named, filterable event — e.g. "order_placed" — for sessions that did something worth finding again in Clarity's own dashboard. */
export function trackClarityEvent(eventName: string) {
  if (!clarityId || typeof window === "undefined" || !window.clarity) return;
  window.clarity("event", eventName);
}

/** A key/value tag on the session (shows up as a filter in Clarity's dashboard) — e.g. order_value, payment_method. */
export function setClarityTag(key: string, value: string) {
  if (!clarityId || typeof window === "undefined" || !window.clarity) return;
  window.clarity("set", key, value);
}

/** The one thing this whole integration was actually asked for: mark a session as one that resulted in a real, placed order. */
export function trackClarityPurchase(orderId: number | string, value: number, paymentMethod?: string) {
  trackClarityEvent("order_placed");
  setClarityTag("order_id", String(orderId));
  setClarityTag("order_value", value.toFixed(2));
  if (paymentMethod) setClarityTag("payment_method", paymentMethod);
}
