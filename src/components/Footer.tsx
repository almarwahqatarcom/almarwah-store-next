"use client";

import Link from "next/link";
import { useStoreConfig } from "@/lib/store/config";
import { useSiteSettings } from "@/lib/store/siteSettings";
import { useLanguage } from "@/lib/store/language";

export default function Footer() {
  const { config, categories } = useStoreConfig();
  const siteSettings = useSiteSettings();
  const { t, locale } = useLanguage();

  const siteName = siteSettings.siteName?.[locale] || config.ecommerce_name;
  const address = siteSettings.addressOverride || config.ecommerce_address;

  return (
    <footer
      className={`text-white/75 mt-16 pt-12 pb-6 ${siteSettings.footerBgColor ? "" : "bg-am-text"}`}
      style={siteSettings.footerBgColor ? { backgroundColor: siteSettings.footerBgColor } : undefined}
    >
      <div className="max-w-[1280px] mx-auto px-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-9 pb-8 border-b border-white/10">
          <div className="col-span-2 md:col-span-1">
            {siteSettings.footerLogoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={siteSettings.footerLogoUrl} alt={siteName} className="h-10 w-auto object-contain mb-2.5" />
            )}
            <span className="text-white font-bold text-lg">{siteName}</span>
            <p className="text-[13.5px] mt-3 leading-relaxed">{t("footer.tagline")}</p>
          </div>
          <div>
            <h4 className="text-white text-[13.5px] font-bold uppercase tracking-wide mb-4">{t("footer.shop")}</h4>
            <ul className="flex flex-col gap-2.5">
              <li><Link href="/" className="text-[13.5px] hover:text-am-primary transition">{t("header.allProducts")}</Link></li>
              {categories.slice(0, 5).map((c) => (
                <li key={c.id}><Link href={`/category/${c.id}`} className="text-[13.5px] hover:text-am-primary transition">{c.name}</Link></li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-white text-[13.5px] font-bold uppercase tracking-wide mb-4">{t("footer.account")}</h4>
            <ul className="flex flex-col gap-2.5">
              <li><Link href="/account" className="text-[13.5px] hover:text-am-primary transition">{t("account.myAccount")}</Link></li>
              <li><Link href="/account/orders" className="text-[13.5px] hover:text-am-primary transition">{t("footer.orderHistory")}</Link></li>
              <li><Link href="/track-order" className="text-[13.5px] hover:text-am-primary transition">{t("footer.trackOrder")}</Link></li>
              <li><Link href="/wishlist" className="text-[13.5px] hover:text-am-primary transition">{t("header.wishlist")}</Link></li>
              <li><Link href="/cart" className="text-[13.5px] hover:text-am-primary transition">{t("header.cart")}</Link></li>
              <li><Link href="/policy" className="text-[13.5px] hover:text-am-primary transition">{t("footer.policyLink")}</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-white text-[13.5px] font-bold uppercase tracking-wide mb-4">{t("footer.getInTouch")}</h4>
            <ul className="flex flex-col gap-2.5 text-[13.5px] mb-5">
              <li>📞 {config.ecommerce_phone}</li>
              <li>✉️ {config.ecommerce_email}</li>
              <li>📍 {address}</li>
            </ul>
            {(siteSettings.googlePlayUrl || siteSettings.appStoreUrl) && (
              <div className="flex flex-col gap-2">
                {siteSettings.googlePlayUrl && (
                  <a
                    href={siteSettings.googlePlayUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2.5 bg-white/5 hover:bg-white/10 border border-white/15 rounded-xl px-3.5 py-2 transition-colors w-fit"
                  >
                    <span className="text-xl leading-none">▶️</span>
                    <span className="leading-tight">
                      <span className="block text-[9.5px] text-white/60">{t("footer.getItOn")}</span>
                      <span className="block text-[13px] font-bold text-white">Google Play</span>
                    </span>
                  </a>
                )}
                {siteSettings.appStoreUrl && (
                  <a
                    href={siteSettings.appStoreUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2.5 bg-white/5 hover:bg-white/10 border border-white/15 rounded-xl px-3.5 py-2 transition-colors w-fit"
                  >
                    <span className="text-xl leading-none"></span>
                    <span className="leading-tight">
                      <span className="block text-[9.5px] text-white/60">{t("footer.downloadOnThe")}</span>
                      <span className="block text-[13px] font-bold text-white">App Store</span>
                    </span>
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap justify-between items-center gap-2.5 pt-5 text-[12.5px]">
          <span>© {new Date().getFullYear()} {siteName}. {t("footer.rightsReserved")}</span>
        </div>
      </div>
    </footer>
  );
}
