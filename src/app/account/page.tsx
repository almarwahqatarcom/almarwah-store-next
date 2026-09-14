"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { useAuthStore } from "@/lib/store/auth";
import { useLanguage } from "@/lib/store/language";
import * as api from "@/lib/api";

function AccountBody() {
  const { token, user, setUser, logout } = useAuthStore();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    api
      .getCustomerInfo(token)
      .then((info) => {
        setUser({
          id: Number(info.id),
          f_name: String(info.f_name ?? ""),
          l_name: String(info.l_name ?? ""),
          email: String(info.email ?? ""),
          phone: String(info.phone ?? ""),
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="max-w-[800px] mx-auto px-5 py-10 am-fade-in">
      <h1 className="text-xl font-bold text-am-text mb-6">{t("account.myAccount")}</h1>

      <div className="bg-white border border-am-border rounded-2xl p-6 mb-6">
        {loading ? (
          <p className="text-am-text-muted text-sm">{t("account.loadingProfile")}</p>
        ) : user ? (
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-am-primary-light flex items-center justify-center text-2xl font-bold text-am-primary-dark">
              {user.f_name?.[0]?.toUpperCase() ?? "U"}
            </div>
            <div>
              <div className="font-bold text-am-text">{user.f_name} {user.l_name}</div>
              <div className="text-[13px] text-am-text-muted">{user.email}</div>
              <div className="text-[13px] text-am-text-muted">{user.phone}</div>
            </div>
          </div>
        ) : (
          <p className="text-am-text-muted text-sm">{t("account.couldNotLoad")}</p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link href="/account/orders" className="bg-white border border-am-border rounded-2xl p-5 hover:border-am-primary hover:shadow-md transition-all text-center">
          <div className="text-2xl mb-2">📦</div>
          <div className="text-sm font-semibold">{t("account.myOrders")}</div>
        </Link>
        <Link href="/account/addresses" className="bg-white border border-am-border rounded-2xl p-5 hover:border-am-primary hover:shadow-md transition-all text-center">
          <div className="text-2xl mb-2">📍</div>
          <div className="text-sm font-semibold">{t("account.myAddresses")}</div>
        </Link>
        <Link href="/wishlist" className="bg-white border border-am-border rounded-2xl p-5 hover:border-am-primary hover:shadow-md transition-all text-center">
          <div className="text-2xl mb-2">❤️</div>
          <div className="text-sm font-semibold">{t("account.wishlist")}</div>
        </Link>
      </div>

      <button onClick={logout} className="mt-8 text-am-error text-sm font-semibold hover:underline">
        {t("common.signOut")}
      </button>
    </div>
  );
}

export default function AccountPage() {
  return (
    <RequireAuth>
      <AccountBody />
    </RequireAuth>
  );
}
