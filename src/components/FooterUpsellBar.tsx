"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { useSiteSettings } from "@/lib/store/siteSettings";
import { useStoreConfig } from "@/lib/store/config";
import { useCartStore } from "@/lib/store/cart";
import { useAuthStore } from "@/lib/store/auth";
import { useLanguage } from "@/lib/store/language";
import { finalPrice, formatCurrency, imageUrl, getApiErrorMessage } from "@/lib/api";
import { scrollShelfState, scrollShelfBy } from "@/lib/scrollShelf";
import type { Product } from "@/lib/types";

// Shown at most once per browser tab per page load, and stays dismissed
// for the rest of that tab's session once closed — same "don't nag twice"
// convention as the other dismissible popups in this app (the checkout
// abandonment offer, the old exit-intent one). A fresh tab/session always
// gets a clean chance to show it again.
const SESSION_KEY = "am-footer-upsell-dismissed";

// A slim, fixed-to-the-footer upsell bar for product/category pages —
// related products in a small auto-advancing, arrow-navigable shelf
// (about 4 visible at a time in the bar's own width, more reachable by
// sliding), closeable, admin can turn off entirely
// (siteSettings.footerUpsellEnabled). Deliberately NOT the same full modal
// SuggestedProductsModal.tsx already uses on the cart page: this needs to
// sit quietly at the edge of the screen while the visitor keeps browsing/
// reading the page above it, not interrupt with a full-screen overlay.
export default function FooterUpsellBar({ products }: { products: Product[] }) {
  const { footerUpsellEnabled } = useSiteSettings();
  const { config } = useStoreConfig();
  const { t } = useLanguage();

  const [dismissed, setDismissed] = useState(true); // starts true so it never flashes in before the sessionStorage check below resolves
  const [entered, setEntered] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollStart, setCanScrollStart] = useState(false);
  const [canScrollEnd, setCanScrollEnd] = useState(false);

  // Only ever 4 visible in the bar's own width at a time (its actual
  // "small" footprint), but the shelf itself can hold more, auto-sliding
  // and arrow-navigating through the rest — capped well above what any
  // page here actually passes in, just as a sanity bound.
  const shown = products.slice(0, 14);
  const enabled = footerUpsellEnabled !== false && shown.length > 0;

  useEffect(() => {
    if (!enabled) return;
    let alreadyDismissed = false;
    try {
      alreadyDismissed = sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      // Private-browsing/storage-blocked — treat as "not dismissed yet".
    }
    if (alreadyDismissed) return;
    setDismissed(false);
    // A brief delay before the slide-up entrance — appearing the instant
    // the page paints reads as a jarring layout jump; a half-second beat
    // first reads as a deliberate, considered reveal instead.
    const t = setTimeout(() => setEntered(true), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  function updateScrollState() {
    const el = scrollRef.current;
    if (!el) return;
    const state = scrollShelfState(el);
    setCanScrollStart(state.canScrollStart);
    setCanScrollEnd(state.canScrollEnd);
  }

  useEffect(() => {
    if (dismissed) return;
    updateScrollState();
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => updateScrollState();
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [dismissed]);

  // Auto-advances the shelf every few seconds — the "slide" in this
  // feature's own name — looping back to the start once it reaches the
  // end. Paused while the visitor's cursor is over it so manual browsing
  // never fights the autoplay (same pattern as SuggestedProductsModal.tsx).
  useEffect(() => {
    const el = scrollRef.current;
    if (dismissed || !el || shown.length <= 1) return;
    let paused = false;
    const timer = setInterval(() => {
      if (paused) return;
      const { canScrollEnd } = scrollShelfState(el);
      if (canScrollEnd) {
        scrollShelfBy(el, "end", el.clientWidth * 0.6);
      } else {
        el.scrollTo({ left: 0, behavior: "smooth" });
      }
    }, 3200);
    const pause = () => {
      paused = true;
    };
    const resume = () => {
      paused = false;
    };
    el.addEventListener("mouseenter", pause);
    el.addEventListener("mouseleave", resume);
    return () => {
      clearInterval(timer);
      el.removeEventListener("mouseenter", pause);
      el.removeEventListener("mouseleave", resume);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dismissed, shown.length]);

  function close() {
    setEntered(false);
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // A failed write just means it may show again this session.
    }
    // Wait for the slide-down exit animation before actually unmounting.
    setTimeout(() => setDismissed(true), 350);
  }

  if (!enabled || dismissed) return null;

  // Portal straight to <body> — see AlertModal.tsx's own comment for why:
  // rendered inline, a page wrapped in the site's `am-fade-in` class
  // (nearly every page here) leaves a lingering non-`none` `transform`
  // behind once that animation finishes, which becomes the containing
  // block for `position: fixed` descendants instead of the viewport —
  // this bar ended up positioned against the bottom of the full scrollable
  // page content instead of the actual viewport, hundreds of pixels below
  // the fold, which was the exact reason it never visibly appeared before
  // this fix even though every other part of it (state, timers, DOM
  // content) was already working correctly.
  return createPortal(
    <div
      className="fixed bottom-0 inset-x-0 z-[70] transition-transform duration-500 ease-out"
      style={{ transform: entered ? "translateY(0)" : "translateY(100%)" }}
      role="complementary"
      aria-label={t("upsell.title")}
    >
      <div className="max-w-[1280px] mx-auto px-3 sm:px-5">
        <div className="bg-white border border-am-border border-b-0 rounded-t-2xl shadow-[0_-10px_34px_rgba(26,41,66,0.14)] overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 pt-2.5 pb-1.5 border-b border-am-border/70">
            <span className="text-[11px] font-bold uppercase tracking-wider text-am-primary-dark">✨ {t("upsell.title")}</span>
            <button
              onClick={close}
              aria-label={t("common.close")}
              className="w-6 h-6 rounded-full flex items-center justify-center text-am-text-muted hover:bg-am-bg hover:text-am-text transition-colors shrink-0"
            >
              ✕
            </button>
          </div>

          <div className="relative">
            <div ref={scrollRef} className="flex gap-3 overflow-x-auto am-scrollbar-none px-4 py-3 scroll-smooth">
              {shown.map((p) => (
                <UpsellTile key={p.id} product={p} />
              ))}
            </div>

            {canScrollStart && (
              <button
                onClick={() => scrollRef.current && scrollShelfBy(scrollRef.current, "start", 200)}
                aria-label={t("header.scrollCategoriesBack")}
                className="hidden sm:flex absolute start-1 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white border border-am-border shadow-md items-center justify-center text-am-text-muted hover:text-am-primary-dark hover:border-am-primary transition-colors"
              >
                <ChevronIcon toward="start" />
              </button>
            )}
            {canScrollEnd && (
              <button
                onClick={() => scrollRef.current && scrollShelfBy(scrollRef.current, "end", 200)}
                aria-label={t("header.scrollCategoriesForward")}
                className="hidden sm:flex absolute end-1 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white border border-am-border shadow-md items-center justify-center text-am-text-muted hover:text-am-primary-dark hover:border-am-primary transition-colors"
              >
                <ChevronIcon toward="end" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function ChevronIcon({ toward }: { toward: "start" | "end" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 rtl:-scale-x-100">
      <path d={toward === "start" ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
    </svg>
  );
}

// One tile in the shelf — thumbnail, name, price, and a real +/- quantity
// control wired straight to the shared cart store (same add/updateQuantity/
// remove actions and the exact same maxQty/error-surfacing behavior
// ProductCard.tsx already uses elsewhere), so adding from this small bar
// behaves identically to adding from anywhere else in the app and stays in
// sync everywhere at once (the header's cart count, the cart page, this
// bar on another tab of the shelf) — not a separate, parallel "add" that
// could drift out of sync with the real cart.
function UpsellTile({ product }: { product: Product }) {
  const { config } = useStoreConfig();
  const { t } = useLanguage();
  const cartItem = useCartStore((s) => s.items.find((i) => i.product_id === product.id));
  const add = useCartStore((s) => s.add);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const remove = useCartStore((s) => s.remove);
  const token = useAuthStore((s) => s.token);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const thumb = imageUrl(config.base_urls, "product_image_url", product.image?.[0]);
  const price = finalPrice({ price: product.price, discount: product.discount, discount_type: product.discount_type });
  const quantity = cartItem?.quantity ?? 0;
  const maxQty = Math.min(product.total_stock || 0, product.maximum_order_quantity || 999);
  const outOfStock = product.total_stock <= 0;

  function showError(err: unknown, fallback: string) {
    setErrorMsg(getApiErrorMessage(err, fallback));
    setTimeout(() => setErrorMsg(null), 2500);
  }

  async function handleAdd() {
    setBusy(true);
    try {
      await add(product, 1, token);
    } catch (err) {
      showError(err, t("common.couldNotAddToCart"));
    } finally {
      setBusy(false);
    }
  }

  async function handleChange(next: number) {
    if (!cartItem) return;
    setBusy(true);
    try {
      if (next <= 0) {
        await remove(cartItem.id, token);
      } else {
        await updateQuantity(cartItem.id, Math.min(next, maxQty), token);
      }
    } catch (err) {
      showError(err, t("common.couldNotUpdateQuantity"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex flex-col gap-1.5 shrink-0 w-[172px] border border-am-border rounded-xl p-2 hover:border-am-primary/60 hover:shadow-sm transition-all bg-white">
      {errorMsg && (
        <div className="absolute bottom-full start-0 mb-1.5 w-max max-w-[170px] bg-am-error text-white text-[10.5px] font-semibold px-2 py-1 rounded-lg shadow-lg z-10">
          {errorMsg}
        </div>
      )}
      <Link href={`/product/${product.id}`} className="flex items-center gap-2.5">
        <span className="w-11 h-11 rounded-lg bg-am-bg shrink-0 relative overflow-hidden">
          {thumb && <Image src={thumb} alt="" fill sizes="44px" className="object-contain p-1" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold text-am-text am-line-clamp-2 leading-tight">{product.name}</span>
          <span className="block text-[12px] font-bold text-am-primary-dark mt-0.5">{formatCurrency(price, config)}</span>
        </span>
      </Link>

      {!outOfStock &&
        (quantity === 0 ? (
          <button
            onClick={handleAdd}
            disabled={busy}
            aria-label={`${t("common.addToCart")} ${product.name}`}
            className="w-full flex items-center justify-center gap-1 bg-am-primary hover:bg-am-primary-dark disabled:opacity-60 text-white text-[11.5px] font-bold py-1.5 rounded-lg transition-colors"
          >
            + {t("common.addToCart")}
          </button>
        ) : (
          <div className="flex items-center justify-between bg-am-primary text-white rounded-lg overflow-hidden">
            <button
              onClick={() => handleChange(quantity - 1)}
              disabled={busy}
              aria-label={`${t("common.decreaseQuantity")} ${product.name}`}
              className="w-8 h-7 flex items-center justify-center text-sm font-bold leading-none hover:bg-am-primary-dark disabled:opacity-60 transition-colors"
            >
              −
            </button>
            <span className="min-w-[18px] text-center text-[12px] font-bold tabular-nums">{quantity}</span>
            <button
              onClick={() => handleChange(quantity + 1)}
              disabled={busy || quantity >= maxQty}
              aria-label={`${t("common.increaseQuantity")} ${product.name}`}
              className="w-8 h-7 flex items-center justify-center text-sm font-bold leading-none hover:bg-am-primary-dark disabled:opacity-40 transition-colors"
            >
              +
            </button>
          </div>
        ))}
    </div>
  );
}
