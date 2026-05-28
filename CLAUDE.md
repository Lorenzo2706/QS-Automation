# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project at a glance

This repo is **QS Automation** — a per-user LinkedIn job-scraper pipeline on Trigger.dev v3, plus
a Next.js frontend that lets invited users self-serve onboarding and run the pipeline.

Pipeline (in `src/trigger/`): `run-user-pipeline` (orchestrator, per user) →
`scrape-user-jobs` (Apify, **waits** for the chain) → `filter-job` (Gemini 3-way classify,
waits) → `classify-job` (Gemini resume score) → then the orchestrator calls `sendRecapForUser`
(`recap.ts`, Resend email). Runs are triggered **on demand** ("Run now" in the web app) or by
each user's **optional imperative schedule** (`scheduled-user-pipeline`, attached via
`schedules.create` with `externalId = userId`). There is no global cron — recurring runs are
opt-in per user. `jobs_raw` / `jobs_filtered` are keyed `(user_id, job_id)` — every job belongs
to one user.

Frontend (in `web/`): Next.js 15 App Router + `@supabase/ssr`. Sign up (gated by
`signup_allowlist`), email confirmation, resume upload (parsed server-side), search-config
CRUD, threshold/profile/password settings, and an Automation card (Run now + schedule) that
triggers Trigger.dev via `@trigger.dev/sdk` (`TRIGGER_SECRET_KEY`).

Shared logic (in `shared/`): `parseResumePdf` and `buildLinkedInUrl` are imported by both
the Trigger.dev tasks (relative path) and the Next.js Server Actions (`@shared/*` alias).
Single source of truth — never duplicate.

Storage: Supabase (`users`, `resumes`, `search_configs`, `jobs_raw`, `jobs_filtered`,
`job_scores`, `signup_allowlist`). See `README.md` for the full pipeline diagram, table
purposes, and RLS model; see `schema.sql` + `migrations/` for the canonical schema.

The "Role / Workflow" section below applies when the user asks for a **new** automation.
For changes to the existing job-scraper pipeline OR the web frontend, skip steps 1–4 and
go straight to Build.

## Role

You are an automation builder. Users will describe a process they want automated. 
Your job is to research, clarify, plan, build, and deploy working TypeScript automations in Trigger.dev. 

## Workflow — Always follow this exact order

1. **Understand** — Listen to the idea. Do not write any code yet.
2. **Research** — Identify the best APIs/services. Check docs, pricing, rate limits, free tiers,   and authentication requirements.
3. **Clarify** — Ask the user targeted questions (see below). Do not assume anything.
4. **Plan** — Write out what you will build in plain English. Get explicit approval before coding.
5. **Build** — Create TypeScript task files following the conventions below.
6. **Environment Setup** — Add all required env vars to `.env` (local) AND the Trigger.dev   dashboard (production). Walk the user through both.
7. **Test Locally** — Start the dev server and trigger a test run. Confirm it works.
8. **Deploy** — Use the Trigger.dev MCP deploy tool to push to production.
9. **Verify** — Check run logs and confirm the automation is working end-to-end.

## Questions to Ask Before Writing Any Code

- **Source**: What data or service does this pull from? Does the user have an account/API key?
- **Output**: Where should results go? (ClickUp, email, Slack, a spreadsheet, a database?)
- **Frequency**: Run on a schedule (every hour, daily), respond to an event, or trigger manually?
- **Accounts**: What services does the user already have access to? What needs to be signed up for?
- **Success**: What does "working" look like? What exact output should they see?
- **Edge cases**: What if the source has no new data? What if an API call fails?

## Tech Stack

- **Language**: TypeScript only — no Python scripts, no shell scripts, no exceptions
- **Runtime**: All code runs as Trigger.dev tasks — never plain Node scripts run directly
- **HTTP requests**: Use native `fetch` — no need for axios or node-fetch

## Project Structure

```
src/trigger/{automation-name}/   ← Trigger.dev tasks (backend)
shared/                          ← code shared by /src and /web; edit here, never duplicate
  linkedin/buildUrl.ts           ← LinkedIn URL builder (used by web + scrape-user-jobs)
  resume/parsePdf.ts             ← pdf2json resume parser (used by web + upload-resume)
web/                             ← Next.js 15 frontend, own package.json (no workspaces)
migrations/                      ← numbered SQL diffs; canonical schema in /schema.sql
```

