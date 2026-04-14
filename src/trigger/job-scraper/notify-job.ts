import { task } from "@trigger.dev/sdk/v3";
import { getUser, getFilteredJob, markScoreNotified } from "./supabase.js";

// Escape special characters for Telegram MarkdownV2
function esc(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!\\-]/g, "\\$&");
}

export const notifyJobTask = task({
  id: "notify-job",
  maxDuration: 60,
  retry: {
    maxAttempts: 5,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10_000,
    factor: 2,
  },
  run: async (payload: {
    jobId: string;
    userId: string;
    score: number;
    reason: string;
  }) => {
    const { jobId, userId, score, reason } = payload;

    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");

    // Load user and job in parallel
    const [user, job] = await Promise.all([getUser(userId), getFilteredJob(jobId)]);

    if (!user) throw new Error(`User not found: ${userId}`);
    if (!job) throw new Error(`Job not found: ${jobId}`);

    if (!user.telegram_chat_id) {
      console.warn(`User ${user.name} has no telegram_chat_id — skipping notification`);
      return { skipped: true, reason: "no_telegram_chat_id" };
    }

    const applyLine =
      job.apply_url && job.apply_url !== job.url
        ? `[View on LinkedIn](${job.url}) \\| [Apply Here](${job.apply_url})`
        : `[View on LinkedIn](${job.url ?? ""})`;

    const message = [
      `🎯 *New Job Match\\!* \\(Score: ${score}/100\\)`,
      ``,
      `*${esc(job.title ?? "Unknown Title")}*`,
      `🏢 ${esc(job.company_name ?? "Unknown Company")}`,
      `📍 ${esc(job.location ?? "N/A")}`,
      ``,
      `*Why it matches:*`,
      esc(reason),
      ``,
      applyLine,
    ].join("\n");

    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: user.telegram_chat_id,
          text: message,
          parse_mode: "MarkdownV2",
          disable_web_page_preview: false,
        }),
      }
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Telegram API error: ${response.status} — ${body}`);
    }

    await markScoreNotified(userId, jobId);
    console.log(`Telegram notification sent to ${user.name} for job "${job.title}" (${score}/100)`);

    return { notified: true, userId, jobId, score };
  },
});
