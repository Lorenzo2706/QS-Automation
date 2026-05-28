import { createClient } from "@/lib/supabase/server";
import { ResumeUploadForm } from "@/components/forms/ResumeUploadForm";
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from "@/components/ui/card";

export default async function ResumePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: resume } = await supabase
    .from("resumes")
    .select("filename, parsed_text, created_at")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-brand-ink">Resume</h1>
        <p className="text-sm text-brand-ink-500">
          We parse your PDF text on upload and store only that text. The matching engine
          uses it to score every job against you.
        </p>
      </div>

      {resume ? (
        <Card>
          <CardHeader>
            <CardTitle>Active resume</CardTitle>
            <CardSubtitle>
              {resume.filename ?? "(unnamed)"} · {resume.parsed_text.length.toLocaleString()} characters
              {resume.created_at
                ? ` · uploaded ${new Date(resume.created_at).toLocaleDateString()}`
                : ""}
            </CardSubtitle>
          </CardHeader>
          <CardBody>
            <details className="text-sm text-brand-ink-700">
              <summary className="cursor-pointer text-brand-ink-500 hover:text-brand-ink">
                Show parsed text
              </summary>
              <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-brand-ink-50 p-3 text-xs leading-relaxed">
                {resume.parsed_text}
              </pre>
            </details>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{resume ? "Replace resume" : "Upload your resume"}</CardTitle>
          <CardSubtitle>Uploading will deactivate any previous resume.</CardSubtitle>
        </CardHeader>
        <CardBody>
          <ResumeUploadForm />
        </CardBody>
      </Card>
    </div>
  );
}
