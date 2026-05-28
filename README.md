# QS Automation — Job Scraper

Per-user LinkedIn job scraper that filters for freelance/temporary roles, scores them against
each user's resume with Gemini, and emails that user a recap of their high-match jobs. Built on
Trigger.dev v3. Runs are triggered **on demand** from the web app or by each user's **optional
recurring schedule** — there is no global cron.

## What it does (end-to-end)

1. A run starts for one user — either from the **"Run now"** button in the web app, or from that
   user's recurring schedule (`scheduled-user-pipeline`, fired by a Trigger.dev imperative
   schedule carrying the user's id in `externalId`). Both route into the `run-user-pipeline`
   orchestrator.
2. `run-user-pipeline` triggers `scrape-user-jobs` for that user **and waits** for the whole
   downstream chain to finish.
3. `scrape-user-jobs` calls the **Apify** LinkedIn actor using the user's saved search URLs, waits
   for it (polling every 30s, up to 20 min), and bulk-inserts results into `jobs_raw` keyed
   `(user_id, job_id)` with insert-ignore-duplicates. Truly-new rows get `needs_evaluation = true`.
   It then `batchTriggerAndWait`s `filter-job` for every scraped job.
4. For each scraped job, `filter-job` runs (per user):
   - If `needs_evaluation` is `true`, it asks **Gemini** to classify the posting as
     `freelance` / `temporary` / `permanent`. Freelance and Temporary are copied to
     `jobs_filtered` (keyed `(user_id, job_id)`) with `job_type` set to the Gemini category;
     Permanent is dropped. Either way `needs_evaluation` flips to `false`.
   - If `needs_evaluation` is already `false`, it trusts the prior decision — no Gemini call.
   - It then `triggerAndWait`s `classify-job`.
5. `classify-job` short-circuits when `(user_id, job_id)` is already in `job_scores`. Otherwise
   it loads the user, their active resume, and the filtered job, then asks **Gemini** to score
   the match 0–100. The score is written to `job_scores`.
6. Once the chain completes, the orchestrator calls `sendRecapForUser` (`recap.ts`): it queries
   `job_scores` for unnotified rows where `relevance_score >= user.notification_threshold`,
   builds an HTML recap email (sorted by score), sends it via **Resend**, flips `notified = true`,
   and records the run status on `pipeline_schedules.last_run_*`.

## Pipeline

```
[Run now]  or  [per-user imperative schedule → scheduled-user-pipeline]
      │
      ▼
run-user-pipeline        ── orchestrator (one user); concurrencyKey = userId; waits for the chain
      │
      ▼
scrape-user-jobs         ── Apify LinkedIn actor; insert-ignore-duplicates into jobs_raw
      │                     (per user, keyed (user_id, job_id); new rows needs_evaluation = true)
      ▼ batchTriggerAndWait (one per job)
filter-job               ── if needs_evaluation: Gemini classifies freelance/temporary/permanent,
      │                     writes jobs_filtered.job_type, then flips the flag to false.
      ▼ triggerAndWait
classify-job             ── if (user, job) already in job_scores: skip.
      │                     Else Gemini scores this job against the user's resume → job_scores.
      ▼
sendRecapForUser         ── (called by the orchestrator) one Resend email of this user's unnotified
(recap.ts)                  matches above threshold; flips job_scores.notified = true
```

## Code layout

```
src/trigger/
├── job-scraper/                    ← the runtime pipeline
│   ├── run-user-pipeline.ts        orchestrator (per user): scrape → … → recap; on demand or scheduled
│   ├── scheduled-user-pipeline.ts  schedules.task target for per-user imperative schedules (externalId = userId)
│   ├── scrape-user-jobs.ts         one Apify run per user; insertNewRawJobs into jobs_raw; waits for filter chain
│   ├── filter-job.ts               flag-driven; Gemini 3-way classify; writes jobs_filtered; waits for classify
│   ├── classify-job.ts             Gemini resume-vs-job score; writes job_scores (skips if scored)
│   ├── recap.ts                    sendRecapForUser: renders + sends the Resend recap for one user
│   ├── gemini.ts                   filterJob (3-way) + scoreJob prompts (gemini-2.5-flash-lite)
│   ├── supabase.ts                 all DB reads/writes; typed row shapes; recordRunStatus
│   └── url-builder.ts              builds LinkedIn search URL from a SearchConfig
└── setup/                          ← one-time, manually triggered from dashboard
    ├── register-user.ts            creates a row in users (name, threshold)
    ├── upload-resume.ts            parses a local PDF, stores text in resumes
    └── create-search-config.ts     adds a search_configs row + builds LinkedIn URL
```

## Database (Supabase)

| Table | Purpose |
|---|---|
| `users` | One row per user, keyed by `auth.users.id` (1:1 link). `email` (NOT NULL), `active`, `notification_threshold`. Auto-created by an `on_auth_user_created` trigger on signup; email is copied from `auth.users.email`. |
| `resumes` | Parsed resume text per user. Only the row with `is_active = true` is used. |
| `search_configs` | User's LinkedIn searches. `active = true` feeds the scraper. |
| `jobs_raw` | Everything Apify returned, keyed by LinkedIn `job_id`. `needs_evaluation = true` on freshly-inserted rows; `filter-job` flips it to `false` after classifying (pass or fail) so Gemini never sees the same job twice. |
| `jobs_filtered` | Subset of `jobs_raw` that Gemini classified as freelance or temporary. `job_type` stores the Gemini category (`"freelance"` or `"temporary"`) — not Apify's raw value. |
| `job_scores` | Per (user, job) relevance score + reason. PK `(user_id, job_id)` doubles as a "already scored" marker so `classify-job` short-circuits re-runs. `notified` flips to true after the daily recap email is sent. |

