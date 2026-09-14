"use client";

import { useRouter, useSearchParams } from "next/navigation";

export default function SortSelect({ currentSort }: { currentSort?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString());
    if (e.target.value) params.set("sort", e.target.value);
    else params.delete("sort");
    params.delete("page");
    router.push(`?${params.toString()}`);
  }

  return (
    <select
      defaultValue={currentSort ?? ""}
      onChange={onChange}
      className="border border-am-border rounded-lg px-3 py-2 text-[13px] bg-white focus:outline-none focus:border-am-primary"
    >
      <option value="">Sort: Default</option>
      <option value="low_to_high">Price: Low to High</option>
      <option value="high_to_low">Price: High to Low</option>
      <option value="ascending">Name: A–Z</option>
      <option value="descending">Name: Z–A</option>
    </select>
  );
}
