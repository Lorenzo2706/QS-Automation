"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { updateProfileAction, type SettingsResult } from "@/lib/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving..." : "Save"}
    </Button>
  );
}

export function ProfileForm({ initialName }: { initialName: string }) {
  const [state, formAction] = useActionState<SettingsResult | null, FormData>(
    updateProfileAction,
    null
  );

  useEffect(() => {
    if (!state) return;
    if ("error" in state) toast.error(state.error);
    else toast.success("Profile updated");
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <Field label="Display name" htmlFor="profile-name">
        <Input id="profile-name" name="name" defaultValue={initialName} required maxLength={80} />
      </Field>
      <div className="flex items-center justify-end">
        <SubmitButton />
      </div>
    </form>
  );
}
