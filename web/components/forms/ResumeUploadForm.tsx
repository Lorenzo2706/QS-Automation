"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { parseAndStoreResumeAction, type ResumeUploadResult } from "@/lib/actions/resume";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Parsing..." : "Upload resume"}
    </Button>
  );
}

export function ResumeUploadForm() {
  const [state, formAction] = useActionState<ResumeUploadResult | null, FormData>(
    parseAndStoreResumeAction,
    null
  );

  useEffect(() => {
    if (!state) return;
    if ("error" in state) {
      toast.error(state.error);
    } else {
      toast.success(`Uploaded ${state.filename} (${state.characters.toLocaleString()} characters)`);
      state.warnings.forEach((w) => toast.warning(w));
    }
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field
        label="PDF resume"
        htmlFor="file"
        hint="Text-based PDF, max 5 MB. Uploading replaces your previous active resume."
      >
        <input
          id="file"
          name="file"
          type="file"
          accept="application/pdf,.pdf"
          required
          className="block w-full text-sm text-brand-ink file:mr-4 file:rounded-lg file:border-0 file:bg-brand-orange file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-brand-orange-600"
        />
      </Field>

      <SubmitButton />
    </form>
  );
}
