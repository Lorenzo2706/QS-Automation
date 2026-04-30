import { task } from "@trigger.dev/sdk/v3";
import {
  jobFilteredExists,
  insertFilteredJob,
  getRawJob,
  markJobEvaluated,
} from "./supabase.js";
import { filterJob as geminiFilterJob } from "./gemini.js";
import { classifyJobTask } from "./classify-job.js";

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

    const rawJob = await getRawJob(jobId);
    if (!rawJob) {
      throw new Error(`Raw job not found in jobs_raw: ${jobId}`);
    }

    // Already-classified path: needs_evaluation is the authoritative flag.
    // If false, trust the prior decision and avoid re-calling Gemini.
    if (!rawJob.needs_evaluation) {
      if (await jobFilteredExists(jobId)) {
        console.log(`Job ${jobId} already filtered — scoring for user ${userId}`);
        await classifyJobTask.trigger(
          { jobId, userId },
          { idempotencyKey: `classify-job-${jobId}-${userId}` }
        );
        return { filtered: true, cached: true };
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
      await markJobEvaluated(jobId);
      console.log(`Job ${jobId} ("${rawJob.title}") classified permanent — skipping`);
      return { skipped: true, reason: "permanent" };
    }

    await insertFilteredJob(jobId, category);
    await markJobEvaluated(jobId);
    console.log(`Job ${jobId} classified ${category} — inserted into jobs_filtered`);

    await classifyJobTask.trigger(
      { jobId, userId },
      { idempotencyKey: `classify-job-${jobId}-${userId}` }
    );

    return { filtered: true, category, cached: false };
  },
});
