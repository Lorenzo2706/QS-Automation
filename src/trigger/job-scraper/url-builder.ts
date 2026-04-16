import type { SearchConfig } from "./supabase.js";

/**
 * LinkedIn job type codes:
 *   F = Full-time
 *   P = Part-time
 *   C = Contract
 *   T = Temporary
 *   I = Internship
 *   V = Volunteer
 *   O = Other
 *
 * LinkedIn date posted codes (f_TPR):
 *   r86400   = Past 24 hours
 *   r604800  = Past week
 *   r2592000 = Past month
 *   (omit)   = Any time
 *
 * Sort order (sortBy):
 *   R  = Most relevant
 *   DD = Most recent
 */
// Map full names (stored in DB) → LinkedIn single-letter codes
const JOB_TYPE_CODES: Record<string, string> = {
  CONTRACT: "C",
  TEMPORARY: "T",
  FULLTIME: "F",
  "FULL-TIME": "F",
  PARTTIME: "P",
  "PART-TIME": "P",
  INTERNSHIP: "I",
  VOLUNTEER: "V",
  OTHER: "O",
};

// Map human-readable values (stored in DB) → LinkedIn f_TPR codes
const DATE_POSTED_CODES: Record<string, string> = {
  "past-day": "r86400",
  "past-week": "r604800",
  "past-month": "r2592000",
};

export function buildLinkedInUrl(config: SearchConfig): string {
  const base = "https://www.linkedin.com/jobs/search/";
  const params = new URLSearchParams();

  params.set("keywords", config.keywords);
  params.set("geoId", config.geo_id);
  params.set("sortBy", config.sort_by);

  if (config.job_types.length > 0) {
    // Map to single-letter codes; fall back to value as-is if already a code
    const codes = config.job_types.map(
      (t) => JOB_TYPE_CODES[t.toUpperCase()] ?? t
    );
    params.set("f_JT", codes.join(","));
  }

  if (config.date_posted) {
    params.set("f_TPR", DATE_POSTED_CODES[config.date_posted] ?? config.date_posted);
  }

  return `${base}?${params.toString()}`;
}
