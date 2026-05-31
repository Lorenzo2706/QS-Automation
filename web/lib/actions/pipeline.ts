"use server";

import { revalidatePath } from "next/cache";
import { tasks, schedules } from "@trigger.dev/sdk/v3";
import { createClient } from "@/lib/supabase/server";
import { ScheduleSchema } from "@/lib/validation";
import { buildCron } from "@/lib/cron";

const TIMEZONE = "Europe/Amsterdam";
const SCHEDULED_TASK = "scheduled-user-pipeline";
const PIPELINE_TASK = "run-user-pipeline";

export type PipelineResult = { error: string } | { success: true };

function configured(): boolean {
  return Boolean(process.env.TRIGGER_SECRET_KEY);
}

// Store the picked wall-clock instant as UTC so the literal hour/minute/day
// round-trips for display; the cron (with TIMEZONE) is what actually fires.
function startToIso(startDateTime: string): string {
  return new Date(`${startDateTime.slice(0, 16)}:00Z`).toISOString();
}

// "Run now" — fire the full E2E pipeline for the signed-in user.
export async function runPipelineNowAction(): Promise<PipelineResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };
  if (!configured()) return { error: "Trigger.dev is not configured (TRIGGER_SECRET_KEY missing)" };

  let runId: string;
  try {
    const handle = await tasks.trigger(
      PIPELINE_TASK,
      { userId: user.id },
      { concurrencyKey: user.id }
    );
    runId = handle.id;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to start the run" };
  }

  // Persist the run id so the dashboard can show its live status (runs.retrieve)
  // right away. The backend orchestrator writes the same id once it starts.
  await supabase.from("pipeline_schedules").upsert(
    {
      user_id: user.id,
      last_run_id: runId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  revalidatePath("/dashboard");
  return { success: true };
}

// Create or update the user's recurring schedule and enable it.
export async function saveScheduleAction(
  _prev: PipelineResult | null,
  formData: FormData
): Promise<PipelineResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };
  if (!configured()) return { error: "Trigger.dev is not configured (TRIGGER_SECRET_KEY missing)" };

  const parsed = ScheduleSchema.safeParse({
    startDateTime: formData.get("startDateTime"),
    recurrence: formData.get("recurrence"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { startDateTime, recurrence } = parsed.data;

  let cron: string;
  try {
    cron = buildCron(startDateTime, recurrence);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Invalid schedule" };
  }

  const { data: existing } = await supabase
    .from("pipeline_schedules")
    .select("trigger_schedule_id")
    .eq("user_id", user.id)
    .maybeSingle();

  let scheduleId = existing?.trigger_schedule_id ?? null;
  try {
    if (scheduleId) {
      await schedules.update(scheduleId, {
        task: SCHEDULED_TASK,
        cron,
        timezone: TIMEZONE,
        externalId: user.id,
      });
      await schedules.activate(scheduleId);
    } else {
      const created = await schedules.create({
        task: SCHEDULED_TASK,
        cron,
        timezone: TIMEZONE,
        externalId: user.id,
        deduplicationKey: `user-pipeline-${user.id}`,
      });
      scheduleId = created.id;
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to save schedule" };
  }

  const { error } = await supabase.from("pipeline_schedules").upsert(
    {
      user_id: user.id,
      enabled: true,
      recurrence,
      start_at: startToIso(startDateTime),
      cron,
      timezone: TIMEZONE,
      trigger_schedule_id: scheduleId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  return { success: true };
}

// Turn the schedule off (deactivate in Trigger.dev, keep the row for re-enabling).
export async function disableScheduleAction(): Promise<PipelineResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };
  if (!configured()) return { error: "Trigger.dev is not configured (TRIGGER_SECRET_KEY missing)" };

  const { data: row } = await supabase
    .from("pipeline_schedules")
    .select("trigger_schedule_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (row?.trigger_schedule_id) {
    try {
      await schedules.deactivate(row.trigger_schedule_id);
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Failed to disable schedule" };
    }
  }

  await supabase
    .from("pipeline_schedules")
    .update({ enabled: false, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);

  revalidatePath("/dashboard");
  return { success: true };
}
