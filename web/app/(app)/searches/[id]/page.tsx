import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SearchConfigForm } from "@/components/forms/SearchConfigForm";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditSearchPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("search_configs")
    .select("id, name, keywords, job_types, geo_id, date_posted, sort_by, active")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-brand-ink">Edit search</h1>
        <p className="text-sm text-brand-ink-500">
          Saving rebuilds the LinkedIn URL automatically.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{data.name ?? "(unnamed search)"}</CardTitle>
        </CardHeader>
        <CardBody>
          <SearchConfigForm
            initial={{
              id: data.id,
              name: data.name,
              keywords: data.keywords,
              jobTypes: data.job_types ?? [],
              geoId: data.geo_id,
              datePosted: data.date_posted,
              sortBy: data.sort_by,
              active: data.active,
            }}
          />
        </CardBody>
      </Card>
    </div>
  );
}
