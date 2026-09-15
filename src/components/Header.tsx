"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useStoreConfig } from "@/lib/store/config";
import { useCartStore, waitForCartHydration } from "@/lib/store/cart";
import { useAuthStore, waitForAuthHydration } from "@/lib/store/auth";
import { useSiteSettings } from "@/lib/store/siteSettings";
import { useLanguage } from "@/lib/store/language";
import * as api from "@/lib/api";
import { imageUrl } from "@/lib/api";
import { scrollShelfState, scrollShelfBy } from "@/lib/scrollShelf";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useAdminSessionStore } from "@/lib/store/adminSession";
import type { Product } from "@/lib/types";

export default function Header() {
  const { config, categories } = useStoreConfig();
  const siteSettings = useSiteSettings();
  const { t, locale } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Product[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const searchBoxRef = useRef<HTMLFormElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const cartItems = useCartStore((s) => s.items);
  const { token, user, logout } = useAuthStore();
  const isAdmin = useAdminSessionStore((s) => s.isAdmin);
  const checkAdminSession = useAdminSessionStore((s) => s.check);
  const adminLogout = useAdminSessionStore((s) => s.logout);
  const didInit = useRef(false);
  const navScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollStart, setCanScrollStart] = useState(false);
  const [canScrollEnd, setCanScrollEnd] = useState(false);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    // Both stores persist to localStorage and rehydrate asynchronously on
    // mount — refreshing the cart before that finishes would read a stale
    // (null) guestId/token and mint a throwaway guest session, orphaning
    // whatever was already in the cart. Wait for both first. Reading the
    // action via getState() (not the hook) keeps this effect's dependency
    // array genuinely empty and fixed-size, not just "effectively stable".
    Promise.all([waitForCartHydration(), waitForAuthHydration()]).then(() => {
      useCartStore.getState().refresh(useAuthStore.getState().token);
    });
  }, []);

  // Checked once per page load — see adminSession.ts for why this is a
  // shared store rather than a local fetch (so /admin's own logout is
  // instantly reflected here too, without a page reload).
  useEffect(() => {
    checkAdminSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live-searching dropdown as the visitor types — a debounced call to the
  // same /products/search endpoint the full search PAGE already uses, just
  // capped to a handful of results for a quick preview instead of a whole
  // page load per keystroke.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(() => {
      // The real backend only does a "contains" match (`LIKE %value%` —
      // confirmed by reading ProductLogic::searchProducts()), not "starts
      // with", so a broader pool is fetched here and narrowed down
      // client-side to names that actually start with what was typed —
      // matching what was asked for ("write ab, show results starting
      // with ab") rather than the API's own default any-position match.
      api
        .searchProducts(trimmed, 20, 1, locale)
        .then((r) => {
          if (cancelled) return;
          const startsWith = r.products
            .filter(api.isProductActive)
            .filter((p) => p.name.toLowerCase().startsWith(trimmed.toLowerCase()));
          setSuggestions(startsWith.slice(0, 6));
          setHighlightIndex(-1);
        })
        .catch(() => {
          if (!cancelled) setSuggestions([]);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, locale]);

  // Closes the dropdown on an outside click — keeps it open for clicks
  // inside the search form itself (typing, hitting the submit button).
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function goToProduct(product: Product) {
    setShowSuggestions(false);
    setQuery("");
    router.push(`/product/${product.id}`);
  }

  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showSuggestions || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    } else if (e.key === "Enter" && highlightIndex >= 0) {
      e.preventDefault();
      goToProduct(suggestions[highlightIndex]);
    }
  }

  // An admin-uploaded logo (see /admin) takes precedence over the live
  // backend's own config.ecommerce_logo when set.
  const logo = siteSettings.logoUrl || imageUrl(config.base_urls, "ecommerce_image_url", config.ecommerce_logo);
  const siteName = siteSettings.siteName?.[locale] || config.ecommerce_name;
  const tagline = siteSettings.tagline?.[locale] || t("header.since");
  const address = siteSettings.addressOverride || config.ecommerce_address;
  const cartCount = cartItems.reduce((s, i) => s + i.quantity, 0);

  function goToFullSearch() {
    setShowSuggestions(false);
    if (query.trim()) router.push(`/search?q=${encodeURIComponent(query.trim())}`);
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    goToFullSearch();
  }

  // The category row hides its scrollbar entirely for a cleaner look, so
  // these arrow buttons (shown only when there's actually more to reveal)
  // are the replacement affordance — without them, hiding the scrollbar
  // would quietly remove the only clue that the row scrolls at all.
  function updateNavScrollState() {
    const el = navScrollRef.current;
    if (!el) return;
    const state = scrollShelfState(el);
    setCanScrollStart(state.canScrollStart);
    setCanScrollEnd(state.canScrollEnd);
  }

  useEffect(() => {
    updateNavScrollState();
    const el = navScrollRef.current;
    if (!el) return;
    const onScroll = () => updateNavScrollState();
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [categories.length]);

  function scrollNavBy(toward: "start" | "end", amount: number) {
    const el = navScrollRef.current;
    if (!el) return;
    scrollShelfBy(el, toward, amount);
  }

  // Lets a plain vertical mouse wheel scroll this row horizontally while
  // hovered — the natural way to explore a scrollbar-less pill row on
  // desktop, where there's no touch/trackpad swipe to fall back on.
  function onNavWheel(e: React.WheelEvent<HTMLDivElement>) {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      const el = e.currentTarget;
      // Wheel-down should always feel like "forward" — see the identical
      // note in ProductRow.tsx's onWheel for why RTL needs this flipped.
      const rtl = getComputedStyle(el).direction === "rtl";
      el.scrollLeft += rtl ? -e.deltaY : e.deltaY;
    }
  }

  return (
    <header className="sticky top-0 z-50 bg-am-card border-b border-am-border shadow-sm">
      <div className="bg-am-text text-white/85 text-[12.5px]">
        {/* flex-wrap (not "hidden sm:flex" on the links, as this was before) — on a
            narrow phone there isn't room for the phone/address AND every link on one
            line, but hiding the links entirely left mobile visitors with literally no
            header way to reach Track Order (or an admin any way to reach /admin or log
            out) short of knowing the URL. Wrapping to a second line keeps everything
            reachable at every width instead of trading real functionality for a
            single tidy row. */}
        <div className="max-w-[1280px] mx-auto px-5 py-1.5 flex items-center flex-wrap justify-between gap-x-2 gap-y-1">
          <span className="truncate">📞 {config.ecommerce_phone} &nbsp;•&nbsp; {address}</span>
          <div className="flex items-center flex-wrap gap-x-4 gap-y-1">
            <a href="https://almarwah.qa/branches.php" className="hover:text-am-primary transition-colors">{t("header.findBranch")}</a>
            <Link href="/track-order" className="hover:text-am-primary transition-colors">{t("header.trackOrder")}</Link>
            <a href="https://almarwah.qa/contact.php" className="hover:text-am-primary transition-colors">{t("header.contactUs")}</a>
            {isAdmin && (
              <>
                <span className="w-px h-3 bg-white/20" />
                <Link href="/admin" className="flex items-center gap-1 font-semibold text-am-primary hover:text-am-primary-light transition-colors">
                  🛠️ {t("header.dashboard")}
                </Link>
                <button
                  onClick={() => {
                    adminLogout();
                    if (pathname?.startsWith("/admin")) router.push("/");
                  }}
                  className="hover:text-am-error transition-colors"
                >
                  {t("header.adminLogout")}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-[1280px] mx-auto px-5 py-3 flex items-center gap-4 md:gap-7 flex-wrap">
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          {/* Plain <img>, not next/image: the real logo (admin-uploaded data: URI, or the
              backend's own remote image) is essentially never square, so a fixed
              width={40} height={40} — needed to even use next/image — was a wrong,
              made-up aspect ratio fighting the "h-10 w-auto" CSS that actually renders
              it correctly. That mismatch is exactly what Next.js warns about (reserved
              layout space not matching the rendered size), confirmed live: a real
              320×105 logo rendering at 122×40. Matches Footer.tsx's own logo handling. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logo && <img src={logo} alt={siteName} className="h-10 w-auto object-contain" fetchPriority="high" />}
          <span className="font-bold text-lg text-am-text leading-tight">
            {siteName}
            <small className="block text-[10px] font-medium text-am-primary-dark tracking-widest uppercase">{tagline}</small>
          </span>
        </Link>

        <form ref={searchBoxRef} onSubmit={submitSearch} className="flex-1 min-w-[220px] max-w-[560px] order-3 md:order-none basis-full md:basis-auto relative">
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onKeyDown={onSearchKeyDown}
            placeholder={t("header.searchPlaceholder")}
            autoComplete="off"
            role="combobox"
            aria-expanded={showSuggestions && suggestions.length > 0}
            aria-controls="header-search-suggestions"
            aria-autocomplete="list"
            className="w-full rounded-full border border-am-border bg-am-bg px-4 py-2.5 pe-11 text-sm focus:outline-none focus:border-am-primary focus:bg-white transition-colors"
          />
          <button type="submit" aria-label="Search" className="absolute end-1 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-am-primary text-white flex items-center justify-center hover:bg-am-primary-dark transition-colors">
            🔍
          </button>

          {showSuggestions && suggestions.length > 0 && (
            <div id="header-search-suggestions" role="listbox" className="absolute top-full inset-x-0 mt-2 bg-white border border-am-border rounded-2xl shadow-xl overflow-hidden z-[60]">
              {suggestions.map((p, i) => {
                const thumb = imageUrl(config.base_urls, "product_image_url", p.image?.[0]);
                const categoryId = p.category_ids?.[0] ? Number(p.category_ids[0].id) : null;
                const categoryName = categoryId ? categories.find((c) => c.id === categoryId)?.name : null;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => goToProduct(p)}
                    onMouseEnter={() => setHighlightIndex(i)}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-start transition-colors ${i === highlightIndex ? "bg-am-bg" : "hover:bg-am-bg"}`}
                  >
                    <span className="w-10 h-10 rounded-lg bg-am-bg-alt shrink-0 relative overflow-hidden">
                      {thumb && <Image src={thumb} alt="" fill sizes="40px" className="object-contain p-1" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold text-am-text truncate">{p.name}</span>
                      {categoryName && <span className="block text-[11px] text-am-text-muted truncate">{categoryName}</span>}
                    </span>
                  </button>
                );
              })}
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={goToFullSearch}
                className="w-full text-center px-3.5 py-2.5 text-[12.5px] font-semibold text-am-primary-dark hover:bg-am-bg border-t border-am-border transition-colors"
              >
                {t("header.seeAllResults")} &quot;{query.trim()}&quot; →
              </button>
            </div>
          )}
        </form>

        <div className="flex items-center gap-2.5 ml-auto shrink-0">
          <LanguageSwitcher />
          <Link href="/wishlist" className="p-2 rounded-full hover:bg-am-bg transition-colors" aria-label={t("header.wishlist")}>❤️</Link>
          <Link href="/cart" className="relative flex items-center gap-2 border border-am-border rounded-full px-4 py-2 text-sm font-semibold hover:border-am-primary transition-colors">
            🛒 <span className="hidden sm:inline">{t("header.cart")}</span>
            {cartCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-am-error text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                {cartCount > 99 ? "99+" : cartCount}
              </span>
            )}
          </Link>

          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 bg-am-primary text-white rounded-full px-4 py-2.5 text-sm font-semibold hover:bg-am-primary-dark transition-colors"
            >
              👤 <span className="hidden sm:inline">{user ? user.f_name : t("header.account")}</span>
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-52 bg-white rounded-xl shadow-xl border border-am-border py-2 z-50 rtl:right-auto rtl:left-0" onMouseLeave={() => setMenuOpen(false)}>
                {token ? (
                  <>
                    <Link href="/account" className="block px-4 py-2 text-sm hover:bg-am-bg">{t("header.myProfile")}</Link>
                    <Link href="/account/orders" className="block px-4 py-2 text-sm hover:bg-am-bg">{t("header.myOrders")}</Link>
                    <Link href="/account/addresses" className="block px-4 py-2 text-sm hover:bg-am-bg">{t("header.myAddresses")}</Link>
                    <Link href="/wishlist" className="block px-4 py-2 text-sm hover:bg-am-bg">{t("header.wishlist")}</Link>
                    <Link href="/track-order" className="block px-4 py-2 text-sm hover:bg-am-bg">📍 {t("header.trackOrder")}</Link>
                    <button
                      onClick={() => { logout(); setMenuOpen(false); router.push("/"); }}
                      className="w-full text-left px-4 py-2 text-sm text-am-error hover:bg-am-bg"
                    >
                      {t("common.signOut")}
                    </button>
                  </>
                ) : (
                  <>
                    <Link href="/login" className="block px-4 py-2 text-sm hover:bg-am-bg font-semibold">{t("header.signIn")}</Link>
                    <Link href="/register" className="block px-4 py-2 text-sm hover:bg-am-bg">{t("header.createAccount")}</Link>
                    <Link href="/track-order" className="block px-4 py-2 text-sm hover:bg-am-bg border-t border-am-border mt-1 pt-2.5">📍 {t("header.trackOrder")}</Link>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {categories.length > 0 && (
        <nav className="bg-white border-t border-am-border relative">
          <div className="max-w-[1280px] mx-auto relative">
            <div
              ref={navScrollRef}
              onWheel={onNavWheel}
              className="flex items-stretch gap-1 overflow-x-auto am-scrollbar-none px-5 py-2 scroll-smooth"
            >
              <Link
                href="/"
                className={`flex items-center gap-2 whitespace-nowrap rounded-full pl-2 pr-3.5 py-1.5 text-[13px] font-bold transition-colors ${
                  pathname === "/" ? "bg-am-primary text-white" : "bg-am-primary/10 text-am-primary-dark hover:bg-am-primary/20"
                }`}
              >
                <span className="w-6 h-6 rounded-full bg-white/25 flex items-center justify-center text-[11px]">✦</span>
                {t("header.allProducts")}
              </Link>

              <span className="w-px bg-am-border shrink-0 my-1.5 mx-1" />

              {categories.slice(0, 14).map((c) => {
                const img = imageUrl(config.base_urls, "category_image_url", c.image);
                const active = pathname === `/category/${c.id}`;
                return (
                  <Link
                    key={c.id}
                    href={`/category/${c.id}`}
                    className={`flex items-center gap-2 whitespace-nowrap rounded-full pl-1.5 pr-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                      active ? "bg-am-primary/10 text-am-primary-dark" : "text-am-text-muted hover:bg-am-bg-alt hover:text-am-text"
                    }`}
                  >
                    <span className="w-6 h-6 rounded-full bg-am-bg-alt overflow-hidden shrink-0 relative">
                      {img && <Image src={img} alt="" fill sizes="24px" className="object-cover" />}
                    </span>
                    {c.name}
                  </Link>
                );
              })}
            </div>

            {/* Edge fades + arrow buttons replace the (now hidden) scrollbar as
                the cue that this row scrolls — each side only appears once
                there's actually more content to reveal in that direction. */}
            {canScrollStart && (
              <>
                <div className="pointer-events-none absolute start-0 top-0 bottom-0 w-12 bg-gradient-to-r from-white to-transparent hidden md:block rtl:bg-gradient-to-l" />
                <button
                  onClick={() => scrollNavBy("start", 240)}
                  aria-label={t("header.scrollCategoriesBack")}
                  className="hidden md:flex absolute start-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white border border-am-border shadow-md items-center justify-center text-am-text-muted hover:text-am-primary-dark hover:border-am-primary transition-colors"
                >
                  <ChevronIcon toward="start" />
                </button>
              </>
            )}
            {canScrollEnd && (
              <>
                <div className="pointer-events-none absolute end-0 top-0 bottom-0 w-12 bg-gradient-to-l from-white to-transparent hidden md:block rtl:bg-gradient-to-r" />
                <button
                  onClick={() => scrollNavBy("end", 240)}
                  aria-label={t("header.scrollCategoriesForward")}
                  className="hidden md:flex absolute end-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white border border-am-border shadow-md items-center justify-center text-am-text-muted hover:text-am-primary-dark hover:border-am-primary transition-colors"
                >
                  <ChevronIcon toward="end" />
                </button>
              </>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}

// Points "backward" (toward the start of the row) or "forward" (toward the
// end) — visually left/right in LTR, mirrored via `rtl:` so the same
// semantic direction points the opposite physical way once the page is
// RTL, matching where the button itself now sits (see scrollShelf.ts).
function ChevronIcon({ toward }: { toward: "start" | "end" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 rtl:-scale-x-100">
      <path d={toward === "start" ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
    </svg>
  );
}
