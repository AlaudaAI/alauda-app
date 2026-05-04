# Scan Integration Specification

This spec documents how `AlaudaAI/Local_Map_SEO` lifts into alauda-app:
file-by-file mapping for `apps/web`, `apps/worker`, and `packages/`,
the identity-bridging changes the lift requires, what does NOT change,
and verification. Consumed by Phase 3 (worker stand-up) and Phase 4
(lift Scan) of [`../plan/fork-and-lift-day.md`](../plan/fork-and-lift-day.md).

The lift is mechanical: most files copy verbatim with a provenance
header and a package-name rename. The integration-layer edits are
small, named, and bounded — three bullets in the section below. Every
other source file ships unchanged.

## File mapping (apps/web side)

Source paths are relative to `Local_Map_SEO/apps/web/src/`. Target
paths are relative to `alauda-app/apps/web/src/`. Routes move into
their tool namespace per
[`./routing.md`](./routing.md); library and hook files keep their
names because no Reviews-side collision exists at the time of the
Phase 4 lift.

| Source (`Local_Map_SEO/apps/web/src/`) | Target (`alauda-app/apps/web/src/`) |
|---|---|
| `app/(platform)/seo-map/*` | `app/(platform)/scan/*` |
| `app/(public)/r/*` (read-only share + `opengraph-image.tsx`) | `app/(public)/scan/r/*` |
| `app/api/scans/*` | `app/api/scan/*` |
| `app/api/business/*` | `app/api/scan/business/*` |
| `lib/business.ts`, `lib/cookies.ts`, `lib/google-places.ts`, `lib/google-maps-link.ts`, `lib/grid.ts`, `lib/business-radius.ts`, `lib/queue.ts`, `lib/scan-metrics.ts`, `lib/scan-status.ts`, `lib/server-timing.ts` | `lib/*` (first-mover wins on naming when Reviews lift in Phase 5 collides) |
| `hooks/use-scan-status.ts`, `hooks/use-point-detail.ts`, `hooks/use-competitor-view.ts` | `hooks/*` |
| `components/TopBar.tsx`, `components/Sidebar.tsx` | **Replaced by alauda-app shell components** (see [`./shell.md`](./shell.md)) — original Scan TopBar / Sidebar discarded |
| `middleware.ts` (Local_Map_SEO original `?businessId=` cookie promotion) | Composed into `apps/web/middleware.ts` alongside `@alauda/auth/middleware-helper` |
| `env.ts` (zod validation) | Merged into `apps/web/env.ts` (combined with Reviews env vars) |

The route renames cascade through every internal link, every `redirect()`
call, and every `Link href={...}` in the lifted files. The Phase 4
lift includes one mechanical sweep that rewrites these in-place after
the verbatim copy.

## File mapping (apps/worker side)

`Local_Map_SEO/apps/worker/*` lifts to `alauda-app/apps/worker/*` as
a verbatim copy with two changes only: package-name renames in the
import paths and in `package.json`. The worker has no UI, no routing,
and no auth surface, so no other edits apply.

| Source | Target | Change |
|---|---|---|
| `apps/worker/src/index.ts` | `apps/worker/src/index.ts` | import paths `@repo/db` → `@alauda/db`, `@repo/jobs` → `@alauda/jobs` |
| `apps/worker/src/redis.ts` | `apps/worker/src/redis.ts` | unchanged |
| `apps/worker/src/env.ts` | `apps/worker/src/env.ts` | unchanged (worker has its own env, no merge with apps/web) |
| `apps/worker/src/serp-adapter.ts` | `apps/worker/src/serp-adapter.ts` | unchanged |
| `apps/worker/src/email.ts` | `apps/worker/src/email.ts` | unchanged (Resend wrapper for scan-complete email) |
| `apps/worker/src/processors/echo.ts` | `apps/worker/src/processors/echo.ts` | unchanged |
| `apps/worker/src/processors/serp-fetch.ts` | `apps/worker/src/processors/serp-fetch.ts` | unchanged |
| `apps/worker/package.json` | `apps/worker/package.json` | rename `@repo/worker` → `@alauda/worker`, dep specs `@repo/db` → `@alauda/db` etc. |

