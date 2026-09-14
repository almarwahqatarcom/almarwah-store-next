"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore, waitForAuthHydration } from "@/lib/store/auth";

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Must wait for the real persisted value, not just "one render later" —
    // otherwise a genuinely logged-in user gets bounced to /login because
    // the token hasn't been read back from localStorage yet.
    waitForAuthHydration().then(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (hydrated && !token) router.replace("/login");
  }, [hydrated, token, router]);

  if (!hydrated || !token) {
    return <div className="max-w-[600px] mx-auto px-5 py-20 text-center text-am-text-muted">Checking your session…</div>;
  }
  return <>{children}</>;
}
