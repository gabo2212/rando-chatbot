"use client";

import { usePathname } from "next/navigation";

import SiteHeader from "@/components/site-header";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isHome = pathname === "/";

  if (isHome) {
    return children;
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-black">
      <SiteHeader />
      <main className="min-h-0 flex-1 overflow-auto">{children}</main>
    </div>
  );
}