### Auth & RLS

- **`public.users.user_id` is a foreign key to `auth.users.id`** with `ON DELETE CASCADE`.
  When someone signs up through Supabase Auth, a trigger (`private.handle_new_auth_user`) inserts
  the matching `public.users` row with `user_id = auth.uid()` and name/email pulled from the auth
  record.
- **RLS is on every table.** Authenticated users only see and manage their own rows in `users`,
  `resumes`, `search_configs`, and their own entries in `job_scores` (read-only — writes come from
  the backend).
- **`jobs_raw` and `jobs_filtered` have no client-facing policies.** Only the `service_role` key
  (used by the Trigger.dev tasks) can read or write them; anonymous and authenticated clients see
  nothing.
- **The Trigger.dev backend uses `SUPABASE_SERVICE_ROLE_KEY`** (which bypasses RLS) because the
  pipeline writes across all users and needs to touch tables that have no client policies. This
  key must never be sent to a browser.

## Setup — new user checklist

Each of these is triggered manually from the Trigger.dev dashboard.

1. `register-user` with `{ email, password, name, notificationThreshold? }` →
   calls `supabase.auth.admin.createUser()`; the signup trigger creates the `public.users` row
   (with email copied from auth), and the task then updates it with `notification_threshold`.
   Returns the new `user_id`.
2. `upload-resume` with `{ userId, pdfPath }` → parses a local PDF, stores text. Must run from
   the dev server (the file path is local).
3. `create-search-config` with `{ userId, keywords, geoId, ... }` → persists a LinkedIn URL.
   Repeat for each saved search.

After that the 09:00 cron picks them up automatically. Once the frontend signup flow is built,
step 1 gets replaced by a normal Supabase Auth signup (the trigger handles the rest); users
update their own `notification_threshold` via the app, governed by RLS.

## Environment variables

All required in both `.env` (local) **and** the Trigger.dev dashboard (staging + prod).

| Key | Used by |
|---|---|
| `SUPABASE_URL` | all DB calls |
| `SUPABASE_SERVICE_ROLE_KEY` | all backend DB calls — **bypasses RLS, never expose to a browser** (Settings → API → service_role secret) |
| `SUPABASE_ANON_KEY` | future frontend clients (subject to RLS); not used by Trigger.dev tasks |
| `APIFY_API_TOKEN` | `scrape-user-jobs` |
| `GEMINI_API_KEY` | `filter-job`, `classify-job` |
| `RESEND_API_KEY` | `recap.ts` (`sendRecapForUser`) |
| `RESEND_FROM_EMAIL` | `recap.ts` (verified sender, e.g. `onboarding@resend.dev` or `jobs@yourdomain.com`) |
| `TRIGGER_SECRET_KEY` | **web app only** — lets Server Actions trigger `run-user-pipeline` and manage per-user schedules (`web/.env.local` + Vercel) |

## Running it

```bash
# local dev server (hot reloads tasks; lets the dashboard trigger them locally)
npm run dev

# production deploy (also auto-runs on push to master via .github/workflows/deploy.yml)
npm run deploy
```

Test triggers (via the Trigger.dev MCP):
- Full E2E for one user (scrape → … → recap email): trigger `run-user-pipeline` with `{ userId }`
- Scrape + filter + score only (no email): trigger `scrape-user-jobs` with `{ userId }`
- Single job against one user: trigger `filter-job` with `{ jobId, userId }`

## Key design choices worth remembering

- **Per-user fan-out, not per-config.** One Apify run per user, with all their URLs as input.
  `splitCountry` is taken from the user's first config (it's actor-level, not per-URL).
- **Two-stage Gemini.** `filter-job` is a 3-way `freelance` / `temporary` / `permanent` classify
  so the expensive resume-scoring call only runs on Freelance + Temporary jobs. Permanent is
  dropped. The Dutch-specific rules live in `gemini.ts`: **explicit start/end dates or fixed
  duration → Temporary**; Permanent is reserved for open-ended roles and "uitzicht op vast".
- **`needs_evaluation` is the authoritative dedup flag.** Fresh rows get `true`; after filtering
  (pass or fail) it flips to `false`. Re-scraping the same job the next day never re-hits Gemini,
  and it works for rejected jobs too (the old `jobs_filtered`-as-cache approach only covered
  passing jobs, so rejected ones were re-classified every day).
- **`job_scores` PK is the classify-dedup key.** `classify-job` returns early when
  `(user_id, job_id)` already has a score. To force a re-score (e.g. after a resume change),
  delete the row.
- **Per-user threshold.** `users.notification_threshold` is checked in `classify-job`; the score
  is always saved, but the Telegram send only happens if it clears the bar.
- **Idempotency keys** on every fan-out call so re-running the cron doesn't duplicate work.
- **LinkedIn URL is built once, stored.** `url-builder.ts` runs at config creation; the scraper
  just reads `search_configs.linkedin_url`.
