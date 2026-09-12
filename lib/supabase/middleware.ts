import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSafeInternalPath } from "@/lib/safeRedirect";

function isProtectedPath(pathname: string): boolean {
  return (
    pathname.startsWith("/app") ||
    pathname.startsWith("/clock") ||
    pathname.startsWith("/history") ||
    pathname.startsWith("/vacations") ||
    pathname.startsWith("/my-schedule") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/owner") ||
    pathname.startsWith("/company")
  );
}

/**
 * Refreshes the Auth session from cookies and enforces route access.
 * Does NOT query profiles (avoid DB on every request). Role checks live in server layouts.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: getUser() validates the JWT with Auth. Do not use getSession() here.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;

  if (!user && isProtectedPath(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    const nextPath = getSafeInternalPath(`${pathname}${search}`, "/app");
    loginUrl.searchParams.set("next", nextPath);
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated users hitting login or home → safe internal destination.
  if (user && (pathname === "/login" || pathname === "/")) {
    const nextParam = request.nextUrl.searchParams.get("next");
    const dest = getSafeInternalPath(nextParam, "/app");
    const redirectUrl = new URL(dest, request.url);
    if (redirectUrl.pathname === "/login") {
      redirectUrl.pathname = "/app";
      redirectUrl.search = "";
    }
    return NextResponse.redirect(redirectUrl);
  }

  return supabaseResponse;
}
