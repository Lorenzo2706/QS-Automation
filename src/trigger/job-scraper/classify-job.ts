import { task } from "@trigger.dev/sdk/v3";
import {
  getUser,
  getActiveResume,
  getFilteredJob,
  upsertJobScore,
  jobScoreExists,
} from "./supabase.js";
import { scoreJob } from "./gemini.js";

export const classifyJobTask = task({
  id: "classify-job",
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

    // 1. Load user (needed for per-user notification threshold)
    const user = await getUser(userId);
    if (!user) throw new Error(`User not found: ${userId}`);

    // Short-circuit: job_scores PK (user_id, job_id) is the authoritative
    // "already scored" marker. Skip the Gemini scoring call when it exists.
    // Clear the row in Supabase to force a re-score (e.g. after a resume update).
    if (await jobScoreExists(userId, jobId)) {
      console.log(`Job ${jobId} already scored for user ${userId} — skipping re-score`);
      return { skipped: true, reason: "already_scored" };
    }

    // 2. Load user's active resume
    const resume = await getActiveResume(userId);
    if (!resume) {
      console.log(`No active resume for user ${userId} — skipping classification`);
      return { skipped: true, reason: "no_resume" };
    }

    // 3. Load filtered job
    const job = await getFilteredJob(userId, jobId);
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

    // Notification is handled by the run-user-pipeline orchestrator, which calls
    // sendRecapForUser once scoring completes — it drains job_scores rows where
    // notified = false and emails one recap per run.
    return { score, reason, meetsThreshold: score >= user.notification_threshold };
  },
});
