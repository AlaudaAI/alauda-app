// origin: AlaudaAI/Local_Map_SEO@bd17057:apps/web/src/lib/business-cookie.ts
// last-synced: 2026-05-06
//
// alauda-app delta: cookie value renamed `localmapseo.businessId` ->
// `alauda.businessId` for namespace isolation. The original "no auth on MLP"
// comment from Local_Map_SEO is no longer accurate — alauda-app has auth from
// Day 1 — but the rationale for non-httpOnly stands: this cookie carries a
// public id, not a secret. Ownership validation in middleware lives in Phase 4
// (with the Scan business switcher).

// Cookie that holds the currently-selected TrackedBusiness id. Not httpOnly —
// it carries a public id, not a secret.
export const BUSINESS_COOKIE = "alauda.businessId";

export const BUSINESS_COOKIE_OPTS = {
  path: "/",
  sameSite: "lax",
  maxAge: 60 * 60 * 24 * 365,
  secure: process.env.NODE_ENV === "production",
} as const;
