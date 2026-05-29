"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function JobReasonToggle({ reason }: { reason: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button
          size="sm"
          variant="ghost"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Hide reason" : "Show reason"}
        </Button>
      </div>
      {open ? (
        <p className="rounded-lg bg-brand-ink-50 px-3 py-2 text-sm text-brand-ink-700">
          {reason}
        </p>
      ) : null}
    </div>
  );
}
