"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useStoreConfig } from "@/lib/store/config";
import * as api from "@/lib/api";
import { useLanguage } from "@/lib/store/language";
import GuestUpgradePrompt from "@/components/GuestUpgradePrompt";

// A public, guest-friendly confirmation page — deliberately NOT behind
// RequireAuth. A guest who just placed a real order (paid or COD) has no
// token to view /account/orders/[id], which requires one; sending them
// there would bounce a customer who just completed a purchase straight to
// a login wall. Everything shown here is already known client-side from
// the checkout flow itself (order_id, amount, payment method), so there's
// nothing that needs an authenticated re-fetch just to say "thank you".
export default function OrderConfirmationPage() {
  return (
    <Suspense fallback={null}>
      <OrderConfirmationBody />
    </Suspense>
  );
}

function OrderConfirmationBody() {
  const { config } = useStoreConfig();
  const { t } = useLanguage();
  const searchParams = useSearchParams();
  const orderId = searchParams.get("order_id");
  const total = searchParams.get("total");
  const paymentMethod = searchParams.get("payment_method");
  const phone = searchParams.get("phone") ?? undefined;
  const name = searchParams.get("name") ?? undefined;

  return (
    <div className="max-w-[560px] mx-auto px-5 py-20 text-center am-fade-in">
      <div className="text-6xl mb-5">✅</div>
      <h1 className="text-2xl font-bold text-am-text mb-2.5">{t("orderConfirm.title")}</h1>
      <p className="text-am-text-muted mb-6">
        {orderId ? (
          <>{t("orderConfirm.yourOrder")} <span className="font-semibold text-am-text">#{orderId}</span> {t("orderConfirm.hasBeenReceived")}</>
        ) : (
          t("orderConfirm.hasBeenReceived")
        )}
        {" "}{t("orderConfirm.weWillBeInTouch")}
      </p>

      {(total || paymentMethod) && (
        <div className="bg-white border border-am-border rounded-2xl p-5 flex flex-col gap-2.5 mb-8 text-left">
          {total && (
            <div className="flex justify-between text-sm">
              <span className="text-am-text-muted">{t("cart.total")}</span>
              <span className="font-bold text-am-primary-dark">{api.formatCurrency(Number(total), config)}</span>
            </div>
          )}
          {paymentMethod && (
            <div className="flex justify-between text-sm">
              <span className="text-am-text-muted">{t("order.payment")}</span>
              <span className="font-semibold capitalize">{paymentMethod.replace(/_/g, " ")}</span>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link href="/" className="inline-block bg-am-primary hover:bg-am-primary-dark text-white font-bold px-8 py-3.5 rounded-full transition-colors">
          {t("common.continueShopping")}
        </Link>
      </div>

      <GuestUpgradePrompt phone={phone} name={name} />
    </div>
  );
}
