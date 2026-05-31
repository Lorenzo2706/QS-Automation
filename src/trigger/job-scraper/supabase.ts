import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface JobRow {
  user_id: string;
  job_id: string;
  title: string | null;
  standardized_title: string | null;
  job_type: string | null;
  company_name: string | null;
  company_details: Record<string, unknown> | null;
  location: string | null;
  url: string | null;
  description_text: string | null;
  posted_at: string | null;
  posting_date_adj: string | null;
  industry: string | null;
  job_function: string | null;
  seniority: string | null;
  job_poster_title: string | null;
  apply_url: string | null;
  language: string | null;
  scraped_at: string;
  needs_evaluation: boolean;
}

export interface SearchConfig {
  id: string;
  user_id: string;
  name: string | null;
  keywords: string;
  job_types: string[];
  geo_id: string;
  split_country: string | null;
  date_posted: string | null;
  sort_by: string;
  linkedin_url: string;
  active: boolean;
}

export type NewSearchConfig = Omit<SearchConfig, "id" | "active"> & {
  active?: boolean;
};

export interface UserRow {
  user_id: string;
  name: string;
  email: string;
  notification_threshold: number;
  active: boolean;
}

export interface ResumeRow {
  resume_id: string;
  user_id: string;
  filename: string | null;
  parsed_text: string;
  is_active: boolean;
}

export interface JobScoreRow {
  user_id: string;
  resume_id: string;
  job_id: string;
  relevance_score: number;
  relevance_reason: string | null;
}

// ─── Client ───────────────────────────────────────────────────────────────────

function getClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(url, key, { auth: { persistSession: false } });
}

// ─── Search configs ───────────────────────────────────────────────────────────

export async function getActiveSearchConfigsForUser(
  userId: string
): Promise<SearchConfig[]> {
  const db = getClient();
  const { data, error } = await db
    .from("search_configs")
    .select("*")
    .eq("user_id", userId)
    .eq("active", true);
  if (error) throw new Error(`getActiveSearchConfigsForUser: ${error.message}`);
  return (data ?? []) as SearchConfig[];
}

export async function insertSearchConfig(
  config: NewSearchConfig
): Promise<SearchConfig> {
  const db = getClient();
  const { data, error } = await db
    .from("search_configs")
    .insert({
      user_id: config.user_id,
      name: config.name,
      keywords: config.keywords,
      job_types: config.job_types,
      geo_id: config.geo_id,
      date_posted: config.date_posted,
      sort_by: config.sort_by,
      split_country: config.split_country,
      linkedin_url: config.linkedin_url,
      active: config.active ?? true,
    })
    .select("*")
    .single();
  if (error) throw new Error(`insertSearchConfig: ${error.message}`);
  return data as SearchConfig;
}

// ─── Raw jobs ─────────────────────────────────────────────────────────────────

// Inserts a batch of scraped jobs (all carrying the same user_id), ignoring any
// (user_id, job_id) pair that already exists in jobs_raw. Returns the job_ids
// that were actually inserted — those are the rows carrying needs_evaluation=true
// and eligible for a Gemini filter call. Existing rows are left untouched (their
// needs_evaluation flag keeps whatever value it had from the prior run).
export async function insertNewRawJobs(jobs: JobRow[]): Promise<string[]> {
  if (jobs.length === 0) return [];
  const db = getClient();
  const { data, error } = await db
    .from("jobs_raw")
    .upsert(jobs, { onConflict: "user_id,job_id", ignoreDuplicates: true })
    .select("job_id");
  if (error) throw new Error(`insertNewRawJobs: ${error.message}`);
  return (data ?? []).map((row: { job_id: string }) => row.job_id);
}

export async function getRawJob(userId: string, jobId: string): Promise<JobRow | null> {
  const db = getClient();
  const { data, error } = await db
    .from("jobs_raw")
    .select("*")
    .eq("user_id", userId)
    .eq("job_id", jobId)
    .single();
  if (error && error.code !== "PGRST116") throw new Error(`getRawJob: ${error.message}`);
  return (data ?? null) as JobRow | null;
}

export async function markJobEvaluated(userId: string, jobId: string): Promise<void> {
  const db = getClient();
  const { error } = await db
    .from("jobs_raw")
    .update({ needs_evaluation: false })
    .eq("user_id", userId)
    .eq("job_id", jobId);
  if (error) throw new Error(`markJobEvaluated ${jobId}: ${error.message}`);
}

// ─── Filtered jobs ────────────────────────────────────────────────────────────

