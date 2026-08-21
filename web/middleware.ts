import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

// Supabase (auth, or the underlying Postgres instance) can be slow to wake from
// a paused/idle state. Vercel kills the whole middleware invocation — and with
// it every route, since the matcher below covers nearly the entire site — if
// this call hangs past the platform's invocation timeout. Bound it well under
// that so we fail open (skip the cookie refresh) instead of taking the site down.
const AUTH_TIMEOUT_MS = 5000;

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
      global: {
        fetch: (url: RequestInfo | URL, init?: RequestInit) =>
          fetch(url, { ...init, signal: AbortSignal.timeout(AUTH_TIMEOUT_MS) }),
      },
    }
  );

  // Refreshes the session cookie on every request. Actual route protection
  // happens server-side in app/(app)/layout.tsx, so failing open here (no
  // cookie refresh) is safe and just means an occasional extra sign-in.
  try {
    await supabase.auth.getUser();
  } catch (error) {
    console.error("middleware: supabase.auth.getUser() failed, continuing without refresh", error);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|brand/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
