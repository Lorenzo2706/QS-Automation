"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { requestPasswordResetAction, type ActionResult } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? "Sending..." : "Send reset link"}
    </Button>
  );
}

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    requestPasswordResetAction,
    null
  );
  const error = state && "error" in state ? state.error : null;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <SubmitButton />

      <p className="text-center text-sm text-brand-ink-500">
        Remembered it?{" "}
        <Link href="/login" className="text-brand-orange hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
