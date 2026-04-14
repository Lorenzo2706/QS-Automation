import { task } from "@trigger.dev/sdk/v3";
import {
  jobFilteredExists,
  insertFilteredJob,
  getActiveUsers,
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
  run: async (payload: { jobId: string }) => {
    const { jobId } = payload;

    // 1. Skip if already processed in a previous run
    if (await jobFilteredExists(jobId)) {
      console.log(`Job ${jobId} already in jobs_filtered — skipping`);
      return { skipped: true, reason: "duplicate" };
    }

    // 2. Fetch the raw job record
    const rawJob = await getRawJob(jobId);
    if (!rawJob) {
      throw new Error(`Raw job not found in jobs_raw: ${jobId}`);
    }

    // 3. Ask Gemini to confirm the role is temporary / contract / freelance
    const isFreelance = await geminiFilterJob(
      rawJob.title ?? "",
      rawJob.description_text ?? ""
    );

    if (!isFreelance) {
      console.log(`Job ${jobId} ("${rawJob.title}") not confirmed as temp/freelance — skipping`);
      return { skipped: true, reason: "not_freelance" };
    }

    // 4. Copy confirmed job to jobs_filtered
    await insertFilteredJob(jobId);
    console.log(`Job ${jobId} confirmed temp/freelance — copied to jobs_filtered`);

    // 5. Fan out to all active users for relevance scoring
    const users = await getActiveUsers();
    if (users.length === 0) {
      console.log("No active users found — no classification triggered");
      return { filtered: true, usersTriggered: 0 };
    }

    // Fire-and-forget: one classify-job task per (job × user)
    await classifyJobTask.batchTrigger(
      users.map((user) => ({
        payload: { jobId, userId: user.user_id },
        options: {
          idempotencyKey: `classify-job-${jobId}-${user.user_id}`,
        },
      }))
    );

    console.log(`Classification triggered for ${users.length} user(s)`);
    return { filtered: true, usersTriggered: users.length };
  },
});
