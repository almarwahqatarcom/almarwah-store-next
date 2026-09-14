"use client";

import { useLanguage } from "@/lib/store/language";

// The address-label picker used by checkout/page.tsx's own "+ Add a new
// address" form, for registered customers only (see that call site's
// comment for why guests don't get this — CheckoutAccountModal.tsx's
// GuestTab hardcodes a single neutral label instead). The real map
// location picker used everywhere now lives in MapLocationPicker.tsx.
export type AddressLabel = "Home" | "Office" | "Other";
export const ADDRESS_LABELS: { key: AddressLabel; icon: string; labelKey: "checkoutAuth.addressLabelHome" | "checkoutAuth.addressLabelOffice" | "checkoutAuth.addressLabelOther" }[] = [
  { key: "Home", icon: "🏠", labelKey: "checkoutAuth.addressLabelHome" },
  { key: "Office", icon: "🏢", labelKey: "checkoutAuth.addressLabelOffice" },
  { key: "Other", icon: "📍", labelKey: "checkoutAuth.addressLabelOther" },
];

export function AddressTypeSelector({ value, onChange }: { value: string; onChange: (v: AddressLabel) => void }) {
  const { t } = useLanguage();
  return (
    <div>
      <label className="block text-[11px] font-bold text-am-primary-dark uppercase tracking-wide mb-1.5">{t("checkoutAuth.saveAs")}</label>
      <div className="flex gap-2">
        {ADDRESS_LABELS.map(({ key, icon, labelKey }) => (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={`flex-1 flex items-center justify-center gap-1.5 text-[13px] font-bold py-2.5 rounded-xl border transition-colors ${
              value === key ? "border-am-primary bg-am-primary/5 text-am-primary-dark" : "border-am-border text-am-text-muted hover:border-am-primary/50"
            }`}
          >
            <span>{icon}</span> {t(labelKey)}
          </button>
        ))}
      </div>
    </div>
  );
}

