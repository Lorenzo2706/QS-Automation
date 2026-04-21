import { task, wait } from "@trigger.dev/sdk/v3";
import {
  getActiveSearchConfigsForUser,
  insertNewRawJobs,
  JobRow,
} from "./supabase.js";
import { filterJobTask } from "./filter-job.js";

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

export const scrapeUserJobsTask = task({
  id: "scrape-user-jobs",
  maxDuration: 1800,
  run: async (payload: { userId: string }) => {
    const { userId } = payload;

    const apifyToken = process.env.APIFY_API_TOKEN;
    if (!apifyToken) throw new Error("APIFY_API_TOKEN is not set");

    const configs = await getActiveSearchConfigsForUser(userId);
    if (configs.length === 0) {
      console.log(`User ${userId} has no active search configs — skipping`);
      return { skipped: true, reason: "no_configs", userId };
    }

    // Pick split_country from the first config — it's an actor-level input,
    // not per-URL, so we require user configs to agree on it (or leave null).
    const splitCountry = configs[0].split_country;
    const urls = configs.map((c) => c.linkedin_url);

    console.log(`User ${userId}: starting Apify run with ${urls.length} URL(s)`);
    urls.forEach((u) => console.log(" →", u));

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
    console.log(`User ${userId}: Apify run started: ${runId}`);

    let attempts = 0;
    while (attempts < 40) {
      await wait.for({ seconds: 30 });

      const statusResponse = await fetch(
        `https://api.apify.com/v2/actor-runs/${runId}`,
        { headers: { Authorization: `Bearer ${apifyToken}` } }
      );
      const statusData = (await statusResponse.json()) as ApifyStatusResponse;
      const status = statusData.data.status;

      console.log(`User ${userId}: Apify status ${status} (${attempts + 1}/40)`);

      if (status === "SUCCEEDED") break;
      if (["FAILED", "ABORTED", "TIMED-OUT"].includes(status)) {
        throw new Error(`Apify run ended with status: ${status}`);
      }

      attempts++;
      if (attempts >= 40) {
        throw new Error("Apify polling timed out after 20 minutes");
      }
    }

    const itemsResponse = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}/dataset/items`,
      { headers: { Authorization: `Bearer ${apifyToken}` } }
    );

    if (!itemsResponse.ok) {
      const body = await itemsResponse.text();
      throw new Error(`Failed to fetch Apify dataset: ${itemsResponse.status} — ${body}`);
    }

    const jobs = (await itemsResponse.json()) as ApifyJob[];
    console.log(`User ${userId}: fetched ${jobs.length} jobs from Apify`);

    const now = new Date().toISOString();
    const rows: JobRow[] = [];
    const allJobIds: string[] = [];

    for (const job of jobs) {
      const jobId = job.id ?? job.jobId;
      if (!jobId) {
        console.warn(`Job missing ID, skipping: "${job.title}"`);
        continue;
      }

      rows.push({
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
        needs_evaluation: true,
      });

      allJobIds.push(jobId);
    }

    const newJobIds = await insertNewRawJobs(rows);
    console.log(
      `User ${userId}: scraped ${jobs.length}, new ${newJobIds.length}, triggering filter for ${allJobIds.length}`
    );

    // Trigger filter for every scraped job (new and already-seen). The filter
    // task short-circuits on needs_evaluation=false, so re-scraped jobs don't
    // re-hit Gemini but still reach classify-job for this user.
    if (allJobIds.length > 0) {
      await filterJobTask.batchTrigger(
        allJobIds.map((jobId) => ({
          payload: { jobId, userId },
          options: { idempotencyKey: `filter-job-${jobId}-${userId}` },
        }))
      );
    }

    return {
      userId,
      runId,
      jobsScraped: jobs.length,
      jobsNew: newJobIds.length,
      jobsTriggered: allJobIds.length,
    };
  },
});
