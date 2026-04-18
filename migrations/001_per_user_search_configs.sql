-- ============================================================
-- Migration 001: per-user search configs
-- Run this in: cloud.supabase.com → your project → SQL Editor
--
-- Adds user_id + linkedin_url to search_configs and wipes the
-- legacy global seed row. Every search config now belongs to a
-- specific user. Scrape-jobs fires one Apify run per user with
-- that user's URLs as input.
-- ============================================================

-- 1. Wipe any existing (user-less) configs. Safe: pre-prod data only.
DELETE FROM search_configs;

-- 2. Add new columns
ALTER TABLE search_configs
  ADD COLUMN IF NOT EXISTS user_id       UUID REFERENCES users(user_id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS split_country TEXT,
  ADD COLUMN IF NOT EXISTS linkedin_url  TEXT,
  ADD COLUMN IF NOT EXISTS created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 3. Enforce NOT NULL on the new required columns
ALTER TABLE search_configs
  ALTER COLUMN user_id      SET NOT NULL,
  ALTER COLUMN linkedin_url SET NOT NULL;

-- 4. Index for fast per-user active-config lookups
CREATE INDEX IF NOT EXISTS search_configs_user_active_idx
  ON search_configs (user_id, active);

-- 5. Add ON DELETE CASCADE to other user-owned tables for consistency
ALTER TABLE resumes
  DROP CONSTRAINT IF EXISTS resumes_user_id_fkey,
  ADD  CONSTRAINT resumes_user_id_fkey
       FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE;

ALTER TABLE job_scores
  DROP CONSTRAINT IF EXISTS job_scores_user_id_fkey,
  ADD  CONSTRAINT job_scores_user_id_fkey
       FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE;
