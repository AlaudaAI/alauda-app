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
| **A1** (amended 2026-05-06) | **Auth = NextAuth v5**, lifted from Local_Map_SEO PR #19 (Yifan, merged 2026-05-01). PrismaAdapter + Google OAuth + Resend magic-link. | PR #19 already shipped this; do **NOT** redo. Net simpler than the original Review_MLP-based A1 — no `lastMagicLinkSentAt` migration, no hand-rolled JWT, free Google sign-in. |
| **R1** | **Public route namespacing**: `/scan/r/[token]` (Scan share) + `/reviews/r/[token]` (Reviews customer rating). Both real routes, no rewrite tricks. | Consistency over SMS-segment savings. |
| **W1** | **Worker topology unchanged**: BullMQ + Railway for Scan, Vercel Cron for Reviews. Both coexist. | Fork & lift principle: each product keeps its async pattern. |
| **S1** | **Flat Prisma schema** in `packages/db`. All models in `public`, no multi-schema. PostGIS on. | No model name collisions; multi-schema = unnecessary abstraction. |
| **T3** | **No marketing site**. `alauda.ai/` redirects by auth state (logged-out → `/login`, logged-in → `/dashboard`). | Marketing content does not exist; landing-page evolution is open and zero-lockin. |
| **Sidebar v2** | **Tools-only sidebar**: Scan / Reviews / Reports (Coming Soon). No global Settings — per-product settings live under each tool. Account dropdown contains Sign out only. | Each tool owns its config; don't create empty surfaces. |

## Coexistence with source repos (α + isolation)

- **α**: alauda-app is the future Alauda platform. Source repos continue independent development. Their eventual sunset is a separate future decision **not in scope** here.
- **Isolation**: alauda-app provisions its own Neon project, Upstash Redis, Twilio number, Resend sender domain. **Zero shared infrastructure.** Schemas evolve independently; data does not leak across.
- alauda-app **opportunistically cherry-picks** logic-relevant changes from upstream after fork & lift; sync is best-effort, not a mechanical mirror.

## Final monorepo layout (target)

```
alauda-app/
├── apps/
│   ├── web/                       ← Single Next.js 14 app (拓扑 1)
│   └── worker/                    ← BullMQ consumer on Railway. Lifted from Local_Map_SEO/apps/worker.
├── packages/
│   ├── db/                        ← S1 flat Prisma schema (User + Account + Session + VerificationToken from PR #19, plus Scan + Reviews models)
│   ├── auth/                      ← A1 NextAuth v5, lifted from Local_Map_SEO PR #19
│   └── jobs/                      ← Lifted from Local_Map_SEO/packages/jobs
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── tsconfig.base.json
└── package.json
```

## Phase 0 / 1 / 2 — early-execution checklist (pre-Glen-sign-off)

These three phases can start before Glen signs off because the underlying ADRs (A1 amendment, S1, W1, C, 拓扑 1) are already locked.

### Phase 0 — provision alauda-app's own dedicated infra

> **Why dedicated**: shared Neon = data leakage + alauda-app's destructive baseline-reset migration would nuke source-repo data. Shared Redis = workers fight for the same jobs. Shared Twilio number = SMS replies confused between products. Shared Resend domain = reputation hygiene blast radius.