export async function jobFilteredExists(userId: string, jobId: string): Promise<boolean> {
  const db = getClient();
  const { count, error } = await db
    .from("jobs_filtered")
    .select("job_id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("job_id", jobId);
  if (error) throw new Error(`jobFilteredExists: ${error.message}`);
  return (count ?? 0) > 0;
}

export async function insertFilteredJob(
  userId: string,
  jobId: string,
  jobType: "freelance" | "temporary"
): Promise<void> {
  const db = getClient();
  const raw = await getRawJob(userId, jobId);
  if (!raw) throw new Error(`insertFilteredJob: raw job not found: ${jobId}`);
  // Copy jobs_raw row into jobs_filtered, overwriting job_type with Gemini's
  // classification and dropping the needs_evaluation flag (only belongs on raw).
  // user_id is preserved so the filtered row stays scoped to this user.
  const { scraped_at, needs_evaluation: _flag, ...rest } = raw;
  const row = { ...rest, job_type: jobType, scraped_at };
  const { error } = await db
    .from("jobs_filtered")
    .upsert(row, { onConflict: "user_id,job_id" });
  if (error) throw new Error(`insertFilteredJob: ${error.message}`);
}

export async function getFilteredJob(userId: string, jobId: string): Promise<JobRow | null> {
  const db = getClient();
  const { data, error } = await db
    .from("jobs_filtered")
    .select("*")
    .eq("user_id", userId)
    .eq("job_id", jobId)
    .single();
  if (error && error.code !== "PGRST116") throw new Error(`getFilteredJob: ${error.message}`);
  return (data ?? null) as JobRow | null;
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function getActiveUsers(): Promise<UserRow[]> {
  const db = getClient();
  const { data, error } = await db
    .from("users")
    .select("*")
    .eq("active", true);
  if (error) throw new Error(`getActiveUsers: ${error.message}`);
  return (data ?? []) as UserRow[];
}

export async function getUser(userId: string): Promise<UserRow | null> {
  const db = getClient();
  const { data, error } = await db
    .from("users")
    .select("*")
    .eq("user_id", userId)
    .single();
  if (error && error.code !== "PGRST116") throw new Error(`getUser: ${error.message}`);
  return (data ?? null) as UserRow | null;
}

// ─── Resumes ──────────────────────────────────────────────────────────────────

export async function getActiveResume(userId: string): Promise<ResumeRow | null> {
  const db = getClient();
  const { data, error } = await db
    .from("resumes")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .single();
  if (error && error.code !== "PGRST116") throw new Error(`getActiveResume: ${error.message}`);
  return (data ?? null) as ResumeRow | null;
}

// ─── Job scores ───────────────────────────────────────────────────────────────

export async function upsertJobScore(score: JobScoreRow): Promise<void> {
  const db = getClient();
  const { error } = await db
    .from("job_scores")
    .upsert(score, { onConflict: "user_id,job_id" });
  if (error) throw new Error(`upsertJobScore: ${error.message}`);
}

export async function jobScoreExists(userId: string, jobId: string): Promise<boolean> {
  const db = getClient();
  const { count, error } = await db
    .from("job_scores")
    .select("job_id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("job_id", jobId);
  if (error) throw new Error(`jobScoreExists: ${error.message}`);
  return (count ?? 0) > 0;
}

// Returns job_ids of new shortlisted matches not yet emailed (notified=false,
// score>=threshold). The count of these IDs is "new shortlisted jobs from this
// run", since classify-job only writes a score row for genuinely new jobs.
export async function getUnnotifiedMatchIds(
  userId: string,
  threshold: number
): Promise<string[]> {
  const db = getClient();
  const { data, error } = await db
    .from("job_scores")
    .select("job_id")
    .eq("user_id", userId)
    .eq("notified", false)
    .gte("relevance_score", threshold);
  if (error) throw new Error(`getUnnotifiedMatchIds: ${error.message}`);
  return ((data ?? []) as Array<{ job_id: string }>).map((r) => r.job_id);
}

export async function markScoresNotified(userId: string, jobIds: string[]): Promise<void> {
  if (jobIds.length === 0) return;
  const db = getClient();
  const { error } = await db
    .from("job_scores")
    .update({ notified: true })
    .eq("user_id", userId)
    .in("job_id", jobIds);
  if (error) throw new Error(`markScoresNotified: ${error.message}`);
}

// ─── Pipeline run id ─────────────────────────────────────────────────────────

// Records the latest Trigger.dev run id on the user's pipeline_schedules row.
// The dashboard derives the run status live from this id (runs.retrieve), so we
// never cache a status that could get stuck. Upserts so it works whether or not
// the user has configured a schedule, and only touches last_run_id.
export async function recordLastRunId(userId: string, runId: string): Promise<void> {
  const db = getClient();
  const { error } = await db
    .from("pipeline_schedules")
    .upsert(
      {
        user_id: userId,
        last_run_id: runId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
  if (error) throw new Error(`recordLastRunId: ${error.message}`);
}
