import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RunNowButton } from "@/components/RunNowButton";
import { ScheduleForm } from "@/components/forms/ScheduleForm";
import { describeSchedule, type Recurrence } from "@/lib/cron";
import { RECURRENCE_OPTIONS } from "@/lib/validation";

const RUN_STATUS_STYLES: Record<string, string> = {
  running: "bg-amber-50 text-amber-700 border-amber-200",
  success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  failed: "bg-red-50 text-red-700 border-red-200",
};

function isRecurrence(value: string | null): value is Recurrence {
  return value != null && (RECURRENCE_OPTIONS as readonly string[]).includes(value);
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: resume }, { count: searchCount }, { data: schedule }] =
    await Promise.all([
      supabase
        .from("users")
        .select("name, notification_threshold")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("resumes")
        .select("filename, parsed_text")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle(),
      supabase
        .from("search_configs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("active", true),
      supabase
        .from("pipeline_schedules")
        .select("enabled, recurrence, start_at, last_run_at, last_run_status")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

  const displayName = profile?.name ?? user.email ?? "there";
  const threshold = profile?.notification_threshold ?? 85;
  const activeSearches = searchCount ?? 0;
  const ready = !!resume && activeSearches > 0;

  // start_at is stored as the picked wall-clock interpreted as UTC, so the first
  // 16 chars give back the "YYYY-MM-DDTHH:mm" the user chose (see lib/cron.ts).
  const startLocal = schedule?.start_at ? String(schedule.start_at).slice(0, 16) : null;
  const recurrence = isRecurrence(schedule?.recurrence ?? null) ? schedule!.recurrence : null;
  const scheduleEnabled = Boolean(schedule?.enabled);
  const scheduleSummary =
    scheduleEnabled && startLocal && isRecurrence(recurrence)
      ? describeSchedule(startLocal, recurrence)
      : null;

  const lastRunStatus = schedule?.last_run_status ?? null;
  const lastRunAt = schedule?.last_run_at ? new Date(schedule.last_run_at) : null;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold text-brand-ink">Welcome, {displayName}</h1>
        <p className="text-sm text-brand-ink-500">
          {ready
            ? "You're all set. Run the pipeline now, or set a schedule below."
            : "Finish the steps below, then run the pipeline or schedule it."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Resume</CardTitle>
            <CardSubtitle>
              {resume
                ? `Active: ${resume.filename ?? "(unnamed)"} · ${resume.parsed_text.length.toLocaleString()} chars`
                : "No active resume yet"}
            </CardSubtitle>
          </CardHeader>
          <CardBody>
            <Link href="/resume">
              <Button variant={resume ? "secondary" : "primary"}>
                {resume ? "Replace resume" : "Upload resume"}
              </Button>
            </Link>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Searches</CardTitle>
            <CardSubtitle>
              {activeSearches > 0
                ? `${activeSearches} active LinkedIn search${activeSearches === 1 ? "" : "es"}`
                : "No active searches yet"}
            </CardSubtitle>
          </CardHeader>
          <CardBody>
            <Link href="/searches">
              <Button variant={activeSearches > 0 ? "secondary" : "primary"}>
                {activeSearches > 0 ? "Manage searches" : "Add a search"}
              </Button>
            </Link>
          </CardBody>
        </Card>

        <Card className="sm:col-span-2">
          <CardHeader>
            <CardTitle>Automation</CardTitle>
            <CardSubtitle>
              Run the full pipeline (scrape → filter → score → email) on demand, or set a
              recurring schedule.
            </CardSubtitle>
          </CardHeader>
          <CardBody className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-col gap-1 text-sm">
                <span className="text-brand-ink">
                  {scheduleSummary ? `Scheduled: ${scheduleSummary}` : "No schedule set"}
                </span>
                <span className="flex items-center gap-2 text-brand-ink-500">
                  Last run:
                  {lastRunStatus ? (
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                        RUN_STATUS_STYLES[lastRunStatus] ??
                        "bg-brand-ink-50 text-brand-ink-600 border-brand-ink-200"
                      }`}
                    >
                      {lastRunStatus}
                    </span>
                  ) : (
                    <span className="text-brand-ink-400">never</span>
                  )}
                  {lastRunAt ? (
                    <span className="text-brand-ink-400">{lastRunAt.toLocaleString()}</span>
                  ) : null}
                </span>
              </div>
              <RunNowButton disabled={!ready} />
            </div>

            {!ready ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                Add an active search and upload a resume first — otherwise a run has nothing to
                scrape or score against.
              </p>
            ) : null}

            <div className="border-t border-brand-ink-100 pt-5">
              <h3 className="mb-3 text-sm font-medium text-brand-ink">Recurring schedule</h3>
              <ScheduleForm
                initial={{
                  enabled: scheduleEnabled,
                  recurrence,
                  startLocal,
                }}
              />
            </div>
          </CardBody>
        </Card>

        <Card className="sm:col-span-2">
          <CardHeader>
            <CardTitle>Notification threshold</CardTitle>
            <CardSubtitle>
              Currently {threshold}/100. Only matches at or above this score email you.
            </CardSubtitle>
          </CardHeader>
          <CardBody>
            <Link href="/settings">
              <Button variant="secondary">Adjust in settings</Button>
            </Link>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
