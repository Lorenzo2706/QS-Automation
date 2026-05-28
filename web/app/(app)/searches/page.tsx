import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  toggleSearchConfigAction,
  deleteSearchConfigAction,
} from "@/lib/actions/search-config";

interface SearchConfigRow {
  id: string;
  name: string | null;
  keywords: string;
  job_types: string[];
  geo_id: string;
  date_posted: string | null;
  sort_by: string;
  linkedin_url: string;
  active: boolean;
}

export default async function SearchesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("search_configs")
    .select("id, name, keywords, job_types, geo_id, date_posted, sort_by, linkedin_url, active")
    .eq("user_id", user.id)
    .order("active", { ascending: false });

  const configs = (data ?? []) as SearchConfigRow[];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-brand-ink">Searches</h1>
          <p className="text-sm text-brand-ink-500">
            One row per LinkedIn search. The daily run uses your active searches.
          </p>
        </div>
        <Link href="/searches/new">
          <Button>+ New search</Button>
        </Link>
      </div>

      {error ? (
        <Card>
          <CardBody>
            <p className="text-sm text-red-600">Failed to load searches: {error.message}</p>
          </CardBody>
        </Card>
      ) : null}

      {configs.length === 0 ? (
        <Card>
          <CardBody className="py-12 text-center">
            <p className="text-sm text-brand-ink-500">
              You don&apos;t have any searches yet. Add one to start getting matches.
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {configs.map((config) => (
            <Card key={config.id}>
              <CardHeader className="flex flex-col gap-1">
                <div className="flex items-start justify-between gap-3">
                  <CardTitle>{config.name ?? "(unnamed search)"}</CardTitle>
                  <span
                    className={
                      config.active
                        ? "rounded-full bg-brand-orange-50 px-2 py-0.5 text-xs font-medium text-brand-orange-700"
                        : "rounded-full bg-brand-ink-100 px-2 py-0.5 text-xs font-medium text-brand-ink-500"
                    }
                  >
                    {config.active ? "Active" : "Paused"}
                  </span>
                </div>
                <CardSubtitle className="break-words">{config.keywords}</CardSubtitle>
              </CardHeader>
              <CardBody className="flex flex-col gap-3">
                <dl className="grid grid-cols-2 gap-y-1.5 gap-x-4 text-xs text-brand-ink-600 sm:grid-cols-4">
                  <div>
                    <dt className="text-brand-ink-400">geoId</dt>
                    <dd className="font-mono">{config.geo_id}</dd>
                  </div>
                  <div>
                    <dt className="text-brand-ink-400">Sort</dt>
                    <dd>{config.sort_by === "DD" ? "Most recent" : "Most relevant"}</dd>
                  </div>
                  <div>
                    <dt className="text-brand-ink-400">Posted</dt>
                    <dd>{config.date_posted ?? "Any time"}</dd>
                  </div>
                  <div>
                    <dt className="text-brand-ink-400">Types</dt>
                    <dd>{config.job_types.length > 0 ? config.job_types.join(", ") : "All"}</dd>
                  </div>
                </dl>
                <a
                  href={config.linkedin_url}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all text-xs text-brand-orange hover:underline"
                >
                  {config.linkedin_url}
                </a>
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/searches/${config.id}`}>
                    <Button size="sm" variant="secondary">
                      Edit
                    </Button>
                  </Link>
                  <form
                    action={async () => {
                      "use server";
                      await toggleSearchConfigAction(config.id, !config.active);
                    }}
                  >
                    <Button size="sm" variant="ghost" type="submit">
                      {config.active ? "Pause" : "Activate"}
                    </Button>
                  </form>
                  <form
                    action={async () => {
                      "use server";
                      await deleteSearchConfigAction(config.id);
                    }}
                  >
                    <Button size="sm" variant="danger" type="submit">
                      Delete
                    </Button>
                  </form>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
