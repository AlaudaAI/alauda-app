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
export function middleware(req: NextRequest) {
  const fromUrl = req.nextUrl.searchParams.get("businessId");
  if (!fromUrl) return NextResponse.next();
  if (fromUrl === req.cookies.get(BUSINESS_COOKIE)?.value) {
    return NextResponse.next();
  }

  // Mutate the inbound request so the same render sees the new id.
  req.cookies.set(BUSINESS_COOKIE, fromUrl);
  const res = NextResponse.next({ request: req });
  res.cookies.set(BUSINESS_COOKIE, fromUrl, BUSINESS_COOKIE_OPTS);
  return res;
}

export const config = {
  matcher: ["/((?!_next/|favicon|.*\\.).*)"],
};
