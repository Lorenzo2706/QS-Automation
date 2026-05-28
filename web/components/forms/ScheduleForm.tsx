"use client";

import { useActionState, useEffect, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import {
  saveScheduleAction,
  disableScheduleAction,
  type PipelineResult,
} from "@/lib/actions/pipeline";
import { RECURRENCE_OPTIONS } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";

interface ScheduleInitial {
  enabled: boolean;
  recurrence: string | null;
  // "YYYY-MM-DDTHH:mm" for the datetime-local input, or null if never set
  startLocal: string | null;
}

const RECURRENCE_LABELS: Record<(typeof RECURRENCE_OPTIONS)[number], string> = {
  daily: "Daily",
  weekdays: "Every weekday (Mon–Fri)",
  weekly: "Weekly",
};

function SaveButton({ enabled }: { enabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving..." : enabled ? "Update schedule" : "Enable schedule"}
    </Button>
  );
}

export function ScheduleForm({ initial }: { initial: ScheduleInitial }) {
  const [state, formAction] = useActionState<PipelineResult | null, FormData>(
    saveScheduleAction,
    null
  );
  const [disabling, startDisable] = useTransition();

  useEffect(() => {
    if (!state) return;
    if ("error" in state) toast.error(state.error);
    else toast.success("Schedule saved");
  }, [state]);

  function onDisable() {
    startDisable(async () => {
      const result = await disableScheduleAction();
      if ("error" in result) toast.error(result.error);
      else toast.success("Schedule turned off");
    });
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <Field
        label="Start date & time"
        htmlFor="startDateTime"
        hint="Sets the time of day (and weekday, for weekly). Times are Europe/Amsterdam."
      >
        <Input
          id="startDateTime"
          name="startDateTime"
          type="datetime-local"
          defaultValue={initial.startLocal ?? ""}
          required
        />
      </Field>

      <Field label="Recurrence" htmlFor="recurrence">
        <Select
          id="recurrence"
          name="recurrence"
          defaultValue={initial.recurrence ?? "daily"}
        >
          {RECURRENCE_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {RECURRENCE_LABELS[value]}
            </option>
          ))}
        </Select>
      </Field>

      <div className="flex items-center justify-end gap-3">
        {initial.enabled ? (
          <Button
            type="button"
            variant="danger"
            onClick={onDisable}
            disabled={disabling}
          >
            {disabling ? "Turning off..." : "Turn off"}
          </Button>
        ) : null}
        <SaveButton enabled={initial.enabled} />
      </div>
    </form>
  );
}
