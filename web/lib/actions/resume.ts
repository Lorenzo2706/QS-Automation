"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseResumePdf } from "@shared/resume/parsePdf";

const MAX_BYTES = 5 * 1024 * 1024;

export type ResumeUploadResult =
  | { error: string }
  | { success: true; filename: string; characters: number; warnings: string[] };

export async function parseAndStoreResumeAction(
  _prev: ResumeUploadResult | null,
  formData: FormData
): Promise<ResumeUploadResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a PDF to upload" };
  }
  if (file.size > MAX_BYTES) {
    return { error: `File is too large (max ${MAX_BYTES / 1024 / 1024} MB)` };
  }
  if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
    return { error: "Only PDF files are accepted" };
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let parsedText = "";
  let warnings: string[] = [];
  try {
    const result = await parseResumePdf(buffer);
    parsedText = result.parsedText;
    warnings = result.warnings;
  } catch (err) {
    const message = err instanceof Error ? err.message : "PDF parsing failed";
    return { error: message };
  }

  if (!parsedText) {
    return { error: "PDF parsing produced empty text. Is the file a text-based PDF?" };
  }

  const { error: deactivateError } = await supabase
    .from("resumes")
    .update({ is_active: false })
    .eq("user_id", user.id);
  if (deactivateError) return { error: `Failed to deactivate previous resume: ${deactivateError.message}` };

  const { error: insertError } = await supabase.from("resumes").insert({
    user_id: user.id,
    filename: file.name,
    parsed_text: parsedText,
    is_active: true,
  });
  if (insertError) return { error: `Failed to save resume: ${insertError.message}` };

  revalidatePath("/resume");
  revalidatePath("/dashboard");
  return {
    success: true,
    filename: file.name,
    characters: parsedText.length,
    warnings,
  };
}
