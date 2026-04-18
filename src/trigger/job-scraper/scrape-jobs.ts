import { schedules } from "@trigger.dev/sdk/v3";
import { getActiveUsers } from "./supabase.js";
import { scrapeUserJobsTask } from "./scrape-user-jobs.js";

export const scrapeJobsTask = schedules.task({
  id: "scrape-jobs",
  // Runs daily at 9:00 AM Amsterdam time
  cron: { pattern: "0 9 * * *", timezone: "Europe/Amsterdam" },
  maxDuration: 300,
  run: async (payload) => {
    const users = await getActiveUsers();
    if (users.length === 0) {
      console.log("No active users — skipping run");
      return { usersTriggered: 0 };
    }

    console.log(`Fanning out scrape to ${users.length} active user(s)`);

    // One Apify run per user, with that user's search URLs as input.
    // Idempotency keyed on timestamp so each scheduled run is distinct,
    // but duplicate fires within the same hour no-op.
    const runStamp = new Date(payload.timestamp).toISOString().slice(0, 13); // YYYY-MM-DDTHH
    await scrapeUserJobsTask.batchTrigger(
      users.map((user) => ({
        payload: { userId: user.user_id },
        options: {
          idempotencyKey: `scrape-user-${user.user_id}-${runStamp}`,
        },
      }))
    );

    return { usersTriggered: users.length };
  },
});
