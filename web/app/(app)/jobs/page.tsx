import { createClient } from "@/lib/supabase/server";
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from "@/components/ui/card";
import { JobReasonToggle } from "@/components/jobs/JobReasonToggle";

interface ScoreRow {
  job_id: string;
  relevance_score: number;
  relevance_reason: string | null;
}

interface FilteredRow {
  job_id: string;
  title: string | null;
  company_name: string | null;
  location: string | null;
  url: string | null;
  apply_url: string | null;
}

const DEFAULT_THRESHOLD = 85;

export default async function JobsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("notification_threshold")
    .eq("user_id", user.id)
    .maybeSingle();
  const threshold = profile?.notification_threshold ?? DEFAULT_THRESHOLD;

  // Scores are owner-readable via RLS. Inclusive filter: score >= threshold.
  const { data: scoreData, error: scoreError } = await supabase
    .from("job_scores")
    .select("job_id, relevance_score, relevance_reason")
    .gte("relevance_score", threshold)
    .order("relevance_score", { ascending: false });

  const scores = (scoreData ?? []) as ScoreRow[];

  // job_scores has no FK to jobs_filtered, so fetch details separately and merge
  // by job_id (both RLS-scoped to this user).
  let details = new Map<string, FilteredRow>();
  let detailError: string | null = null;
  if (scores.length > 0) {
    const { data: filteredData, error: filteredError } = await supabase
      .from("jobs_filtered")
      .select("job_id, title, company_name, location, url, apply_url")
      .in(
        "job_id",
        scores.map((s) => s.job_id)
      );
    detailError = filteredError?.message ?? null;
    details = new Map(((filteredData ?? []) as FilteredRow[]).map((d) => [d.job_id, d]));
  }

  const error = scoreError?.message ?? detailError;

  // Preserve the score-desc order from the scores query.
  const jobs = scores.map((s) => {
    const d = details.get(s.job_id);
    return {
      job_id: s.job_id,
      score: s.relevance_score,
      reason: s.relevance_reason,
      title: d?.title ?? "(untitled job)",
      company: d?.company_name ?? "Unknown company",
      location: d?.location ?? null,
      linkedinUrl: d?.url ?? `https://www.linkedin.com/jobs/view/${s.job_id}`,
      applyUrl: d?.apply_url ?? null,
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-brand-ink">Jobs</h1>
        <p className="text-sm text-brand-ink-500">
          Matches scored at or above your threshold of {threshold}, highest first.
        </p>
      </div>

      {error ? (
        <Card>
          <CardBody>
            <p className="text-sm text-red-600">Failed to load jobs: {error}</p>
          </CardBody>
        </Card>
      ) : null}

      {jobs.length === 0 ? (
        <Card>
          <CardBody className="py-12 text-center">
            <p className="text-sm text-brand-ink-500">
              No matches above your threshold yet. New matches appear here after a run.
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {jobs.map((job) => (
            <Card key={job.job_id}>
              <CardHeader className="flex flex-col gap-1">
                <div className="flex items-start justify-between gap-3">
                  <CardTitle>{job.title}</CardTitle>
                  <span className="shrink-0 rounded-full bg-brand-orange-50 px-2 py-0.5 text-xs font-medium text-brand-orange-700">
                    Score {job.score}
                  </span>
                </div>
                <CardSubtitle>
                  {job.company}
                  {job.location ? ` · ${job.location}` : ""}
                </CardSubtitle>
              </CardHeader>
              <CardBody className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5 text-sm">
                  <a
                    href={job.linkedinUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand-orange hover:underline"
                  >
                    View on LinkedIn
                  </a>
                  {job.applyUrl ? (
                    <a
                      href={job.applyUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-brand-orange hover:underline"
                    >
                      Apply directly
                    </a>
                  ) : (
                    <span className="text-brand-ink-400">No direct link available</span>
                  )}
                </div>
                {job.reason ? <JobReasonToggle reason={job.reason} /> : null}
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
