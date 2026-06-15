"use client";

import { useMemo, useState } from "react";
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { JobReasonToggle } from "@/components/jobs/JobReasonToggle";

export interface Job {
  job_id: string;
  score: number;
  reason: string | null;
  title: string;
  company: string;
  location: string | null;
  linkedinUrl: string;
  applyUrl: string | null;
  postedAt: string | null;
}

type SortKey = "score" | "date";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

function formatPostedDate(postedAt: string | null): string {
  if (!postedAt) return "Posted date unknown";
  const date = new Date(postedAt);
  if (Number.isNaN(date.getTime())) return "Posted date unknown";
  return `Posted ${dateFormatter.format(date)}`;
}

// Button-like anchor classes mirroring components/ui/button.tsx, sized for ≥44px tap targets.
const actionBase =
  "inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white";
const actionPrimary =
  "bg-brand-orange text-white hover:bg-brand-orange-600 focus-visible:ring-brand-orange-500";
const actionSecondary =
  "border border-brand-ink-200 bg-white text-brand-ink hover:bg-brand-ink-50 focus-visible:ring-brand-ink-300";

export function JobsList({ jobs }: { jobs: Job[] }) {
  const [sort, setSort] = useState<SortKey>("score");

  const sorted = useMemo(() => {
    const copy = [...jobs];
    if (sort === "date") {
      // ISO 8601 strings compare chronologically as text; null sorts last.
      copy.sort((a, b) => (b.postedAt ?? "").localeCompare(a.postedAt ?? ""));
    } else {
      copy.sort((a, b) => b.score - a.score);
    }
    return copy;
  }, [jobs, sort]);

  return (
    <div className="flex flex-col gap-4">
      <div className="sticky top-0 z-10 -mx-4 flex items-center justify-between gap-3 border-b border-brand-ink-100 bg-brand-ink-50/95 px-4 py-2 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        <span className="text-sm font-medium text-brand-ink-600">
          {sorted.length} {sorted.length === 1 ? "job" : "jobs"}
        </span>
        <div className="flex items-center gap-2">
          <label htmlFor="job-sort" className="hidden text-sm text-brand-ink-500 sm:block">
            Sort by
          </label>
          <Select
            id="job-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="h-9 w-full max-w-[12rem]"
            aria-label="Sort jobs"
          >
            <option value="score">Relevance (score)</option>
            <option value="date">Date posted (newest)</option>
          </Select>
        </div>
      </div>

      {sorted.map((job) => (
        <Card key={job.job_id}>
          <CardHeader className="flex flex-col gap-1 px-4 py-4 sm:px-6">
            <div className="flex items-start justify-between gap-3">
              <CardTitle className="text-base sm:text-lg">{job.title}</CardTitle>
              <span className="shrink-0 rounded-full bg-brand-orange-50 px-2 py-0.5 text-xs font-medium text-brand-orange-700">
                Score {job.score}
              </span>
            </div>
            <CardSubtitle>
              {job.company}
              {job.location ? ` · ${job.location}` : ""}
            </CardSubtitle>
            <p className="text-xs text-brand-ink-500">{formatPostedDate(job.postedAt)}</p>
          </CardHeader>
          <CardBody className="flex flex-col gap-3 px-4 py-4 sm:px-6">
            <div className="flex flex-wrap gap-2">
              <a
                href={job.linkedinUrl}
                target="_blank"
                rel="noreferrer"
                className={`${actionBase} ${actionSecondary}`}
              >
                View on LinkedIn
              </a>
              {job.applyUrl ? (
                <a
                  href={job.applyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={`${actionBase} ${actionPrimary}`}
                >
                  Apply directly
                </a>
              ) : (
                <span className="inline-flex min-h-11 flex-1 items-center justify-center px-4 text-sm text-brand-ink-400">
                  No direct link available
                </span>
              )}
            </div>
            {job.reason ? <JobReasonToggle reason={job.reason} /> : null}
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
