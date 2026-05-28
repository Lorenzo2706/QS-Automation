import type { SearchConfig } from "./supabase.js";
import { buildLinkedInUrl as buildLinkedInUrlShared } from "../../../shared/linkedin/buildUrl.js";

export function buildLinkedInUrl(config: SearchConfig): string {
  return buildLinkedInUrlShared({
    keywords: config.keywords,
    job_types: config.job_types,
    geo_id: config.geo_id,
    date_posted: config.date_posted,
    sort_by: config.sort_by,
  });
}
