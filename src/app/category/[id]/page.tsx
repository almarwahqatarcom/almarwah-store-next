import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCategories, getCategoryProducts, isProductActive, imageUrl, getConfig } from "@/lib/api";
import ProductCard from "@/components/ProductCard";
import SortSelect from "@/components/SortSelect";
import Pagination from "@/components/Pagination";
import { getServerLocale } from "@/lib/i18n/server";
import { t } from "@/lib/i18n/t";

export const revalidate = 120;

const PER_PAGE = 24;
// These are the literal values the live API accepts for this endpoint —
// verified directly against admin.almarwah.qa/api/v1/categories/products,
// not the values used by /products/all (which differ: "latest" etc).
const SORT_VALUES = ["low_to_high", "high_to_low", "ascending", "descending"] as const;

// Previously entirely missing — every category page fell back to the root
// layout's own generic homepage title/description, so Google (and anyone
// sharing a category link) saw "AlMarwa Online" for every single category
// rather than the category's own real name.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const locale = await getServerLocale();
  const [categories, config] = await Promise.all([getCategories(locale).catch(() => []), getConfig().catch(() => null)]);
  const category = categories.find((c) => c.id === Number(id));
  if (!category) return { title: "Category Not Found" };
  const image = imageUrl(config?.base_urls, "category_image_url", category.image);
  return {
    title: category.name,
    description: t(locale, "seo.categoryDescription").replace("{category}", category.name),
    openGraph: { title: category.name, images: image ? [image] : undefined },
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; sort?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const categoryId = Number(id);
  const locale = await getServerLocale();
  const categories = await getCategories(locale).catch(() => []);
  const category = categories.find((c) => c.id === categoryId);

  if (!category) notFound();

  const page = Math.max(1, Number(sp.page) || 1);
  const sort = SORT_VALUES.includes(sp.sort as (typeof SORT_VALUES)[number]) ? sp.sort : undefined;
  // This endpoint's `offset` is the page number itself, not a computed
  // record-skip index (confirmed live: offset=2 returns the next 24 products,
  // not records 2-25) — verified directly against
  // admin.almarwah.qa/api/v1/categories/products, same convention /products/search
  // uses. A `(page - 1) * PER_PAGE + 1` style offset works for page 1 by
  // coincidence (both formulas equal 1) and returns nothing for every page
  // after that, since it's an offset far beyond how many pages actually exist.
  const offset = page;

  const data = await getCategoryProducts(categoryId, PER_PAGE, offset, sort, locale).catch(() => ({ products: [], total_size: 0 }));
  const totalPages = Math.max(1, Math.ceil(data.total_size / PER_PAGE));
  // The API's own count/pagination includes disabled products (status: 0) —
  // filtering them out here only affects what's rendered, not the count, so
  // a page can show fewer than PER_PAGE cards on rare occasions. Preferable
  // to showing a product that 404s the moment it's opened.
  const visibleProducts = data.products.filter(isProductActive);

  return (
    <div className="max-w-[1280px] mx-auto px-5 am-fade-in">
      <div className="text-[12.5px] text-am-text-muted py-4">
        <Link href="/" className="hover:text-am-primary-dark">{t(locale, "common.home")}</Link> / <span>{category.name}</span>
      </div>

      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <h1 className="text-xl font-bold text-am-text">
          {category.name} <span className="text-am-text-faint font-medium text-[15px]">({data.total_size.toLocaleString()})</span>
        </h1>
        <SortSelect currentSort={sp.sort} />
      </div>

      {visibleProducts.length === 0 ? (
        <div className="text-center py-16 text-am-text-muted">{t(locale, "category.noProductsYet")}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5 pb-6">
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
