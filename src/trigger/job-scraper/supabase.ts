import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface JobRow {
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
  email: string | null;
  telegram_chat_id: string | null;
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
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL or SUPABASE_ANON_KEY is not set");
  return createClient(url, key);
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

export async function upsertRawJob(job: JobRow): Promise<void> {
  const db = getClient();
  const { error } = await db
    .from("jobs_raw")
    .upsert(job, { onConflict: "job_id" });
  if (error) throw new Error(`upsertRawJob ${job.job_id}: ${error.message}`);
}

export async function getRawJob(jobId: string): Promise<JobRow | null> {
  const db = getClient();
  const { data, error } = await db
    .from("jobs_raw")
    .select("*")
    .eq("job_id", jobId)
    .single();
  if (error && error.code !== "PGRST116") throw new Error(`getRawJob: ${error.message}`);
  return (data ?? null) as JobRow | null;
}

// ─── Filtered jobs ────────────────────────────────────────────────────────────

export async function jobFilteredExists(jobId: string): Promise<boolean> {
  const db = getClient();
  const { count, error } = await db
    .from("jobs_filtered")
    .select("job_id", { count: "exact", head: true })
    .eq("job_id", jobId);
  if (error) throw new Error(`jobFilteredExists: ${error.message}`);
  return (count ?? 0) > 0;
}

export async function insertFilteredJob(jobId: string): Promise<void> {
  const db = getClient();
  const raw = await getRawJob(jobId);
  if (!raw) throw new Error(`insertFilteredJob: raw job not found: ${jobId}`);
  // Copy row to jobs_filtered; DB sets filtered_at = NOW() via DEFAULT
  const { scraped_at: _scraped, ...rest } = raw;
  const { error } = await db
    .from("jobs_filtered")
    .upsert({ ...rest, scraped_at: _scraped }, { onConflict: "job_id" });
  if (error) throw new Error(`insertFilteredJob: ${error.message}`);
}

export async function getFilteredJob(jobId: string): Promise<JobRow | null> {
  const db = getClient();
  const { data, error } = await db
    .from("jobs_filtered")
    .select("*")
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

export async function markScoreNotified(userId: string, jobId: string): Promise<void> {
  const db = getClient();
  const { error } = await db
    .from("job_scores")
    .update({ notified: true })
    .eq("user_id", userId)
    .eq("job_id", jobId);
  if (error) throw new Error(`markScoreNotified: ${error.message}`);
}
