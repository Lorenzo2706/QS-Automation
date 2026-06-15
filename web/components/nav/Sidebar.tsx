"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/brand/Logo";
import { cn } from "@/lib/cn";
import { NAV_ITEMS, isActive } from "@/components/nav/navItems";

export function Sidebar({ userEmail }: { userEmail: string }) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-brand-ink-100 bg-white md:flex">
      <div className="flex h-16 items-center border-b border-brand-ink-100 px-6">
        <Logo height={28} priority />
      </div>
      <nav className="flex-1 px-3 py-4">
        <ul className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-brand-orange-50 text-brand-orange-700"
                      : "text-brand-ink-600 hover:bg-brand-ink-50"
                  )}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="border-t border-brand-ink-100 px-6 py-4">
        <div className="mb-2 truncate text-xs text-brand-ink-500">{userEmail}</div>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="text-sm font-medium text-brand-ink-700 hover:text-brand-orange"
          >
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
