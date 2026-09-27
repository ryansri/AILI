import { NextResponse, type NextRequest } from "next/server";
import { readSessionToken, SESSION_COOKIE } from "@/lib/auth";

/**
 * Sends anyone without a valid session cookie to /login.
 * Helper API routes check their own bearer token instead.
 */
export function proxy(request: NextRequest) {
  const workspaceId = readSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  const { pathname } = request.nextUrl;

  if (pathname === "/login" || pathname === "/signup") {
    if (workspaceId) return NextResponse.redirect(new URL("/inbox", request.url));
    return NextResponse.next();
  }

  if (!workspaceId) {
    const login = new URL("/login", request.url);
    if (pathname !== "/") login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/login", "/signup", "/welcome", "/inbox/:path*", "/people/:path*", "/today/:path*", "/posts/:path*", "/settings/:path*"],
};
