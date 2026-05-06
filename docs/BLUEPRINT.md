# Blueprint TL;DR (early-stage)

> **Authoritative source**: [`AlaudaAI/contexts` PR #3](https://github.com/AlaudaAI/contexts/pull/3) → `design-docs/alauda-app-blueprint.md` (spec) + `design-docs/alauda-app-blueprint-execution.md` (15-task plan to write the full 13-file blueprint).
>
> This file is a **working summary** for early-execution sessions before the full 13-file blueprint lands (Tasks 1-15, gated on Glen sign-off of contexts PR #3 Q1/Q2). When Tasks 1-15 commit, this file is replaced by `architecture/decisions.md` and friends.

## Meta principle

**Blueprint decides integration conflicts only. It does not redesign source project internals.**

Anything Local_Map_SEO or Review_MLP already does (BullMQ, Resend, Vercel Pro plan, env names, Prisma migrations, internal field shapes, AI prompts) is **inherited verbatim**. The blueprint only resolves the unavoidable seams when two products fold into one Next.js app, one Postgres, one auth flow, one URL space.

## The 8 ADRs at a glance

| ID | Decision | One-liner |
|---|---|---|
| **C** | **Fork & Lift** into a new monorepo `alauda-app`. Source repos continue independent development. | Threads the needle between clean monorepo (too disruptive) and polyrepo + shell (breaks unified UX). |
| **拓扑 1** | **Single Next.js app** at `apps/web` serves all routes. | One process, one cookie, one layout. |
| **A1** | **Auth = NextAuth v5**, lifted from Local_Map_SEO PR #19 (Yifan, merged 2026-05-01). Single-file `apps/web/src/auth.ts` (PrismaAdapter + Google OAuth + Resend magic-link, JWT session strategy — no Session table). No `packages/auth`, no `auth.config.ts` split, no `requireOwner` helper. Login route `/signin`. Cookie `alauda.businessId`. `TrackedBusiness.userId` NOT NULL from baseline (no cookie-only legacy users). | PR #19 already shipped this; do **NOT** redo. Net simpler than the original Review_MLP-based A1 — no `lastMagicLinkSentAt` migration, no hand-rolled JWT, free Google sign-in. |
| **R1** | **Public route namespacing**: `/scan/r/[token]` (Scan share) + `/reviews/r/[token]` (Reviews customer rating). Both real routes, no rewrite tricks. | Consistency over SMS-segment savings. |
| **W1** | **Worker topology unchanged**: BullMQ + Railway for Scan, Vercel Cron for Reviews. Both coexist. | Fork & lift principle: each product keeps its async pattern. |
| **S1** | **Flat Prisma schema** in `packages/db`. All models in `public`, no multi-schema. PostGIS on. | No model name collisions; multi-schema = unnecessary abstraction. |
| **T3** | **No marketing site**. `alauda.ai/` redirects by auth state (logged-out → `/signin`, logged-in → `/dashboard`). | Marketing content does not exist; landing-page evolution is open and zero-lockin. |
| **Sidebar v2** | **Tools-only sidebar**: Scan / Reviews / Reports (Coming Soon). No global Settings — per-product settings live under each tool. Account dropdown contains Sign out only. | Each tool owns its config; don't create empty surfaces. |

## Coexistence with source repos (α + isolation)

- **α**: alauda-app is the future Alauda platform. Source repos continue independent development. Their eventual sunset is a separate future decision **not in scope** here.
- **Isolation**: alauda-app provisions its own Neon project, Upstash Redis, Twilio number, Resend sender domain. **Zero shared infrastructure.** Schemas evolve independently; data does not leak across.
- alauda-app **opportunistically cherry-picks** logic-relevant changes from upstream after fork & lift; sync is best-effort, not a mechanical mirror.

## Final monorepo layout (target)

```
alauda-app/
├── apps/
│   ├── web/                       ← Single Next.js 14 app (拓扑 1).
│   │                                Auth lives in `src/auth.ts` single-file (PR #19 模式),
│   │                                NOT a separate `packages/auth` (no second consumer).
│   └── worker/                    ← BullMQ consumer on Railway. Lifted from Local_Map_SEO/apps/worker.
├── packages/
│   ├── db/                        ← S1 flat Prisma schema (User + Account + VerificationToken from PR #19, plus Scan + Reviews models). JWT mode = no Session table.
│   └── jobs/                      ← Lifted from Local_Map_SEO/packages/jobs
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── tsconfig.base.json
└── package.json
```

## Phase 0 / 1 / 2 — early-execution checklist (pre-Glen-sign-off)

These three phases can start before Glen signs off because the underlying ADRs (A1, S1, W1, C, 拓扑 1) are already locked.

### Phase 0 — provision alauda-app's own dedicated infra

> **Why dedicated**: shared Neon = data leakage + alauda-app's destructive baseline-reset migration would nuke source-repo data. Shared Redis = workers fight for the same jobs. Shared Twilio number = SMS replies confused between products. Shared Resend domain = reputation hygiene blast radius.

| Service | Action | NOT under Yifan's accounts? |
|---|---|---|
| **Neon Postgres** | New project, PostGIS extension on | ✅ MUST be new |
| **Upstash Redis** | New instance | ✅ MUST be new |
| **Twilio** | New phone number (Review_MLP's number stays with its production) | ✅ MUST be new |
| **Resend** | Same account ok; new sender domain `hi@send.alauda.ai` (alauda.ai subdomain provisioned by Yifan in his Resend account using his GoDaddy access). Domain-level isolation ✓; API key shared with Yifan's account at Phase 2. | New domain ✓; account shared |
| **Anthropic** | Same key ok | ✅ Reuse |
| **Google Places** | Same key ok | ✅ Reuse |
| **Mapbox** | Same token ok | ✅ Reuse |
| **Serper / DataForSEO** | Same key ok | ✅ Reuse |

- [ ] All four "MUST be new" services provisioned
- [ ] `.env.example` populated with var names from Local_Map_SEO PR #19 (see `.env.example` in repo root)
- [ ] Sanity check: connect to Neon dev branch, ping Upstash, verify Twilio number can send/receive

### Phase 1 — monorepo skeleton + 2 packages

- [ ] Scaffold: `pnpm-workspace.yaml`, root `package.json`, `tsconfig.base.json`, empty `apps/`, `packages/`
- [ ] **`@alauda/db`** = copy `Local_Map_SEO/packages/db` verbatim
  - PR #19's User + Account + VerificationToken models are **already baked in** — do not redesign (JWT mode = no Session table)
  - Append `Business` + `ReviewRequest` from `Review_MLP/prisma/schema.prisma`
  - Drop `Business.lastMagicLinkSentAt` (NextAuth handles rate-limit; field obsolete)
  - alauda-app starts with `TrackedBusiness.userId` **NOT NULL** from baseline (no cookie-only legacy users to migrate)
  - Delete `prisma/migrations/`; run `pnpm prisma migrate dev --name baseline` for single baseline
  - Rename `@repo/db` → `@alauda/db` in package.json
- [ ] **`@alauda/jobs`** = `Local_Map_SEO/packages/jobs` verbatim, rename `@repo/jobs` → `@alauda/jobs`
- [ ] **No `packages/auth`** — auth lives single-file at `apps/web/src/auth.ts`, lifted in Phase 2 (PR #19 mirrors this layout exactly; only consumer is the web app, no need for a package)
- [ ] Verify: `pnpm install && pnpm typecheck` clean, no `@repo/*` left over

### Phase 2 — apps/web shell + sign-in

> **Lift strategy: zero-original-code.** `auth.ts`, `middleware.ts`, `business-cookie.ts`, `signin/*` pages, the `[...nextauth]/route.ts` handler — all lifted from `Local_Map_SEO/apps/web/src/` to the same paths in alauda-app. Mechanical edits only: `@repo/db` → `@alauda/db`, cookie name renamed (see below), drop PR #19's `signIn` callback entirely — its only logic was cookie-only `TrackedBusiness` adoption for legacy users, which alauda-app doesn't have.

- [ ] Next.js 14 skeleton at `apps/web` (App Router, TypeScript, Tailwind matching PR #19)
- [ ] `apps/web/src/auth.ts` — lifted verbatim from `Local_Map_SEO/apps/web/src/auth.ts` (single-file PR #19 + #20 mode). `@repo/db` → `@alauda/db`. Drop PR #19's `signIn` callback (its only logic was legacy cookie-only adoption).
- [ ] `apps/web/src/lib/business-cookie.ts` — lifted verbatim, but **rename the cookie value**: `localmapseo.businessId` → `alauda.businessId`.
- [ ] `apps/web/src/app/(public)/layout.tsx` — minimal no-chrome layout
- [ ] `apps/web/src/app/(public)/signin/{page.tsx, SignInForm.tsx, check-email/page.tsx}` — lifted verbatim from PR #19 + #20 (PR #20's `safeCallback` open-redirect fix is included in main HEAD)
- [ ] `apps/web/src/app/api/auth/[...nextauth]/route.ts` — PR #19 actual:
  ```ts
  import { handlers } from "@/auth";
  export const { GET, POST } = handlers;
  ```
- [ ] `apps/web/src/middleware.ts` — lifted verbatim. **Do NOT** wrap NextAuth's `auth` middleware export; PR #19 keeps middleware to plain cookie promotion (`?businessId=` → cookie). Page-level auth is enforced by `(platform)` server components calling `await auth()` themselves and redirecting to `/signin` if null.
- [ ] `apps/web/src/app/(platform)/layout.tsx` — sidebar + topbar shell (stubs ok), inline `await auth()` + `if (!session) redirect("/signin")` gate (no `requireOwner` helper — match PR #19), onboarding-detection placeholder
- [ ] Shell stubs: TopBar / Sidebar v2 (3 items: Scan / Reviews / Reports-soon) / BusinessSwitcher (empty list ok) / UserDropdown (Sign out only)
- [ ] Route stubs: `/` redirect by auth state, `/signin`, `/dashboard` (blank ok)

**Verify**: `pnpm dev:web` → `/signin` → either Google OAuth or magic-link email → land at `/dashboard` (blank acceptable). **At end of Phase 2, sign-in is fully functional and final** (no rework needed later).

## Migration discipline (until Phase 6 deploy automation lands)

The Vercel build script does **not** run `prisma migrate deploy` — schema changes are applied by the developer before pushing:

1. Add a Prisma model change to `packages/db/prisma/schema.prisma`.
2. Run `pnpm --filter @alauda/db migrate -- --name <change_name>` locally to generate + apply the migration against the shared Neon dev branch.
3. Commit the migration file + schema change together.
4. Push. Vercel preview just compiles app code; the Neon DB is already up-to-date.

Why no auto-deploy: Phase 0-2 has dev / preview / prod sharing one Neon branch (Vercel-Neon integration default). Auto-applying migrations on every Vercel build would let preview deploys mutate the same DB the production app uses, race on migration locks under concurrent builds, and apply schema before the new app version goes live. Phase 6 introduces a separate prod-only deploy step that runs `prisma migrate deploy` after the app deploys cleanly.

If a developer forgets step 2, the preview app will reference a column the DB doesn't have and the route will 500 at runtime. That's the intended fast-fail signal — better than silent schema drift between local and production.

## Don't-duplicate guardrails (hard rules)

| ❌ DON'T | ✅ DO |
|---|---|
| Write a new NextAuth config | Lift `apps/web/src/auth.ts` (single-file, PR #19 + #20 actual) verbatim |
| Design a custom User schema | Adopt PR #19's User + Account + VerificationToken as-is (no Session table; JWT mode) |
| Add a `lastMagicLinkSentAt` rate-limit field | NextAuth + Resend provider's built-in rate limit is enough |
| Wrap NextAuth's `auth` middleware in `middleware.ts` | PR #19 doesn't — keeps middleware to cookie promotion only; page server components call `await auth()` themselves |
| Customize cookie name / session strategy / Google or Resend env name | Inherit from PR #19's `auth.ts` + `middleware.ts`; read source, don't redecide. **PR #19 actual**: `session: { strategy: "jwt" }`; env names `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` / `RESEND_API_KEY` / `EMAIL_FROM` / `WEB_URL` / `AUTH_SECRET` |
| Build a `/signin` UI from scratch | Lift PR #19's `/signin` page (already includes PR #20's open-redirect fix) |
| Keep `/signup` route or `/api/auth/{request,verify,signup}` legacy paths | Use NextAuth's catch-all `/api/auth/[...nextauth]`; PrismaAdapter creates User implicitly on first sign-in |
| Write a custom PrismaClient singleton | Use the one `@alauda/db` exports |
| Decide what Mapbox / Anthropic / Serper key alauda-app uses | Reuse the source-repo keys (no shared write state) |
| Reuse Yifan's Neon / Upstash / Twilio number / Resend domain | Provision alauda-app's own (isolation rule) |

## What NOT to start before Glen signs off

| Phase / Task | Why blocked |
|---|---|
| **Tasks 1-15** (write the 13-file blueprint inside this repo) | Depends on Glen Q1 (provenance header strategy) + Q2 (file count 13 vs 11) |
| **Phase 4** (lift Scan business code) | Heavyweight; if shell or routing decisions change, returns to redo |
| **Phase 5** (lift Reviews business code) | Same as Phase 4 |
| **Phase 6** (production deploy) | Gated on Phase 4 + 5 + first-deploy plan |

## Sync strategy with source repos (preview)

After fork & lift, alauda-app **opportunistically cherry-picks** logic-relevant changes from `Local_Map_SEO` and `Review_MLP` upstream. Full flow lives in the spec's Section 6 / Phase 7 + execution-plan Task 15:

- **Triggers**: schema changes, bug fixes, new features, prompt tweaks, dependency upgrades.
- **Cadence**: weekly scan of source-repo `main` against `last-synced` sha.
- **Decision tree per change**: cherry-pick (small, no boundary touch) / adapt (touches a boundary modified during lift) / skip (only meaningful in source-repo shape).
- **Schema deltas**: written as fresh alauda-app migrations (not copied verbatim from upstream).

## Provenance comments (every lifted file)

Every file lifted from a source repo carries a header:

```ts
// origin: AlaudaAI/<repo>@<sha>:<path-in-source-repo>
// last-synced: YYYY-MM-DD
```

This header is the only mechanical artifact that makes Phase 7 sync work without git subtree / submodule complexity. Updated on every cherry-pick.

## Glossary (verbatim across docs)

- **fork & lift** — copy code from source repos into alauda-app; source repos stay untouched
- **lift** — one-time copy of a file/dir from source repo into alauda-app
- **adapt** — re-implement an upstream change inside alauda-app's restructured layout (used during sync, not lift)
- **soft bridge** — Reviews ownership = `Business.ownerEmail = currentUser.email` at runtime; no foreign key
- **hard FK** — Scan ownership = `TrackedBusiness.userId = currentUser.id` at the schema level (NOT NULL post-baseline)
- **dual-write** — onboarding creates one `Business` (Reviews) + one `TrackedBusiness` (Scan) sharing one `Place`
- **public allowlist** — middleware-skipped paths: `/`, `/signin`, `/scan/r/*`, `/reviews/r/*`, `/api/auth/*`, `/api/r/*`, `/api/cron/*`, `/api/sms/*`, static assets
- **NextAuth callback flow** — sign-in → `/api/auth/callback/{google|resend}` → session cookie → redirect to `next` (default `/dashboard`)
- **`alauda.businessId` cookie** — written by middleware on `?businessId=` query promotion (lifted verbatim from PR #19's `apps/web/src/middleware.ts`) and by `BusinessSwitcher` when the user picks a business. Renamed from PR #19's `localmapseo.businessId`. PR #19's `signIn` callback is **dropped** — its only logic was cookie-only `TrackedBusiness` adoption for legacy users, which alauda-app doesn't have.

## Useful agent commands (gstack)

- `/review` + `/codex review` — code review on PRs
- `/qa` — broad coverage testing
- `/investigate` — root-cause debugging
- `/cso` — security audit
- `/plan-eng-review` — re-run on the execution plan if scope shifts
- `/ship` + `/canary` — release path (not yet relevant; Phase 6+)

See `dev-cycle.md` in `contexts` repo for the full process.
