import { searchProducts, isProductActive } from "@/lib/api";
import ProductCard from "@/components/ProductCard";
import Pagination from "@/components/Pagination";
import { getServerLocale } from "@/lib/i18n/server";
import { t } from "@/lib/i18n/t";

export const revalidate = 60;
const PER_PAGE = 24;

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const sp = await searchParams;
  const query = (sp.q ?? "").trim();
  const page = Math.max(1, Number(sp.page) || 1);
  // `offset` on this endpoint is the page number itself, not a computed
  // record-skip index — see the identical fix + explanation in
  // category/[id]/page.tsx, confirmed live against both endpoints.
  const offset = page;
  const locale = await getServerLocale();

  const data = query
    ? await searchProducts(query, PER_PAGE, offset, locale).catch(() => ({ products: [], total_size: 0 }))
    : { products: [], total_size: 0 };
  const totalPages = Math.max(1, Math.ceil(data.total_size / PER_PAGE));
  // Disabled products (status: 0) still come back from this endpoint —
  // filter them from what's rendered, same as category/[id]/page.tsx.
  const visibleProducts = data.products.filter(isProductActive);

  return (
    <div className="max-w-[1280px] mx-auto px-5 py-8 am-fade-in">
      <h1 className="text-xl font-bold text-am-text mb-6">
        {query ? (
          <>{t(locale, "search.resultsFor")} &quot;{query}&quot; <span className="text-am-text-faint font-medium text-[15px]">({data.total_size.toLocaleString()})</span></>
        ) : (
          t(locale, "search.title")
        )}
      </h1>

      {!query ? (
        <div className="text-center py-16 text-am-text-muted">{t(locale, "search.typeSomething")}</div>
      ) : visibleProducts.length === 0 ? (
        <div className="text-center py-16 text-am-text-muted">{t(locale, "search.noMatch")} &quot;{query}&quot;. {t(locale, "search.tryDifferent")}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
            {visibleProducts.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
          <Pagination page={page} totalPages={totalPages} />
        </>
      )}
    </div>
  );
}
