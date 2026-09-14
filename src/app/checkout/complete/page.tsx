"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuthStore } from "@/lib/store/auth";
import { useCartStore } from "@/lib/store/cart";
import { trackPurchase } from "@/lib/fbPixel";
import { trackClarityPurchase } from "@/lib/clarity";
import { useLanguage } from "@/lib/store/language";
import GuestUpgradePrompt from "@/components/GuestUpgradePrompt";

// Where Sadad (via the backend's own hosted `/payment/sadad/pay` page) sends
// the customer back to. Confirmed by a real, harmless call to the live
// quote endpoint: there is no client-side "confirm" step for this gateway —
// by the time the customer's browser lands here, the backend has already
// created the real order itself (only on genuine payment success) and is
// just reporting the outcome via `?flag=success` / `?flag=fail` plus a
// base64 `token` carrying the transaction reference. See the note above
// quoteDigitalPayment in src/lib/api.ts for the full trace and its one
// caveat: the exact param names are inferred from every sibling gateway in
// the codebase sharing the same redirect helper, not confirmed from
// Sadad's own (separately-licensed, unavailable) controller source — if a
// real order ever lands here without `flag` matching what's expected below,
// that's the first place to look.
function decodeToken(token: string | null): Record<string, string> | null {
  if (!token) return null;
  try {
    const decoded = atob(token);
    const out: Record<string, string> = {};
    for (const pair of decoded.split("&&")) {
      const [k, v] = pair.split("=");
      if (k) out[k] = v ?? "";
    }
    return out;
  } catch {
    return null;
  }
}

export default function CheckoutCompletePage() {
  return (
    <Suspense fallback={null}>
      <CheckoutCompleteBody />
    </Suspense>
  );
}

function CheckoutCompleteBody() {
  const searchParams = useSearchParams();
  const token = useAuthStore((s) => s.token);
  const { t } = useLanguage();
  const clearCart = useCartStore((s) => s.clear);
  const [cartCleared, setCartCleared] = useState(false);

  const flag = searchParams.get("flag");
  const gatewayToken = decodeToken(searchParams.get("token"));
  const success = flag === "success";

  useEffect(() => {
    // The real order was created server-side before this redirect happened
    // (or wasn't, on failure) — nothing left to confirm from here. The only
    // client-side action needed on success is clearing the cart the order
    // was actually placed from.
    if (success && !cartCleared) {
      clearCart(token).finally(() => setCartCleared(true));

      // The redirect back carries no order amount of its own (see the note
      // above) — the value was stashed in sessionStorage right before
      // leaving for Sadad, purely so this Purchase event can carry a real
      // `value`. Missing it (a different tab, cleared storage) just means
      // firing without one rather than blocking the event entirely.
      try {
        const stashed = sessionStorage.getItem("am-pending-purchase-value");
        sessionStorage.removeItem("am-pending-purchase-value");
        const value = stashed ? Number(stashed) : 0;
        trackPurchase({ value });
        trackClarityPurchase(gatewayToken?.reference || gatewayToken?.ref || "sadad", value, "sadad");
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [success]);

  if (success) {
    return (
      <div className="max-w-[560px] mx-auto px-5 py-20 text-center am-fade-in">
        <div className="text-6xl mb-5">✅</div>
        <h1 className="text-2xl font-bold text-am-text mb-2.5">{t("orderComplete.paymentSuccessful")}</h1>
        <p className="text-am-text-muted mb-6">{t("orderComplete.paidBody")}</p>
        {gatewayToken?.transaction_reference && (
          <div className="bg-white border border-am-border rounded-2xl p-5 flex justify-between text-sm mb-8 text-left">
            <span className="text-am-text-muted">{t("orderComplete.transactionReference")}</span>
            <span className="font-semibold">{gatewayToken.transaction_reference}</span>
          </div>
        )}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/" className="inline-block bg-am-primary hover:bg-am-primary-dark text-white font-bold px-8 py-3.5 rounded-full transition-colors">
            {t("common.continueShopping")}
          </Link>
          {token && (
            <Link href="/account/orders" className="inline-block border border-am-border hover:border-am-primary text-am-text font-bold px-8 py-3.5 rounded-full transition-colors">
              {t("orderComplete.viewMyOrders")}
            </Link>
          )}
        </div>

        <GuestUpgradePrompt />
      </div>
    );
  }

  // flag === "fail", or missing/unexpected — either way nothing was
  // charged and no order was created, so the cart is left exactly as the
  // customer left it.
  return (
    <div className="max-w-[480px] mx-auto px-5 py-24 text-center am-fade-in">
      <div className="text-5xl mb-4">✕</div>
      <h1 className="text-xl font-bold text-am-text mb-2">{t("orderComplete.notCompleted")}</h1>
      <p className="text-am-text-muted mb-6">{t("orderComplete.notCompletedBody")}</p>
      <Link href="/checkout" className="inline-block bg-am-primary hover:bg-am-primary-dark text-white font-bold px-7 py-3 rounded-full transition-colors">
        {t("common.tryAgain")}
      </Link>
    </div>
  );
}
