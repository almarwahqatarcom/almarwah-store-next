"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import RequireAuth from "@/components/RequireAuth";
import { useAuthStore } from "@/lib/store/auth";
import { useLanguage } from "@/lib/store/language";
import ProductCard from "@/components/ProductCard";
import * as api from "@/lib/api";
import type { Product } from "@/lib/types";

function WishlistBody() {
  const token = useAuthStore((s) => s.token)!;
  const { t, locale } = useLanguage();
  const [items, setItems] = useState<Product[] | null>(null);

  useEffect(() => {
    // A previously-wishlisted product can later be disabled — filter it out
    // here rather than showing a saved item that 404s if opened.
    api.getWishlist(token, locale).then((list) => setItems(list.filter(api.isProductActive))).catch(() => setItems([]));
  }, [token, locale]);

  return (
    <div className="max-w-[1280px] mx-auto px-5 py-10 am-fade-in">
      <h1 className="text-xl font-bold text-am-text mb-6">{t("wishlist.myWishlist")}</h1>
      {items === null ? (
        <p className="text-am-text-muted text-sm">{t("common.loading")}</p>
      ) : items.length === 0 ? (
        <div className="text-center py-16 bg-white border border-am-border rounded-2xl">
          <p className="text-am-text-muted mb-4">{t("wishlist.nothingSaved")}</p>
          <Link href="/" className="inline-block bg-am-primary text-white font-bold px-6 py-2.5 rounded-full text-sm">{t("wishlist.browseProducts")}</Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
          {items.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function WishlistPage() {
  return (
    <RequireAuth>
      <WishlistBody />
    </RequireAuth>
  );
}