- Each automation gets its own folder under `src/trigger/`
- A single task file is fine for simple automations
- Split into multiple files when one task detects/polls for new items and another does the heavy work (API calls, LLM, posting output) — see `/trigger-ref` for the orchestrator+processor pattern

## Web frontend (`/web`)

- Stack: Next.js 15 App Router + React 19 + Tailwind + `@supabase/ssr`. Server Actions for
  every write. `pdf2json` runs on the Node runtime via Server Action — never on the client.
- Auth: Supabase Auth with email confirmation. Confirm/reset emails go through Resend SMTP
  configured in the Supabase dashboard (one-time, not in code).
- Access gate: `public.signup_allowlist` table; the signup Server Action looks up the email
  via the service-role client before calling `supabase.auth.signUp`. Add invites with
  `INSERT INTO public.signup_allowlist (email) VALUES ('...')` in the Supabase SQL editor.
- Sharing with backend: `shared/resume/parsePdf.ts` and `shared/linkedin/buildUrl.ts` are
  imported via `@shared/*` (web) and relative `../../../shared/*.js` (Trigger.dev). Vercel
  picks up `/shared` because `next.config.ts` sets `outputFileTracingRoot` to the repo root.
  `pdf2json` is in `serverExternalPackages` — keep it there.
- Brand: Quicksilver SVGs live in `web/public/brand/` (copied from `.assets/`); palette is
  `#f47822` orange / `#231f20` ink, exposed as `brand.orange` / `brand.ink` in Tailwind.
- Local dev: `cd web && npm install && npm run dev`. Backend dev server (`npm run dev` at
  repo root) is independent — both just hit the same Supabase project.
- Deploy: Vercel, Root Directory `web`. Same env vars as `web/.env.local.example`.

## Database changes that touch RLS or auth

- `users`, `resumes`, `search_configs` are RLS-scoped to the authenticated user — the web app
  uses the cookie-aware client and writes go through normal `update`/`insert`. Do not reach
  for the service-role key from the web app for these tables.
- `jobs_raw`, `jobs_filtered`, `signup_allowlist` have no client policies — service-role only.
  The Trigger.dev pipeline uses service-role; the web app only touches `signup_allowlist`
  via `lib/supabase/admin.ts` (server-only) for the signup gate.
- The `private.handle_new_auth_user` trigger creates the matching `public.users` row on
  signup using `user_metadata.name`, so the signup Server Action passes `data: { name }`
  and never touches `users` directly.

## Environment Variables — Security Rules

- **Every secret lives in `.env`** — API keys, tokens, workspace IDs, channel IDs. No exceptions.
- **Never log secret values** — `console.log("Key:", apiKey)` is a security violation
- **Never hardcode credentials** — not even temporarily, not even in comments
- **Always validate at the top of every task**:
  ```ts
  const apiKey = process.env.MY_API_KEY;
  if (!apiKey) throw new Error("MY_API_KEY is not set");
  ```
- **IDs and tokens from third-party services** (workspace IDs, channel IDs, etc.) — always read from env vars, never hardcode or fetch dynamically when a static value will do
- **Before deploying**: add ALL env vars to Trigger.dev dashboard → Project → Environment
  Variables. Add to both staging and prod environments. This is the #1 cause of production failures.
- **Verify `.gitignore` includes `.env`** before any commit. Never commit secrets.
- **When adding a new env var**: add it to `.env` with a descriptive comment explaining where to
  get it, then remind the user to also add it to the Trigger.dev dashboard
- `SUPABASE_SERVICE_ROLE_KEY` is what every Trigger.dev task uses (bypasses RLS by design — `jobs_raw` and `jobs_filtered` have no client policies). Never expose it to a browser/frontend client.

## Trigger.dev Critical Rules

- Use `@trigger.dev/sdk` — NEVER `client.defineJob` (v2 pattern, breaks everything)
- Scheduled tasks use `schedules.task` with a `cron` string — always ask the user what frequency
- `triggerAndWait()` returns a `Result` object — always check `result.ok` before `result.output`
- NEVER wrap `triggerAndWait`, `batchTriggerAndWait`, or `wait.*` calls in `Promise.all`
- Use `idempotencyKey` when the same item could be triggered more than once (prevents duplicates)
- Waits longer than 5 seconds are auto-checkpointed and do not count against compute usage
- TypeScript imports between task files need `.js` extension: `import { myTask } from "./my-task.js"`

## Scheduling

