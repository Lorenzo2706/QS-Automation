"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { updateThresholdAction, type SettingsResult } from "@/lib/actions/settings";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving..." : "Save threshold"}
    </Button>
  );
}

export function ThresholdForm({ initial }: { initial: number }) {
  const [state, formAction] = useActionState<SettingsResult | null, FormData>(
    updateThresholdAction,
    null
  );
  const [value, setValue] = useState(initial);

  useEffect(() => {
    if (!state) return;
    if ("error" in state) toast.error(state.error);
    else toast.success("Threshold updated");
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <Field
        label={`Notification threshold: ${value}`}
        htmlFor="threshold"
        hint="Only matches with a relevance score at or above this value email you the daily recap."
      >
        <input
          id="threshold"
          name="threshold"
          type="range"
          min={0}
          max={100}
          step={1}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          className="w-full accent-brand-orange"
        />
      </Field>
      <div className="flex items-center justify-end">
        <SubmitButton />
      </div>
    </form>
  );
}
