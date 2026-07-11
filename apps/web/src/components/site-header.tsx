"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import UserMenu from "@/components/user-menu";
import { cn } from "@chatbot/ui/lib/utils";

const navLinks = [
  { href: "/ai", label: "CHAT" },
  { href: "/documents", label: "DOCS" },
] as const;

export default function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="shrink-0 border-b border-white/20 bg-black/80 backdrop-blur-sm">
      <div className="mx-auto flex h-12 max-w-6xl items-center justify-between gap-4 px-4 lg:px-8">
        <div className="flex min-w-0 items-center gap-4 lg:gap-6">
          <Link
            href="/"
            className="-skew-x-12 transform font-mono text-lg font-bold tracking-widest text-white italic lg:text-xl"
          >
            RANDO
          </Link>
          <div className="hidden h-3 w-px bg-white/40 sm:block" />
          <span className="hidden font-mono text-[9px] text-white/50 sm:inline">EST. 2025</span>
          <nav className="hidden items-center gap-4 sm:flex">
            {navLinks.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "font-mono text-[10px] tracking-wider text-white/50 transition-colors hover:text-white",
                  pathname === href || pathname.startsWith(`${href}/`)
                    ? "text-white"
                    : undefined,
                )}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <div className="hidden items-center gap-2 font-mono text-[9px] text-white/40 lg:flex">
            <span>SYS.ACT</span>
            <div className="h-1 w-1 animate-pulse rounded-full bg-white/60" />
          </div>
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
