import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// v56:
//   - Signup endpoints are removed (public signup disabled).
//   - /signup / /register / /sign-up route paths redirect to /login.
//   - Authenticated users whose users.is_active = false are signed out and
//     redirected to /login?inactive=1.
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const { pathname } = request.nextUrl;

  // Kill any old signup URLs.
  if (
    pathname === "/signup" ||
    pathname === "/register" ||
    pathname === "/sign-up" ||
    pathname.startsWith("/api/auth/signup")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("signup_disabled", "1");
    return NextResponse.redirect(url);
  }

  // Public read-only endpoints (teams list still needed for the admin UI).
  if (pathname.startsWith("/api/teams")) {
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet: { name: string; value: string; options?: object }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const isPublic =
    pathname.startsWith("/login") ||
    pathname.startsWith("/reset-password");

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Active-user gate.
  if (user && !isPublic) {
    const { data: profile } = await supabase
      .from("users")
      .select("is_active")
      .eq("id", user.id)
      .single();
    if (profile && (profile as any).is_active === false) {
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("inactive", "1");
      return NextResponse.redirect(url);
    }
  }

  if (user && isPublic && !pathname.startsWith("/reset-password")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
