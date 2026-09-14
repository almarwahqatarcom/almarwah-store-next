"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as api from "@/lib/api";
import { normalizeQatarPhone } from "@/lib/phone";
import { useAuthStore } from "@/lib/store/auth";
import { useStoreConfig } from "@/lib/store/config";
import { useLanguage } from "@/lib/store/language";

// useSearchParams() (for ?redirect=, e.g. from the checkout account-choice
// modal) opts this into client-side rendering, hence the Suspense wrapper —
// same reasoning as login/page.tsx.
export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm() {
  const { config } = useStoreConfig();
  const { t } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/account";

  // Arriving from GuestUpgradePrompt (order-confirmation, after a real
  // guest order) carries the same phone/name that order was placed under —
  // pre-filled here so "create an account" genuinely means "same details,
  // one less thing to retype", not just a link to a blank form. A guest's
  // stored name is a single free-text field (see checkout/page.tsx's
  // newAddress.contact_person_name), so it's split on the first space as a
  // best-effort first/last name guess — never perfect, always editable.
  const [form, setForm] = useState(() => {
    const prefillPhone = searchParams.get("phone") ?? "";
    const prefillName = (searchParams.get("name") ?? "").trim();
    const [firstGuess, ...restGuess] = prefillName.split(/\s+/).filter(Boolean);
    return {
      f_name: firstGuess ?? "",
      l_name: restGuess.join(" "),
      email: "",
      phone: prefillPhone,
      password: "",
    };
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const setSession = useAuthStore((s) => s.setSession);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await api.register({ ...form, phone: normalizeQatarPhone(form.phone) });
      setSession(res.token);
      router.push(redirectTo);
    } catch {
      setError(t("auth.registerError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-[460px] mx-auto px-5 py-14 am-fade-in">
      <div className="bg-white border border-am-border rounded-2xl p-8 shadow-sm">
        <h1 className="text-xl font-bold text-am-text mb-1 text-center">{t("auth.createYourAccount")}</h1>
        <p className="text-sm text-am-text-muted text-center mb-7">{t("auth.joinFor")} {config.ecommerce_name} {t("auth.joinForSuffix")}</p>

        {error && <div className="bg-am-error/10 text-am-error text-[13px] rounded-lg px-4 py-2.5 mb-4">{error}</div>}

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-bold text-am-primary-dark uppercase tracking-wide mb-1.5">{t("auth.firstName")}</label>
              <input required value={form.f_name} onChange={(e) => update("f_name", e.target.value)} className="w-full border border-am-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-am-primary" />
            </div>
            <div>
              <label className="block text-[12px] font-bold text-am-primary-dark uppercase tracking-wide mb-1.5">{t("auth.lastName")}</label>
              <input required value={form.l_name} onChange={(e) => update("l_name", e.target.value)} className="w-full border border-am-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-am-primary" />
            </div>
          </div>
          <div>
            <label className="block text-[12px] font-bold text-am-primary-dark uppercase tracking-wide mb-1.5">{t("auth.email")}</label>
            <input type="email" required value={form.email} onChange={(e) => update("email", e.target.value)} className="w-full border border-am-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-am-primary" />
          </div>
          <div>
            <label className="block text-[12px] font-bold text-am-primary-dark uppercase tracking-wide mb-1.5">{t("auth.phone")}</label>
            <input required value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="66XXXXXX" className="w-full border border-am-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-am-primary" />
          </div>
          <div>
            <label className="block text-[12px] font-bold text-am-primary-dark uppercase tracking-wide mb-1.5">{t("auth.password")}</label>
            <input type="password" required minLength={6} value={form.password} onChange={(e) => update("password", e.target.value)} className="w-full border border-am-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-am-primary" />
          </div>
          <button type="submit" disabled={loading} className="bg-am-primary hover:bg-am-primary-dark disabled:opacity-50 text-white font-bold py-3.5 rounded-full transition-colors mt-2">
            {loading ? t("auth.creatingAccount") : t("auth.createAccount")}
          </button>
        </form>

        <p className="text-center text-[13px] text-am-text-muted mt-6">
          {t("auth.alreadyHaveAccount")} <Link href="/login" className="text-am-primary-dark font-semibold hover:underline">{t("auth.signIn")}</Link>
        </p>
      </div>
    </div>
  );
}
