import { Resend } from "resend";
import {
  getUnnotifiedMatchIds,
  markScoresNotified,
  UserRow,
} from "./supabase.js";

function escHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// One simple end-of-run notification: how many NEW shortlisted jobs this run
// produced, plus a button to the shortlist. No per-job cards.
function renderRecapHtml(
  userName: string,
  count: number,
  threshold: number,
  shortlistUrl: string,
  scoringFailures: number
): string {
  const heading =
    count > 0
      ? `${count} new job match${count === 1 ? "" : "es"}`
      : `No new matches this run`;

  const message =
    count > 0
      ? `Your latest run finished and found <strong>${count}</strong> new shortlisted job${count === 1 ? "" : "s"} at or above your threshold of ${threshold}.`
      : `Your latest run finished. No new jobs cleared your threshold of ${threshold} this time — your shortlist is unchanged.`;

  // Surface jobs that couldn't be scored this run so the count above isn't read
  // as the complete picture. They're retried automatically on the next run.
  const failureNote =
    scoringFailures > 0
      ? `<p style="margin:0 0 24px 0;color:#b45309;font-size:14px;line-height:1.5;">Note: ${scoringFailures} job${scoringFailures === 1 ? "" : "s"} couldn't be scored this run and ${scoringFailures === 1 ? "is" : "are"} not yet reflected in the count above — ${scoringFailures === 1 ? "it" : "they"} will be retried on your next run.</p>`
      : "";

  return `<!DOCTYPE html>
<html>
  <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f3f4f6;margin:0;padding:24px;">
    <div style="max-width:560px;margin:0 auto;">
      <h1 style="font-size:22px;color:#231f20;margin:0 0 8px 0;">${heading}</h1>
      <p style="margin:0 0 24px 0;color:#4b5563;font-size:15px;line-height:1.5;">Hi ${escHtml(userName)}, ${message}</p>
      ${failureNote}
      <p style="margin:0 0 8px 0;">
        <a href="${escHtml(shortlistUrl)}" style="display:inline-block;background:#f47822;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 24px;border-radius:8px;">View your shortlist</a>
      </p>
      <p style="margin:24px 0 0 0;font-size:12px;color:#9ca3af;text-align:center;">Sent by QS Automation</p>
    </div>
  </body>
</html>`;
}

export interface RecapResult {
  userId: string;
  email: string;
  matches: number;
  scoringFailures: number;
  sent: boolean;
  skipReason?: string;
}

// Sends one end-of-run email to a single user reporting how many NEW shortlisted
// jobs this run produced (un-notified scores above threshold), with a link to the
// shortlist. Always sends — even at zero — so it doubles as a "run finished"
// notice. Marks those scores notified after a successful send. Shared by the
// on-demand orchestrator (run-user-pipeline). Throws on a Resend send error so
// the caller's retry policy can kick in.
export async function sendRecapForUser(
  user: UserRow,
  scoringFailures = 0
): Promise<RecapResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const webUrl = process.env.WEB_APP_URL;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");
  if (!from) throw new Error("RESEND_FROM_EMAIL is not set");
  if (!webUrl) throw new Error("WEB_APP_URL is not set");

  const shortlistUrl = `${webUrl.replace(/\/$/, "")}/jobs`;

  const jobIds = await getUnnotifiedMatchIds(
    user.user_id,
    user.notification_threshold
  );
  const count = jobIds.length;

  const resend = new Resend(apiKey);
  const html = renderRecapHtml(
    user.name,
    count,
    user.notification_threshold,
    shortlistUrl,
    scoringFailures
  );
  const subject =
    count > 0
      ? `Your job run finished — ${count} new match${count === 1 ? "" : "es"}`
      : `Your job run finished — no new matches`;

  const { error: sendErr } = await resend.emails.send({
    from,
    to: user.email,
    subject,
    html,
  });

  if (sendErr) {
    throw new Error(`Resend send failed for ${user.email}: ${sendErr.message}`);
  }

  await markScoresNotified(user.user_id, jobIds);

  console.log(
    `Sent recap to ${user.email}: ${count} new match(es), ${scoringFailures} unscored`
  );
  return {
    userId: user.user_id,
    email: user.email,
    matches: count,
    scoringFailures,
    sent: true,
  };
}
