import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-brand-ink-50 px-4 text-center">
      <h1 className="text-2xl font-semibold text-brand-ink">Page not found</h1>
      <p className="max-w-md text-sm text-brand-ink-500">
        The page you&apos;re looking for doesn&apos;t exist.
      </p>
      <Link href="/dashboard">
        <Button>Go to dashboard</Button>
      </Link>
    </div>
  );
}