Phase 3 (worker stand-up) lands these files first against an empty
`packages/db` and proves the BLPOP loop runs against dev Upstash. Phase
4 then connects the producer side (`/api/scan/*`) to the same queue.

## File mapping (packages side)

`packages/db` is the only package that takes integration-layer edits;
`packages/jobs` lifts verbatim. Reviews models are added in Phase 5
when the Reviews lift lands — Phase 4 ships only the Scan-side schema
plus the three integration-layer field changes from
[`../domain/data-model.md`](../domain/data-model.md).

| Source | Target | Change |
|---|---|---|
| `Local_Map_SEO/packages/db/prisma/schema.prisma` | `alauda-app/packages/db/prisma/schema.prisma` | merged with Reviews models (`Business` + `ReviewRequest`); `User.lastMagicLinkSentAt` field added; `Business.lastMagicLinkSentAt` removed; `TrackedBusiness.userId` NOT NULL |
| `Local_Map_SEO/packages/db/prisma/migrations/*` | `alauda-app/packages/db/prisma/migrations/baseline/` | history reset; single baseline migration captures merged schema |
| `Local_Map_SEO/packages/db/src/index.ts` | `alauda-app/packages/db/src/index.ts` | unchanged (singleton PrismaClient) |
| `Local_Map_SEO/packages/db/src/jobs.ts` | `alauda-app/packages/db/src/jobs.ts` | unchanged (BullMQ job-data types) |
| `Local_Map_SEO/packages/db/package.json` | `alauda-app/packages/db/package.json` | rename `@repo/db` → `@alauda/db` |
| `Local_Map_SEO/packages/jobs/*` | `alauda-app/packages/jobs/*` | verbatim copy; rename `@repo/jobs` → `@alauda/jobs` in package.json |

The baseline migration referenced above is generated once the merged
`schema.prisma` is in place; it captures every Scan table and every
Reviews table in one shot. See migration policy in
[`../domain/data-model.md`](../domain/data-model.md).

## Identity-bridging changes (only)

The lift requires three changes that are not pure file moves. Each
exists because Local_Map_SEO assumed cookie-based identity and a single
implicit user; alauda-app assumes a real `User` table and a session
cookie issued by `@alauda/auth`.

1. **`BusinessProvider` Context lift.** Local_Map_SEO mounts
   `BusinessProvider` in `(platform)/seo-map/layout.tsx`. alauda-app
   lifts it to `(platform)/layout.tsx` so both Scan and Reviews share
   the same current-business context. Implementation: same
   `BusinessProvider` source, different mount point. The lift also
   means the provider becomes the single reader of the
   `currentBusinessId` cookie, and both tools read it from the same
   React context.
2. **Cookie identity replaced by session.** Local_Map_SEO uses
   cookie-based identity (no auth). Every server query that previously
   read identity from `cookies()` now reads from `getSession()` via
   `@alauda/auth` ([`./auth.md`](./auth.md)). Specifically: every Scan
   query gains `where: { userId: currentUser.id }` in its Prisma call,
   and `currentUser` is resolved once at the top of the request handler
   instead of per-query. The `currentBusinessId` cookie still scopes
   the active business, but identity itself moves to the session JWT.
3. **`TrackedBusiness.userId` NOT NULL enforcement.** The baseline
   migration (Phase 1) tightens `userId` from nullable to NOT NULL. No
   backfill needed because alauda-app starts empty. This matches
   `Local_Map_SEO`'s README note about the planned post-pilot tighten,
   and turns the soft cookie identity into a hard FK against `User.id`
   per
   [`../architecture/integration-points.md`](../architecture/integration-points.md)
   seam 3.

These three are the entire integration delta on the Scan side. Every
other Scan behaviour ships unchanged.

The auth bridge for Scan is exclusively a **hard FK** against `User.id`;
there is no email-based ownership lookup for Scan rows. The contrast
with Reviews — which keeps the `Business.ownerEmail` soft bridge — is
deliberate and lives in
[`../architecture/integration-points.md`](../architecture/integration-points.md)
seam 3.

## What does NOT change

The lift is deliberately conservative. The list below is the concrete
inventory of Scan behaviour that ships verbatim and is **not**
re-implemented, re-styled, or re-architected during the Phase 4 lift:

