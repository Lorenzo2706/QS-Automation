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
export function buildLinkedInUrl(config: SearchConfig): string {
  const base = "https://www.linkedin.com/jobs/search/";
  const params = new URLSearchParams();

  params.set("keywords", config.keywords);
  params.set("geoId", config.geo_id);
  params.set("sortBy", config.sort_by);

  if (config.job_types.length > 0) {
    // LinkedIn expects comma-separated values, e.g. f_JT=C,T
    params.set("f_JT", config.job_types.join(","));
  }

  if (config.date_posted) {
    params.set("f_TPR", config.date_posted);
  }

  return `${base}?${params.toString()}`;
}
