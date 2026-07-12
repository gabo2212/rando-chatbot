"use client";

import { usePathname } from "next/navigation";

import SiteHeader from "@/components/site-header";
import { cn } from "@chatbot/ui/lib/utils";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const isDrive = pathname === "/drive";

  if (isHome) {
    return children;
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-black">
      {/* Hide chrome on Drive so landscape phones keep the Start button on-screen */}
      <div className={isDrive ? "hidden md:block" : undefined}>
        <SiteHeader />
      </div>
      <main
        className={cn(
          "min-h-0 flex-1",
          isDrive ? "overflow-hidden" : "overflow-auto",
        )}
      >
        {children}
      </main>
    </div>
  );
}
