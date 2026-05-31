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
      <div className="flex items-center justify-end gap-2">
        <label htmlFor="job-sort" className="text-sm text-brand-ink-500">
          Sort by
        </label>
        <Select
          id="job-sort"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="h-9 w-52"
        >
          <option value="score">Relevance (score)</option>
          <option value="date">Date posted (newest)</option>
        </Select>
      </div>

      {sorted.map((job) => (
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
            <p className="text-xs text-brand-ink-500">{formatPostedDate(job.postedAt)}</p>
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
  );
}
