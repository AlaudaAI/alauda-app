// origin: AlaudaAI/Local_Map_SEO@bd17057:apps/web/src/middleware.ts
// last-synced: 2026-05-06
//
// Lifted verbatim. Cookie promotion only — does NOT wrap NextAuth's `auth`
// middleware export. Auth gating is enforced page-by-page in (platform)
// server components via `await auth()` + redirect.

import { NextResponse, type NextRequest } from "next/server";
import { BUSINESS_COOKIE, BUSINESS_COOKIE_OPTS } from "@/lib/business-cookie";

// `?businessId=...` overrides whichever business is in the cookie. We
// promote it to the cookie so server components see one source of truth.
//
// We also forward an `x-pathname` request header carrying the current
// path + search so server components (e.g. (platform)/layout.tsx) can
// build a `?callbackUrl=` redirect to /signin without needing access to
// the raw request URL (App Router server components don't get one).
export function middleware(req: NextRequest) {
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set(
    "x-pathname",
    req.nextUrl.pathname + req.nextUrl.search,
  );

  const fromUrl = req.nextUrl.searchParams.get("businessId");
  if (!fromUrl || fromUrl === req.cookies.get(BUSINESS_COOKIE)?.value) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // Mutate the inbound request so the same render sees the new id.
  req.cookies.set(BUSINESS_COOKIE, fromUrl);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.cookies.set(BUSINESS_COOKIE, fromUrl, BUSINESS_COOKIE_OPTS);
  return res;
}

export const config = {
  matcher: ["/((?!_next/|favicon|.*\\.).*)"],
};
