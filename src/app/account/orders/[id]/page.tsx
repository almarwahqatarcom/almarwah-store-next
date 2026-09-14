"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import RequireAuth from "@/components/RequireAuth";
import { useAuthStore } from "@/lib/store/auth";
import { useStoreConfig } from "@/lib/store/config";
import { useLanguage } from "@/lib/store/language";
import * as api from "@/lib/api";

type OrderItemDetail = {
  product_details?: { name?: string };
  quantity?: number;
  price?: number;
  order?: Record<string, unknown>;
};

function OrderDetailBody() {
  const { config } = useStoreConfig();
  const { t } = useLanguage();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const justPlaced = searchParams.get("placed") === "1";
  const token = useAuthStore((s) => s.token)!;
  const [order, setOrder] = useState<Record<string, unknown> | null>(null);
  const [items, setItems] = useState<OrderItemDetail[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    // The real response is an ARRAY of order line items, each nesting the
    // order's own summary fields (status, payment info, total…) under
    // `.order` — not a single order object, confirmed by a live call.
    api
      .getOrderDetails(token, Number(params.id))
      .then((res) => {
        const list = (Array.isArray(res) ? res : []) as OrderItemDetail[];
        if (list.length === 0 || !list[0].order) {
          setError(true);
          return;
        }
        setOrder(list[0].order);
        setItems(list);
      })
      .catch(() => setError(true));
  }, [token, params.id]);

  return (
    <div className="max-w-[700px] mx-auto px-5 py-10 am-fade-in">
      {justPlaced && (
        <div className="bg-am-success/10 text-am-success rounded-xl px-5 py-3.5 mb-6 text-sm font-semibold">
          {t("order.placedSuccessfully")}
        </div>
      )}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-am-text">{t("order.number")} #{params.id}</h1>
        {!error && order && (
          <Link
            href={`/order-invoice/${params.id}`}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-am-primary-dark hover:underline"
            title={t("order.viewInvoice")}
          >
            🧾 {t("order.viewInvoice")}
          </Link>
        )}
      </div>

      {error ? (
        <p className="text-am-error text-sm">{t("order.couldNotLoad")}</p>
      ) : !order ? (
        <p className="text-am-text-muted text-sm">{t("common.loading")}</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="bg-white border border-am-border rounded-2xl p-6 flex flex-col gap-3">
            <Row label={t("order.status")} value={String(order.order_status ?? "—")} />
            <Row label={t("order.payment")} value={String(order.payment_method ?? "—").replace(/_/g, " ")} />
            <Row label={t("order.paymentStatus")} value={String(order.payment_status ?? "—")} />
            <Row label={t("order.orderType")} value={String(order.order_type ?? "—").replace(/_/g, " ")} />
            <Row label={t("order.placedOn")} value={order.created_at ? new Date(String(order.created_at)).toLocaleString() : "—"} />
            <div className="flex justify-between pt-3 border-t border-am-border font-bold">
              <span>{t("order.total")}</span>
              <span className="text-am-primary-dark">{api.formatCurrency(Number(order.order_amount ?? 0), config)}</span>
            </div>
          </div>

          {items.length > 0 && (
            <div className="bg-white border border-am-border rounded-2xl p-6">
              <h2 className="font-bold text-am-text mb-3 text-sm">{t("order.items")}</h2>
              <div className="flex flex-col gap-2.5">
                {items.map((item, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-am-text">
                      {item.product_details?.name ?? "Item"} <span className="text-am-text-muted">× {item.quantity ?? 1}</span>
                    </span>
                    <span className="font-semibold">{api.formatCurrency(Number(item.price ?? 0) * Number(item.quantity ?? 1), config)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-am-text-muted">{label}</span>
      <span className="font-semibold capitalize">{value}</span>
    </div>
  );
}

export default function OrderDetailPage() {
  return (
    <RequireAuth>
      <OrderDetailBody />
    </RequireAuth>
  );
}
