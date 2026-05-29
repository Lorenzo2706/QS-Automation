-- ============================================================
-- Migration 006: client read access to jobs_filtered + url backfill
--   1. Give authenticated users SELECT on their OWN jobs_filtered rows so the
--      web app can render a "My Jobs" page (jobs scored at/above the user's
--      notification_threshold). Mirrors job_scores_select_own. jobs_raw stays
--      service-role only — only the post-filter, user-facing set is exposed.
--   2. Backfill jobs_raw / jobs_filtered.url for rows scraped before the scraper
--      was fixed to read the Apify `link` field. job_id is LinkedIn's numeric
--      job id, so the canonical job page is .../jobs/view/<job_id> — identical
--      to what the `link` field returns. New rows get url from `link` directly.
-- ============================================================

-- ── 1. Owner-scoped read on jobs_filtered ──────────────────────────────────
DROP POLICY IF EXISTS "jobs_filtered_select_own" ON public.jobs_filtered;
CREATE POLICY "jobs_filtered_select_own" ON public.jobs_filtered
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ── 2. Backfill empty url columns ──────────────────────────────────────────
UPDATE public.jobs_raw
  SET url = 'https://www.linkedin.com/jobs/view/' || job_id
  WHERE url IS NULL;
UPDATE public.jobs_filtered
  SET url = 'https://www.linkedin.com/jobs/view/' || job_id
  WHERE url IS NULL;
