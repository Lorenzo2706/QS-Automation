import { task } from "@trigger.dev/sdk/v3";
import {
  jobFilteredExists,
  insertFilteredJob,
  getRawJob,
  markJobEvaluated,
} from "./supabase.js";
import { filterJob as geminiFilterJob } from "./gemini.js";
import { classifyJobTask } from "./classify-job.js";

// Score the job for this user and WAIT for it, so the parent scrape run only
// completes once classify-job has finished (the orchestrator emails after that).
// A failed score is logged but not re-thrown — one bad job shouldn't fail the
// whole batch; classify-job has its own retries before it gives up. Returns
// false so the caller can surface the failure up the chain (scrape-user-jobs →
// recap) instead of letting it vanish into a misleading "success" recap.
async function scoreAndWait(jobId: string, userId: string): Promise<boolean> {
  const result = await classifyJobTask.triggerAndWait(
    { jobId, userId },
    { idempotencyKey: `classify-job-${jobId}-${userId}` }
  );
  if (!result.ok) {
    console.warn(`classify-job failed for ${jobId} (user ${userId}): ${result.error}`);
    return false;
  }
  return true;
}

export const filterJobTask = task({
  id: "filter-job",
  maxDuration: 120,
  retry: {
    maxAttempts: 5,
    minTimeoutInMs: 2_000,
    maxTimeoutInMs: 60_000,
    factor: 2,
    randomize: true,
  },
  run: async (payload: { jobId: string; userId: string }) => {
    const { jobId, userId } = payload;

    const rawJob = await getRawJob(userId, jobId);
    if (!rawJob) {
      throw new Error(`Raw job not found in jobs_raw: ${jobId} (user ${userId})`);
    }

    // Already-classified path: needs_evaluation is the authoritative flag
    // (per user). If false, trust the prior decision and avoid re-calling Gemini.
    if (!rawJob.needs_evaluation) {
      if (await jobFilteredExists(userId, jobId)) {
        console.log(`Job ${jobId} already filtered — scoring for user ${userId}`);
        const scored = await scoreAndWait(jobId, userId);
        return { filtered: true, cached: true, scoreFailed: !scored };
      }
      console.log(`Job ${jobId} previously rejected as permanent — skipping`);
      return { skipped: true, reason: "previously_rejected" };
    }

    // Needs evaluation: run Gemini once and record the outcome.
    const category = await geminiFilterJob(
      rawJob.title ?? "",
      rawJob.description_text ?? ""
    );

    if (category === "permanent") {
      await markJobEvaluated(userId, jobId);
      console.log(`Job ${jobId} ("${rawJob.title}") classified permanent — skipping`);
      return { skipped: true, reason: "permanent" };
    }

    await insertFilteredJob(userId, jobId, category);
    await markJobEvaluated(userId, jobId);
    console.log(`Job ${jobId} classified ${category} — inserted into jobs_filtered`);

    const scored = await scoreAndWait(jobId, userId);

    return { filtered: true, category, cached: false, scoreFailed: !scored };
  },
});
