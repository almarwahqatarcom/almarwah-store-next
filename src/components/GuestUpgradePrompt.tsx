"use client";

import Link from "next/link";
import { useAuthStore } from "@/lib/store/auth";
import { useStoreConfig } from "@/lib/store/config";
import { useLanguage } from "@/lib/store/language";

// Shown after a guest completes a real order (order-confirmation and
// checkout/complete) — the moment guest checkout's one real cost (typing
// everything again next time) is freshest, so "create an account, same
// details" actually lands. Renders nothing for an already-authenticated
// customer (checked here, not left to each caller, so it's safe to drop in
// unconditionally). The reward-points bullet only appears when the store's
// own config actually has loyalty points turned on (loyalty_point_status)
// — confirmed live it's currently off, so promising them unconditionally
// would be a real claim this store doesn't back up.
export default function GuestUpgradePrompt({ phone, name }: { phone?: string; name?: string }) {
  const token = useAuthStore((s) => s.token);
  const { config } = useStoreConfig();
  const { t } = useLanguage();

  if (token) return null;

  const params = new URLSearchParams({ redirect: "/account" });
  if (phone) params.set("phone", phone);
  if (name) params.set("name", name);

  const benefits = [
    { icon: "📦", label: t("guestUpgrade.trackOrders") },
    { icon: "📍", label: t("guestUpgrade.savedAddresses") },
    { icon: "⚡", label: t("guestUpgrade.fasterCheckout") },
    ...(config.loyalty_point_status ? [{ icon: "🎁", label: t("guestUpgrade.rewardPoints") }] : []),
  ];

  return (
    <div
      className="mt-8 rounded-3xl p-7 text-start border border-am-primary/20"
      style={{ background: "linear-gradient(135deg, var(--am-primary-light) 0%, white 65%)" }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-2xl">✨</span>
        <h3 className="text-lg font-bold text-am-text">{t("guestUpgrade.title")}</h3>
      </div>
      <p className="text-[13px] text-am-text-muted mb-5 leading-relaxed">{t("guestUpgrade.subtitle")}</p>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 mb-6">
        {benefits.map((b) => (
          <div key={b.label} className="flex items-center gap-2 text-[12.5px] font-semibold text-am-text">
            <span className="shrink-0">{b.icon}</span> {b.label}
          </div>
        ))}
      </div>

      <Link
        href={`/register?${params.toString()}`}
        className="block text-center bg-am-primary hover:bg-am-primary-dark text-white font-bold py-3.5 rounded-full transition-colors shadow-[0_8px_20px_rgba(196,154,60,0.3)]"
      >
        {t("guestUpgrade.cta")}
      </Link>
    </div>
  );
}
