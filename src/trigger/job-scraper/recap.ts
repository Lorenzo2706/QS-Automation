import { Resend } from "resend";
import {
  getUnnotifiedMatches,
  markScoresNotified,
  RecapMatch,
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

function renderJobCard(match: RecapMatch): string {
  const title = escHtml(match.title ?? "Unknown Title");
  const company = escHtml(match.company_name ?? "Unknown Company");
  const location = escHtml(match.location ?? "N/A");
  const reason = escHtml(match.relevance_reason ?? "");
  const linkedinUrl = match.url ? escHtml(match.url) : "";
  const applyUrl = match.apply_url ? escHtml(match.apply_url) : "";

  const links: string[] = [];
  if (linkedinUrl) {
    links.push(
      `<a href="${linkedinUrl}" style="color:#0a66c2;text-decoration:none;">View on LinkedIn</a>`
    );
  }
  if (applyUrl && applyUrl !== linkedinUrl) {
    links.push(
      `<a href="${applyUrl}" style="color:#0a66c2;text-decoration:none;">Apply Here</a>`
    );
  }

  return `
    <div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:0 0 16px 0;background:#ffffff;">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:baseline;">
        <h3 style="margin:0;font-size:18px;color:#111827;">${title}</h3>
        <span style="font-size:14px;color:#10b981;font-weight:600;white-space:nowrap;">${match.relevance_score}/100</span>
      </div>
      <p style="margin:6px 0 0 0;font-size:14px;color:#4b5563;">🏢 ${company} &nbsp;·&nbsp; 📍 ${location}</p>
      ${reason ? `<p style="margin:12px 0 0 0;font-size:14px;color:#374151;line-height:1.5;"><strong>Why it matches:</strong> ${reason}</p>` : ""}
      ${links.length > 0 ? `<p style="margin:12px 0 0 0;font-size:14px;">${links.join(" &nbsp;|&nbsp; ")}</p>` : ""}
    </div>`;
}

function renderRecapHtml(userName: string, matches: RecapMatch[]): string {
  const cards = matches.map(renderJobCard).join("\n");
  return `<!DOCTYPE html>
<html>
  <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f3f4f6;margin:0;padding:24px;">
    <div style="max-width:640px;margin:0 auto;">
      <h1 style="font-size:22px;color:#111827;margin:0 0 8px 0;">🎯 ${matches.length} new job match${matches.length === 1 ? "" : "es"}</h1>
      <p style="margin:0 0 24px 0;color:#4b5563;font-size:14px;">Hi ${escHtml(userName)}, here are today's matches sorted by relevance.</p>
      ${cards}
      <p style="margin:24px 0 0 0;font-size:12px;color:#9ca3af;text-align:center;">Sent by QS Automation</p>
    </div>
  </body>
</html>`;
}

export interface RecapResult {
  userId: string;
  email: string;
  matches: number;
  sent: boolean;
  skipReason?: string;
}

// Sends one recap email to a single user covering their un-notified matches
// above threshold, then marks those scores notified. Shared by the on-demand
// orchestrator (run-user-pipeline) — no global cron drives recaps anymore.
// Throws on a Resend send error so the caller's retry policy can kick in.
export async function sendRecapForUser(user: UserRow): Promise<RecapResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");
  if (!from) throw new Error("RESEND_FROM_EMAIL is not set");

  const matches = await getUnnotifiedMatches(user.user_id, user.notification_threshold);

  if (matches.length === 0) {
    console.log(`User ${user.name}: no new matches above threshold ${user.notification_threshold}`);
    return { userId: user.user_id, email: user.email, matches: 0, sent: false, skipReason: "no_matches" };
  }

  const resend = new Resend(apiKey);
  const html = renderRecapHtml(user.name, matches);
  const subject = `🎯 ${matches.length} new job match${matches.length === 1 ? "" : "es"} for you`;

  const { error: sendErr } = await resend.emails.send({
    from,
    to: user.email,
    subject,
    html,
  });

  if (sendErr) {
    throw new Error(`Resend send failed for ${user.email}: ${sendErr.message}`);
  }

  await markScoresNotified(
    user.user_id,
    matches.map((m) => m.job_id)
  );

  console.log(`Sent recap to ${user.email}: ${matches.length} match(es)`);
  return { userId: user.user_id, email: user.email, matches: matches.length, sent: true };
}
