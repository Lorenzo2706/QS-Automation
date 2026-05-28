"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SearchConfigSchema, type SearchConfigInput } from "@/lib/validation";
import { buildLinkedInUrl } from "@shared/linkedin/buildUrl";

export type SearchActionResult = { error: string } | { success: true };

function rawFromForm(formData: FormData): unknown {
  return {
    name: formData.get("name") ?? "",
    keywords: formData.get("keywords") ?? "",
    jobTypes: formData.getAll("jobTypes"),
    geoId: formData.get("geoId") ?? "",
    datePosted: formData.get("datePosted") ?? "",
    sortBy: formData.get("sortBy") ?? "DD",
    active: formData.get("active") === "on" || formData.get("active") === "true",
  };
}

function buildPayload(input: SearchConfigInput, userId: string) {
  return {
    user_id: userId,
    name: input.name,
    keywords: input.keywords,
    job_types: input.jobTypes,
    geo_id: input.geoId,
    date_posted: input.datePosted,
    sort_by: input.sortBy,
    split_country: null,
    linkedin_url: buildLinkedInUrl({
      keywords: input.keywords,
      job_types: input.jobTypes,
      geo_id: input.geoId,
      date_posted: input.datePosted,
      sort_by: input.sortBy,
    }),
    active: input.active,
  };
}

export async function createSearchConfigAction(
  _prev: SearchActionResult | null,
  formData: FormData
): Promise<SearchActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const parsed = SearchConfigSchema.safeParse(rawFromForm(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { error } = await supabase.from("search_configs").insert(buildPayload(parsed.data, user.id));
  if (error) return { error: error.message };

  revalidatePath("/searches");
  redirect("/searches");
}

export async function updateSearchConfigAction(
  id: string,
  _prev: SearchActionResult | null,
  formData: FormData
): Promise<SearchActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const parsed = SearchConfigSchema.safeParse(rawFromForm(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const payload = buildPayload(parsed.data, user.id);
  const { error } = await supabase
    .from("search_configs")
    .update({
      name: payload.name,
      keywords: payload.keywords,
      job_types: payload.job_types,
      geo_id: payload.geo_id,
      date_posted: payload.date_posted,
      sort_by: payload.sort_by,
      linkedin_url: payload.linkedin_url,
      active: payload.active,
    })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/searches");
  redirect("/searches");
}

export async function toggleSearchConfigAction(id: string, active: boolean): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("search_configs")
    .update({ active })
    .eq("id", id)
    .eq("user_id", user.id);

  revalidatePath("/searches");
  revalidatePath("/dashboard");
}

export async function deleteSearchConfigAction(id: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("search_configs").delete().eq("id", id).eq("user_id", user.id);

  revalidatePath("/searches");
  revalidatePath("/dashboard");
}
