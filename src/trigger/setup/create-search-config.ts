import { task } from "@trigger.dev/sdk/v3";
import {
  getUser,
  insertSearchConfig,
  type SearchConfig,
} from "../job-scraper/supabase.js";
import { buildLinkedInUrl } from "../job-scraper/url-builder.js";

/**
 * One-time setup task: creates a new search config for a user.
 *
 * Must be run after register-user. Every user needs at least one active
 * search config before scrape-jobs will fetch jobs for them.
 *
 * Trigger from the Trigger.dev dashboard with a payload like:
 * {
 *   "userId": "uuid-from-register-user-task",
 *   "name": "NL Freelance/Contract",
 *   "keywords": "freelance OR contractor OR consultant",
 *   "jobTypes": ["CONTRACT", "TEMPORARY"],
 *   "geoId": "102890719",
 *   "datePosted": "past-month",
 *   "sortBy": "DD",
 *   "splitCountry": null,
 *   "active": true
 * }
 *
 * geoId references:
 *   Netherlands: 102890719
 *   Belgium:     100565514
 *   Germany:     101282230
 *
 * jobTypes: CONTRACT, TEMPORARY, FULLTIME, PARTTIME, INTERNSHIP, VOLUNTEER, OTHER
 * datePosted: past-day, past-week, past-month, or null for any time
 * sortBy: DD (most recent) or R (most relevant)
 */
export const createSearchConfigTask = task({
  id: "create-search-config",
  run: async (payload: {
    userId: string;
    name?: string;
    keywords: string;
    jobTypes?: string[];
    geoId: string;
    datePosted?: string | null;
    sortBy?: string;
    splitCountry?: string | null;
    active?: boolean;
  }) => {
    const {
      userId,
      name,
      keywords,
      jobTypes = [],
      geoId,
      datePosted = null,
      sortBy = "DD",
      splitCountry = null,
      active = true,
    } = payload;

    if (!userId?.trim()) throw new Error("userId is required");
    if (!keywords?.trim()) throw new Error("keywords is required");
    if (!geoId?.trim()) throw new Error("geoId is required");

    const user = await getUser(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}. Run register-user first.`);
    }

    // Build the LinkedIn URL from params and persist it alongside the config
    const configForUrl: SearchConfig = {
      id: "",
      user_id: userId,
      name: name ?? null,
      keywords,
      job_types: jobTypes,
      geo_id: geoId,
      date_posted: datePosted,
      sort_by: sortBy,
      split_country: splitCountry,
      linkedin_url: "",
      active,
    };
    const linkedinUrl = buildLinkedInUrl(configForUrl);

    const inserted = await insertSearchConfig({
      user_id: userId,
      name: name ?? null,
      keywords,
      job_types: jobTypes,
      geo_id: geoId,
      date_posted: datePosted,
      sort_by: sortBy,
      split_country: splitCountry,
      linkedin_url: linkedinUrl,
      active,
    });

    console.log(`Search config created for ${user.name}:`);
    console.log(`  config_id: ${inserted.id}`);
    console.log(`  name: ${inserted.name ?? "(unnamed)"}`);
    console.log(`  linkedin_url: ${inserted.linkedin_url}`);

    return {
      configId: inserted.id,
      userId: inserted.user_id,
      name: inserted.name,
      linkedinUrl: inserted.linkedin_url,
      active: inserted.active,
    };
  },
});
