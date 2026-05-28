-- ============================================================
-- QS Automation — Supabase schema
-- Run this in: cloud.supabase.com → your project → SQL Editor
-- ============================================================
--
-- Architecture:
--   - public.users is linked 1:1 to auth.users (user_id FK references auth.users.id)
--   - On signup, a trigger on auth.users auto-creates the matching public.users row
--   - RLS on every public table; authenticated users only see/manage their own rows
--   - jobs_raw and jobs_filtered have no client-facing policies — backend uses
--     the service_role key (which bypasses RLS) to write/read them
-- ============================================================

-- Users (1:1 with auth.users; populated by the on_auth_user_created trigger below)
CREATE TABLE IF NOT EXISTS users (
  user_id                UUID        PRIMARY KEY
                                      REFERENCES auth.users(id) ON DELETE CASCADE,
  name                   TEXT        NOT NULL,
  email                  TEXT        NOT NULL,
  notification_threshold INT         NOT NULL DEFAULT 85,
  active                 BOOLEAN     NOT NULL DEFAULT TRUE
);

-- Ensure the auth.users FK is present on existing tables (CREATE TABLE IF NOT EXISTS skips this)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_user_id_fkey'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Resumes
CREATE TABLE IF NOT EXISTS resumes (
  resume_id   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  filename    TEXT,
  parsed_text TEXT        NOT NULL,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enforce at most one active resume per user; getActiveResume() uses .single() and
-- breaks silently when multiple is_active=true rows exist for the same user.
CREATE UNIQUE INDEX IF NOT EXISTS resumes_one_active_per_user
  ON public.resumes (user_id) WHERE is_active = TRUE;

-- Search configs (drives the Apify scraper, one or more per user)
-- geo_id 102890719 = Netherlands
CREATE TABLE IF NOT EXISTS search_configs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  name          TEXT,
  keywords      TEXT        NOT NULL,
  job_types     TEXT[]      NOT NULL DEFAULT '{}',
  geo_id        TEXT        NOT NULL,
  date_posted   TEXT,
  sort_by       TEXT        NOT NULL DEFAULT 'DD',
  split_country TEXT,
  linkedin_url  TEXT        NOT NULL,
  active        BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS search_configs_user_active_idx
  ON search_configs (user_id, active);

-- Raw jobs (everything Apify returns; per-user, insert-only with ON CONFLICT DO NOTHING)
CREATE TABLE IF NOT EXISTS jobs_raw (
  user_id            UUID        NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  job_id             TEXT        NOT NULL,
  title              TEXT,
  standardized_title TEXT,
  job_type           TEXT,
  company_name       TEXT,
  company_details    JSONB,
  location           TEXT,
  url                TEXT,
  description_text   TEXT,
  posted_at          TEXT,
  posting_date_adj   TEXT,
  industry           TEXT,
  job_function       TEXT,
  seniority          TEXT,
  job_poster_title   TEXT,
  apply_url          TEXT,
  language           TEXT,
  scraped_at         TIMESTAMPTZ NOT NULL,
  needs_evaluation   BOOLEAN     NOT NULL DEFAULT FALSE,
  PRIMARY KEY (user_id, job_id)
);

CREATE INDEX IF NOT EXISTS jobs_raw_needs_eval_idx
  ON jobs_raw (user_id, needs_evaluation) WHERE needs_evaluation = TRUE;

-- Filtered jobs (passed Gemini temp/freelance check; per-user)
CREATE TABLE IF NOT EXISTS jobs_filtered (
  user_id            UUID        NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  job_id             TEXT        NOT NULL,
  title              TEXT,
  standardized_title TEXT,
  job_type           TEXT,
  company_name       TEXT,
  company_details    JSONB,
  location           TEXT,
  url                TEXT,
  description_text   TEXT,
  posted_at          TEXT,
  posting_date_adj   TEXT,
  industry           TEXT,
  job_function       TEXT,
  seniority          TEXT,
  job_poster_title   TEXT,
  apply_url          TEXT,
  language           TEXT,
  scraped_at         TIMESTAMPTZ NOT NULL,
  filtered_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, job_id)
);

