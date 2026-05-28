import Link from "next/link";
import { Logo } from "@/components/brand/Logo";

export function MobileTopBar() {
  return (
    <header className="flex h-16 items-center justify-between border-b border-brand-ink-100 bg-white px-4 md:hidden">
      <Link href="/dashboard">
        <Logo height={26} priority />
      </Link>
      <nav className="flex items-center gap-3 text-sm font-medium text-brand-ink-600">
        <Link href="/resume">Resume</Link>
        <Link href="/searches">Searches</Link>
        <Link href="/settings">Settings</Link>
      </nav>
    </header>
  );
}
