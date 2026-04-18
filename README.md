# QS Automation — Job Scraper

Daily LinkedIn job scraper that filters for freelance/contract roles, scores them against each
user's resume with Gemini, and sends high-match jobs to Telegram. Built on Trigger.dev v3.

## What it does (end-to-end)

1. At **09:00 Europe/Amsterdam**, `scrape-jobs` fires.
2. It loads all active users from Supabase and fans out one `scrape-user-jobs` run per user.
3. Each user run calls the **Apify** LinkedIn actor using that user's saved search URLs, waits for
   it to finish (polling every 30s, up to 20 min), and upserts every result into `jobs_raw`.
4. For each raw job, `filter-job` runs:
   - If the job is already in `jobs_filtered` (some other user already confirmed it), it skips the
     LLM and jumps to scoring.
   - Otherwise it asks **Gemini** "is this temp/contract/freelance?". If yes → copy to
     `jobs_filtered`. If no → drop.
5. `classify-job` loads the user, their active resume, and the filtered job, then asks **Gemini**
   to score the match 0–100. The score is written to `job_scores`.
6. If `score >= user.notification_threshold`, `notify-job` sends a formatted Telegram message and
   marks the score as notified.

## Pipeline

```
[cron 09:00 AMS]
      │
      ▼
scrape-jobs              ── fans out per active user
      │
      ▼
scrape-user-jobs         ── Apify LinkedIn actor, upserts into jobs_raw
      │
      ▼ (one per job)
filter-job               ── Gemini: is this freelance/contract?
      │                     cached via jobs_filtered so we only ask once per job
      ▼
classify-job             ── Gemini: score this job against user's resume → job_scores
      │
      ▼ (only if score ≥ user threshold)
notify-job               ── Telegram message to user.telegram_chat_id
```

## Code layout

```
src/trigger/
├── job-scraper/                 ← the runtime pipeline
│   ├── scrape-jobs.ts           scheduled task (09:00 AMS); fans out per user
│   ├── scrape-user-jobs.ts      one Apify run per user; upserts jobs_raw
│   ├── filter-job.ts            Gemini temp/freelance check; writes jobs_filtered
│   ├── classify-job.ts          Gemini resume-vs-job score; writes job_scores
│   ├── notify-job.ts            Telegram sender; marks score.notified
│   ├── gemini.ts                filterJob + scoreJob prompts (gemini-2.0-flash)
│   ├── supabase.ts              all DB reads/writes; typed row shapes
│   └── url-builder.ts           builds LinkedIn search URL from a SearchConfig
└── setup/                       ← one-time, manually triggered from dashboard
    ├── register-user.ts         creates a row in users (name, telegram, threshold)
    ├── upload-resume.ts         parses a local PDF, stores text in resumes
    └── create-search-config.ts  adds a search_configs row + builds LinkedIn URL
```

## Database (Supabase)

| Table | Purpose |
|---|---|
| `users` | One row per user. `active`, `notification_threshold`, `telegram_chat_id`. |
| `resumes` | Parsed resume text per user. Only the row with `is_active = true` is used. |
| `search_configs` | User's LinkedIn searches. `active = true` feeds the scraper. |
| `jobs_raw` | Everything Apify returned, keyed by LinkedIn `job_id`. |
| `jobs_filtered` | Subset of `jobs_raw` that Gemini confirmed as temp/freelance. Acts as the dedup cache so we don't re-ask Gemini for the same job. |
| `job_scores` | Per (user, job) relevance score + reason. `notified` flips to true after Telegram. |

## Setup — new user checklist

Each of these is triggered manually from the Trigger.dev dashboard.

1. `register-user` → get back a `user_id`.
2. `upload-resume` with `{ userId, pdfPath }` → parses a local PDF, stores text. Must run from
   the dev server (the file path is local).
3. `create-search-config` with `{ userId, keywords, geoId, ... }` → persists a LinkedIn URL.
   Repeat for each saved search.

After that the 09:00 cron picks them up automatically.

## Environment variables

All required in both `.env` (local) **and** the Trigger.dev dashboard (staging + prod).

| Key | Used by |
|---|---|
| `SUPABASE_URL` | all DB calls |
| `SUPABASE_ANON_KEY` | all DB calls |
| `APIFY_API_TOKEN` | `scrape-user-jobs` |
| `GEMINI_API_KEY` | `filter-job`, `classify-job` |
| `TELEGRAM_BOT_TOKEN` | `notify-job` |

## Running it

```bash
# local dev server (hot reloads tasks; lets the dashboard trigger them locally)
npm run dev

# production deploy (also auto-runs on push to master via .github/workflows/deploy.yml)
npm run deploy
```

Test triggers (via the Trigger.dev MCP):
- Full daily run: trigger `scrape-jobs`
- Single user: trigger `scrape-user-jobs` with `{ userId }`
- Single job against one user: trigger `filter-job` with `{ jobId, userId }`

## Key design choices worth remembering

- **Per-user fan-out, not per-config.** One Apify run per user, with all their URLs as input.
  `splitCountry` is taken from the user's first config (it's actor-level, not per-URL).
- **Two-stage Gemini.** `filter-job` is a yes/no "is this freelance?" so the expensive
  resume-scoring call only runs on relevant jobs.
- **`jobs_filtered` doubles as a cache.** If user A already caused a job to be filtered, user B
  skips the LLM and goes straight to scoring for their own resume.
- **Per-user threshold.** `users.notification_threshold` is checked in `classify-job`; the score
  is always saved, but the Telegram send only happens if it clears the bar.
- **Idempotency keys** on every fan-out call so re-running the cron doesn't duplicate work.
- **LinkedIn URL is built once, stored.** `url-builder.ts` runs at config creation; the scraper
  just reads `search_configs.linkedin_url`.
