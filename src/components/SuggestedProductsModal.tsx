"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ProductCard from "@/components/ProductCard";
import { useLanguage } from "@/lib/store/language";
import { scrollShelfState, scrollShelfBy } from "@/lib/scrollShelf";
import type { Product } from "@/lib/types";

// Same horizontally-scrolling-shelf-with-arrows pattern as ProductRow.tsx
// (hidden scrollbar, floating arrow buttons shown only when there's more to
// reveal), just presented inside a modal instead of an inline page section.
export default function SuggestedProductsModal({ products, onClose }: { products: Product[]; onClose: () => void }) {
  const { t } = useLanguage();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollStart, setCanScrollStart] = useState(false);
  const [canScrollEnd, setCanScrollEnd] = useState(false);

  function updateScrollState() {
    const el = scrollRef.current;
    if (!el) return;
    const state = scrollShelfState(el);
    setCanScrollStart(state.canScrollStart);
    setCanScrollEnd(state.canScrollEnd);
  }

  useEffect(() => {
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
  }, [products.length]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Auto-advances the shelf every few seconds, looping back to the start
  // once it reaches the end — paused while the customer's cursor is over
  // the slider so browsing manually doesn't fight the autoplay.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || products.length <= 1) return;
    let paused = false;
    const timer = setInterval(() => {
      if (paused) return;
      // scrollLeft 0 is always "the start" in both LTR and RTL (only the
      // END's sign differs between them — see scrollShelf.ts) — so looping
      // back needs no direction check, only advancing forward does.
      const { canScrollEnd } = scrollShelfState(el);
      if (canScrollEnd) {
        scrollShelfBy(el, "end", el.clientWidth * 0.85);
      } else {
        el.scrollTo({ left: 0, behavior: "smooth" });
      }
    }, 3000);
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
  }, [products.length]);

  function scrollByPage(toward: "start" | "end") {
    const el = scrollRef.current;
    if (!el) return;
    scrollShelfBy(el, toward, el.clientWidth * 0.85);
  }

  // Portal straight to <body> — see AlertModal.tsx's comment: rendered
  // inline, a page root wrapped in the site's `am-fade-in` class (nearly
  // every page) leaves a lingering non-`none` `transform` behind once that
  // animation finishes, which becomes the containing block for `position:
  // fixed` descendants instead of the viewport — the modal ends up sized
  // and positioned relative to that page's own container, not truly
  // centered on screen with even space around it.
  return createPortal(
    <div
      className="fixed inset-0 z-[70] bg-am-text/50 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("cart.youMightAlsoLike")}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-3xl shadow-2xl max-w-[760px] w-full p-6 sm:p-8 relative am-fade-in">
        <button
          onClick={onClose}
          aria-label={t("common.close")}
          className="absolute top-4 end-4 w-8 h-8 rounded-full flex items-center justify-center text-am-text-muted hover:bg-am-bg hover:text-am-text transition-colors"
        >
          ✕
        </button>

        <div className="text-center mb-6 px-8">
          <div className="text-[11px] font-bold uppercase tracking-wider text-am-primary-dark mb-1.5">✨ {t("cart.beforeYouGo")}</div>
          <h2 className="text-xl font-bold text-am-text">{t("cart.youMightAlsoLike")}</h2>
        </div>

        <div className="relative">
          <div ref={scrollRef} className="flex gap-4 overflow-x-auto am-scrollbar-none pb-2 scroll-smooth">
            {products.map((p) => (
              <div key={p.id} className="w-[160px] shrink-0">
                <ProductCard product={p} />
              </div>
            ))}
          </div>

          {canScrollStart && (
            <button
              onClick={() => scrollByPage("start")}
              aria-label="Scroll back"
              className="hidden sm:flex absolute -start-4 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white border border-am-border shadow-md items-center justify-center text-am-text-muted hover:text-am-primary-dark hover:border-am-primary transition-colors"
            >
              <ChevronIcon toward="start" />
            </button>
          )}
          {canScrollEnd && (
            <button
              onClick={() => scrollByPage("end")}
              aria-label="Scroll forward"
              className="hidden sm:flex absolute -end-4 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white border border-am-border shadow-md items-center justify-center text-am-text-muted hover:text-am-primary-dark hover:border-am-primary transition-colors"
            >
              <ChevronIcon toward="end" />
            </button>
          )}
        </div>

        <button
          onClick={onClose}
          className="block mx-auto mt-6 text-[13px] font-semibold text-am-text-muted hover:text-am-primary-dark transition-colors"
        >
          {t("cart.continueToCheckout")}
        </button>
      </div>
    </div>,
    document.body
  );
}

// Points "backward" (toward the start of the shelf) or "forward" (toward
// the end) — visually left/right in LTR, mirrored via `rtl:` so the same
// semantic direction points the opposite physical way once the page is
// RTL, matching where the button itself now sits (see scrollShelf.ts).
function ChevronIcon({ toward }: { toward: "start" | "end" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 rtl:-scale-x-100">
      <path d={toward === "start" ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
    </svg>
  );
}
