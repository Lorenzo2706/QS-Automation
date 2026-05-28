import { schedules } from "@trigger.dev/sdk/v3";
import { runUserPipelineTask } from "./run-user-pipeline.js";

// Target for per-user IMPERATIVE schedules created from the web app via
// schedules.create({ task: "scheduled-user-pipeline", externalId: <userId>, ... }).
// No `cron` here on purpose — the schedule(s) are attached dynamically at runtime,
// one per user, and carry the userId in `externalId`.
export const scheduledUserPipelineTask = schedules.task({
  id: "scheduled-user-pipeline",
  run: async (payload) => {
    const userId = payload.externalId;
    if (!userId) {
      console.warn("scheduled-user-pipeline fired without an externalId — skipping");
      return { skipped: true, reason: "no_external_id" };
    }

    // Fire-and-forget the orchestrator; concurrencyKey serialises per user.
    const handle = await runUserPipelineTask.trigger(
      { userId },
      { concurrencyKey: userId }
    );

    return { userId, runId: handle.id };
  },
});
