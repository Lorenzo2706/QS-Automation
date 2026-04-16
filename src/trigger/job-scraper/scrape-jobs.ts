import { schedules, wait } from "@trigger.dev/sdk/v3";
import { getActiveSearchConfigs, upsertRawJob } from "./supabase.js";
import { buildLinkedInUrl } from "./url-builder.js";
import { filterJobTask } from "./filter-job.js";

// Shape of what the Apify LinkedIn Jobs actor returns.
// Field names may vary — we handle both camelCase variants defensively.
interface ApifyJob {
  id?: string;
  jobId?: string;
  title?: string;
  normalizedTitle?: string;
  standardizedTitle?: string;
  jobType?: string;
  employmentType?: string;
  companyName?: string;
  company?: string;
  companyDetails?: Record<string, unknown>;
  location?: string;
  jobUrl?: string;
  url?: string;
  descriptionText?: string;
  description?: string;
  postedAt?: string;
  postingDateAdj?: string;
  industry?: string;
  jobFunction?: string;
  seniority?: string;
  jobPosterTitle?: string;
  applyUrl?: string;
  language?: string;
}

interface ApifyRunResponse {
  data: { id: string };
}

interface ApifyStatusResponse {
  data: { status: string };
}

export const scrapeJobsTask = schedules.task({
  id: "scrape-jobs",
  // Runs daily at 9:00 AM Amsterdam time
  cron: { pattern: "0 9 * * *", timezone: "Europe/Amsterdam" },
  // Allow up to 30 minutes — Apify runs can be slow
  maxDuration: 1800,
  run: async () => {
    const apifyToken = process.env.APIFY_API_TOKEN;
    if (!apifyToken) throw new Error("APIFY_API_TOKEN is not set");

    // 1. Load active search configurations from Supabase
    const configs = await getActiveSearchConfigs();
    if (configs.length === 0) {
      console.log("No active search configs — skipping run");
      return { jobsScraped: 0, jobsTriggered: 0 };
    }

    const splitCountry = configs[0].split_country;
    const urls = configs.map((c) => buildLinkedInUrl(c));
    console.log(`Starting Apify run with ${urls.length} search URL(s):`);
    urls.forEach((u) => console.log(" →", u));

    // 2. Start the Apify actor run
    const startResponse = await fetch(
      "https://api.apify.com/v2/acts/hKByXkMQaC5Qt9UMN/runs",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apifyToken}`,
        },
        body: JSON.stringify({
            count: 100,
            scrapeCompany: true,
            splitByLocation: false,
            splitCountry,
            urls,
          }),
      }
    );

    if (!startResponse.ok) {
      const body = await startResponse.text();
      throw new Error(`Apify start failed: ${startResponse.status} — ${body}`);
    }

    const startData = (await startResponse.json()) as ApifyRunResponse;
    const runId = startData.data.id;
    console.log(`Apify run started: ${runId}`);

    // 3. Poll until SUCCEEDED (max 40 × 30s = 20 minutes)
    let attempts = 0;
    while (attempts < 40) {
      await wait.for({ seconds: 30 });

      const statusResponse = await fetch(
        `https://api.apify.com/v2/actor-runs/${runId}`,
        { headers: { Authorization: `Bearer ${apifyToken}` } }
      );
      const statusData = (await statusResponse.json()) as ApifyStatusResponse;
      const status = statusData.data.status;

      console.log(`Apify status: ${status} (attempt ${attempts + 1}/40)`);

      if (status === "SUCCEEDED") break;
      if (["FAILED", "ABORTED", "TIMED-OUT"].includes(status)) {
        throw new Error(`Apify run ended with status: ${status}`);
      }

      attempts++;
      if (attempts >= 40) {
        throw new Error("Apify polling timed out after 20 minutes");
      }
    }

    // 4. Fetch results from Apify dataset
    const itemsResponse = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}/dataset/items`,
      { headers: { Authorization: `Bearer ${apifyToken}` } }
    );

    if (!itemsResponse.ok) {
      const body = await itemsResponse.text();
      throw new Error(`Failed to fetch Apify dataset: ${itemsResponse.status} — ${body}`);
    }

    const jobs = (await itemsResponse.json()) as ApifyJob[];
    console.log(`Fetched ${jobs.length} jobs from Apify`);

    // 5. Upsert every job into jobs_raw
    const now = new Date().toISOString();
    const validJobs: ApifyJob[] = [];

    for (const job of jobs) {
      const jobId = job.id ?? job.jobId;
      if (!jobId) {
        console.warn(`Job missing ID, skipping: "${job.title}"`);
        continue;
      }

      await upsertRawJob({
        job_id: jobId,
        title: job.title ?? null,
        standardized_title: job.normalizedTitle ?? job.standardizedTitle ?? null,
        job_type: job.jobType ?? job.employmentType ?? null,
        company_name: job.companyName ?? job.company ?? null,
        company_details: job.companyDetails ?? null,
        location: job.location ?? null,
        url: job.jobUrl ?? job.url ?? null,
        description_text: job.descriptionText ?? job.description ?? null,
        posted_at: job.postedAt ?? null,
        posting_date_adj: job.postingDateAdj ?? null,
        industry: job.industry ?? null,
        job_function: job.jobFunction ?? null,
        seniority: job.seniority ?? null,
        job_poster_title: job.jobPosterTitle ?? null,
        apply_url: job.applyUrl ?? null,
        language: job.language ?? null,
        scraped_at: now,
      });

      validJobs.push(job);
    }

    console.log(`Stored ${validJobs.length} jobs in jobs_raw`);

    // 6. Batch-trigger filter-job for every job (fire-and-forget)
    if (validJobs.length > 0) {
      await filterJobTask.batchTrigger(
        validJobs.map((job) => {
          const jobId = (job.id ?? job.jobId)!;
          return {
            payload: { jobId },
            options: { idempotencyKey: `filter-job-${jobId}` },
          };
        })
      );
    }

    return { jobsScraped: jobs.length, jobsTriggered: validJobs.length, runId };
  },
});
