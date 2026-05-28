import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { Card, CardBody } from "@/components/ui/card";

export default function ForgotPasswordCheckInboxPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-brand-ink-50 px-4 py-12">
      <Link href="/" className="mb-8">
        <Logo height={36} priority />
      </Link>
      <Card className="w-full max-w-md">
        <CardBody className="p-8 text-center">
          <h1 className="mb-2 text-2xl font-semibold text-brand-ink">Check your inbox</h1>
          <p className="mb-6 text-sm text-brand-ink-500">
            If an account exists for that email, we sent a link to reset your password.
            Click it to choose a new password, then sign in.
          </p>
          <Link
            href="/login"
            className="text-sm font-medium text-brand-orange hover:underline"
          >
            Back to sign in
          </Link>
        </CardBody>
      </Card>
    </div>
  );
}
