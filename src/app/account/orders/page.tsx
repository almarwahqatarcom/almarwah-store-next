"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { useAuthStore } from "@/lib/store/auth";
import { useStoreConfig } from "@/lib/store/config";
import { useLanguage } from "@/lib/store/language";
import * as api from "@/lib/api";
import type { Order } from "@/lib/types";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-am-info/10 text-am-info",
  confirmed: "bg-am-info/10 text-am-info",
  processing: "bg-am-rating/15 text-[#8a6d00]",
  out_for_delivery: "bg-am-rating/15 text-[#8a6d00]",
  delivered: "bg-am-success/10 text-am-success",
  canceled: "bg-am-error/10 text-am-error",
  cancelled: "bg-am-error/10 text-am-error",
  failed: "bg-am-error/10 text-am-error",
};

function OrdersBody() {
  const { config } = useStoreConfig();
  const { t } = useLanguage();
  const token = useAuthStore((s) => s.token)!;
  const [orders, setOrders] = useState<Order[] | null>(null);

  useEffect(() => {
    api.getOrders(token).then(setOrders).catch(() => setOrders([]));
  }, [token]);

  return (
    <div className="max-w-[800px] mx-auto px-5 py-10 am-fade-in">
      <h1 className="text-xl font-bold text-am-text mb-6">{t("account.myOrders")}</h1>

      {orders === null ? (
        <p className="text-am-text-muted text-sm">{t("account.loadingOrders")}</p>
      ) : orders.length === 0 ? (
        <div className="text-center py-16 bg-white border border-am-border rounded-2xl">
          <p className="text-am-text-muted mb-4">{t("account.noOrdersYet")}</p>
          <Link href="/" className="inline-block bg-am-primary text-white font-bold px-6 py-2.5 rounded-full text-sm">{t("common.startShopping")}</Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {orders.map((o) => (
            <Link key={o.id} href={`/account/orders/${o.id}`} className="flex items-center justify-between bg-white border border-am-border rounded-xl p-4 hover:border-am-primary transition-colors">
              <div>
                <div className="font-semibold text-sm text-am-text">{t("order.number")} #{o.id}</div>
                <div className="text-[12.5px] text-am-text-muted">{new Date(o.created_at).toLocaleDateString()} · {o.payment_method.replace(/_/g, " ")}</div>
              </div>
              <div className="text-right">
                <div className="font-bold text-am-primary-dark text-sm">{api.formatCurrency(o.order_amount, config)}</div>
                <span className={`inline-block mt-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full capitalize ${STATUS_COLORS[o.order_status] ?? "bg-am-bg-alt text-am-text"}`}>
                  {o.order_status.replace(/_/g, " ")}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function OrdersPage() {
  return (
    <RequireAuth>
      <OrdersBody />
    </RequireAuth>
  );
}
