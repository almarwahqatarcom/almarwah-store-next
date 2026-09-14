"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AuthUser } from "@/lib/types";

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  hasHydrated: boolean;
  setHasHydrated: (v: boolean) => void;
  setSession: (token: string, user?: AuthUser | null) => void;
  setUser: (user: AuthUser | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      hasHydrated: false,
      setHasHydrated: (v) => set({ hasHydrated: v }),
      setSession: (token, user = null) => set({ token, user }),
      setUser: (user) => set({ user }),
      logout: () => set({ token: null, user: null }),
    }),
    {
      name: "am-auth",
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);

/** Resolves once the persisted auth token has been restored from localStorage. */
export function waitForAuthHydration(): Promise<void> {
  if (useAuthStore.getState().hasHydrated) return Promise.resolve();
  return new Promise((resolve) => {
    const unsub = useAuthStore.subscribe((state) => {
      if (state.hasHydrated) {
        unsub();
        resolve();
      }
    });
  });
}