| Service | Action | NOT under Yifan's accounts? |
|---|---|---|
| **Neon Postgres** | New project, PostGIS extension on | ✅ MUST be new |
| **Upstash Redis** | New instance | ✅ MUST be new |
| **Twilio** | New phone number (Review_MLP's number stays with its production) | ✅ MUST be new |
| **Resend** | Same account ok; **new sender domain** (e.g. `noreply@app.alauda.ai`) | New domain only |
| **Anthropic** | Same key ok | ✅ Reuse |
| **Google Places** | Same key ok | ✅ Reuse |
| **Mapbox** | Same token ok | ✅ Reuse |
| **Serper / DataForSEO** | Same key ok | ✅ Reuse |

- [ ] All four "MUST be new" services provisioned
- [ ] `.env.example` populated with var names from Local_Map_SEO PR #19 (see `.env.example` in repo root)
- [ ] Sanity check: connect to Neon dev branch, ping Upstash, verify Twilio number can send/receive

### Phase 1 — monorepo skeleton + 3 packages

- [ ] Scaffold: `pnpm-workspace.yaml`, root `package.json`, `tsconfig.base.json`, empty `apps/`, `packages/`
- [ ] **`@alauda/db`** = copy `Local_Map_SEO/packages/db` verbatim
  - PR #19's User + Account + Session + VerificationToken models are **already baked in** — do not redesign
  - Append `Business` + `ReviewRequest` from `Review_MLP/prisma/schema.prisma`
  - Drop `Business.lastMagicLinkSentAt` (NextAuth handles rate-limit; field obsolete)
  - Delete `prisma/migrations/`; run `pnpm prisma migrate dev --name baseline` for single baseline
  - Rename `@repo/db` → `@alauda/db` in package.json
- [ ] **`@alauda/jobs`** = `Local_Map_SEO/packages/jobs` verbatim, rename `@repo/jobs` → `@alauda/jobs`
- [ ] **`@alauda/auth`** (NextAuth v5, lifted from Local_Map_SEO PR #19):
  - Copy `auth.ts` (root config) + `auth.config.ts` (edge-safe providers + callbacks) from PR #19 into `packages/auth/src/`
  - Add `packages/auth/src/require-owner.ts` — alauda-app convenience: calls `auth()`, redirects to `/login` if null
  - `packages/auth/src/index.ts` — one file, re-exports `{ auth, signIn, signOut, handlers, requireOwner }`
  - `packages/auth/package.json` — name `@alauda/auth`, deps: `next-auth@5`, `@auth/prisma-adapter`, `resend`
- [ ] Verify: `pnpm install && pnpm typecheck` clean, no `@repo/*` left over

### Phase 2 — apps/web shell + sign-in

- [ ] Next.js 14 skeleton at `apps/web` (App Router, TypeScript, Tailwind matching PR #19)
- [ ] `apps/web/src/app/(public)/layout.tsx` — minimal no-chrome layout
- [ ] `apps/web/src/app/(public)/login/page.tsx` — lifted from PR #19; calls `signIn` from `@alauda/auth`
- [ ] `apps/web/src/app/api/auth/[...nextauth]/route.ts` — one line:
  ```ts
  export { GET, POST } from "@alauda/auth"  // re-export NextAuth handlers
  ```
- [ ] `apps/web/middleware.ts` — wrap NextAuth's `auth` middleware export, layer Local_Map_SEO's `?businessId=` cookie promotion logic (also lifted from PR #19) on top. **Read PR #19's `apps/web/middleware.ts` source first**: copy the cookie name (`currentBusinessId`) and any helper imports verbatim. Do NOT invent a cookie name or session strategy — both are inherited from PR #19's config.
- [ ] `apps/web/src/app/(platform)/layout.tsx` — sidebar + topbar shell (stubs ok), `requireOwner()` gate, onboarding-detection placeholder
- [ ] Shell stubs: TopBar / Sidebar v2 (3 items: Scan / Reviews / Reports-soon) / BusinessSwitcher (empty list ok) / UserDropdown (Sign out only)
- [ ] Route stubs: `/` redirect by auth state, `/login`, `/dashboard` (blank ok)

**Verify**: `pnpm dev:web` → `/login` → either Google OAuth or magic-link email → land at `/dashboard` (blank acceptable). **At end of Phase 2, sign-in is fully functional and final** (no rework needed later).

## Don't-duplicate guardrails (hard rules)

| ❌ DON'T | ✅ DO |
|---|---|
| Write a new NextAuth config | Lift `auth.ts` + `auth.config.ts` from Local_Map_SEO PR #19 verbatim |
| Design a custom User schema | Adopt PR #19's User + Account + Session + VerificationToken as-is |
| Add a `lastMagicLinkSentAt` rate-limit field | NextAuth + Resend provider's built-in rate limit is enough |
| Write custom session middleware | Wrap NextAuth's `auth` middleware export |
| Customize cookie name / session strategy (database vs JWT) / Resend env name | Inherit from PR #19's `auth.config.ts` + `middleware.ts`; read source, don't redecide. NextAuth v5 defaults to JWT but PR #19 may have picked database — go look |
| Build a `/login` UI from scratch | Lift PR #19's `/login` page |
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
- **public allowlist** — middleware-skipped paths: `/`, `/login`, `/scan/r/*`, `/reviews/r/*`, `/api/auth/*`, `/api/r/*`, `/api/cron/*`, `/api/sms/*`, static assets
- **NextAuth callback flow** — sign-in → `/api/auth/callback/{google|resend}` → session cookie → redirect to `next` (default `/dashboard`)
- **`currentBusinessId` cookie** — written by NextAuth's `signIn` callback (lifted from PR #19) and by middleware on `?businessId=` query promotion

## Useful agent commands (gstack)

- `/review` + `/codex review` — code review on PRs
- `/qa` — broad coverage testing
- `/investigate` — root-cause debugging
- `/cso` — security audit
- `/plan-eng-review` — re-run on the execution plan if scope shifts
- `/ship` + `/canary` — release path (not yet relevant; Phase 6+)

See `dev-cycle.md` in `contexts` repo for the full process.
