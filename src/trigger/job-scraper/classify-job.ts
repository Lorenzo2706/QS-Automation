import { task } from "@trigger.dev/sdk/v3";
import {
  getUser,
  getActiveResume,
  getFilteredJob,
  upsertJobScore,
} from "./supabase.js";
import { scoreJob } from "./gemini.js";
import { notifyJobTask } from "./notify-job.js";

export const classifyJobTask = task({
  id: "classify-job",
  maxDuration: 120,
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 30_000,
    factor: 2,
  },
  run: async (payload: { jobId: string; userId: string }) => {
    const { jobId, userId } = payload;

    // 1. Load user (needed for per-user notification threshold)
    const user = await getUser(userId);
    if (!user) throw new Error(`User not found: ${userId}`);

    // 2. Load user's active resume
    const resume = await getActiveResume(userId);
    if (!resume) {
      console.log(`No active resume for user ${userId} — skipping classification`);
      return { skipped: true, reason: "no_resume" };
    }

    // 3. Load filtered job
    const job = await getFilteredJob(jobId);
    if (!job) throw new Error(`Filtered job not found: ${jobId}`);

    // 4. Ask Gemini to score relevance
    const { score, reason } = await scoreJob(
      job.title ?? "",
      job.description_text ?? "",
      resume.parsed_text
    );

    console.log(
      `Job "${job.title}" scored ${score}/100 for user ${user.name} (threshold: ${user.notification_threshold})`
    );

    // 5. Persist the score
    await upsertJobScore({
      user_id: userId,
      resume_id: resume.resume_id,
      job_id: jobId,
      relevance_score: score,
      relevance_reason: reason,
    });

    // 6. Notify if score meets user's personal threshold
    const shouldNotify = score >= user.notification_threshold;
    if (shouldNotify) {
      const result = await notifyJobTask.triggerAndWait({ jobId, userId, score, reason });
      if (!result.ok) {
        // Non-fatal: score is already saved — log and continue
        console.error(`notify-job failed for ${jobId}/${userId}: ${result.error}`);
      }
    }

    return { score, reason, notified: shouldNotify };
  },
});
