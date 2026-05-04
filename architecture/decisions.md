# Architecture Decisions

This document is the canonical record of every decision the alauda-app
blueprint makes. It begins with a meta principle that scopes the work,
then captures the eight integration ADRs, the source-repo coexistence
model, and the items the blueprint explicitly defers.

Every decision elsewhere in the blueprint — routing, schema, deployment,
runbook — descends from an ADR here. When two specs disagree, this file
wins.

## ADR-001: Meta principle

> **Blueprint decides integration conflicts only. It does not redesign
> source project internals.**

Anything `Local_Map_SEO` or `Review_MLP` already does — BullMQ as the
async base, Resend as the email provider, the Vercel Pro plan dependency,
existing env variable names, each project's Prisma migration strategy,
internal field shapes, internal AI prompts, and so on — is inherited
verbatim. The blueprint only resolves the unavoidable seams that appear
when two products fold into one Next.js app, one Postgres database, one
auth flow, and one URL space.

This principle constrains every following ADR. It is the reason the
blueprint discusses route namespacing but not how SERP fetching works,
why it picks a Prisma schema layout but not a new ORM, and why it
freezes the worker topology rather than rebuilding it on Inngest.
"Obvious" questions about source-repo internals are deliberately not
answered here — they are out of scope by construction.

The shape of every ADR below reflects this principle. Each one names
the integration seam, names the choice, names the alternatives that
were rejected, and names the consequences. None of them redesign source
internals.

## ADR-002: Fork & Lift (C)

**Context:** Two existing source repos must become one product platform.
The integration shape determines how every other decision is framed.

**Decision:** Adopt the **fork & lift** model — create a new monorepo
`alauda-app` that lifts code from both source repos, while the source
repos continue independent development.

**Rejected alternatives:**

- **A — Clean monorepo with stop-the-world migration** — rejected because
  it would freeze both source repos for the duration of the migration
  and disrupt active product work.
- **B — Polyrepo plus reverse-proxy shell** — rejected because routing
  two separate Next.js apps behind a shell breaks the unified product
  UX (one cookie, one layout, one URL space) that LocalRank-style
  integration requires.

**Consequences:**

