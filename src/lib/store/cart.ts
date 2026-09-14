"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartItem, Product } from "@/lib/types";
import * as api from "@/lib/api";
import { trackAddToCart } from "@/lib/fbPixel";

interface CartState {
  guestId: number | null;
  items: CartItem[];
  loading: boolean;
  error: string | null;
  hasHydrated: boolean;
  setHasHydrated: (v: boolean) => void;
  ensureGuest: () => Promise<number>;
  refresh: (token?: string | null) => Promise<void>;
  add: (product: Product, quantity: number, token?: string | null) => Promise<void>;
  updateQuantity: (cartId: number, quantity: number, token?: string | null) => Promise<void>;
  remove: (cartId: number, token?: string | null) => Promise<void>;
  clear: (token?: string | null) => Promise<void>;
  totalItems: () => number;
  totalAmount: () => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      guestId: null,
      items: [],
      loading: false,
      error: null,
      hasHydrated: false,
      setHasHydrated: (v) => set({ hasHydrated: v }),

      ensureGuest: async () => {
        const existing = get().guestId;
        if (existing) return existing;
        try {
          const res = await api.createGuestSession();
          set({ guestId: res.guest.id });
          return res.guest.id;
        } catch {
          return 0;
        }
      },

      refresh: async (token) => {
        set({ loading: true, error: null });
        try {
          const guestId = token ? null : await get().ensureGuest();
          const items = await api.getCart({ token, guestId });
          set({ items, loading: false });
        } catch (e) {
          set({ loading: false, error: e instanceof Error ? e.message : "Failed to load cart" });
        }
      },

      add: async (product, quantity, token) => {
        set({ loading: true, error: null });
        try {
          const guestId = token ? null : await get().ensureGuest();
          const items = await api.addToCart(product, quantity, { token, guestId });
          set({ items, loading: false });
          trackAddToCart({
            content_ids: [product.id],
            content_name: product.name,
            value: api.finalPrice({ price: product.price, discount: product.discount, discount_type: product.discount_type }) * quantity,
          });
        } catch (e) {
          set({ loading: false, error: e instanceof Error ? e.message : "Could not add to cart" });
          throw e;
        }
      },

      updateQuantity: async (cartId, quantity, token) => {
        const prev = get().items;
        // optimistic update
        set({ items: prev.map((i) => (i.id === cartId ? { ...i, quantity } : i)) });
        try {
          const guestId = token ? null : get().guestId;
          const items = await api.updateCartQuantity(cartId, quantity, { token, guestId });
          set({ items });
        } catch (e) {
          set({ items: prev, error: e instanceof Error ? e.message : "Could not update quantity" });
        }
      },

      remove: async (cartId, token) => {
        const prev = get().items;
        set({ items: prev.filter((i) => i.id !== cartId) });
        try {
          const guestId = token ? null : get().guestId;
          const items = await api.removeCartItem(cartId, { token, guestId });
          set({ items });
        } catch (e) {
          set({ items: prev, error: e instanceof Error ? e.message : "Could not remove item" });
        }
      },

      clear: async (token) => {
        const prev = get().items;
        set({ items: [] });
        try {
          const guestId = token ? null : get().guestId;
          await api.clearCart({ token, guestId });
        } catch (e) {
          set({ items: prev, error: e instanceof Error ? e.message : "Could not clear cart" });
        }
      },

      totalItems: () => get().items.reduce((sum, i) => sum + i.quantity, 0),
      totalAmount: () =>
        get().items.reduce((sum, i) => {
          const price = api.finalPrice({ price: i.price, discount: i.discount, discount_type: i.discount_type });
          return sum + price * i.quantity;
        }, 0),
    }),
    {
      name: "am-cart",
      partialize: (state) => ({ guestId: state.guestId, items: state.items }),
      // `refresh`/`add` etc. read `guestId` via get() — if anything calls them
      // before localStorage has been restored, it sees the initial `null`
      // and mints a brand-new guest session, orphaning whatever was already
      // in the cart. This flag lets callers (see Header.tsx) wait for real
      // hydration before touching the cart on mount.
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);

/** Resolves once persisted cart state (guestId, items) has been restored from localStorage. */
export function waitForCartHydration(): Promise<void> {
  if (useCartStore.getState().hasHydrated) return Promise.resolve();
  return new Promise((resolve) => {
    const unsub = useCartStore.subscribe((state) => {
      if (state.hasHydrated) {
        unsub();
        resolve();
      }
    });
  });
}
