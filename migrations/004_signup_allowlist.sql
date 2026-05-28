-- ============================================================
-- Migration 004: signup allowlist
--   Used by the web frontend's signup server action: only emails present in
--   public.signup_allowlist are allowed to call supabase.auth.signUp.
--   No client-facing RLS policies — only the service_role key can read or
--   write this table.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.signup_allowlist (
  email     TEXT        PRIMARY KEY,
  added_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note      TEXT
);

ALTER TABLE public.signup_allowlist ENABLE ROW LEVEL SECURITY;

-- Seed the initial admin so the first signup can succeed
INSERT INTO public.signup_allowlist (email, note)
VALUES ('lorenzo.giori@finext.com', 'initial admin')
ON CONFLICT (email) DO NOTHING;
