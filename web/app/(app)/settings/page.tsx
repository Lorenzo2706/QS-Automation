import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "@/components/forms/ProfileForm";
import { ThresholdForm } from "@/components/forms/ThresholdForm";
import { PasswordForm } from "@/components/forms/PasswordForm";
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from "@/components/ui/card";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("name, email, notification_threshold")
    .eq("user_id", user.id)
    .maybeSingle();

  const name = profile?.name ?? "";
  const email = profile?.email ?? user.email ?? "";
  const threshold = profile?.notification_threshold ?? 85;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-brand-ink">Settings</h1>
        <p className="text-sm text-brand-ink-500">
          Account and notification preferences. Email is fixed to {email}.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardSubtitle>This is the name we use in your daily recap.</CardSubtitle>
        </CardHeader>
        <CardBody>
          <ProfileForm initialName={name} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardSubtitle>
            Higher = stricter. 85 means only strong matches make it to your inbox.
          </CardSubtitle>
        </CardHeader>
        <CardBody>
          <ThresholdForm initial={threshold} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardSubtitle>Pick a new password if needed.</CardSubtitle>
        </CardHeader>
        <CardBody>
          <PasswordForm />
        </CardBody>
      </Card>
    </div>
  );
}
