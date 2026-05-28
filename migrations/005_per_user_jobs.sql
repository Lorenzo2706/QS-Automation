-- ============================================================
-- Migration 005: per-user job isolation + pipeline_schedules
--   1. jobs_raw / jobs_filtered become per-user: add user_id and a composite
--      primary key (user_id, job_id). They previously had no user_id, so a job
--      could not be attributed to the user who scraped it and one user's filter
--      decisions silently affected everyone. These tables are a derived cache
--      (regenerated on the next run), so we TRUNCATE them — there is no user_id
--      to backfill. job_scores (the durable per-user output) is left intact.
--   2. New pipeline_schedules table: one row per user holding their optional
--      schedule (start datetime + recurrence + Trigger.dev schedule id) and a
--      "last run" marker. Owner-scoped RLS; the backend writes last_run_* via
--      the service_role key.
-- ============================================================

-- ── 1. Per-user jobs_raw / jobs_filtered ───────────────────────────────────

-- Derived cache, no user_id to backfill — wipe and let the pipeline repopulate.
TRUNCATE TABLE public.jobs_raw;
TRUNCATE TABLE public.jobs_filtered;

-- jobs_raw: add user_id, swap PK (job_id) → (user_id, job_id)
ALTER TABLE public.jobs_raw
  ADD COLUMN IF NOT EXISTS user_id UUID NOT NULL
    REFERENCES public.users(user_id) ON DELETE CASCADE;
ALTER TABLE public.jobs_raw DROP CONSTRAINT IF EXISTS jobs_raw_pkey;
ALTER TABLE public.jobs_raw ADD PRIMARY KEY (user_id, job_id);

-- needs_evaluation lookups are now scoped per user
DROP INDEX IF EXISTS public.jobs_raw_needs_eval_idx;
CREATE INDEX IF NOT EXISTS jobs_raw_needs_eval_idx
  ON public.jobs_raw (user_id, needs_evaluation) WHERE needs_evaluation = TRUE;

-- jobs_filtered: add user_id, swap PK (job_id) → (user_id, job_id)
ALTER TABLE public.jobs_filtered
  ADD COLUMN IF NOT EXISTS user_id UUID NOT NULL
    REFERENCES public.users(user_id) ON DELETE CASCADE;
ALTER TABLE public.jobs_filtered DROP CONSTRAINT IF EXISTS jobs_filtered_pkey;
ALTER TABLE public.jobs_filtered ADD PRIMARY KEY (user_id, job_id);

-- RLS unchanged: jobs_raw / jobs_filtered stay service-role only (no client
-- policies). RLS is already enabled on both from schema.sql.

-- ── 2. pipeline_schedules ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pipeline_schedules (
  user_id             UUID        PRIMARY KEY REFERENCES public.users(user_id) ON DELETE CASCADE,
  enabled             BOOLEAN     NOT NULL DEFAULT FALSE,
  recurrence          TEXT,            -- 'daily' | 'weekdays' | 'weekly'
  start_at            TIMESTAMPTZ,     -- user-chosen anchor (time-of-day + weekly day)
  cron                TEXT,            -- generated cron pattern
  timezone            TEXT        NOT NULL DEFAULT 'Europe/Amsterdam',
  trigger_schedule_id TEXT,            -- Trigger.dev imperative schedule id
  last_run_at         TIMESTAMPTZ,
  last_run_status     TEXT,            -- 'running' | 'success' | 'failed'
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.pipeline_schedules ENABLE ROW LEVEL SECURITY;

-- Owner-scoped CRUD (mirrors search_configs). Backend writes last_run_* via the
-- service_role key, which bypasses RLS.
DROP POLICY IF EXISTS "pipeline_schedules_select_own" ON public.pipeline_schedules;
DROP POLICY IF EXISTS "pipeline_schedules_insert_own" ON public.pipeline_schedules;
DROP POLICY IF EXISTS "pipeline_schedules_update_own" ON public.pipeline_schedules;
DROP POLICY IF EXISTS "pipeline_schedules_delete_own" ON public.pipeline_schedules;
CREATE POLICY "pipeline_schedules_select_own" ON public.pipeline_schedules
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "pipeline_schedules_insert_own" ON public.pipeline_schedules
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "pipeline_schedules_update_own" ON public.pipeline_schedules
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "pipeline_schedules_delete_own" ON public.pipeline_schedules
  FOR DELETE TO authenticated USING (user_id = auth.uid());
