"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { useAuthStore } from "@/lib/store/auth";
import { useStoreConfig } from "@/lib/store/config";
import { useLanguage } from "@/lib/store/language";
import * as api from "@/lib/api";

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
// for.
type OrderItemDetail = {
  id: number;
  product_details?: { name?: string };
  quantity?: number;
  price?: number;
  discount_on_product?: number;
  tax_amount?: number;
};

type OrderSummary = {
  id: number;
  order_amount?: number;
  delivery_charge?: number;
  total_tax_amount?: number;
  coupon_discount_amount?: number;
  coupon_code?: string;
  payment_method?: string;
  payment_status?: string;
  order_status?: string;
  order_type?: string;
  transaction_reference?: string;
  created_at?: string;
  delivery_address?: {
    contact_person_name?: string;
    contact_person_number?: string;
    address?: string;
  } | null;
};

export default function OrderInvoicePage() {
  return (
    <RequireAuth>
      <OrderInvoiceBody />
    </RequireAuth>
  );
}

function OrderInvoiceBody() {
  const { config } = useStoreConfig();
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
        const list = (Array.isArray(res) ? res : []) as (OrderItemDetail & { order?: OrderSummary })[];
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

  const subtotal = items.reduce((sum, i) => sum + (i.price ?? 0) * (i.quantity ?? 1), 0);
  const discountTotal = items.reduce((sum, i) => sum + (i.discount_on_product ?? 0) * (i.quantity ?? 1), 0);
  const taxTotal = order.total_tax_amount ?? items.reduce((sum, i) => sum + (i.tax_amount ?? 0), 0);
  const deliveryCharge = order.delivery_charge ?? 0;
  const couponDiscount = order.coupon_discount_amount ?? 0;
  const total = order.order_amount ?? subtotal + taxTotal + deliveryCharge - discountTotal - couponDiscount;
  const logo = api.imageUrl(config.base_urls, "ecommerce_image_url", config.ecommerce_logo);

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

      <div className="bg-white border border-am-border rounded-3xl shadow-[0_10px_34px_rgba(26,41,66,0.07)] p-8 sm:p-12 print:shadow-none print:border-0 print:rounded-none print:p-0">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between gap-6 pb-8 mb-8 border-b-2 border-am-primary/20">
          <div className="flex items-center gap-3.5">
            {logo && <Image src={logo} alt={config.ecommerce_name} width={52} height={52} className="rounded-xl object-contain" />}
            <div>
              <div className="text-lg font-bold text-am-text">{config.ecommerce_name}</div>
              <div className="text-[12.5px] text-am-text-muted leading-relaxed">
                {config.ecommerce_address}
                <br />
                {config.ecommerce_phone} · {config.ecommerce_email}
              </div>
            </div>
          </div>
          <div className="text-left sm:text-right">
            <div className="text-2xl font-bold text-am-primary-dark uppercase tracking-wide">{t("order.invoiceTitle")}</div>
            <div className="text-[13px] text-am-text-muted mt-1">
              {t("order.number")} <span className="font-semibold text-am-text">#{order.id}</span>
            </div>
            <div className="text-[13px] text-am-text-muted">{order.created_at ? new Date(order.created_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "—"}</div>
          </div>
        </div>

        {/* Billing / Payment info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mb-10">
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-am-text-faint mb-2.5">{t("order.deliveredTo")}</h3>
            <div className="text-[13.5px] text-am-text leading-relaxed">
              {order.delivery_address?.contact_person_name && <div className="font-semibold">{order.delivery_address.contact_person_name}</div>}
              {order.delivery_address?.contact_person_number && <div>{order.delivery_address.contact_person_number}</div>}
              {order.delivery_address?.address && <div className="text-am-text-muted">{order.delivery_address.address}</div>}
              {!order.delivery_address && <div className="text-am-text-muted">{t("order.selfPickup")}</div>}
            </div>
          </div>
          <div className="sm:text-right">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-am-text-faint mb-2.5">{t("order.payment")}</h3>
            <div className="text-[13.5px] text-am-text leading-relaxed">
              <div className="capitalize">{(order.payment_method ?? "—").replace(/_/g, " ")}</div>
              <div className="capitalize text-am-text-muted">{t("order.statusColon")} {order.payment_status ?? "—"}</div>
              {order.transaction_reference && <div className="text-am-text-muted text-[12px]">{t("order.ref")} {order.transaction_reference}</div>}
            </div>
          </div>
        </div>

        {/* Items */}
        <table className="w-full text-[13.5px] mb-8">
          <thead>
            <tr className="border-b-2 border-am-primary/20 text-[11px] uppercase tracking-wider text-am-text-faint">
              <th className="text-left font-bold py-2.5">{t("order.items")}</th>
              <th className="text-center font-bold py-2.5 w-20">{t("order.qty")}</th>
              <th className="text-right font-bold py-2.5 w-28">{t("order.price")}</th>
              <th className="text-right font-bold py-2.5 w-28">{t("order.total")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-am-border">
                <td className="py-3 text-am-text">{item.product_details?.name ?? "Item"}</td>
                <td className="py-3 text-center text-am-text-muted">{item.quantity ?? 1}</td>
                <td className="py-3 text-right text-am-text-muted">{api.formatCurrency(item.price ?? 0, config)}</td>
                <td className="py-3 text-right font-semibold text-am-text">{api.formatCurrency((item.price ?? 0) * (item.quantity ?? 1), config)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end">
          <div className="w-full sm:w-72 flex flex-col gap-2 text-[13.5px]">
            <div className="flex justify-between text-am-text-muted">
              <span>{t("cart.subtotal")}</span>
              <span>{api.formatCurrency(subtotal, config)}</span>
            </div>
            {discountTotal > 0 && (
              <div className="flex justify-between text-am-text-muted">
                <span>{t("order.discount")}</span>
                <span>−{api.formatCurrency(discountTotal, config)}</span>
              </div>
            )}
            {couponDiscount > 0 && (
              <div className="flex justify-between text-am-text-muted">
                <span>{t("checkout.coupon")}{order.coupon_code ? ` (${order.coupon_code})` : ""}</span>
                <span>−{api.formatCurrency(couponDiscount, config)}</span>
              </div>
            )}
            {taxTotal > 0 && (
              <div className="flex justify-between text-am-text-muted">
                <span>{t("order.tax")}</span>
                <span>{api.formatCurrency(taxTotal, config)}</span>
              </div>
            )}
            <div className="flex justify-between text-am-text-muted">
              <span>{t("checkout.delivery")}</span>
              <span>{deliveryCharge > 0 ? api.formatCurrency(deliveryCharge, config) : t("common.currencyFree")}</span>
            </div>
            <div className="flex justify-between text-lg font-bold text-am-text pt-3 mt-1 border-t-2 border-am-primary/20">
              <span>{t("order.total")}</span>
              <span className="text-am-primary-dark">{api.formatCurrency(total, config)}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-am-border text-center text-[12px] text-am-text-faint">
          <p className="mb-1">{t("order.thankYou")} {config.ecommerce_name}.</p>
          <p>{config.footer_text}</p>
        </div>
      </div>
    </div>
  );
}
