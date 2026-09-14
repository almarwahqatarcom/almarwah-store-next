import Link from "next/link";
import Image from "next/image";
import { getBanners, getCategories, getDailyNeeds, getFeatured, getMostReviewed, getConfig, imageUrl } from "@/lib/api";
import ProductRow from "@/components/ProductRow";
import { getServerLocale } from "@/lib/i18n/server";
import { t } from "@/lib/i18n/t";
import type { Product } from "@/lib/types";

export const revalidate = 300;

export default async function HomePage() {
  const locale = await getServerLocale();
  const [config, banners, categories, daily, featured, reviewed] = await Promise.all([
    getConfig(),
    getBanners().catch(() => []),
    getCategories(locale).catch(() => []),
    getDailyNeeds(12, 1, locale).catch(() => ({ products: [] as Product[] })),
    getFeatured(12, 1, locale).catch(() => ({ products: [] as Product[] })),
    getMostReviewed(12, 1, locale).catch(() => ({ products: [] as Product[] })),
  ]);

  const sortedCategories = [...categories].sort((a, b) => a.priority - b.priority);

  return (
    <div className="am-fade-in">
      {banners.length > 0 && (
        <section className="pt-6 pb-2">
          <div className="max-w-[1280px] mx-auto px-5">
            <div className="flex gap-4.5 gap-x-4 overflow-x-auto snap-x snap-mandatory am-scrollbar-thin pb-1.5">
              {banners.map((b) => {
                const img = imageUrl(config.base_urls, "banner_image_url", b.image);
                if (!img) return null;
                const href = b.product_id ? `/product/${b.product_id}` : b.category_id ? `/category/${b.category_id}` : "#";
                return (
                  <Link
                    key={b.id}
                    href={href}
                    className="snap-start shrink-0 w-[88vw] sm:w-[min(820px,88vw)] aspect-[3.2/1] rounded-2xl overflow-hidden bg-am-bg-alt shadow-[0_8px_26px_rgba(196,154,60,0.12)] relative"
                  >
                    <Image src={img} alt={b.title} fill sizes="820px" className="object-cover" priority />
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {sortedCategories.length > 0 && (
        <section className="py-8">
          <div className="max-w-[1280px] mx-auto px-5">
            <h2 className="text-xl font-bold text-am-text mb-4">{t(locale, "home.popularCategories")}</h2>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4.5 gap-y-6">
              {sortedCategories.slice(0, 16).map((c) => {
                const img = imageUrl(config.base_urls, "category_image_url", c.image);
                return (
                  <Link key={c.id} href={`/category/${c.id}`} className="text-center group">
                    <div className="w-[84px] h-[84px] mx-auto mb-2.5 rounded-full bg-white border border-am-border flex items-center justify-center overflow-hidden shadow-sm transition-all group-hover:-translate-y-1 group-hover:shadow-[0_8px_26px_rgba(196,154,60,0.16)] group-hover:border-am-primary relative">
                      {img && <Image src={img} alt={c.name} fill sizes="84px" className="object-cover" />}
                    </div>
                    <div className="text-[12.5px] font-semibold text-am-text am-line-clamp-2 leading-tight">{c.name}</div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <ProductRow title={t(locale, "home.dailyNeeds")} products={daily.products} />
      <ProductRow title={t(locale, "home.featuredProducts")} products={featured.products} />
      <ProductRow title={t(locale, "home.mostLoved")} products={reviewed.products} />

      <section className="py-8">
        <div className="max-w-[1280px] mx-auto px-5">
          <div className="rounded-2xl p-10 flex items-center justify-between flex-wrap gap-5 text-white" style={{ background: "linear-gradient(135deg, var(--am-primary) 0%, var(--am-primary-dark) 100%)" }}>
            <div>
              <div className="text-xl font-bold mb-1.5">{t(locale, "home.readyToCheckout")}</div>
              <div className="text-sm opacity-90">{t(locale, "home.readyToCheckoutSub")}</div>
            </div>
            <Link href="/cart" className="bg-white text-am-primary-dark px-7 py-3 rounded-full font-bold text-sm whitespace-nowrap hover:scale-105 transition-transform">
              {t(locale, "common.goToMyCart")}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