Always ask the user what frequency they want before choosing a cron. Common cron patterns:

| Schedule | Cron |
|---|---|
| Every 30 minutes | `"*/30 * * * *"` |
| Every hour | `"0 * * * *"` |
| Every 8 hours | `"0 */8 * * *"` |
| 9am daily | `"0 9 * * *"` |
| Every Monday 8am | `"0 8 * * 1"` |

When polling a feed on a schedule, set the lookback window slightly larger than the cron interval
(e.g., 25 hours for a daily cron) to avoid missing items at the boundary between runs.

## MCP Tools — Use These Instead of CLI When Possible

You have live Trigger.dev MCP tools. Prefer them over running CLI commands in the terminal:

| What you need to do | MCP Tool |
|---|---|
| Deploy to production | `mcp__trigger__deploy` |
| Fire a test run | `mcp__trigger__trigger_task` |
| Wait for a run to finish | `mcp__trigger__wait_for_run_to_complete` |
| Read run logs and errors | `mcp__trigger__get_run_details` |
| List recent runs | `mcp__trigger__list_runs` |
| See all registered tasks | `mcp__trigger__get_current_worker` |

## Testing Locally

Trigger.dev backend:
1. Start the dev server: `npm run dev` (at repo root)
2. Use `mcp__trigger__trigger_task` to fire a test run with a sample payload
3. Watch logs in the terminal — errors appear here in real time
4. Use `mcp__trigger__get_run_details` to inspect the full run trace if something fails

Web frontend:
1. `cd web && npm install` (first time only)
2. `npm run dev` — boots Next.js on `localhost:3000`
3. `npm run type-check` — strict TypeScript check (covers `/shared` too)
4. `npm run build` — production build, catches App Router edge cases that dev hides

After changes that touch `/shared`, run **both** `npm run type-check` in `/web` AND
`npx tsc --noEmit` at the repo root — the two TypeScript projects pick up the shared
module independently and either can break.

## Deploying to Production

**NEVER push to production or deploy without explicit user approval.** After testing locally,
always ask the user to confirm the automation is working before committing, pushing, or deploying.
Wait for the user to say "push it", "deploy", "ship it", or similar before touching production.

**Checklist — complete this before every deploy:**

- [ ] All env vars added to Trigger.dev dashboard (not just `.env`)
  - Go to: cloud.trigger.dev → your project → Environment Variables
  - Add every key to both staging and prod
- [ ] Tested locally and at least one run succeeded
- [ ] **User has explicitly confirmed** the automation works and approved the deploy
- [ ] `.env` is in `.gitignore`

**Deploy**: `npm run deploy`, or push to `master` — GitHub Actions auto-deploys via `.github/workflows/deploy.yml`

**After deploying:**
- Use `mcp__trigger__list_runs` to confirm the first run succeeded
- For scheduled tasks: check the Schedules tab in the dashboard to confirm the cron is registered
- Do a manual test trigger from the dashboard or via `mcp__trigger__trigger_task`

## When a Run Fails

1. Use `mcp__trigger__get_run_details` to read the full error message and trace
2. Most common causes:
   - **Missing env var in dashboard** — key is in `.env` locally but was never added to Trigger.dev
   - **Import path** — TypeScript task imports need `.js` extension (e.g., `"./process-video.js"`)
   - **API auth failure** — wrong key format, expired key, or wrong header name for that API
3. Fix the issue, test locally again, then redeploy

## Adding npm Packages

```bash
npm install {package-name}
npm install -D @types/{package-name}   # only if the package doesn't bundle its own types
```

Trigger.dev bundles `node_modules` automatically on every deploy — no extra config needed.

## Full Trigger.dev API Reference

Read `trigger-ref.md` (at repo root) for complete code examples: task patterns, schedules, waits,
triggerAndWait, batch triggers, debounce, and schema tasks with Zod validation.

## Database changes

- Canonical schema lives in `schema.sql`; numbered files in `migrations/` are the applied diffs.
- For any table/RLS change, follow `.claude/skills/supabase/SKILL.md` and add a new numbered migration — never edit `schema.sql` by hand without a matching migration.

## Supabase MCP Skill

use `.claude\skills\supabase\SKILL.md` as standard to work with supabase mcp server.
use it every time you need to modify the table schema, use RLS and troubleshoot problems. 

## Codex session 

Any session from Codex is summarized in `codex_recap.md`, use it as context for your session if relevant