- BullMQ queue name (`serp-fetch`) and its job-data shape.
- Processor logic, retry policy, and exponential backoff timings.
- `TokenBucket` QPS limiting and rate-limit math in
  `apps/worker/src/serp-adapter.ts`.
- `Place` 7-day cache logic (`lastFetchedAt` gating, see
  [`../domain/data-model.md`](../domain/data-model.md)).
- Mapbox component and its token-gating fallback ("Map disabled" card
  when no token is configured).
- Right-panel layout, pin styling (`pin-style.ts`), and competitor
  view-mode toggle.
- Grid math: 5x5 layout, 25 points, radius math in
  `lib/business-radius.ts` and `lib/grid.ts`.
- Server-Timing headers emitted by API routes.
- Business setup flow (Place text-search + select). Invoked from
  onboarding ([`./shell.md`](./shell.md)) or from `/scan/settings`.
- Public scan share template and OG image generation
  (`opengraph-image.tsx` under `app/(public)/scan/r/`).
- The provider-mocking switch (mock SERP provider in dev mode).
- Magic-link-free dev flow for scans — the user signs in via
  console-mode magic links, but the scan submission flow itself is
  unchanged from Local_Map_SEO.

## Verification

After Phase 4 lift completes, the following end-to-end flow must work
locally with `pnpm dev:web` plus `pnpm dev:worker` plus a dev Neon
database plus dev Upstash. This is the expanded Phase 4 verify line
from [`../plan/fork-and-lift-day.md`](../plan/fork-and-lift-day.md):

1. Sign up at `/signup` with a fresh email — console-mode magic-link
   logs to terminal.
2. Click magic link — land on `/dashboard` (or onboarding if zero
   businesses).
3. Onboarding creates one `Business` plus one `TrackedBusiness` sharing
   one `Place` ([`./shell.md`](./shell.md)).
4. Navigate to `/scan/new` — submit keyword plus radius — POST to
   `/api/scan` — 25 jobs enqueued to Upstash.
5. Worker logs show `[serp-fetch]` lines as it processes the 25 jobs
   (mock provider in dev mode).
6. `/scan/reports/[id]` page shows the report with map plus right
   panel (Mapbox token required for map; "Map disabled" card otherwise).
7. Click "Share" on the report — copies a `/scan/r/[token]` URL to
   clipboard.
8. Open the share URL in incognito — public read-only report renders
   plus OG image at `/scan/r/[token]/opengraph-image`.

If any step fails, the lift is not done; the failing step pinpoints
which file mapping above needs another pass:

- Steps 1–3 failing means the `(platform)/layout.tsx` shell, onboarding
  dual-write, or `@alauda/auth` wiring is wrong — see
  [`./shell.md`](./shell.md) and [`./auth.md`](./auth.md).
- Step 4 failing means the producer side of the queue (`/api/scan`,
  `lib/queue.ts`) did not lift cleanly, or the worker is not reachable
  from dev Upstash.
- Steps 5–6 failing means the worker-side processor or the
  `/scan/reports/[id]` reader did not lift cleanly; both should
  be byte-for-byte identical to source minus the package renames.
- Steps 7–8 failing means the public-share namespace move
  (`(public)/r/*` → `(public)/scan/r/*`) missed a route or a link, or
  the `opengraph-image.tsx` did not move with its parent route.

## Provenance

Every lifted file in `apps/web`, `apps/worker`, and `packages/` carries
the standard provenance header at the top of the file:

```ts
// origin: AlaudaAI/Local_Map_SEO@<commit-sha>:apps/web/src/lib/grid.ts
// last-synced: YYYY-MM-DD
```

The header is machine-grep-able and serves two purposes:

- **Traceability** — any alauda-app file can be traced back to the
  source-repo file it lifted from, which is the basis for source-side
  bug-fix backports.
- **Phase 7 sync signal** — the `last-synced` date is the input to the
  upstream-diff tool that flags drifted files. Detail in
  [`../plan/sync-strategy.md`](../plan/sync-strategy.md).

Files that have no source-repo origin (e.g., `apps/web/middleware.ts`
which composes Scan and auth middleware) carry an `origin: alauda-app
(integration)` marker instead, so the sync tool can skip them cleanly.
