// Shared helpers for the horizontally-scrolling "shelf" pattern used by
// ProductRow.tsx and SuggestedProductsModal.tsx (hidden scrollbar, floating
// prev/next arrow buttons shown only when there's more to reveal).
//
// Chromium/Firefox use the "negative" RTL scrollLeft convention: in an
// element with `direction: rtl` (which every page gets from <html dir="rtl">
// while browsing in Arabic), `scrollLeft` starts at 0 at the visual RIGHT
// edge (the start of the shelf, since Arabic reads right-to-left) and goes
// NEGATIVE down to -(scrollWidth - clientWidth) at the visual LEFT edge (the
// end of the shelf) — confirmed live in this app (scrollTo({left: -9999})
// landed at scrollLeft ≈ -(scrollWidth-clientWidth), not the LTR-style
// positive range). The arrow buttons' old logic assumed the LTR-only
// [0, max] range unconditionally, which silently inverted both "is there
// more to reveal" and "which way does clicking this arrow scroll" the
// moment the page went RTL — the arrows pointed and scrolled backwards.
function isElementRtl(el: HTMLElement): boolean {
  return getComputedStyle(el).direction === "rtl";
}

export function scrollShelfState(el: HTMLElement): { canScrollStart: boolean; canScrollEnd: boolean } {
  const max = el.scrollWidth - el.clientWidth;
  if (!isElementRtl(el)) {
    return { canScrollStart: el.scrollLeft > 4, canScrollEnd: el.scrollLeft < max - 4 };
  }
  return { canScrollStart: el.scrollLeft < -4, canScrollEnd: el.scrollLeft > -(max - 4) };
}

export function scrollShelfBy(el: HTMLElement, toward: "start" | "end", amount: number, behavior: ScrollBehavior = "smooth"): void {
  const forward = toward === "end"; // moving further into the shelf's content
  const rtl = isElementRtl(el);
  const delta = forward === !rtl ? amount : -amount;
  el.scrollBy({ left: delta, behavior });
}
