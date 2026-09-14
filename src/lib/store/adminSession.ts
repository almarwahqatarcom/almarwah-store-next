"use client";

import { create } from "zustand";

// Whether this browser holds a valid admin dashboard session — a plain
// (non-persisted) global store, not localStorage-backed like useAuthStore:
// the httpOnly am-admin-session cookie is the only real source of truth
// (never readable from client JS by design, see session.server.ts), so
// this is just a cache of the server's own answer, re-checked with
// check(). It's a SHARED store rather than a per-component fetch so that
// Header.tsx's top-bar "Dashboard / Logout" shortcut and the /admin page
// itself always agree — logging out from either place is instantly
// reflected in the other, which two independent local useState/useEffect
// checks (an earlier version of this) did not do: logging out from inside
// the dashboard left the header's own separate "Dashboard" link showing
// until a full page reload.
interface AdminSessionState {
  isAdmin: boolean;
  checked: boolean;
  check: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useAdminSessionStore = create<AdminSessionState>((set) => ({
  isAdmin: false,
  checked: false,
  check: async () => {
    try {
      const res = await fetch("/api/admin/me");
      const d = await res.json();
      set({ isAdmin: !!d.authenticated, checked: true });
    } catch {
      set({ checked: true });
    }
  },
  logout: async () => {
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } finally {
      set({ isAdmin: false });
    }
  },
}));
