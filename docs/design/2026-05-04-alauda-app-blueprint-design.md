# Alauda App Blueprint — Design

> Brainstorming-phase output (2026-05-04). Captures the decisions that the
> alauda-app blueprint will articulate. The blueprint itself is a multi-document
> deliverable (`architecture/`, `domain/`, `specs/`, `ops/`, `plan/`) — this
> spec is the single source that drives writing those documents.

## What is alauda-app

A unified product platform that integrates two existing Alauda products
into one LocalRank-style Next.js app:

- **Scan** — geographic SERP visibility (5×5 grid scan), backed by
  [`AlaudaAI/Local_Map_SEO`](https://github.com/AlaudaAI/Local_Map_SEO).
- **Reviews** — Google review request funnel (SMS / Email → rating page →
  AI-drafted review or private feedback), backed by
  [`AlaudaAI/Review_MLP`](https://github.com/AlaudaAI/Review_MLP).
- **Reports** — sidebar placeholder ("Coming Soon"), no implementation.

Reference dashboard form: [`app.localrank.so/dashboard`](https://app.localrank.so/dashboard).
Reference blueprint shape: first commit of
[`AlaudaAI/website-rebuild`](https://github.com/AlaudaAI/website-rebuild)
— pure documentation, zero code.

## Meta principle

**Blueprint decides integration conflicts only. It does not redesign source
project internals.**

Anything Local_Map_SEO or Review_MLP already does (BullMQ choice, Resend
choice, Vercel Pro plan dependency, env variable names, Prisma migration
strategy of each, internal field shapes, internal AI prompts, etc.) is
inherited verbatim. The blueprint only decides the unavoidable seams that
appear when two products fold into one Next.js app, one Postgres database,
one auth flow, and one URL space.

This principle is written into `architecture/decisions.md` as the first ADR
so future readers know why some "obvious" questions are not discussed.

## Out of scope (explicitly)

- Business / TrackedBusiness field unification (D1)
- Agency / multi-location / membership / role model
- Stripe billing
- Async-base unification (W2 Inngest migration / W3 BullMQ for Reviews)
- Marketing site
- Global Settings (no account-level settings exist)
- Internal feature redesign of either product
- Freezing the source repos (handled in a separate future decision, not this blueprint)

## Decisions (the 8 ADRs)

| ID | Decision | Why |
|---|---|---|
| **C** | **Fork & Lift** into a new monorepo `alauda-app`. Source repos continue independent development. | A (clean monorepo) too disruptive; B (polyrepo + shell) breaks unified UX; C threads the needle. |
| **拓扑 1** | **Single Next.js app** at `apps/web` serves all routes (`/dashboard`, `/scan/*`, `/reviews/*`, public flows). One process, one cookie, one layout. | LocalRank-style unified product UX requires one URL space + one session. |
| **A1** | **Auth = magic-link** ported from Review_MLP into `packages/auth`. `jose` JWT, Resend email, no IDP, no passwords. | Most mature existing asset; SMB owner-friendly; no SSO/SAML need today. |
| **R1** | **Public route namespacing**: `/scan/r/[token]` (Scan share) + `/reviews/r/[token]` (Reviews customer rating). Both real routes, no rewrite tricks. | Consistency over SMS-segment savings. SMS length optimization deferred to post-launch rewrite if it matters. |
| **W1** | **Worker topology unchanged**: BullMQ + Railway for Scan, Vercel Cron for Reviews. Coexist. | Fork & lift principle: each product keeps its async pattern. Inngest migration left as future work. |
| **S1** | **Flat Prisma schema** in `packages/db`, all models in `public`, no multi-schema feature. PostGIS extension on. | No actual model name collisions between the two products; multi-schema = unnecessary abstraction. |
| **T3** | **No marketing site**. `alauda.ai/` redirects by auth state (logged-out → `/login`, logged-in → `/dashboard`). | Marketing content does not exist; T3 → T1 → T2 evolution path is open and zero-lockin. |
| **Sidebar v2** | **Tools-only sidebar**: Scan / Reviews / Reports (Coming Soon). No global Settings — per-product settings live under each tool. Account dropdown in header right (Sign out only for now). | Each tool owns its config. Global Settings lacks content (no account / billing / notifications yet) — don't create empty surfaces. |

## Coexistence model with source repos (α + isolation)

- **α**: alauda-app is the future Alauda platform. Source repos
  (`Local_Map_SEO`, `Review_MLP`) continue independent development.
  Their eventual sunset is a separate future decision **not in this
  blueprint's scope**.
- **Isolation**: alauda-app provisions its own Neon project, Upstash Redis,
  Twilio phone number, and Resend sender domain. **Zero shared
  infrastructure** with the source repos. Schemas evolve independently
  on each side; data does not leak across.
- alauda-app does **not** require Yifan to pause development on the source
  repos. Source-repo iteration continues in parallel.
- alauda-app **opportunistically cherry-picks** logic-relevant changes from
  upstream after fork & lift; sync is best-effort, not mechanical mirror.

---

# Section 1: Blueprint shape and deliverable

The blueprint is a **pure documentation** commit to the alauda-app repository.
**No code is produced by this brainstorming.** Implementation (the Phase 1-7
runbook in Section 6) happens later, on Jason's schedule, with zero
disruption to Yifan's source-repo work.

## Final blueprint folder layout (alauda-app repo)

```
alauda-app/
├── README.md                     ← Blueprint entry, overview
├── architecture/
│   ├── decisions.md              ← All ADRs (meta principle + the 8 decisions + α/isolation + sync strategy)
│   ├── system-diagram.md         ← Mermaid diagram: Next app + Worker + DB + Redis + external services
│   ├── integration-points.md     ← Catalog of "seams" where the two products meet
│   └── constants.md              ← Index of inherited operational constants (auth expiry, BullMQ concurrency, SERP QPS, Reviews velocity cap, Place cache TTL, Vercel Cron cadence) with pointers into source repos
├── domain/
│   └── data-model.md             ← Merged Prisma schema sketch + ER diagram (mermaid)
├── specs/
│   ├── shell.md                  ← Sidebar v2, header dropdown, BusinessSwitcher, root-route behaviour
│   ├── auth.md                   ← `@alauda/auth` API, middleware decision tree, magic-link callback flow
│   ├── routing.md                ← Full route table: public + authed, web + api
│   ├── scan-integration.md       ← Local_Map_SEO → alauda-app file mapping
│   └── reviews-integration.md    ← Review_MLP → alauda-app file mapping
├── ops/
│   ├── deployment.md             ← Vercel + Railway, env variable groups, external services list
│   └── database.md               ← Neon + PostGIS setup, baseline migration strategy
└── plan/
    ├── fork-and-lift-day.md      ← Phase 0-6 step-by-step runbook (one-time)
    └── sync-strategy.md          ← Phase 7 ongoing cherry-pick flow (continuous)
```

## What this blueprint does NOT include (vs website-rebuild's blueprint)

- **No `evals/` folder** — alauda-app is platform integration, not a new product.
  Evals stay in the source repos.
- **No marketing copy / design system** — not a marketing site (T3).

## What this blueprint adds

- **`plan/sync-strategy.md`** — α + isolation coexistence with source repos
  requires a documented sync flow.

---

# Section 2: Monorepo physical layout

```
alauda-app/
├── apps/
│   ├── web/                       ← Single Next.js 14 app (拓扑 1)
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── (public)/      ← No-chrome layout
│   │   │   │   │   ├── page.tsx           ← `/`: redirect by auth state
│   │   │   │   │   ├── login/
│   │   │   │   │   ├── signup/
│   │   │   │   │   ├── scan/r/[token]/    ← Scan public share + opengraph-image
│   │   │   │   │   └── reviews/r/[token]/ ← Reviews customer rating page
│   │   │   │   ├── (platform)/    ← Authed layout: sidebar + topbar + business context
│   │   │   │   │   ├── dashboard/
│   │   │   │   │   ├── scan/      ← Lifted from Local_Map_SEO (platform)/seo-map/*
│   │   │   │   │   └── reviews/   ← Lifted from Review_MLP owner/*
│   │   │   │   └── api/
│   │   │   │       ├── auth/      ← magic-link signup / request / verify
│   │   │   │       ├── scan/      ← /api/scans/* + /api/business/* from Local_Map_SEO
│   │   │   │       ├── reviews/   ← /api/owner/* + /api/review-request from Review_MLP
│   │   │   │       ├── r/[token]/ ← Reviews public API (rate / suggest / feedback / google-click)
│   │   │   │       ├── cron/      ← Vercel Cron (Reviews send loop)
│   │   │   │       └── sms/       ← Twilio status callback
│   │   │   ├── components/        ← Shell: TopBar, Sidebar, BusinessSwitcher, UserDropdown
│   │   │   ├── lib/               ← Per-product lib merged (phone, contact, scheduling,
│   │   │   │                         notifier, ai-review, business, grid, …)
│   │   │   ├── hooks/
│   │   │   └── middleware.ts      ← Auth guard + business cookie + public allowlist
│   │   ├── next.config.mjs
│   │   ├── tailwind.config.ts
│   │   └── vercel.json            ← Vercel Cron config
│   │
│   └── worker/                    ← BullMQ consumer on Railway. Lifted from Local_Map_SEO/apps/worker.
│       └── src/...
│
├── packages/
│   ├── db/                        ← S1 flat Prisma schema
│   │   ├── prisma/
│   │   │   ├── schema.prisma      ← Place / TrackedBusiness / Scan / GridPoint / ScanResult /
│   │   │   │                         UsageLedger / User / Business / ReviewRequest
│   │   │   └── migrations/        ← Single baseline migration (history reset)
│   │   └── src/
│   │       ├── index.ts           ← Singleton PrismaClient
│   │       └── jobs.ts            ← QUEUE_NAMES + SerpFetchJobData
│   │
│   ├── auth/                      ← A1 magic-link, lifted from Review_MLP/src/lib
│   │   └── src/
│   │       ├── index.ts           ← Public API
│   │       ├── jwt.ts             ← jose HS256
│   │       ├── magic-link.ts      ← Magic-link email render + Resend send
│   │       └── middleware-helper.ts
│   │
│   └── jobs/                      ← Lifted from Local_Map_SEO/packages/jobs
│       └── src/
│           ├── serp.ts
│           ├── cache-key.ts
│           ├── rate-limit.ts
│           └── providers/
│
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── tsconfig.base.json
└── package.json
```

## YAGNI: packages NOT created

- **`packages/ui`** — single Next app has only one consumer; shell components stay in `apps/web/src/components`.
- **`packages/email` / `packages/notify`** — Reviews notifier stays in `apps/web/lib` (product-internal); worker's Resend usage stays in `apps/worker`; auth's magic-link email lives inside `packages/auth`. Duplicating a thin Resend wrapper is cheaper than a forced shared package.
- **`packages/types`** — types come from Prisma generation + each app's own definitions.

## Dependency graph

- `apps/web` → `@alauda/db`, `@alauda/auth`, `@alauda/jobs`
- `apps/worker` → `@alauda/db`, `@alauda/jobs`
- `@alauda/auth` → `@alauda/db` (uses `User` model)
- `@alauda/db`, `@alauda/jobs` → no internal deps

## Naming

`@alauda/*` package namespace (renamed from Local_Map_SEO's `@repo/*` during fork & lift).

---

# Section 3: Auth (`@alauda/auth`) + Data (`@alauda/db`)

## `@alauda/auth` — A1 magic-link

### Public API

| Function | Purpose |
|---|---|
| `getSession()` | Returns `{ userId, email } \| null` from cookie |
| `requireOwner(redirectTo?)` | Strict version — throws Next redirect to `/login?next=<current>` if unauth'd |
| `signMagicLink(email)` / `sendMagicLinkEmail(email)` | Generate magic-link JWT (`purpose: "magic"`, 15-min expiry); the second sends via Resend |
| `verifyMagicLink(token)` | Verify and return email |
| `setSessionCookie / clearSessionCookie` | Session JWT 30-day, HttpOnly, SameSite=Lax |

### Middleware helper (`middleware-helper.ts`)

Accepts a public-route allowlist + the request → returns `{ kind: 'public' \| 'authed' \| 'redirect' }`. `apps/web/middleware.ts` composes this with Local_Map_SEO's existing `?businessId=` → cookie promotion logic.

### Inherited from Review_MLP without redesign

- `jose` HS256 JWT, `AUTH_SECRET` env (32+ byte random)
- Same session cookie name as Review_MLP
- Magic-link / session JWT claim shapes

### Sole integration-layer schema change

`Business.lastMagicLinkSentAt` → `User.lastMagicLinkSentAt`. Reason: Review_MLP put it on Business because `Business = Owner` there; now User is the identity, so per-User rate-limit is the correct semantics. This is a passive consequence of the User table existing, not a redesign.

### Ownership resolution per product

- **Reviews**: runtime `Business.ownerEmail = currentUser.email`. **Business schema unchanged** — soft bridge.
- **Scan**: `TrackedBusiness.userId = currentUser.id`. Fork & lift migration tightens `userId` to NOT NULL (matches Local_Map_SEO README's planned post-pilot migration).

## `@alauda/db` — S1 flat schema

Single Neon Postgres + PostGIS extension. `schema.prisma` shape:

```
// === Identity ===
model User {
  id                  String    @id @default(cuid())
  email               String    @unique
  lastMagicLinkSentAt DateTime?     // ← migrated from Review_MLP/Business
  createdAt           DateTime  @default(now())
  trackedBusinesses   TrackedBusiness[]
}

// === Scan tool (Local_Map_SEO inherited as-is) ===
model Place             { /* PostGIS lat/lng + googlePlaceId + 7-day cache */ }
model TrackedBusiness   { /* userId NOT NULL after fork & lift */ }
// (omitted: full bodies of Scan, GridPoint, ScanResult, UsageLedger — inherited unchanged from Local_Map_SEO/packages/db/prisma/schema.prisma)

// === Reviews tool (Review_MLP inherited as-is) ===
model Business {
  // All fields preserved: name, ownerEmail (unique, soft-bridge to User.email),
  // googlePlaceId, googleReviewUrl, googleBusinessType, googleEditorialSummary,
  // ownerDescription, aiPromptOverride, smsTemplate
  // Removed only: lastMagicLinkSentAt (moved to User)
}
model ReviewRequest     { /* unchanged */ }
```

### Migration strategy: baseline reset

Because alauda-app has no paid users, `prisma/migrations/` does **not** preserve either source repo's migration history. The first migration is the merged-schema initialisation. Rationale: merging two independent migration graphs across project lines is hard with zero benefit (no production data to protect).

### Single PrismaClient

`@alauda/db` exports a singleton. `apps/web` and `apps/worker` both import from it (avoids Next.js dev-mode connection leaks). BullMQ job types also live here (preserves Local_Map_SEO's existing convention).

### External services (managed in `ops/`)

| Service | Use | Source repo origin |
|---|---|---|
| Neon (PG + PostGIS) | App DB | shared |
| Upstash Redis | BullMQ broker | Scan |
| Resend | auth email + Reviews email + Scan completion email | shared |
| Twilio | Reviews SMS + status webhook | Reviews |
| Anthropic | Reviews AI draft | Reviews |
| Serper / DataForSEO | Scan SERP | Scan |
| Google Places API | Place ID lookup | shared |
| Mapbox | Scan report map | Scan |

---

# Section 4: Routing model + Shell + Middleware

## Public routes (`(public)/` group, no chrome)

| Path | Purpose | Origin |
|---|---|---|
| `/` | Logged-out → 307 `/login`; logged-in → 307 `/dashboard` | new |
| `/login` | Magic-link request form | Review_MLP `/owner/login` |
| `/signup` | Self-serve signup | Review_MLP `/owner/signup` |
| `/scan/r/[token]` | Scan public read-only report share (+ OG image) | Local_Map_SEO `/r/<token>` |
| `/reviews/r/[token]` | Reviews customer rating page | Review_MLP `/r/[token]` |

## Public APIs (middleware-allowlisted; endpoints self-verify)

| Path | Verification |
|---|---|
| `/api/auth/{signup,request,verify}` | Magic-link mechanism itself |
| `/api/r/[token]/{rate,suggest,feedback,google-click}` | Token is the public rating token |
| `/api/cron/send-reviews` | Bearer `CRON_SECRET` |
| `/api/sms/status-callback` | Twilio HMAC-SHA1 |

## Authed routes (`(platform)/` group, with sidebar + header + business context)

| Path | Origin |
|---|---|
| `/dashboard` | new (cross-tool overview: current business + Scan/Reviews/Reports cards) |
| `/scan` → tools home / report list | Local_Map_SEO `/seo-map` |
| `/scan/new` / `/scan/reports` / `/scan/reports/[id]` / `/scan/settings` | Local_Map_SEO equivalents |
| `/reviews` → dashboard | Review_MLP `/owner/dashboard` |
| `/reviews/new` / `/reviews/settings` | Review_MLP `/owner/new` / `/owner/settings` |

Authed APIs: `/api/scan/*` + `/api/reviews/*` (full table in `specs/routing.md`).

## Shell layout (`(platform)/layout.tsx`)

```
┌──────────────────────────────────────────────────────┐
│ TopBar                                                │
│ ┌──────┐                              ┌─────────────┐ │
│ │ Logo │ BusinessSwitcher (current)   │ avatar ▼    │ │
│ └──────┘                              └─────────────┘ │
├─────────────┬────────────────────────────────────────┤
│ Sidebar     │                                         │
│             │                                         │
│ 🗺 Scan     │     {children}                          │
│ ⭐ Reviews  │                                         │
│ 📊 Reports  │                                         │
│   (soon)    │                                         │
└─────────────┴────────────────────────────────────────┘
```

### Components

- **TopBar** — logo + `BusinessSwitcher` + `UserDropdown`
- **BusinessSwitcher** — lists current User's businesses (Reviews `Business` + Scan `TrackedBusiness`, deduped at UI layer by `googlePlaceId`). Click → write `currentBusinessId` cookie. Collapses to read-only text when only one business. Pattern from Local_Map_SEO's `BusinessProvider` Context + `useBusiness()` hook.
- **UserDropdown** — avatar + email; dropdown contains only **Sign out** (Account/Billing TBD when those features exist).
- **Sidebar** — Sidebar v2 three items (Scan / Reviews / Reports soon). No global Settings entry.

### Onboarding forced flow (first login, zero businesses)

`(platform)/layout.tsx` detects User has zero businesses → renders onboarding instead of tool content. Flow: business name input + Google Place lookup. On commit, **dual-write**: a `Business` row (Reviews side, `ownerEmail = currentUser.email`) + a `TrackedBusiness` row (Scan side, `userId = currentUser.id`) sharing the same `Place`. Both tools immediately usable post-onboarding.

## Middleware decision tree (`apps/web/middleware.ts`)

```
1. Public-page allowlist hit  → next()
2. Public-API allowlist hit   → next()  // endpoint self-verifies
3. Not authenticated          → 307 /login?next=<encoded path>
4. Has ?businessId= query     → write currentBusinessId cookie + 307 sans query
5. Cookie has no business
   AND path != /dashboard     → 307 /dashboard
6. next()
```

Public allowlist: `/`, `/login`, `/signup`, `/scan/r/*`, `/reviews/r/*`, `/api/auth/*`, `/api/r/*`, `/api/cron/*`, `/api/sms/*`, static assets.

### Magic-link callback

Inherits Review_MLP's behaviour: `/api/auth/verify?token=xxx` is a GET endpoint. Success → set session cookie + 307 to `next` (default `/dashboard`). Failure → 307 `/login?error=invalid_or_expired`. No new `/login/verify` route.

## R1 implementation note

Both public routes are **first-class real route files**, no `next.config.mjs` rewrite tricks:

- `apps/web/src/app/(public)/scan/r/[token]/page.tsx` (+ `opengraph-image.tsx`)
- `apps/web/src/app/(public)/reviews/r/[token]/page.tsx`

`/api/r/*` is reserved for **Reviews** (it owns the `r` semantics). Scan public pages are server-rendered read-only, no public API namespace conflict.

---

# Section 5: Worker + Deployment topology

## Two deploy targets, each owns half

### Vercel ← `apps/web`

Hosts everything except the long-lived Scan worker:

- **Vercel Cron** at `/api/cron/send-reviews` every minute (**Pro plan required** — inherited from Review_MLP)
- **Twilio webhook** at `/api/sms/status-callback`
- All authed pages, public pages, APIs, auth callback

### Railway ← `apps/worker`

Hosts Scan SERP fetch (BullMQ BLPOP, long-lived, doesn't fit Vercel function timeout). Inherited from Local_Map_SEO with zero changes. 25-concurrency, TokenBucket QPS limit, scan-complete email via Resend. **Worker has no HTTP entry** — pure Redis BLPOP consumer; no domain needed.

## Shared infrastructure (alauda-app's own, isolated from source repos)

| Service | Instances | Consumers |
|---|---|---|
| Neon Postgres + PostGIS | 1 (alauda-app's own) | apps/web + apps/worker |
| Upstash Redis | 1 (alauda-app's own) | apps/web (enqueue) + apps/worker (consume) |
| Resend / Twilio (own number) / Anthropic / Serper / Google Places / Mapbox | 1 account each | per-app as needed |

## Deployment commands

**Vercel**:
- Root: `apps/web`
- Build: `pnpm --filter @alauda/db migrate:deploy && pnpm --filter @alauda/web build` (the `migrate:deploy` script in `@alauda/db` wraps `prisma migrate deploy`, inherited from Local_Map_SEO's existing scripts)
- Migration runs before web build; failed migration → failed deploy → no broken schema goes live.

**Railway**:
- Root: empty (Railpack sees workspace root)
- Build: `echo skip` (worker uses `tsx`, no build step)
- Start: `pnpm --filter @alauda/worker start`

## Env variable groups (full table in `ops/deployment.md`)

| Group | Vars | apps/web | apps/worker |
|---|---|---|---|
| **DB** | `DATABASE_URL`, `POSTGRES_URL_NON_POOLING` | ✓ | ✓ |
| **Queue** | `REDIS_URL` (or `KV_URL` fallback) | ✓ | ✓ |
| **Auth** | `AUTH_SECRET`, `APP_URL` | ✓ | — |
| **Email** | `RESEND_API_KEY`, `RESEND_FROM` | ✓ | ✓ (scan-complete) |
| **SMS (Reviews)** | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` | ✓ | — |
| **Cron** | `CRON_SECRET` | ✓ | — |
| **AI (Reviews)** | `ANTHROPIC_API_KEY` | ✓ | — |
| **SERP (Scan)** | `SERPER_API_KEY` (or DataForSEO), `SERP_QPS`, `SERP_WORKER_CONCURRENCY` | — | ✓ |
| **Places** | `GOOGLE_PLACES_API_KEY` | ✓ | — |
| **Map (Scan)** | `NEXT_PUBLIC_MAPBOX_TOKEN` | ✓ | — |

Each app validates required vars via `env.ts` (zod, fail-fast) at startup.

## Domain

`alauda.ai` single A/CNAME → Vercel `apps/web`. No sub-domains. Railway worker has no public networking.

## Inherited limitation: PR preview + Scan worker

PR preview deploys: Vercel auto-builds `apps/web`. Railway does not auto-deploy preview workers. Result: on a PR preview, "create scan" enqueues but no worker consumes — scans stuck on `queued`. Reviews / auth / scan-report-viewing are fully functional.

**This is inherited as-is from the source repos.** Both Local_Map_SEO and Review_MLP work around it with local dev (`pnpm dev:web` + `pnpm dev:worker`) for full-stack testing. alauda-app does the same. Solving preview workers is post-blueprint follow-up work, not a blueprint decision.

## Local dev

```bash
pnpm install                   # postinstall runs prisma generate
cp .env.example .env           # fill DB / Redis / API keys
pnpm db:migrate:deploy
pnpm dev:web                   # terminal 1: http://localhost:3000
pnpm dev:worker                # terminal 2: connects to Upstash dev Redis
```

`.env.example` ships in the blueprint with all required keys + comments pointing to source.

---

# Section 6: Fork & lift runbook + Ongoing sync

## Phase ordering (final)

```
Phase 0  Preconditions
  ↓
Phase 1  Skeleton + packages (db / auth / jobs)
  ↓
Phase 2  apps/web shell + login (base + 登录)         ← swapped from earlier draft
  ↓
Phase 3  apps/worker stand-up
  ↓
Phase 4  Lift Scan
  ↓
Phase 5  Lift Reviews
  ↓
Phase 6  alauda-app's own first deploy (dogfood-only)  ← NOT a point of no return
  ↓
Phase 7  Ongoing sync flow                             ← continuous, not a one-time event
```

Every phase is one PR — independently reviewable, independently revertable. After Phase 2, sign-in works; after Phase 4, Scan works; after Phase 5, Reviews works. Every phase delivers a verifiable "it runs" state.

## Phase 0: Preconditions

- Blueprint final version reviewed + committed
- alauda-app's **own dedicated** service instances created (NOT under Yifan's source-repo accounts):
  - **New** Neon project (PostGIS extension on)
  - **New** Upstash Redis instance (independent BullMQ broker; no cross-talk with source-repo workers)
  - Resend: same account ok, but **new sender domain** (e.g. `noreply@app.alauda.ai`) — keeps reputation separate from Review_MLP's
  - Twilio: **new phone number** — Review_MLP's number stays with its production
  - Anthropic / Google Places / Mapbox / Serper: same account keys ok (no shared write-state, no cross-talk risk)
- **Yifan is NOT required to pause** source-repo development. Source repos iterate at full speed.

## Phase 1: Skeleton + packages

- **Scaffold**: `pnpm-workspace.yaml`, `package.json`, `tsconfig.base.json`, empty `apps/`, `packages/`
- **`@alauda/db`**: copy `Local_Map_SEO/packages/db`; append `Business` + `ReviewRequest` from Review_MLP (drop `lastMagicLinkSentAt`, move it to `User`). Delete migration history; run `prisma migrate dev --name baseline` to generate single baseline.
- **`@alauda/jobs`**: verbatim copy of `Local_Map_SEO/packages/jobs`; rename `@repo/jobs` → `@alauda/jobs`.
- **`@alauda/auth`**: extract `auth.ts` + `magic-link.ts` + `session.ts` + `token.ts` from `Review_MLP/src/lib`, package them; export the public API listed in Section 3.

**Verify**: `pnpm install && pnpm typecheck` passes.

## Phase 2: apps/web shell + login

- Next.js 14 skeleton at `apps/web`
- `(public)/layout.tsx` minimal; `(platform)/layout.tsx` renders TopBar + Sidebar + children + calls `requireOwner()` + onboarding detection
- `middleware.ts` calls `@alauda/auth/middleware-helper` + reuses Local_Map_SEO's `?businessId=` cookie promotion
- Components: TopBar / Sidebar v2 / BusinessSwitcher (stub, empty list) / UserDropdown (Sign out only)
- Route stubs: `/` redirect, `/login`, `/signup`, `/dashboard`, `/api/auth/*` (copied from Review_MLP and wired to `@alauda/auth`)

**Verify**: locally `pnpm dev:web` → signup → console-mode magic-link → `/dashboard` (blank ok). **At end of Phase 2, sign-in is fully functional.**

## Phase 3: apps/worker stand-up

- Verbatim copy of `Local_Map_SEO/apps/worker/*` → `alauda-app/apps/worker/*`
- Import paths: `@repo/db` → `@alauda/db`; `@repo/jobs` → `@alauda/jobs`
- No other changes

**Verify**: `pnpm dev:worker` starts, log `[worker] serp-fetch ready`. Worker idles on BLPOP (no Scan jobs exist yet — Phase 4 will produce them).

## Phase 4: Lift Scan

Copy from `Local_Map_SEO/apps/web/src`:

| Source | Target |
|---|---|
| `app/(platform)/seo-map/*` | `app/(platform)/scan/*` |
| `app/(public)/r/*` | `app/(public)/scan/r/*` |
| `app/api/scans/*` | `app/api/scan/*` |
| `app/api/business/*` | `app/api/scan/business/*` |
| `lib/*`, `hooks/*` | `apps/web/src/{lib,hooks}/*` (first-mover wins on naming) |

- Lift `BusinessProvider` Context up to `(platform)/layout.tsx`
- Replace cookie-based identity: every server query gets `where userId = currentUser.id`
- Baseline migration already enforces `TrackedBusiness.userId NOT NULL` (no backfill needed)

**Verify**: signup → onboarding creates business → `/scan/new` → worker processes → `/scan/reports/[id]` displays → Share link → incognito loads `/scan/r/[token]` + OG image.

## Phase 5: Lift Reviews

Copy from `Review_MLP/src`:

| Source | Target | Note |
|---|---|---|
| `app/owner/*` | `app/(platform)/reviews/*` | rename owner → reviews |
| `app/r/*` | `app/(public)/reviews/r/*` | |
| `app/api/owner/*` | `app/api/reviews/*` | |
| `app/api/review-request` | `app/api/reviews/review-request` | |
| `app/api/r/*` | `app/api/r/*` | top-level retained (Reviews owns `/r` semantics) |
| `app/api/cron/*` | `app/api/cron/*` | Vercel Cron path unchanged |
| `app/api/sms/*` | `app/api/sms/*` | Twilio webhook path unchanged |
| `lib/{ai-review,contact,scheduling,notifier,email,phone,…}.ts` | `apps/web/src/lib/` | |
| ~~`lib/{auth,magic-link,session,token}.ts`~~ | delete | already in `@alauda/auth` |
| ~~`lib/prisma.ts`~~ | delete | use `@alauda/db` singleton |
| ~~`app/api/auth/*`~~ | delete | already lifted in Phase 2 |
| `vercel.json` cron config | merge into `apps/web/vercel.json` | |

- All Reviews server-side `findFirst({ where: { ownerEmail } })` calls source `ownerEmail` from `currentUser.email` (not from cookie payload)

**Verify**: signup → `/reviews/new` → schedule request → console-mode log → `/r/[token]` → 4 stars → AI draft → 1 star → private feedback → dashboard reflects.

## Phase 1-5 universal constraint: provenance comments

Every lifted file gets a header:

```ts
// origin: AlaudaAI/Local_Map_SEO@<sha>:apps/web/src/lib/grid.ts
// last-synced: 2026-05-04
```

Used for:

- **Traceability** — any future reader can trace back to upstream
- **Sync signal** — when upstream has commits past `last-synced`, that triggers Phase 7 cherry-pick decisions

Lifted files **drift naturally** from upstream. The blueprint accepts drift; sync reconciles manually, not as a 1:1 mirror.

## Phase 6: alauda-app's own first deploy (dogfood-only)

- Vercel: new project (alauda-app repo), root `apps/web`, **Pro plan**, env from Phase 0 isolated services
- Railway: new project, start `pnpm --filter @alauda/worker start`, env from Phase 0
- Twilio console: alauda-app's own number's status callback URL → `https://alauda.ai/api/sms/status-callback`
- Production smoke (Jason / Yifan with real phone + email): signup → onboarding → one scan with real keyword → one review request → end-to-end pass

**After deploy**:
- alauda-app does **not** receive real end users — dogfood-only with Jason + Yifan + invited internal seeds.
- Source repos continue serving their own users on their own production.
- "When to migrate real users to alauda-app" = a future independent decision, not in this blueprint.

**This is NOT a point of no return.** alauda-app's Vercel + Railway can be turned off any time; source-repo production is unaffected (isolation guarantees it).

## Phase 7: Ongoing sync flow (continuous, not one-time)

Captured in `plan/sync-strategy.md`:

- **Triggers**: meaningful upstream changes — schema changes, bug fixes, new features, prompt tweaks, dependency upgrades
- **Cadence**: weekly scan of source-repo `main` against `last-synced` sha (no need to track every commit)
- **Flow**:
  1. `git log <last-synced-sha>..HEAD -- <path>` on source repo → see what changed
  2. Decide: cherry-pick / adapt / skip
     - **cherry-pick**: small change, no integration side-effects → patch directly
     - **adapt**: change touches a boundary that was modified during lift (auth / route namespace / DB bridge) → rewrite equivalent logic in alauda-app
     - **skip**: change is meaningful only in source-repo shape → not applicable here
  3. Update file's `last-synced` sha
  4. Open PR in alauda-app
- **Do NOT use**: git subtree / submodule / automated mirror tooling — too brittle, integration adaptation is human work
- **Responsibility**: alauda-app maintainer (Jason) pulls sync; source-repo author (Yifan) does not need to push to alauda-app
- **Schema-change special handling**: schema delta in source repo is the heaviest sync event. alauda-app does **not** copy migration files (alauda-app uses baseline-reset strategy); instead, write an equivalent alauda-app migration manually + run tests for data-shape compatibility.

## Rollback strategy

- **Phase 1-5 failure**: revert that PR; alauda-app falls back to previous phase. **Zero production impact** (neither alauda-app's own prod nor source-repo prod).
- **Phase 6 failure**: delete alauda-app's Vercel/Railway projects; source-repo production unaffected (isolation pays off); retry on another day.
- **Phase 7**: continuous run, no "failure" concept — a sync that doesn't go smoothly is just skipped, retried later.

---

# Provenance convention (re-stated for the blueprint)

Every file lifted from a source repo carries a header:

```ts
// origin: AlaudaAI/<repo>@<sha>:<path-in-source-repo>
// last-synced: YYYY-MM-DD
```

This is the only mechanical artifact that makes Phase 7 sync work without
git subtree / submodule complexity. Updated on every cherry-pick.

# What's next

After this spec is approved, the next step is invoking the
`superpowers:writing-plans` skill to create the implementation plan for
the blueprint deliverable itself — i.e., the multi-document blueprint
inside `architecture/`, `domain/`, `specs/`, `ops/`, `plan/`. The plan
is "produce N markdown documents that articulate the decisions in this
spec," not "execute the fork & lift runbook." Fork & lift runbook
execution comes later, on Jason's schedule.
