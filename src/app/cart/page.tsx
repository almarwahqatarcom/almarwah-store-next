"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useCartStore, waitForCartHydration } from "@/lib/store/cart";
import { useAuthStore, waitForAuthHydration } from "@/lib/store/auth";
import { useStoreConfig } from "@/lib/store/config";
import { finalPrice, formatCurrency, imageUrl, getCategoryProducts, isProductActive } from "@/lib/api";
import SuggestedProductsModal from "@/components/SuggestedProductsModal";
import { useLanguage } from "@/lib/store/language";
import { useSiteSettings } from "@/lib/store/siteSettings";
import type { Product } from "@/lib/types";

export default function CartPage() {
  const { config } = useStoreConfig();
  const { items, loading, refresh, updateQuantity, remove } = useCartStore();
  const token = useAuthStore((s) => s.token);
  const { t } = useLanguage();
  const siteSettings = useSiteSettings();
  // Admin-configurable — see the field's own comment in store.server.ts for
  // why missing/undefined still means enabled (keeps existing installs'
  // current always-on behavior until an admin explicitly disables it).
  const suggestedProductsEnabled = siteSettings.suggestedProductsEnabled !== false;

  useEffect(() => {
    // See Header.tsx for why: both stores rehydrate from localStorage
    // asynchronously, so refreshing before that finishes can orphan the cart.
    Promise.all([waitForCartHydration(), waitForAuthHydration()]).then(() => {
      refresh(useAuthStore.getState().token);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const subtotal = items.reduce((sum, i) => sum + finalPrice({ price: i.price, discount: i.discount, discount_type: i.discount_type }) * i.quantity, 0);
  const belowMinimum = config.minimum_order_value > 0 && subtotal < config.minimum_order_value;

  // Mirrors the Flutter app's FreeDeliveryProgressBarWidget exactly — same
  // gating flag, same threshold, same "X more to free delivery" vs "enjoy
  // free delivery" copy. Only ever shows what's actually configured
  // (free_delivery_over_amount_status/free_delivery_over_amount) — nothing
  // hardcoded, since that's what caused the flat-100-QR bug this replaced.
  const freeDeliveryEnabled = !!config.free_delivery_over_amount_status && config.free_delivery_over_amount > 0;
  const freeDeliveryProgress = freeDeliveryEnabled ? Math.min(1, subtotal / config.free_delivery_over_amount) : 0;
  const qualifiesForFreeDelivery = freeDeliveryProgress >= 1;

  // Cross-sell suggestions — sourced from the category of what's actually
  // in the cart (same "More from category" relevance logic as the product
  // page). Shown as a centered modal (SuggestedProductsModal — auto-slides
  // through the shelf on its own) either on demand via the link below, or
  // automatically when hovering "Proceed to Checkout": the moment of
  // highest purchase intent, and a natural "wait, one more thing" beat
  // before the customer leaves the cart page.
  const [suggested, setSuggested] = useState<Product[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const hoverOpenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Hovering the button opens it once per visit to this page — after that,
  // repeated hovers do nothing, so it doesn't re-pop every time the cursor
  // passes back over the button. The manual "You Might Also Like" link is
  // unaffected and always works.
  const hoverAlreadyOpened = useRef(false);

  async function loadSuggestions(): Promise<Product[]> {
    if (suggested.length > 0) return suggested;
    const categoryId = items.map((i) => i.product?.category_ids?.[0]?.id).find((id): id is string => !!id);
    if (!categoryId) return [];
    try {
      const res = await getCategoryProducts(Number(categoryId), 12, 1);
      const cartProductIds = new Set(items.map((i) => i.product_id));
      const suggestions = res.products.filter((p) => isProductActive(p) && !cartProductIds.has(p.id)).slice(0, 10);
      setSuggested(suggestions);
      return suggestions;
    } catch {
      return [];
    }
  }

  async function openSuggestions() {
    if (!suggestedProductsEnabled) return;
    const suggestions = await loadSuggestions();
    if (suggestions.length > 0) setShowSuggestions(true);
  }

  function handleCheckoutHoverEnter() {
    if (!suggestedProductsEnabled || hoverAlreadyOpened.current) return;
    // A brief hover-intent delay — a quick mouse pass over the button on
    // the way elsewhere shouldn't pop a full modal; a genuine pause over it
    // should. Once open, the modal behaves like any other (closed via its
    // own X/backdrop/Escape), not tied to continued hovering.
    hoverOpenTimer.current = setTimeout(() => {
      hoverAlreadyOpened.current = true;
      openSuggestions();
    }, 250);
  }

  function handleCheckoutHoverLeave() {
    if (hoverOpenTimer.current) clearTimeout(hoverOpenTimer.current);
  }

  if (!loading && items.length === 0) {
    return (
      <div className="max-w-[600px] mx-auto px-5 py-20 text-center am-fade-in">
        <div className="text-5xl mb-4">🛒</div>
        <h1 className="text-xl font-bold text-am-text mb-2">{t("cart.empty.title")}</h1>
        <p className="text-am-text-muted mb-6">{t("cart.empty.body")}</p>
        <Link href="/" className="inline-block bg-am-primary hover:bg-am-primary-dark text-white font-bold px-7 py-3 rounded-full transition-colors">
          {t("common.startShopping")}
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-[1000px] mx-auto px-5 py-8 am-fade-in">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <h1 className="text-xl font-bold text-am-text">{t("cart.title")} {items.length > 0 && <span className="text-am-text-faint font-medium text-[15px]">({items.length} {items.length === 1 ? t("cart.item") : t("cart.items")})</span>}</h1>
        {suggestedProductsEnabled && (
          <button onClick={openSuggestions} className="text-[13px] font-semibold text-am-primary-dark hover:underline">
            ✨ {t("cart.youMightAlsoLike")}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8">
        <div className="flex flex-col gap-3">
          {items.map((item) => {
            const thumb = imageUrl(config.base_urls, "product_image_url", item.product?.image?.[0]);
            const price = finalPrice({ price: item.price, discount: item.discount, discount_type: item.discount_type });
            const maxQty = Math.min(item.product?.total_stock ?? 999, item.product?.maximum_order_quantity ?? 999);
            return (
              <div key={item.id} className="flex gap-4 bg-white border border-am-border rounded-xl p-4 items-center">
                <Link href={`/product/${item.product_id}`} className="w-20 h-20 bg-am-bg rounded-lg flex items-center justify-center shrink-0 relative overflow-hidden">
                  {thumb && <Image src={thumb} alt={item.product?.name ?? ""} fill sizes="80px" className="object-contain p-1.5" />}
                </Link>
                <div className="flex-1 min-w-0">
                  <Link href={`/product/${item.product_id}`} className="text-[13.5px] font-semibold text-am-text hover:text-am-primary-dark am-line-clamp-2">
                    {item.product?.name}
                  </Link>
                  <div className="text-[14px] font-bold text-am-primary-dark mt-1">{formatCurrency(price, config)}</div>
                </div>
                <div className="flex items-center border border-am-border rounded-full overflow-hidden shrink-0">
                  <button
                    onClick={() => (item.quantity <= 1 ? remove(item.id, token) : updateQuantity(item.id, item.quantity - 1, token))}
                    aria-label={item.quantity <= 1 ? t("common.remove") : t("common.decreaseQuantity")}
                    className="w-8 h-8 flex items-center justify-center hover:bg-am-bg font-semibold"
                  >
                    −
                  </button>
                  <span className="w-8 text-center text-sm font-semibold">{item.quantity}</span>
                  <button onClick={() => updateQuantity(item.id, Math.min(maxQty, item.quantity + 1), token)} aria-label={t("common.increaseQuantity")} className="w-8 h-8 flex items-center justify-center hover:bg-am-bg font-semibold">+</button>
                </div>
                <button onClick={() => remove(item.id, token)} className="text-am-error text-xs font-semibold hover:underline shrink-0" aria-label={t("common.remove")}>
                  {t("common.remove")}
                </button>
              </div>
            );
          })}
        </div>

        <div className="bg-white border border-am-border rounded-2xl p-6 h-fit sticky top-24">
          <h2 className="font-bold text-am-text mb-4">{t("cart.orderSummary")}</h2>
          <div className="flex justify-between text-sm mb-2.5">
            <span className="text-am-text-muted">{t("cart.subtotal")}</span>
            <span className="font-semibold">{formatCurrency(subtotal, config)}</span>
          </div>
          {/* No delivery line here on purpose — matching the real app's
              cart screen (CartDetailsWidget in the Flutter source): delivery
              fee depends on branch/distance/delivery-area, none of which is
              known until checkout, so it's calculated and shown only there
              (see src/app/checkout/page.tsx). Showing a number here would
              have to guess, the same mistake that previously showed a flat,
              wrong 100 QR pulled from an unused legacy config field. */}
          <p className="text-[12px] text-am-text-muted mb-4 pb-4 border-b border-am-border">{t("cart.deliveryCalculated")}</p>
          <div className="flex justify-between text-base font-bold mb-5">
            <span>{t("cart.total")}</span>
            <span className="text-am-primary-dark">{formatCurrency(subtotal, config)}</span>
          </div>
          {belowMinimum ? (
            <p className="text-[12px] text-am-error mb-3">{t("cart.minimumOrderIs")} {formatCurrency(config.minimum_order_value, config)} — {t("cart.addMore")} {formatCurrency(config.minimum_order_value - subtotal, config)} {t("cart.more")}</p>
          ) : null}
          {freeDeliveryEnabled && (
            <div className="mb-4">
              <div className="flex items-center gap-2 text-[12.5px] font-semibold text-am-text mb-2">
                <span>🏷️</span>
                {qualifiesForFreeDelivery ? (
                  <span className="text-am-success">{t("cart.unlockedFreeDelivery")}</span>
                ) : (
                  <span>{formatCurrency(config.free_delivery_over_amount - subtotal, config)} {t("cart.moreForFreeDelivery")}</span>
                )}
              </div>
              <div className="h-1.5 rounded-full bg-am-border overflow-hidden">
                <div className="h-full bg-am-primary rounded-full transition-all" style={{ width: `${freeDeliveryProgress * 100}%` }} />
              </div>
            </div>
          )}
          <div onMouseEnter={belowMinimum ? undefined : handleCheckoutHoverEnter} onMouseLeave={handleCheckoutHoverLeave}>
            <Link
              href="/checkout"
              className={`block text-center font-bold py-3.5 rounded-full transition-colors ${belowMinimum ? "bg-am-border text-am-text-faint pointer-events-none" : "bg-am-primary hover:bg-am-primary-dark text-white"}`}
            >
              {t("cart.proceedToCheckout")}
            </Link>
          </div>
        </div>
      </div>

      {showSuggestions && suggested.length > 0 && (
        <SuggestedProductsModal products={suggested} onClose={() => setShowSuggestions(false)} />
      )}
    </div>
  );
}
