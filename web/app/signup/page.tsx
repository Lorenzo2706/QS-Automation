import { redirect } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { SignupForm } from "@/components/forms/SignupForm";
import { Card, CardBody } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export default async function SignupPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-brand-ink-50 px-4 py-12">
      <Link href="/" className="mb-8">
        <Logo height={36} priority />
      </Link>
      <Card className="w-full max-w-md">
        <CardBody className="p-8">
          <h1 className="mb-1 text-2xl font-semibold text-brand-ink">Create your account</h1>
          <p className="mb-6 text-sm text-brand-ink-500">
            Sign up with your invited email. You&apos;ll get a confirmation link by mail.
          </p>
          <SignupForm />
        </CardBody>
      </Card>
    </div>
  );
}
