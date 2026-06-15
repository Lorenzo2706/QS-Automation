import Link from "next/link";
import { Logo } from "@/components/brand/Logo";

export function MobileTopBar() {
  return (
    <header className="flex h-16 items-center justify-between border-b border-brand-ink-100 bg-white px-4 md:hidden">
      <Link href="/dashboard">
        <Logo height={26} priority />
      </Link>
      <form action="/auth/signout" method="post">
        <button
          type="submit"
          className="rounded-lg px-2 py-1 text-sm font-medium text-brand-ink-600 transition-colors hover:bg-brand-ink-50 hover:text-brand-orange"
        >
          Sign out
        </button>
      </form>
    </header>
  );
}
