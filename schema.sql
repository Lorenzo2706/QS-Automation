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
  user_id     UUID        NOT NULL REFERENCES users(user_id),
  filename    TEXT,
  parsed_text TEXT        NOT NULL,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Search configs (drives the Apify scraper)
-- geo_id 102890719 = Netherlands
CREATE TABLE IF NOT EXISTS search_configs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT,
  keywords    TEXT        NOT NULL,
  job_types   TEXT[]      NOT NULL DEFAULT '{}',
  geo_id      TEXT        NOT NULL,
  date_posted TEXT,
  sort_by     TEXT        NOT NULL DEFAULT 'DD',
  active      BOOLEAN     NOT NULL DEFAULT TRUE
);

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
  user_id          UUID    NOT NULL REFERENCES users(user_id),
  resume_id        UUID    NOT NULL REFERENCES resumes(resume_id),
  job_id           TEXT    NOT NULL,
  relevance_score  INT     NOT NULL,
  relevance_reason TEXT,
  notified         BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (user_id, job_id)
);

-- ============================================================
-- Seed: one search config for NL freelance/contract roles
-- Adjust keywords, job_types, and geo_id to match what you want
-- ============================================================
INSERT INTO search_configs (name, keywords, job_types, geo_id, date_posted, sort_by)
VALUES (
  'NL Freelance/Contract',
  'freelance OR contractor OR consultant',
  ARRAY['CONTRACT', 'TEMPORARY'],
  '102890719',
  'past-month',
  'DD'
)
ON CONFLICT DO NOTHING;
