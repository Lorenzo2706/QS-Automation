import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: resume }, { count: searchCount }] = await Promise.all([
    supabase
      .from("users")
      .select("name, notification_threshold")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("resumes")
      .select("filename, parsed_text")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("search_configs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("active", true),
  ]);

  const displayName = profile?.name ?? user.email ?? "there";
  const threshold = profile?.notification_threshold ?? 85;
  const activeSearches = searchCount ?? 0;
  const ready = !!resume && activeSearches > 0;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold text-brand-ink">Welcome, {displayName}</h1>
        <p className="text-sm text-brand-ink-500">
          {ready
            ? `You're set up. Your daily recap runs at 09:30 Europe/Amsterdam.`
            : `Finish the steps below to start receiving your daily recap.`}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Resume</CardTitle>
            <CardSubtitle>
              {resume
                ? `Active: ${resume.filename ?? "(unnamed)"} · ${resume.parsed_text.length.toLocaleString()} chars`
                : "No active resume yet"}
            </CardSubtitle>
          </CardHeader>
          <CardBody>
            <Link href="/resume">
              <Button variant={resume ? "secondary" : "primary"}>
                {resume ? "Replace resume" : "Upload resume"}
              </Button>
            </Link>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Searches</CardTitle>
            <CardSubtitle>
              {activeSearches > 0
                ? `${activeSearches} active LinkedIn search${activeSearches === 1 ? "" : "es"}`
                : "No active searches yet"}
            </CardSubtitle>
          </CardHeader>
          <CardBody>
            <Link href="/searches">
              <Button variant={activeSearches > 0 ? "secondary" : "primary"}>
                {activeSearches > 0 ? "Manage searches" : "Add a search"}
              </Button>
            </Link>
          </CardBody>
        </Card>

        <Card className="sm:col-span-2">
          <CardHeader>
            <CardTitle>Notification threshold</CardTitle>
            <CardSubtitle>
              Currently {threshold}/100. Only matches at or above this score email you.
            </CardSubtitle>
          </CardHeader>
          <CardBody>
            <Link href="/settings">
              <Button variant="secondary">Adjust in settings</Button>
            </Link>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
