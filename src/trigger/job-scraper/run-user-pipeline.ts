import { task } from "@trigger.dev/sdk/v3";
import { getUser, recordRunStatus } from "./supabase.js";
import { scrapeUserJobsTask } from "./scrape-user-jobs.js";
import { sendRecapForUser } from "./recap.js";

// End-to-end pipeline for a single user. Triggered on demand from the web app
// ("Run now") and by each user's imperative schedule (scheduled-user-pipeline).
// scrape-user-jobs now WAITS for the full filter → classify chain, so by the
// time it returns every match has been scored and we can email the recap.
//
// concurrencyKey = userId serialises a user's runs: a second "Run now" while one
// is in flight queues behind it instead of launching a duplicate Apify run.
export const runUserPipelineTask = task({
  id: "run-user-pipeline",
  queue: { concurrencyLimit: 1 },
  maxDuration: 3600,
  run: async (payload: { userId: string; notify?: boolean }) => {
    const { userId, notify = true } = payload;

    await recordRunStatus(userId, "running");

    const result = await scrapeUserJobsTask.triggerAndWait({ userId });
    if (!result.ok) {
      await recordRunStatus(userId, "failed");
      throw new Error(`scrape-user-jobs failed for ${userId}: ${result.error}`);
    }

    let recap: Awaited<ReturnType<typeof sendRecapForUser>> | null = null;
    if (notify) {
      const user = await getUser(userId);
      if (user) recap = await sendRecapForUser(user);
      else console.warn(`run-user-pipeline: user ${userId} not found — skipping recap`);
    }

    await recordRunStatus(userId, "success", new Date());

    return {
      userId,
      scrape: result.output,
      recap,
    };
  },
});
