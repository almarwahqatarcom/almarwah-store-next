"use client";

import { sendVisitorHeartbeat } from "@/lib/api";
import { useCartStore } from "@/lib/store/cart";

// Drives the "who's browsing right now" feature on the admin dashboard's
// Visitor Tracking page — the exact same mechanism the Flutter app already
// uses (see VisitorTrackingService in the Flutter source): no WebSocket/
// real-time infra exists, so presence is done the simple way instead: this
// tab pings the backend every ~25 seconds while visible, and the backend
// treats any session heard from in the last 90 seconds as "live"
// (VisitorSession::LIVE_WINDOW_SECONDS). Stop pinging — tab hidden, closed,
// no network — and the session just ages out on its own; nothing needs to
// explicitly mark a visitor as "gone".
//
// One instance for the whole site (module-level singleton), started once
// from VisitorTracker.tsx mounted in the root layout; every route change
// just calls updateCurrentPage(), which is cheap and never awaited.

const SESSION_KEY_STORAGE = "am-visitor-session-key";
const HEARTBEAT_INTERVAL_MS = 25_000;
const PAGE_CHANGE_DEBOUNCE_MS = 400;

let sessionKey: string | null = null;
let currentPage = "/";
let timer: ReturnType<typeof setInterval> | null = null;
let pageChangeDebounce: ReturnType<typeof setTimeout> | null = null;
let started = false;

function getOrCreateSessionKey(): string {
  try {
    let key = localStorage.getItem(SESSION_KEY_STORAGE);
    if (!key) {
      key = crypto.randomUUID();
      localStorage.setItem(SESSION_KEY_STORAGE, key);
    }
    return key;
  } catch {
    // localStorage unavailable (private mode, etc.) — fall back to an
    // in-memory key for this page load only; still shows up as one live
    // session, just doesn't persist across reloads.
    return crypto.randomUUID();
  }
}

function guestId(): string | null {
  const id = useCartStore.getState().guestId;
  return id == null ? null : String(id);
}

async function sendHeartbeat() {
  if (!sessionKey) return;
  try {
    await sendVisitorHeartbeat({
      session_key: sessionKey,
      platform: "web",
      current_page: currentPage,
      guest_id: guestId(),
    });
  } catch {
    // Never let a tracking failure surface to the visitor — the next beat,
    // ~25s later, will very likely succeed.
  }
}

function resume() {
  if (!started) return;
  if (timer) clearInterval(timer);
  sendHeartbeat();
  timer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
}

function pause() {
  if (timer) clearInterval(timer);
  timer = null;
}

export function startVisitorTracking() {
  if (started) return;
  started = true;
  sessionKey = getOrCreateSessionKey();
  currentPage = window.location.pathname;

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") resume();
    else pause();
  });

  resume();
}

// Called on every route change (see VisitorTracker.tsx). Debounced slightly
// since a single logical navigation can otherwise fire this more than once.
export function updateVisitorCurrentPage(page: string) {
  if (!page || page === currentPage) return;
  currentPage = page;
  if (pageChangeDebounce) clearTimeout(pageChangeDebounce);
  pageChangeDebounce = setTimeout(sendHeartbeat, PAGE_CHANGE_DEBOUNCE_MS);
}
