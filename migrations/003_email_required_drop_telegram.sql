-- ============================================================
-- Migration 003: enforce users.email NOT NULL, drop telegram_chat_id
-- ============================================================
-- Notifications moved from Telegram to email (Resend). Email is already
-- populated by the on_auth_user_created trigger from auth.users.email,
-- so existing rows should have it; this migration enforces the contract.
-- Safe to run multiple times.
-- ============================================================

-- 1. Refuse to migrate if any user row is missing email — would break the recap
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.users WHERE email IS NULL) THEN
    RAISE EXCEPTION 'Cannot enforce users.email NOT NULL: rows with NULL email exist. Backfill them first.';
  END IF;
END $$;

-- 2. Make email required at the schema level
ALTER TABLE public.users
  ALTER COLUMN email SET NOT NULL;

-- 3. Drop the now-obsolete telegram_chat_id column
ALTER TABLE public.users
  DROP COLUMN IF EXISTS telegram_chat_id;
