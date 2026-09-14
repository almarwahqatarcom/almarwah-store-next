"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Product } from "@/lib/types";
import { useCartStore } from "@/lib/store/cart";
import { useAuthStore } from "@/lib/store/auth";
import * as api from "@/lib/api";
import { useStoreConfig } from "@/lib/store/config";
import { useLanguage } from "@/lib/store/language";
import AlertModal from "@/components/AlertModal";

// Mirrors ProductCard's real-time cart sync: once this product is in the
// cart, +/- here update the actual cart quantity immediately (same
// Zustand store, same live count everywhere — header badge, cart page,
// this panel), instead of the old design where +/- only adjusted a local
// "how many to add" counter that did nothing until a separate "Add to
// Cart" click, and the cart's own true quantity was never shown here.
export default function AddToCartPanel({ product }: { product: Product }) {
  const { config } = useStoreConfig();
  const { t } = useLanguage();
  const [initialQty, setInitialQty] = useState(1); // only used before this product is in the cart at all
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [wishStatus, setWishStatus] = useState<"idle" | "loading" | "done">("idle");

  const cartItem = useCartStore((s) => s.items.find((i) => i.product_id === product.id));
  const add = useCartStore((s) => s.add);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const remove = useCartStore((s) => s.remove);
  const token = useAuthStore((s) => s.token);
  const router = useRouter();

  const inStock = product.total_stock > 0;
  const maxQty = Math.min(product.total_stock || 0, product.maximum_order_quantity || 999);
  const inCartQty = cartItem?.quantity ?? 0;

  function showError(err: unknown, fallback: string) {
    setErrorMsg(api.getApiErrorMessage(err, fallback));
  }

  async function handleAdd() {
    setBusy(true);
    try {
      await add(product, initialQty, token);
    } catch (e) {
      showError(e, t("common.couldNotAddToCart"));
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
    } catch (e) {
      showError(e, t("common.couldNotUpdateQuantity"));
    } finally {
      setBusy(false);
    }
  }

  async function handleWishlist() {
    if (!token) {
      router.push("/login");
      return;
    }
    setWishStatus("loading");
    try {
      await api.toggleWishlist(token, product.id);
      setWishStatus("done");
      setTimeout(() => setWishStatus("idle"), 1500);
    } catch {
      setWishStatus("idle");
    }
  }

  return (
    <div>
      {inStock && !cartItem && (
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center border border-am-border rounded-full overflow-hidden">
            <button
              onClick={() => setInitialQty((q) => Math.max(1, q - 1))}
              className="w-10 h-10 flex items-center justify-center hover:bg-am-bg text-lg font-semibold"
              aria-label={t("common.decreaseQuantity")}
            >
              −
            </button>
            <span className="w-10 text-center font-semibold text-sm">{initialQty}</span>
            <button
              onClick={() => setInitialQty((q) => Math.min(maxQty, q + 1))}
              className="w-10 h-10 flex items-center justify-center hover:bg-am-bg text-lg font-semibold"
              aria-label={t("common.increaseQuantity")}
            >
              +
            </button>
          </div>
          <span className="text-[12.5px] text-am-text-muted">{product.unit} · {t("common.max")} {maxQty} {t("common.perOrder")}</span>
        </div>
      )}

      <div className="flex gap-3">
        {inCartQty > 0 ? (
          <div className="flex-1 flex items-center justify-between border border-am-primary bg-am-primary/5 rounded-full pl-1.5 pr-2 py-1.5">
            <button
              onClick={() => handleChange(inCartQty - 1)}
              disabled={busy}
              aria-label={t("common.decreaseQuantity")}
              className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold text-am-primary-dark hover:bg-am-primary/10 disabled:opacity-50 transition-colors"
            >
              −
            </button>
            <span className="text-[14px] font-bold text-am-primary-dark">{inCartQty} {t("product.inCart")}</span>
            <button
              onClick={() => handleChange(inCartQty + 1)}
              disabled={busy || inCartQty >= maxQty}
              aria-label={t("common.increaseQuantity")}
              className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold text-am-primary-dark hover:bg-am-primary/10 disabled:opacity-30 transition-colors"
            >
              +
            </button>
          </div>
        ) : (
          <button
            onClick={handleAdd}
            disabled={!inStock || busy}
            className="flex-1 bg-am-primary hover:bg-am-primary-dark disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-full text-[15px] transition-all shadow-[0_8px_20px_rgba(196,154,60,0.35)] hover:shadow-[0_10px_24px_rgba(196,154,60,0.45)] flex items-center justify-center gap-2"
          >
            {busy ? t("common.adding") : !inStock ? t("common.outOfStock") : `🛒 ${t("common.addToCart")}`}
          </button>
        )}
        <button
          onClick={handleWishlist}
          className="w-14 h-14 rounded-full border border-am-border flex items-center justify-center text-xl hover:border-am-primary transition-colors shrink-0"
          aria-label={t("common.addToWishlist")}
        >
          {wishStatus === "done" ? "❤️" : "🤍"}
        </button>
      </div>
      {errorMsg && <AlertModal message={errorMsg} onClose={() => setErrorMsg("")} />}
      {inCartQty > 0 && (
        <button onClick={() => router.push("/cart")} className="mt-3 text-[13px] font-semibold text-am-primary-dark hover:underline">
          {t("common.viewCart")}
        </button>
      )}
      {config.minimum_order_value ? (
        <p className="text-[12px] text-am-text-muted mt-3">{t("product.minimumOrderValue")} {api.formatCurrency(config.minimum_order_value, config)}</p>
      ) : null}
    </div>
  );
}
