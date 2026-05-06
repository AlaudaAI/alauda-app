// origin: AlaudaAI/Local_Map_SEO@bd17057:apps/web/src/env.ts
// last-synced: 2026-05-06
//
// Lifted verbatim. Phase 4-5 lifts will add Reviews-side keys (Twilio, Resend
// from address overrides if any) — the schema is intentionally permissive
// (.optional() everywhere) so a missing key never blocks unrelated routes.

import "server-only";
import { z } from "zod";

// Type-check env at module load. Runtime requirements are enforced lazily by
// the helpers below so a missing key doesn't crash unrelated routes.
const Schema = z.object({
  DATABASE_URL: z.string().min(1),
  POSTGRES_URL_NON_POOLING: z.string().min(1).optional(),
  REDIS_URL: z.string().min(1).optional(),
  KV_URL: z.string().min(1).optional(),
  GOOGLE_PLACES_API_KEY: z.string().min(1).optional(),
  // NextAuth (auth.ts). Optional during boot — sign-in routes throw a
  // clear error if these are missing; the rest of the app still loads.
  AUTH_SECRET: z.string().min(1).optional(),
  GOOGLE_OAUTH_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().email().optional(),
  WEB_URL: z.string().url().optional(),
  // Anthropic — used to suggest keywords on /seo-map/new based on the
  // selected business's primary type. Optional: if missing, the form
  // simply omits the suggestions section.
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export const env = Schema.parse(process.env);

export function requirePlacesApiKey(): string {
  if (!env.GOOGLE_PLACES_API_KEY) {
    throw new Error("GOOGLE_PLACES_API_KEY is not set");
  }
  return env.GOOGLE_PLACES_API_KEY;
}

export function requireRedisUrl(): string {
  const url = env.REDIS_URL ?? env.KV_URL;
  if (!url) {
    throw new Error("REDIS_URL or KV_URL must be set");
  }
  return url;
}
