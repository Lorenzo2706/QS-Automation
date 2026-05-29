import { NextResponse, type NextRequest } from "next/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const code = searchParams.get("code");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next =
    searchParams.get("next") ?? (type === "recovery" ? "/reset-password" : "/dashboard");

  const supabase = await createClient();

  function loginError(message: string) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(message)}`, request.url)
    );
  }

  // OTP / token_hash flow — used when the email template is customized to send
  // `?token_hash=...&type=...` (works cross-device, no PKCE verifier needed).
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (error) return loginError(error.message);
    return NextResponse.redirect(new URL(next, request.url));
  }

  // PKCE / code flow — used by the default Supabase templates ({{ .ConfirmationURL }}),
  // which route through /auth/v1/verify and redirect back here with `?code=...`.
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return loginError(error.message);
    return NextResponse.redirect(new URL(next, request.url));
  }

  return NextResponse.redirect(new URL("/login?error=invalid_link", request.url));
}
