"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as api from "@/lib/api";
import { normalizeQatarPhone } from "@/lib/phone";
import { useAuthStore } from "@/lib/store/auth";
import { useStoreConfig } from "@/lib/store/config";
import { useLanguage } from "@/lib/store/language";

// useSearchParams() (for ?redirect=) opts this page into client-side
// rendering, which Next.js requires to be wrapped in Suspense so the rest of
// the app can still be statically prerendered around it.
export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFormSkeleton />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginFormSkeleton() {
  return (
    <div className="max-w-[420px] mx-auto px-5 py-14">
      <div className="bg-white border border-am-border rounded-2xl p-8 shadow-sm animate-pulse">
        <div className="h-5 w-32 bg-am-bg-alt rounded mx-auto mb-2" />
        <div className="h-4 w-48 bg-am-bg-alt rounded mx-auto mb-7" />
        <div className="h-12 bg-am-bg-alt rounded-xl mb-4" />
        <div className="h-12 bg-am-bg-alt rounded-xl mb-4" />
        <div className="h-12 bg-am-bg-alt rounded-full" />
      </div>
    </div>
  );
}

function LoginForm() {
  const { config } = useStoreConfig();
  const { t } = useLanguage();
  const setSession = useAuthStore((s) => s.setSession);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/account";

  const [emailOrPhone, setEmailOrPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onPasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const isEmail = emailOrPhone.includes("@");
      const type = isEmail ? "email" : "phone";
      const identifier = isEmail ? emailOrPhone : normalizeQatarPhone(emailOrPhone);
      const res = await api.login(identifier, password, type);
      setSession(res.token);
      router.push(redirectTo);
    } catch (err) {
      setError(err instanceof api.ApiError ? t("auth.invalidCredentials") : t("auth.somethingWrong"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-[420px] mx-auto px-5 py-14 am-fade-in">
      <div className="bg-white border border-am-border rounded-2xl p-8 shadow-sm">
        <h1 className="text-xl font-bold text-am-text mb-1 text-center">{t("auth.welcomeBack")}</h1>
        <p className="text-sm text-am-text-muted text-center mb-7">{t("auth.signInToContinue")} {config.ecommerce_name}</p>

        {error && <div className="bg-am-error/10 text-am-error text-[13px] rounded-lg px-4 py-2.5 mb-4">{error}</div>}

        <form onSubmit={onPasswordSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-[12px] font-bold text-am-primary-dark uppercase tracking-wide mb-1.5">{t("auth.phone")}</label>
            <input
              type="text"
              required
              value={emailOrPhone}
              onChange={(e) => setEmailOrPhone(e.target.value)}
              className="w-full border border-am-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-am-primary"
              placeholder="66XXXXXX"
            />
          </div>
          <div>
            <label className="block text-[12px] font-bold text-am-primary-dark uppercase tracking-wide mb-1.5">{t("auth.password")}</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-am-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-am-primary"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="bg-am-primary hover:bg-am-primary-dark disabled:opacity-50 text-white font-bold py-3.5 rounded-full transition-colors mt-2"
          >
            {loading ? t("auth.signingIn") : t("auth.signIn")}
          </button>
        </form>

        <p className="text-center text-[13px] text-am-text-muted mt-6">
          {t("auth.noAccount")} <Link href="/register" className="text-am-primary-dark font-semibold hover:underline">{t("auth.createOne")}</Link>
        </p>
      </div>
    </div>
  );
}
