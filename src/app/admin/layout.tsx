import type { Metadata } from "next";

// A client component page ("use client") can't export `metadata` itself,
// hence this thin server layout wrapper — its only job is keeping the
// admin dashboard out of search engines.
export const metadata: Metadata = {
  title: "Admin Dashboard",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
