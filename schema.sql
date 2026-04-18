-- ============================================================
-- QS Automation — Supabase schema
-- Run this in: cloud.supabase.com → your project → SQL Editor
-- ============================================================

-- Users
CREATE TABLE IF NOT EXISTS users (
  user_id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT        NOT NULL,
  email                TEXT,
  telegram_chat_id     TEXT,
  notification_threshold INT       NOT NULL DEFAULT 85,
  active               BOOLEAN     NOT NULL DEFAULT TRUE
);

-- Resumes
CREATE TABLE IF NOT EXISTS resumes (
  resume_id   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  filename    TEXT,
  parsed_text TEXT        NOT NULL,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

-- Raw jobs (everything Apify returns, upserted by job_id)
CREATE TABLE IF NOT EXISTS jobs_raw (
  job_id             TEXT        PRIMARY KEY,
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
  scraped_at         TIMESTAMPTZ NOT NULL
);

-- Filtered jobs (passed Gemini temp/freelance check)
CREATE TABLE IF NOT EXISTS jobs_filtered (
  job_id             TEXT        PRIMARY KEY,
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
  filtered_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
