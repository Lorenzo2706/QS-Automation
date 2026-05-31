import "server-only";
import { runs } from "@trigger.dev/sdk/v3";

// The three states the dashboard renders for a pipeline run.
export type UiRunStatus = "running" | "success" | "failed";

// Trigger.dev run statuses that mean the run finished unsuccessfully. COMPLETED
// maps to "success"; everything else (QUEUED, EXECUTING, WAITING, DELAYED, …) is
// still in flight, so it maps to "running" via the default branch below.
const FAILED_STATUSES = new Set<string>([
  "CANCELED",
  "FAILED",
  "CRASHED",
  "SYSTEM_FAILURE",
  "EXPIRED",
  "TIMED_OUT",
]);

function mapStatus(status: string): UiRunStatus {
  if (status === "COMPLETED") return "success";
  if (FAILED_STATUSES.has(status)) return "failed";
  return "running";
}

export type RunStatusInfo = { status: UiRunStatus; at: Date | null };

// Resolve a Trigger.dev run's live status — the dashboard's source of truth, so
// a status can never get stuck. Returns null when Trigger.dev isn't configured
// or the run can't be retrieved (e.g. an invalid id, or one purged by Trigger.dev
// retention → 404), in which case the caller falls back to an "unknown" badge.
export async function getRunStatus(runId: string): Promise<RunStatusInfo | null> {
  if (!process.env.TRIGGER_SECRET_KEY) return null;
  try {
    const run = await runs.retrieve(runId);
    return {
      status: mapStatus(run.status),
      at: run.finishedAt ?? run.startedAt ?? run.createdAt ?? null,
    };
  } catch {
    return null;
  }
}
