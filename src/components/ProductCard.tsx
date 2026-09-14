"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import type { Product } from "@/lib/types";
import { finalPrice, averageRating, formatCurrency, imageUrl, getApiErrorMessage } from "@/lib/api";
import { useStoreConfig } from "@/lib/store/config";
import { useCartStore } from "@/lib/store/cart";
import { useAuthStore } from "@/lib/store/auth";
import { useLanguage } from "@/lib/store/language";
import { hasArabicText } from "@/lib/i18n/t";

export default function ProductCard({ product }: { product: Product }) {
  const { config } = useStoreConfig();
  const { t, locale } = useLanguage();
  // The backend only ever overwrites `name` with a real Arabic translation
  // when one exists (see hasArabicText()'s docblock) — so while browsing in
  // Arabic, a name with no Arabic characters at all means it silently fell
  // back to English, and gets flagged rather than passed off as translated.
  const missingArabicName = locale === "ar" && !hasArabicText(product.name);
  const price = finalPrice(product);
  const hasDiscount = product.discount > 0;
  const rating = averageRating(product.rating);
  const outOfStock = product.total_stock <= 0;
  const thumb = imageUrl(config.base_urls, "product_image_url", product.image?.[0]);

  // Reading `items` live (not a one-time snapshot) is what makes this stay
  // in sync in real time — any other card, the cart page, or the header's
  // cart count for the SAME product all share this one Zustand store, so a
  // +/- here updates everywhere at once, immediately.
  const cartItem = useCartStore((s) => s.items.find((i) => i.product_id === product.id));
  const add = useCartStore((s) => s.add);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const remove = useCartStore((s) => s.remove);
  const token = useAuthStore((s) => s.token);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const quantity = cartItem?.quantity ?? 0;
  const maxQty = Math.min(product.total_stock || 0, product.maximum_order_quantity || 999);

  // Surfaces the backend's real reason (e.g. "Product not available") instead
  // of silently doing nothing — a bare try/catch with no feedback here looks
  // exactly like a broken button, which is what this replaces.
  function showError(err: unknown, fallback: string) {
    setErrorMsg(getApiErrorMessage(err, fallback));
    setTimeout(() => setErrorMsg(null), 3000);
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
    <div className="group relative flex flex-col bg-am-card border border-am-border rounded-2xl overflow-hidden transition-all hover:-translate-y-1 hover:shadow-[0_8px_26px_rgba(196,154,60,0.16)] hover:border-am-primary-light">
      <Link href={`/product/${product.id}`} className="flex flex-col flex-1">
        <div className="aspect-square bg-am-bg flex items-center justify-center overflow-hidden relative">
          {thumb && (
            <Image
              src={thumb}
              alt={product.name}
              fill
              sizes="(max-width: 640px) 45vw, (max-width: 1024px) 22vw, 220px"
              className="object-contain p-3.5 group-hover:scale-105 transition-transform duration-300"
            />
          )}
          {hasDiscount ? (
            <span className="absolute top-2.5 start-2.5 bg-am-error text-white text-[10.5px] font-bold px-2.5 py-0.5 rounded-full tracking-wide">
              {product.discount_type === "amount" ? formatCurrency(product.discount, config) : `${product.discount}%`} {t("product.off")}
            </span>
          ) : outOfStock ? (
            <span className="absolute top-2.5 start-2.5 bg-gray-400 text-white text-[10.5px] font-bold px-2.5 py-0.5 rounded-full">{t("common.outOfStock")}</span>
          ) : null}
        </div>
        <div className="p-3.5 flex flex-col gap-1.5 flex-1">
          <div className="text-[13px] font-semibold text-am-text am-line-clamp-2 min-h-[34px]">
            {product.name}
            {missingArabicName && (
              <span className="text-am-error ms-1 align-top" title={t("product.noArabicName")} aria-label={t("product.noArabicName")}>★</span>
            )}
          </div>
          {rating > 0 && (
            <div className="flex items-center gap-1 text-[11.5px] text-am-text-muted">
              <span className="text-am-rating">★</span> {rating.toFixed(1)}
            </div>
          )}
          <div className="flex items-baseline gap-2 mt-auto pt-1">
            <span className="text-[15px] font-bold text-am-primary-dark">{formatCurrency(price, config)}</span>
            {hasDiscount && <span className="text-xs text-am-text-faint line-through">{formatCurrency(product.price, config)}</span>}
          </div>
        </div>
      </Link>

      {/* Deliberately outside the Link above — a button nested inside an <a>
          is invalid HTML and would also navigate on every click. Floating
          here keeps the card's height identical whether or not it's in the
          cart, so grid rows stay aligned. */}
      {!outOfStock && (
        <div className="absolute bottom-2.5 end-2.5 z-10">
          {errorMsg && (
            <div className="absolute bottom-full end-0 mb-2 w-max max-w-[180px] bg-am-error text-white text-[11px] font-semibold px-2.5 py-1.5 rounded-lg shadow-lg">
              {errorMsg}
            </div>
          )}
          {quantity === 0 ? (
            <button
              onClick={(e) => {
                e.preventDefault();
                handleAdd();
              }}
              disabled={busy}
              aria-label={`${t("common.addToCart")} ${product.name}`}
              className="w-9 h-9 rounded-full bg-am-primary text-white shadow-lg flex items-center justify-center text-lg font-bold leading-none hover:bg-am-primary-dark disabled:opacity-60 transition-colors"
            >
              +
            </button>
          ) : (
            <div className="flex items-center bg-am-primary text-white rounded-full shadow-lg overflow-hidden">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  handleChange(quantity - 1);
                }}
                disabled={busy}
                aria-label={`${t("common.decreaseQuantity")} ${product.name}`}
                className="w-8 h-8 flex items-center justify-center text-base font-bold leading-none hover:bg-am-primary-dark disabled:opacity-60 transition-colors"
              >
                −
              </button>
              <span className="min-w-[20px] text-center text-[13px] font-bold tabular-nums">{quantity}</span>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  handleChange(quantity + 1);
                }}
                disabled={busy || quantity >= maxQty}
                aria-label={`${t("common.increaseQuantity")} ${product.name}`}
                className="w-8 h-8 flex items-center justify-center text-base font-bold leading-none hover:bg-am-primary-dark disabled:opacity-40 transition-colors"
              >
                +
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
