"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { runPipelineNowAction } from "@/lib/actions/pipeline";
import { Button } from "@/components/ui/button";

export function RunNowButton({ disabled }: { disabled?: boolean }) {
  const [pending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      const result = await runPipelineNowAction();
      if ("error" in result) toast.error(result.error);
      else toast.success("Run started — we'll email your matches when it finishes.");
    });
  }

  return (
    <Button onClick={onClick} disabled={pending || disabled}>
      {pending ? "Starting..." : "Run now"}
    </Button>
  );
}
