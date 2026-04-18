import { task } from "@trigger.dev/sdk/v3";
import {
  jobFilteredExists,
  insertFilteredJob,
  getRawJob,
} from "./supabase.js";
import { filterJob as geminiFilterJob } from "./gemini.js";
import { classifyJobTask } from "./classify-job.js";

export const filterJobTask = task({
  id: "filter-job",
  maxDuration: 120,
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 30_000,
    factor: 2,
  },
  run: async (payload: { jobId: string; userId: string }) => {
    const { jobId, userId } = payload;

    // Fast path: if this job already passed the Gemini filter in a prior run
    // (possibly for a different user), skip the LLM call and go straight
    // to scoring for this user.
    if (await jobFilteredExists(jobId)) {
      console.log(`Job ${jobId} already in jobs_filtered — scoring for user ${userId}`);
      await classifyJobTask.trigger(
        { jobId, userId },
        { idempotencyKey: `classify-job-${jobId}-${userId}` }
      );
      return { filtered: true, cached: true };
    }

    const rawJob = await getRawJob(jobId);
    if (!rawJob) {
      throw new Error(`Raw job not found in jobs_raw: ${jobId}`);
    }

    const isFreelance = await geminiFilterJob(
      rawJob.title ?? "",
      rawJob.description_text ?? ""
    );

    if (!isFreelance) {
      console.log(`Job ${jobId} ("${rawJob.title}") not temp/freelance — skipping`);
      return { skipped: true, reason: "not_freelance" };
    }

    await insertFilteredJob(jobId);
    console.log(`Job ${jobId} confirmed temp/freelance — copied to jobs_filtered`);

    await classifyJobTask.trigger(
      { jobId, userId },
      { idempotencyKey: `classify-job-${jobId}-${userId}` }
    );

    console.log(`Classification triggered for user ${userId}`);
    return { filtered: true, cached: false };
  },
});