-- Job scores (user × job, with notification status)
CREATE TABLE IF NOT EXISTS job_scores (
  user_id          UUID    NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  resume_id        UUID    NOT NULL REFERENCES resumes(resume_id),
  job_id           TEXT    NOT NULL,
  relevance_score  INT     NOT NULL,
  relevance_reason TEXT,
  notified         BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (user_id, job_id)
);

-- Pipeline schedules (one row per user): optional per-user schedule + last-run marker.
-- The web app writes the schedule fields (owner RLS); the backend orchestrator
-- writes last_run_* via the service_role key.
CREATE TABLE IF NOT EXISTS pipeline_schedules (
  user_id             UUID        PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
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

-- ============================================================
-- Signup hook: auto-create public.users on auth.users insert
-- ============================================================
-- Lives in a private schema (never expose SECURITY DEFINER functions via the
-- Data API). Name falls back to user_metadata.name → email → 'New user'.
-- The client is expected to update telegram_chat_id / notification_threshold
-- after signup (or the register-user Trigger.dev task does it on their behalf).

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM anon, authenticated, PUBLIC;
GRANT USAGE ON SCHEMA private TO postgres, service_role;

CREATE OR REPLACE FUNCTION private.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.users (user_id, name, email)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'name', ''), NEW.email, 'New user'),
    NEW.email
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.handle_new_auth_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION private.handle_new_auth_user();

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE public.users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resumes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs_raw           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs_filtered      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_scores         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_schedules ENABLE ROW LEVEL SECURITY;

-- users: owner-scoped CRUD
DROP POLICY IF EXISTS "users_select_own" ON public.users;
DROP POLICY IF EXISTS "users_insert_own" ON public.users;
DROP POLICY IF EXISTS "users_update_own" ON public.users;
DROP POLICY IF EXISTS "users_delete_own" ON public.users;
CREATE POLICY "users_select_own" ON public.users
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "users_insert_own" ON public.users
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "users_delete_own" ON public.users
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- resumes: owner-scoped CRUD
DROP POLICY IF EXISTS "resumes_select_own" ON public.resumes;
DROP POLICY IF EXISTS "resumes_insert_own" ON public.resumes;
DROP POLICY IF EXISTS "resumes_update_own" ON public.resumes;
DROP POLICY IF EXISTS "resumes_delete_own" ON public.resumes;
CREATE POLICY "resumes_select_own" ON public.resumes
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "resumes_insert_own" ON public.resumes
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "resumes_update_own" ON public.resumes
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "resumes_delete_own" ON public.resumes
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- search_configs: owner-scoped CRUD
DROP POLICY IF EXISTS "search_configs_select_own" ON public.search_configs;
DROP POLICY IF EXISTS "search_configs_insert_own" ON public.search_configs;
DROP POLICY IF EXISTS "search_configs_update_own" ON public.search_configs;
DROP POLICY IF EXISTS "search_configs_delete_own" ON public.search_configs;
CREATE POLICY "search_configs_select_own" ON public.search_configs
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "search_configs_insert_own" ON public.search_configs
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "search_configs_update_own" ON public.search_configs
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "search_configs_delete_own" ON public.search_configs
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- job_scores: read-only for the owner; all writes come from the backend
DROP POLICY IF EXISTS "job_scores_select_own" ON public.job_scores;
CREATE POLICY "job_scores_select_own" ON public.job_scores
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- pipeline_schedules: owner-scoped CRUD (last_run_* written by the backend service_role)
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

-- jobs_raw, jobs_filtered: no client-facing policies. RLS is on; only the
-- service_role key (used by Trigger.dev tasks) can read or write them.

-- ============================================================
-- Signup allowlist (used by the web frontend's signup server action)
-- ============================================================
-- The frontend looks up an incoming email here (via the service_role key)
-- before calling supabase.auth.signUp. No client-facing policies.

CREATE TABLE IF NOT EXISTS public.signup_allowlist (
  email     TEXT        PRIMARY KEY,
  added_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note      TEXT
);

ALTER TABLE public.signup_allowlist ENABLE ROW LEVEL SECURITY;
