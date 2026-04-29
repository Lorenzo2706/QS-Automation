-- ============================================================
-- Migration 002: auth FK, idempotent RLS policies, active-resume constraint
-- Apply this to existing Supabase projects that were set up before schema.sql
-- was updated to reference auth.users. Safe to run multiple times.
-- ============================================================

-- 1. Add auth.users FK to users.user_id if it doesn't already exist
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_user_id_fkey'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 2. Enforce one active resume per user
CREATE UNIQUE INDEX IF NOT EXISTS resumes_one_active_per_user
  ON public.resumes (user_id) WHERE is_active = TRUE;

-- 3. Recreate RLS policies idempotently
DROP POLICY IF EXISTS "users_select_own"          ON public.users;
DROP POLICY IF EXISTS "users_insert_own"          ON public.users;
DROP POLICY IF EXISTS "users_update_own"          ON public.users;
DROP POLICY IF EXISTS "users_delete_own"          ON public.users;
CREATE POLICY "users_select_own" ON public.users
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "users_insert_own" ON public.users
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "users_delete_own" ON public.users
  FOR DELETE TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "resumes_select_own"        ON public.resumes;
DROP POLICY IF EXISTS "resumes_insert_own"        ON public.resumes;
DROP POLICY IF EXISTS "resumes_update_own"        ON public.resumes;
DROP POLICY IF EXISTS "resumes_delete_own"        ON public.resumes;
CREATE POLICY "resumes_select_own" ON public.resumes
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "resumes_insert_own" ON public.resumes
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "resumes_update_own" ON public.resumes
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "resumes_delete_own" ON public.resumes
  FOR DELETE TO authenticated USING (user_id = auth.uid());

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

DROP POLICY IF EXISTS "job_scores_select_own"     ON public.job_scores;
CREATE POLICY "job_scores_select_own" ON public.job_scores
  FOR SELECT TO authenticated USING (user_id = auth.uid());
