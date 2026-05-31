-- ============================================================
-- Migration 007: store the Trigger.dev run id, drop the cached run status
--   The dashboard used to read a cached last_run_status / last_run_at that the
--   backend wrote (running → success/failed). If the orchestrator threw after
--   the "running" write (e.g. recap send failure) or was hard-killed, the row
--   stayed "running" forever and the dashboard showed a permanently stuck run.
--
--   Trigger.dev is now the single source of truth: we keep only the run id, and
--   the dashboard derives the live status via runs.retrieve(). This makes status
--   drift structurally impossible. No client policies needed — the web app reads
--   last_run_id under the existing owner RLS; the backend writes it (service role).
-- ============================================================

ALTER TABLE public.pipeline_schedules ADD COLUMN IF NOT EXISTS last_run_id TEXT;
ALTER TABLE public.pipeline_schedules DROP COLUMN IF EXISTS last_run_status;
ALTER TABLE public.pipeline_schedules DROP COLUMN IF EXISTS last_run_at;
