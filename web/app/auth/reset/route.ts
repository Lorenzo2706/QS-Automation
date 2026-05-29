import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Dedicated landing route for password-recovery links. Supabase's /auth/v1/verify
// hop drops the query string on redirect_to (so `?next=...` never survives) but keeps
// the path — so the recovery intent is encoded in the path here, and this route always
// ends on /reset-password. Handles both the PKCE `code` flow (default email template)
// and the `token_hash` OTP flow (custom template).
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");

  const supabase = await createClient();

  function loginError(message: string) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(message)}`, request.url)
    );
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return loginError(error.message);
  } else if (token_hash) {
    const { error } = await supabase.auth.verifyOtp({ type: "recovery", token_hash });
    if (error) return loginError(error.message);
  } else {
    return NextResponse.redirect(new URL("/login?error=invalid_link", request.url));
  }

  return NextResponse.redirect(new URL("/reset-password", request.url));
}
