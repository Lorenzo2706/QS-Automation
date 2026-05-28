"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { resetPasswordAction, type ActionResult } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? "Saving..." : "Update password"}
    </Button>
  );
}

export function ResetPasswordForm() {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    resetPasswordAction,
    null
  );
  const error = state && "error" in state ? state.error : null;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field label="New password" htmlFor="new-password" hint="At least 8 characters.">
        <Input
          id="new-password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </Field>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <SubmitButton />
    </form>
  );
}
