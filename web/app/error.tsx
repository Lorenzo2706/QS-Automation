"use client";

import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-brand-ink-50 px-4 text-center">
      <h1 className="text-2xl font-semibold text-brand-ink">Something went wrong</h1>
      <p className="max-w-md text-sm text-brand-ink-500">
        {error.message || "Unexpected error."}
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