- Establishes alauda-app as a new repository with its own deploy
  targets, isolated from source-repo infrastructure (see
  [ADR-010](#adr-010-source-repo-coexistence-alpha--isolation)).
- Forces every lifted file to carry a provenance header naming its
  source-repo SHA and last-synced date, so drift is auditable.
- Introduces an ongoing cherry-pick sync flow as a permanent workstream
  rather than a one-time migration (see
  [`plan/sync-strategy.md`](../plan/sync-strategy.md)).
- Permits per-phase rollback during fork & lift execution because the
  source repos remain the system of record until alauda-app receives
  real users.

## ADR-003: Single Next.js App (Topology 1)

**Context:** With two products folded into one platform, the runtime
topology decides how URLs, sessions, and layouts are shared.

**Decision:** Run a **single Next.js app** at `apps/web` that serves
every route — `/dashboard`, `/scan/*`, `/reviews/*`, and the public
share/rating flows — under one process, one cookie, and one root
layout.

**Rejected alternatives:**

- **Topology 2 — Per-product Next.js apps plus a shell app in a
  monorepo** — rejected because three Next.js processes multiply build
  surface, complicate session sharing, and make the shell a runtime
  dependency rather than a layout concern.
- **Topology 3 — Sub-domain split with multiple deployments** — rejected
  because cross-sub-domain cookies and layout consistency add friction
  for no current product gain.

**Consequences:**

- Concentrates routing in a single `app/` directory split into
  `(public)/` and `(platform)/` route groups (see
  [`specs/routing.md`](../specs/routing.md)).
- Makes the platform layout the single owner of `BusinessProvider`
  context, sidebar, and onboarding gating (see
  [`specs/shell.md`](../specs/shell.md)).
- Reduces deploy surface to two targets — Vercel for `apps/web` and
  Railway for `apps/worker` — instead of three or more.
- Defers any future per-product split to a topology migration, not a
  routine refactor.

## ADR-004: Magic-link Auth in `packages/auth` (A1)

**Context:** Both source repos need a single identity model after merge.
The auth implementation must be shared by every authed page and API.

**Decision:** Port Review_MLP's magic-link flow into a new
`packages/auth` workspace package, exposing `getSession`,
`requireOwner`, magic-link sign and send helpers, and middleware
plumbing.

**Rejected alternatives:**

- **A2 — Hosted IDP (Clerk, WorkOS, Auth0, Supabase Auth)** — rejected
  because no SSO or SAML need exists today and a hosted IDP imposes
  vendor lock-in for benefits the SMB owner persona does not consume.
- **A3 — Separate sign-in IDP repo** — rejected because a third
  deployable adds operational cost without integration leverage.
- **A4 — Interface-only abstraction with implementation deferred** —
  rejected because Review_MLP's magic-link is the most mature existing
  asset and shipping requires a real implementation now.

**Consequences:**

- Ports `jose` HS256 JWTs, the Resend-based magic-link email, and the
  30-day session cookie verbatim from Review_MLP.
- Moves `lastMagicLinkSentAt` from `Business` (Review_MLP's owner-equals-
  business assumption) onto `User`, the only integration-layer schema
  edit auth requires (see [`specs/auth.md`](../specs/auth.md)).
- Resolves Reviews ownership at runtime via
  `Business.ownerEmail = currentUser.email` — a soft email bridge that
  leaves Review_MLP's schema otherwise unchanged.
- Tightens `TrackedBusiness.userId` to NOT NULL during the baseline
  migration, matching Local_Map_SEO's planned post-pilot tightening.

## ADR-005: Public Route Namespacing (R1)

**Context:** Both products expose customer-facing public flows
(Scan share reports, Reviews customer rating pages) and the URL space
must accommodate both.

**Decision:** Namespace public routes under each tool —
`/scan/r/[token]` for Scan share reports and `/reviews/r/[token]` for
Reviews customer rating pages — with both implemented as first-class
route files, no rewrites.

**Rejected alternatives:**

- **R2 — Semantic top-level routes (`/r/[token]`, `/share/[token]`)** —
  rejected because shorter URLs save SMS segments only marginally and
  cost legibility when a third public flow is added.
- **R3 — Sub-domain split for public flows** — rejected because it
  fragments the cookie and the layout for a use case (read-only public
  pages) that does not benefit from isolation.

**Consequences:**

- Reserves the `/api/r/*` namespace for Reviews because Reviews owns
  the `r` semantics; Scan public pages render server-side and need no
  public API namespace.
- Locates both pages under `(public)/` so they inherit the no-chrome
  layout (see [`specs/routing.md`](../specs/routing.md)).
- Defers SMS-length optimization to a post-launch rewrite if real
  message-cost data ever justifies it.
- Keeps the Open Graph image co-located with the Scan share page as
  `opengraph-image.tsx`, matching Local_Map_SEO's existing structure.

## ADR-006: Worker Topology Unchanged (W1)

**Context:** Scan runs long-lived SERP fetches via BullMQ on Railway
while Reviews runs a per-minute send loop via Vercel Cron. The merged
platform must decide whether to unify the async base.

**Decision:** Keep both async patterns — **BullMQ plus a Railway worker
for Scan, Vercel Cron for Reviews** — coexisting in alauda-app, with no
migration to a unified base.

**Rejected alternatives:**

- **W2 — Migrate Scan to Vercel Cron or Inngest, drop Railway** —
  rejected because long-lived BLPOP consumers do not fit Vercel
  function timeouts and re-platforming a working SERP pipeline violates
  the meta principle (see [ADR-001](#adr-001-meta-principle)).
- **W3 — Move Reviews to BullMQ for a unified async pattern** —
  rejected because Reviews' send loop is well served by Vercel Cron
  and standing up a second BullMQ consumer adds runtime cost for no
  product benefit.

**Consequences:**

- Splits deploy targets between Vercel (`apps/web` and the Reviews
  cron) and Railway (`apps/worker` BullMQ consumer).
- Requires both apps to import the same `@alauda/jobs` package so
  job-data shapes stay aligned (see
  [`ops/deployment.md`](../ops/deployment.md)).
- Inherits the PR-preview limitation that Railway does not auto-deploy
  preview workers, leaving "create scan" stuck on `queued` in preview
  environments — a known gap the source repos already work around with
  local dev.
- Leaves Inngest or any other async unification as future work, off the
  blueprint's critical path.

## ADR-007: Flat Prisma Schema (S1)

**Context:** Two product schemas must share one Postgres database. The
schema layout decides how name conflicts and migration history are
managed.

**Decision:** Use a **flat Prisma schema** in `packages/db` with all
models in the `public` schema, no Prisma multi-schema feature, and a
single baseline migration.

**Rejected alternatives:**

- **S2 — Prisma multi-schema feature with per-product Postgres
  schemas** — rejected because Scan and Reviews share zero model names
  and multi-schema layering buys abstraction the data does not need.
- **S3 — Prefix every model per product (`ScanPlace`, `ReviewsBusiness`,
  ...)** — rejected because no actual collisions exist; renaming every
  model adds churn for nothing.

**Consequences:**

- Enables PostGIS as a single extension, used by Scan's `Place` model
  and reusable by future tools (see
  [`ops/database.md`](../ops/database.md)).
- Resets migration history in `prisma/migrations/` — the first
  migration is the merged-schema initialisation, not a replay of either
  source repo's history. Acceptable because alauda-app has no paid
  users to protect.
- Exports a single `PrismaClient` from `@alauda/db` so `apps/web` and
  `apps/worker` share one connection-pool convention and avoid Next.js
  dev-mode connection leaks.
- Co-locates BullMQ job-data types in `@alauda/db` to preserve
  Local_Map_SEO's existing convention.

## ADR-008: No Marketing Site (T3)

**Context:** The root URL `alauda.ai/` must do something. The choice
sets whether marketing content exists at all.

**Decision:** Ship **no marketing site**. The root path redirects by
auth state — logged-out users go to `/login`, logged-in users go to
`/dashboard` — and `alauda.ai` is a single Vercel deployment with no
sub-domains.

**Rejected alternatives:**

- **T1 — Single Next.js app handles both marketing and product** —
  rejected because no marketing copy or design system exists today;
  building one is a separate product effort.
- **T2 — Sub-domain split (`alauda.ai` marketing, `app.alauda.ai`
  product)** — rejected because it locks the platform into a sub-domain
  shape before any marketing strategy informs it.

**Consequences:**

- Implements `/` as a 307 redirect by auth state with no landing page
  template (see [`specs/routing.md`](../specs/routing.md)).
- Keeps the evolution path open — T3 can become T1 (marketing on the
  same domain) or T2 (sub-domain split) without lock-in, because
  no marketing content has been committed.
- Simplifies DNS to one A/CNAME record pointing at Vercel.
- Removes any need for a marketing-stack design system, copywriting
  pipeline, or CMS in the blueprint.

## ADR-009: Tools-only Sidebar (Sidebar v2)

**Context:** The platform shell must decide what enters the sidebar
and where global versus per-tool settings live.

**Decision:** Render a **tools-only sidebar** with three entries —
Scan, Reviews, and Reports (Coming Soon). Per-tool settings stay
namespaced under each tool. No global Settings entry exists. The
account dropdown sits in the header right and contains only Sign out.

**Rejected alternatives:**

- **Sidebar v1 — Sidebar with a global Settings entry that consolidates
  per-product settings** — rejected because no account-level settings
  exist today (no billing, no notifications, no profile fields beyond
  email) and a global Settings page would surface empty content.

**Consequences:**

- Locates Reviews settings at `/reviews/settings` and Scan settings at
  `/scan/settings`, both inside the `(platform)/` group (see
  [`specs/shell.md`](../specs/shell.md)).
- Reserves the dropdown for Sign out only; Account and Billing entries
  are deferred until the underlying features exist.
- Renders Reports as a disabled "Coming Soon" entry rather than a live
  tool route — the placeholder ships in the sidebar, not in the URL
  space.
- Leaves room to add a global Settings entry later when account-level
  features land, without forcing the design now.

## ADR-010: Source-repo Coexistence (alpha + isolation)

**Context:** alauda-app launches alongside two actively maintained
source repos. The relationship between alauda-app and those repos
must be defined explicitly so neither side blocks the other.

**Decision:** Run alauda-app as a fully **independent deployment with
zero shared infrastructure** with the source repos. alauda-app is
**alpha** — the future Alauda platform, dogfooded internally — while
`Local_Map_SEO` and `Review_MLP` continue independent development on
their own production. Sync from upstream is **opportunistic
cherry-pick**, not a mechanical mirror.

**Rejected alternatives:**

- **Pause source-repo development during fork & lift** — rejected
  because it blocks Yifan's product velocity for a migration that does
  not require a freeze.
- **Share infrastructure (Postgres, Redis, Twilio number, Resend
  domain) between alauda-app and source repos** — rejected because
  schema or job-shape drift on either side would corrupt the other,
  and "isolation pays off" is the rollback story for Phase 6.
- **Automated mirror via git subtree or submodule** — rejected because
  integration adaptation (auth bridge, route namespacing, schema
  merge) is human work that mechanical mirroring cannot perform
  correctly.

**Consequences:**

- Provisions alauda-app's own Neon project, Upstash Redis, Twilio
  phone number, and Resend sender domain — every stateful service is
  separate from the source repos (see
  [`ops/deployment.md`](../ops/deployment.md)).
- Permits source-repo iteration to continue at full speed; alauda-app
  pulls changes, source repos do not push.
- Drives the provenance-comment convention on every lifted file and
  the weekly sync cadence in
  [`plan/sync-strategy.md`](../plan/sync-strategy.md).
- Defers any source-repo sunset decision out of this blueprint;
  "when to migrate real users to alauda-app" is a separate future
  call.

## ADR-011: Out-of-scope items

The following items are deliberately not decided in this blueprint.
Each is listed with the rationale for deferral so future readers know
they were considered, not forgotten. This ADR uses a flat bulleted
list; it has no Decision or Rejected-alternatives section because each
item is a non-decision.

- **D1 Business / TrackedBusiness field unification** — deferred
  because the soft email bridge (`Business.ownerEmail` matched against
  `currentUser.email`) plus `TrackedBusiness.userId` is sufficient for
  alpha; field-level merging is a data migration that needs real
  multi-tool usage data to design correctly.
- **Agency, multi-location, membership, and role model** — deferred
  because alauda-app's identity model is a flat `User` with owned
  businesses; multi-tenant role logic has no current product driver
  and would force schema decisions that might not match the eventual
  shape.
- **Stripe billing** — deferred until product launch; no paying users
  exist during alpha, and billing requires its own design pass on
  pricing, plans, and entitlement enforcement.
- **Async-base unification (W2 Inngest migration, W3 BullMQ for
  Reviews)** — deferred because each product's existing async pattern
  works and the meta principle forbids redesigning source internals
  without integration cause (see
  [ADR-006](#adr-006-worker-topology-unchanged-w1)).
- **Marketing site** — deferred because no marketing copy or design
  system exists today; the root redirect under
  [ADR-008](#adr-008-no-marketing-site-t3) keeps every evolution path
  open.
- **Global Settings page** — deferred because no account-level
  settings (billing, notifications, profile beyond email) exist; an
  empty Settings surface is worse than no surface (see
  [ADR-009](#adr-009-tools-only-sidebar-sidebar-v2)).
- **Internal feature redesign of either product** — deferred by the
  meta principle itself; BullMQ choice, Resend choice, AI prompts, env
  variable names, and internal field shapes are inherited verbatim
  (see [ADR-001](#adr-001-meta-principle)).
- **Freezing or sunsetting the source repos** — deferred because
  alauda-app's alpha-plus-isolation posture explicitly requires the
  source repos to keep iterating; their eventual sunset is a separate
  future decision outside this blueprint's scope (see
  [ADR-010](#adr-010-source-repo-coexistence-alpha--isolation)).
