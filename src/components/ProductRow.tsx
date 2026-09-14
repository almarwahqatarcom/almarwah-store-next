"use client";

import { useEffect, useRef, useState } from "react";
import ProductCard from "@/components/ProductCard";
import { isProductActive } from "@/lib/api";
import { scrollShelfState, scrollShelfBy } from "@/lib/scrollShelf";
import type { Product } from "@/lib/types";

// A horizontally-scrolling product shelf with the scrollbar hidden — the row
// still scrolls perfectly by touch, trackpad, or drag; floating arrow
// buttons (desktop only, shown only when there's more to reveal) and a
// hover-to-wheel-scroll take over as the discoverability cue a visible
// scrollbar would otherwise provide. Same pattern as the header's category
// row, for a consistent feel across the site.
export default function ProductRow({ title, products }: { title: string; products: Product[] }) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products.length]);

  function scrollByPage(toward: "start" | "end") {
    const el = scrollRef.current;
    if (!el) return;
    scrollShelfBy(el, toward, el.clientWidth * 0.85);
  }

  function onWheel(e: React.WheelEvent<HTMLDivElement>) {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      const el = e.currentTarget;
      // Wheel-down should always feel like "forward" (toward the end of the
      // shelf) regardless of language — without this, RTL's negative
      // scrollLeft convention (see scrollShelf.ts) makes a normal downward
      // wheel scroll the shelf backward instead.
      const rtl = getComputedStyle(el).direction === "rtl";
      el.scrollLeft += rtl ? -e.deltaY : e.deltaY;
    }
  }

  const visibleProducts = products.filter(isProductActive);
  if (visibleProducts.length === 0) return null;

  return (
    <section className="py-8">
      <div className="max-w-[1280px] mx-auto px-5 relative">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-am-text">{title}</h2>
        </div>

        <div ref={scrollRef} onWheel={onWheel} className="flex gap-5 overflow-x-auto am-scrollbar-none pb-2 scroll-smooth">
          {visibleProducts.map((p) => (
            <div key={p.id} className="w-[200px] shrink-0">
              <ProductCard product={p} />
            </div>
          ))}
        </div>

        {canScrollStart && (
          <>
            <div className="pointer-events-none absolute start-5 top-0 bottom-2 w-14 bg-gradient-to-r from-am-bg to-transparent hidden md:block rtl:bg-gradient-to-l" />
            <button
              onClick={() => scrollByPage("start")}
              aria-label={`Scroll ${title} back`}
              className="hidden md:flex absolute start-1 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white border border-am-border shadow-md items-center justify-center text-am-text-muted hover:text-am-primary-dark hover:border-am-primary transition-colors"
            >
              <ChevronIcon toward="start" />
            </button>
          </>
        )}
        {canScrollEnd && (
          <>
            <div className="pointer-events-none absolute end-5 top-0 bottom-2 w-14 bg-gradient-to-l from-am-bg to-transparent hidden md:block rtl:bg-gradient-to-r" />
            <button
              onClick={() => scrollByPage("end")}
              aria-label={`Scroll ${title} forward`}
              className="hidden md:flex absolute end-1 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white border border-am-border shadow-md items-center justify-center text-am-text-muted hover:text-am-primary-dark hover:border-am-primary transition-colors"
            >
              <ChevronIcon toward="end" />
            </button>
          </>
        )}
      </div>
    </section>
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
