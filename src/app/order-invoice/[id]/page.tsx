"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { useAuthStore } from "@/lib/store/auth";
import { useLanguage } from "@/lib/store/language";
import * as api from "@/lib/api";
import InvoiceDocument, { type InvoiceItem, type InvoiceOrder } from "@/components/InvoiceDocument";

// A properly-scoped alternative to the backend's own /order-invoice/{id}
// page (linked from account/orders/[id] before this existed): that route
// has NO auth and NO ownership check on sequential ids — any order can be
// viewed by guessing the number (see the flag in README.md's "Security
// issue" section and the route's own comment in the Laravel source). This
// page instead reuses GET /customer/order/details, which — confirmed by
// reading OrderController::getOrderDetails() — genuinely does scope to the
// authenticated customer's own orders (`whereHas('order', fn($q) =>
// $q->where(['user_id' => $userId, ...]))`), so a customer can only ever
// see their own invoice here, on top of getting the redesigned look asked
// for. The actual invoice layout lives in InvoiceDocument.tsx, shared with
// track-order's own "Download Invoice" (same underlying data shape from
// the same backend endpoint, just token vs phone auth) so both stay
// pixel-identical.
type OrderItemDetail = InvoiceItem & { id: number };
type OrderSummary = InvoiceOrder & { order_status?: string };

export default function OrderInvoicePage() {
  return (
    <RequireAuth>
      <OrderInvoiceBody />
    </RequireAuth>
  );
}

function OrderInvoiceBody() {
  const { t } = useLanguage();
  const params = useParams<{ id: string }>();
  const token = useAuthStore((s) => s.token)!;
  const [order, setOrder] = useState<OrderSummary | null>(null);
  const [items, setItems] = useState<OrderItemDetail[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    api
      .getOrderDetails(token, Number(params.id))
      .then((res) => {
        const list = (Array.isArray(res) ? res : []) as unknown as (OrderItemDetail & { order?: OrderSummary })[];
        if (list.length === 0 || !list[0].order) {
          setError(true);
          return;
        }
        setOrder(list[0].order!);
        setItems(list);
      })
      .catch(() => setError(true));
  }, [token, params.id]);

  if (error) {
    return (
      <div className="max-w-[600px] mx-auto px-5 py-20 text-center am-fade-in">
        <p className="text-am-error text-sm mb-6">{t("order.couldNotLoadInvoice")}</p>
        <Link href="/account/orders" className="inline-block bg-am-primary text-white font-bold px-7 py-3 rounded-full">{t("order.backToOrders")}</Link>
      </div>
    );
  }

  if (!order) {
    return <p className="text-am-text-muted text-sm text-center py-20">{t("common.loading")}</p>;
  }

  return (
    <div className="max-w-[850px] mx-auto px-5 py-10 am-fade-in print:py-0 print:px-0 print:max-w-none">
      <style>{`@media print { header, footer { display: none !important; } body { background: #fff !important; } }`}</style>

      <div className="flex items-center justify-between mb-6 print:hidden">
        <Link href={`/account/orders/${order.id}`} className="text-[13px] font-semibold text-am-text-muted hover:text-am-primary-dark">{t("order.backToOrder")}</Link>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 bg-am-primary hover:bg-am-primary-dark text-white text-[13px] font-bold px-5 py-2.5 rounded-full transition-colors"
        >
          {t("order.printInvoice")}
        </button>
      </div>

      <div className="print:border-0">
        <InvoiceDocument order={order} items={items} />
      </div>
    </div>
  );
}
