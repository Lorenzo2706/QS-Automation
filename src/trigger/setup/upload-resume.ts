import { task } from "@trigger.dev/sdk/v3";
import { readFileSync } from "fs";
import { basename, resolve } from "path";
import { createClient } from "@supabase/supabase-js";

// pdf-parse uses CommonJS exports; esModuleInterop handles the default import
import pdfParse from "pdf-parse";

/**
 * One-time setup task: parses a PDF resume and stores the text in Supabase.
 * Run this from the Trigger.dev dev server (locally) where the PDF file is accessible.
 *
 * Trigger from the Trigger.dev dashboard with a payload like:
 * {
 *   "userId": "uuid-from-register-user-task",
 *   "pdfPath": "C:/Users/LorenzoGiori/Documents/resume.pdf"
 * }
 *
 * Notes:
 *   - pdfPath must be an absolute path accessible from your local machine
 *   - Each call deactivates the previous resume for this user and adds the new one
 *   - The parsed text is stored in Supabase and used by classify-job in production
 */
export const uploadResumeTask = task({
  id: "upload-resume",
  maxDuration: 120,
  run: async (payload: { userId: string; pdfPath: string }) => {
    const { userId, pdfPath } = payload;

    if (!userId?.trim()) throw new Error("userId is required");
    if (!pdfPath?.trim()) throw new Error("pdfPath is required");

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL or SUPABASE_ANON_KEY is not set");

    const db = createClient(url, key);

    // Validate that the user exists
    const { data: user, error: userError } = await db
      .from("users")
      .select("user_id, name")
      .eq("user_id", userId)
      .single();

    if (userError || !user) {
      throw new Error(`User not found: ${userId}. Run register-user first.`);
    }

    // Read and parse the PDF
    const absolutePath = resolve(pdfPath);
    console.log(`Parsing PDF: ${absolutePath}`);

    let buffer: Buffer;
    try {
      buffer = readFileSync(absolutePath);
    } catch {
      throw new Error(`Could not read file: ${absolutePath}. Check the path and try again.`);
    }

    const pdfData = await pdfParse(buffer);
    const parsedText = pdfData.text?.trim();

    if (!parsedText) {
      throw new Error("PDF parsing produced empty text — check the file is a valid text-based PDF");
    }

    console.log(`Parsed ${parsedText.length} characters from ${basename(absolutePath)}`);

    // Deactivate any previous resumes for this user
    await db
      .from("resumes")
      .update({ is_active: false })
      .eq("user_id", userId);

    // Insert new resume
    const { data: resume, error: insertError } = await db
      .from("resumes")
      .insert({
        user_id: userId,
        filename: basename(absolutePath),
        parsed_text: parsedText,
        is_active: true,
      })
      .select("resume_id")
      .single();

    if (insertError) throw new Error(`Failed to insert resume: ${insertError.message}`);

    console.log(`Resume uploaded successfully:`);
    console.log(`  resume_id: ${resume.resume_id}`);
    console.log(`  user: ${(user as { name: string }).name}`);
    console.log(`  file: ${basename(absolutePath)}`);
    console.log(`  characters: ${parsedText.length}`);

    return {
      resumeId: resume.resume_id as string,
      userId,
      filename: basename(absolutePath),
      textLength: parsedText.length,
    };
  },
});
