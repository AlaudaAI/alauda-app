# Fork & Lift Day Runbook

This runbook is prescriptive: each Phase has explicit commands, verification, and rollback. Phases 0-6 are one-time events; [Phase 7 (continuous sync)](./sync-strategy.md) lives in a separate file.

Read this end-to-end before starting. Each phase is one PR — independently reviewable, independently revertable. After Phase 2, sign-in works. After Phase 4, Scan works. After Phase 5, Reviews works. After Phase 6, alauda-app's own production is live in dogfood-only posture per [ADR-010](../architecture/decisions.md#adr-010-source-repo-coexistence-alpha--isolation).

The runbook never asks the operator to redesign source-repo internals — that is forbidden by [ADR-001 (the meta principle)](../architecture/decisions.md#adr-001-meta-principle). Every step below is either a verbatim file lift, a named integration-layer edit (the small set documented in [`../specs/scan-integration.md`](../specs/scan-integration.md) and [`../specs/reviews-integration.md`](../specs/reviews-integration.md)), or an infrastructure provisioning action.

## Phase ordering

```
Phase 0  Preconditions
  |
Phase 1  Skeleton + packages (db / auth / jobs)
  |
Phase 2  apps/web shell + login        <-- sign-in fully functional at end
  |
Phase 3  apps/worker stand-up
  |
Phase 4  Lift Scan
  |
Phase 5  Lift Reviews
  |
Phase 6  First deploy (dogfood-only)   <-- NOT a point of no return
  |
Phase 7  Ongoing sync (./sync-strategy.md, continuous)
```

Phases 1-5 are local file changes; only Phase 6 touches production infrastructure. That invariant is the rollback story — see [Rollback strategy summary](#rollback-strategy-summary) at the bottom of this document.

## Phase 0: Preconditions

### Goals

Verify all preconditions before starting. No code changes here. Provision dedicated services on alauda-app's own accounts so source-repo production is never touched per [ADR-010](../architecture/decisions.md#adr-010-source-repo-coexistence-alpha--isolation).

### Steps

- [ ] Confirm blueprint final version is committed and reviewed on this repo's `main` branch. Run `git log --oneline -1 main` and verify the SHA matches the agreed-upon blueprint commit.
- [ ] Provision dedicated services (NEW, NOT under any source-repo account):
  - [ ] **New Neon project** — create a fresh Neon project (do not reuse Local_Map_SEO's or Review_MLP's). Pick a region close to Vercel's `apps/web` region; US-East is the typical default. Enable PostGIS in the Neon SQL editor:
    ```sql
    CREATE EXTENSION IF NOT EXISTS postgis;
    ```
    Capture both `DATABASE_URL` (pooled) and `POSTGRES_URL_NON_POOLING` (direct) from the Neon dashboard. See [`../ops/database.md#neon-project-setup`](../ops/database.md#neon-project-setup).
  - [ ] **New Upstash Redis instance** — create a fresh Upstash database for alauda-app's BullMQ broker. Capture `REDIS_URL`. Do not reuse Local_Map_SEO's Redis — schema or job-shape drift on either side would corrupt the other.
  - [ ] **Resend** — same account ok, but provision a NEW sender domain (e.g. `noreply@app.alauda.ai`). Verify the domain via DNS records before going live. Keeping the sender separate from Review_MLP's preserves Review_MLP's sender reputation independently.
  - [ ] **Twilio** — buy a NEW phone number on the existing account. Review_MLP's number stays with its production. Capture `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`.
  - [ ] **Anthropic / Google Places / Mapbox / Serper** — same account keys ok (no shared write-state, no cross-talk risk). Capture `ANTHROPIC_API_KEY`, `GOOGLE_PLACES_API_KEY`, `NEXT_PUBLIC_MAPBOX_TOKEN`, `SERPER_API_KEY`.
  - [ ] Generate `AUTH_SECRET` (32+ random bytes) and `CRON_SECRET` (any random string) with `openssl rand -base64 32`.
- [ ] **Vercel project** — provision a new project pointing at the alauda-app repo. Set Root Directory to `apps/web`, framework preset to Next.js, plan to Pro (Vercel Cron sub-hour cadence is required by Reviews per [ADR-006](../architecture/decisions.md#adr-006-worker-topology-unchanged-w1)). Do NOT trigger a deploy yet — env vars are filled in Phase 6. See the Vercel section of [`../ops/deployment.md`](../ops/deployment.md).
- [ ] **Railway project** — provision a new project pointing at the alauda-app repo. Set Start Command to `pnpm --filter @alauda/worker start`, leave Root Directory empty (let Railpack discover the workspace root). Do NOT trigger a deploy yet — env vars are filled in Phase 6. See the Railway section of [`../ops/deployment.md`](../ops/deployment.md).
- [ ] Confirm Yifan does NOT need to pause source-repo development. Source repos iterate at full speed during fork & lift execution per [ADR-010](../architecture/decisions.md#adr-010-source-repo-coexistence-alpha--isolation).
- [ ] Pin the source-repo SHAs that this lift will reference. Capture `git rev-parse main` from each:
  ```bash
  ( cd ../Local_Map_SEO && git rev-parse main )
  ( cd ../Review_MLP && git rev-parse main )
  ```
  Record both SHAs in a scratch note — every provenance header written in Phases 1-5 cites one of these two SHAs.

### Verify

All service account dashboards show alauda-app-specific resources distinct from source-repo's:

- Neon dashboard lists a fresh project (no Local_Map_SEO tables yet — empty schema).
- Upstash dashboard lists a fresh Redis (no `bull:*` keys yet).
- Twilio dashboard lists the new phone number; Review_MLP's number is untouched.
- Resend dashboard shows the new sender domain in `verified` state.
- Vercel and Railway projects exist with no successful deploys yet (no env vars filled).

### Rollback

N/A — pre-execution only. If you abort Phase 0, tear down provisioned services from each vendor's dashboard. No alauda-app code exists at this point, so there is nothing to revert in git.

## Phase 1: Skeleton + packages

### Goals

Build the monorepo skeleton plus three packages: `@alauda/db`, `@alauda/auth`, `@alauda/jobs`. End state: `pnpm install && pnpm typecheck` passes. Source repos are untouched throughout.

### Steps

- [ ] **PR 1.1: scaffold the monorepo.** Create the workspace files at the repo root.
  ```bash
  cd alauda-app
  cat > pnpm-workspace.yaml <<'EOF'
  packages:
    - apps/*
    - packages/*
  EOF

  cat > package.json <<'EOF'
  {
    "name": "alauda-app",
    "private": true,
    "packageManager": "pnpm@9.12.3",
    "scripts": {
      "dev:web": "pnpm --filter @alauda/web dev",
      "dev:worker": "pnpm --filter @alauda/worker dev",
      "build": "pnpm -r build",
      "lint": "pnpm -r lint",
      "typecheck": "pnpm -r typecheck",
      "db:migrate": "pnpm --filter @alauda/db migrate",
      "db:migrate:deploy": "pnpm --filter @alauda/db migrate:deploy",
      "db:studio": "pnpm --filter @alauda/db studio"
    },
    "engines": { "node": ">=20", "pnpm": ">=9" }
  }
  EOF

  mkdir -p apps packages
  ```
  Add a minimal `tsconfig.base.json` and commit. PR title: `chore: scaffold monorepo`.

- [ ] **PR 1.2: lift `@alauda/db`.** Copy `Local_Map_SEO/packages/db` into `packages/db`, then merge in Reviews models and apply the three integration-layer schema edits per [`../domain/data-model.md#integration-layer-changes-only`](../domain/data-model.md#integration-layer-changes-only).
  ```bash
  cp -r ../Local_Map_SEO/packages/db packages/db
  ```
  Edit `packages/db/prisma/schema.prisma`:
  - Append the `Business` and `ReviewRequest` models from `Review_MLP/prisma/schema.prisma`.
  - Remove `lastMagicLinkSentAt` from the `Business` model.
  - Add `lastMagicLinkSentAt DateTime?` to the `User` model.
  - Tighten `TrackedBusiness.userId` from `String?` to `String` (NOT NULL).
  Then reset migration history and generate the baseline:
  ```bash
  rm -rf packages/db/prisma/migrations
  cd packages/db
  pnpm prisma migrate dev --name baseline
  cd ../..
  ```
  Rename the package: open `packages/db/package.json`, change `"name": "@repo/db"` to `"name": "@alauda/db"`. Add a provenance header to `packages/db/src/index.ts`:
  ```ts
  // origin: AlaudaAI/Local_Map_SEO@<sha>:packages/db/src/index.ts
  // last-synced: 2026-05-04
  ```
  PR title: `feat(db): lift @alauda/db with merged schema and baseline migration`.

- [ ] **PR 1.3: lift `@alauda/jobs`.** Verbatim copy.
  ```bash
  cp -r ../Local_Map_SEO/packages/jobs packages/jobs
  ```
  Open `packages/jobs/package.json` and rename `"name": "@repo/jobs"` to `"name": "@alauda/jobs"`. Update any internal `@repo/jobs` import strings to `@alauda/jobs` with a single ripgrep sweep:
  ```bash
  rg -l '@repo/jobs' packages/jobs | xargs sed -i '' 's|@repo/jobs|@alauda/jobs|g'
  ```
  Add provenance headers to every source file. PR title: `feat(jobs): lift @alauda/jobs verbatim`.

- [ ] **PR 1.4: build `@alauda/auth`.** Extract from `Review_MLP/src/lib`. Per [ADR-004](../architecture/decisions.md#adr-004-magic-link-auth-in-packagesauth-a1) and [`../specs/auth.md`](../specs/auth.md), copy four files into the new package.
  ```bash
  mkdir -p packages/auth/src
  cp ../Review_MLP/src/lib/auth.ts        packages/auth/src/auth.ts
  cp ../Review_MLP/src/lib/magic-link.ts  packages/auth/src/magic-link.ts
  cp ../Review_MLP/src/lib/session.ts     packages/auth/src/session.ts
  cp ../Review_MLP/src/lib/token.ts       packages/auth/src/token.ts
  ```
  Add `packages/auth/package.json`:
  ```json
  {
    "name": "@alauda/auth",
    "version": "0.0.0",
    "private": true,
    "main": "./src/index.ts",
    "types": "./src/index.ts",
    "dependencies": {
      "@alauda/db": "workspace:*",
      "jose": "^5.0.0",
      "resend": "^4.0.0"
    }
  }
  ```
  Add `packages/auth/src/index.ts` re-exporting the seven public API functions from [`../specs/auth.md#public-api`](../specs/auth.md#public-api): `getSession`, `requireOwner`, `signMagicLink`, `sendMagicLinkEmail`, `verifyMagicLink`, `setSessionCookie`, `clearSessionCookie`. Add `packages/auth/src/middleware-helper.ts` exposing the middleware composition pattern referenced in [`../specs/auth.md#middleware-decision-tree`](../specs/auth.md#middleware-decision-tree). Replace every `import { prisma } from '@/lib/prisma'` with `import { prisma } from '@alauda/db'`. Add provenance headers. PR title: `feat(auth): build @alauda/auth from Review_MLP magic-link source`.

### Verify

```bash
pnpm install                        # postinstall runs prisma generate
pnpm typecheck                      # all 3 packages pass
ls packages/db/prisma/migrations/   # one directory: <timestamp>_baseline
```

Expected:

- Zero typecheck errors across `packages/db`, `packages/jobs`, `packages/auth`.
- Exactly one baseline migration directory under `packages/db/prisma/migrations/`.
- `pnpm install` completes without warnings about workspace resolution.
- `node -e "require('@alauda/auth')"` from the repo root resolves the package (smoke-only — full functional check waits for Phase 2).

### Rollback

Revert the failing PR (1.1, 1.2, 1.3, or 1.4) with `git revert <sha>` or `git reset --hard <previous-phase-tip>`. Source repos are completely untouched in Phase 1 — there is nothing external to undo. If `prisma migrate dev` half-applied a baseline against the dev Neon branch, drop and recreate the branch from the Neon dashboard, then re-run the failing PR's migration step on a clean slate.

## Phase 2: apps/web shell + login

### Goals

End-of-phase: `/signup` -> magic link -> `/dashboard` works locally. Sidebar, TopBar, UserDropdown render. No tools yet — the dashboard is an empty stub. Per [`../specs/shell.md`](../specs/shell.md) and [`../specs/auth.md`](../specs/auth.md).

### Steps

- [ ] Create `apps/web` from the Next.js 14 template, then refactor to the `src/app/` layout.
  ```bash
  pnpm create next-app@14 apps/web --typescript --tailwind --eslint --app --no-src-dir
  ```
  Move generated `apps/web/app/` to `apps/web/src/app/`, update `tsconfig.json` `paths` accordingly, and rename the package to `@alauda/web` in `apps/web/package.json`.

- [ ] Add workspace deps to `apps/web/package.json`:
  ```json
  {
    "dependencies": {
      "@alauda/db": "workspace:*",
      "@alauda/auth": "workspace:*",
      "@alauda/jobs": "workspace:*",
      "jose": "^5.0.0",
      "resend": "^4.0.0",
      "@anthropic-ai/sdk": "^0.30.0",
      "libphonenumber-js": "^1.10.0",
      "date-fns-tz": "^3.0.0",
      "zod": "^3.23.0",
      "ioredis": "^5.4.0",
      "mapbox-gl": "^3.0.0"
    }
  }
  ```
  Run `pnpm install` to refresh the lockfile.

- [ ] Add the two route group layouts. `apps/web/src/app/(public)/layout.tsx` is a minimal pass-through (no chrome). `apps/web/src/app/(platform)/layout.tsx` calls `requireOwner()` from `@alauda/auth`, mounts `BusinessProvider`, queries the two onboarding-detection counts (zero `Business` + zero `TrackedBusiness` -> render onboarding), and renders TopBar + Sidebar + children. Implementation contract: [`../specs/shell.md#onboarding-forced-flow`](../specs/shell.md#onboarding-forced-flow).

- [ ] Add `apps/web/src/middleware.ts` composing `@alauda/auth/middleware-helper` with the `?businessId=` cookie promotion logic from `Local_Map_SEO/apps/web/src/middleware.ts`. Allowlist the public pages and APIs per [`../specs/auth.md#public-allowlist`](../specs/auth.md#public-allowlist). Implement the six-step decision tree from [`../specs/auth.md#middleware-decision-tree`](../specs/auth.md#middleware-decision-tree) verbatim. This file's provenance header reads `origin: alauda-app (integration)` because it composes two upstreams; it is not lifted from a single source.

- [ ] Add shell components per [`../specs/shell.md`](../specs/shell.md):
  - `apps/web/src/components/TopBar.tsx`
  - `apps/web/src/components/Sidebar.tsx` — three items: Scan, Reviews, Reports (Coming Soon, disabled).
  - `apps/web/src/components/BusinessSwitcher.tsx` — stub returning empty list initially. The dual-source query (Reviews `Business` + Scan `TrackedBusiness`, deduped by `googlePlaceId`) lands in Phase 4 and Phase 5 when the model rows actually exist.
  - `apps/web/src/components/UserDropdown.tsx` — Sign out only.

- [ ] Add route stubs:
  - `apps/web/src/app/(public)/page.tsx` — `/` redirect by auth state per [ADR-008](../architecture/decisions.md#adr-008-no-marketing-site-t3): logged-out -> `/login`, logged-in -> `/dashboard`.
  - `apps/web/src/app/(public)/login/page.tsx` — port from `Review_MLP/src/app/owner/login/page.tsx` (promoted to the public group).
  - `apps/web/src/app/(public)/signup/page.tsx` — port from `Review_MLP/src/app/owner/signup/page.tsx`.
  - `apps/web/src/app/(platform)/dashboard/page.tsx` — empty stub. Real content lands in Phase 4 (Scan widgets) and Phase 5 (Reviews widgets).
  - `apps/web/src/app/api/auth/signup/route.ts`, `apps/web/src/app/api/auth/request/route.ts`, `apps/web/src/app/api/auth/verify/route.ts` — port from `Review_MLP/src/app/api/auth/*`. Replace every `import { ... } from '@/lib/auth'` (and friends) with `import { ... } from '@alauda/auth'`. Replace every `import { prisma } from '@/lib/prisma'` with `import { prisma } from '@alauda/db'`. The verify handler implements the success and failure branches per [`../specs/auth.md#magic-link-callback`](../specs/auth.md#magic-link-callback).

- [ ] Add `apps/web/env.ts` (zod) merging the auth and DB env vars from [`../ops/deployment.md#environment-variable-groups`](../ops/deployment.md#environment-variable-groups). For Phase 2 the required set is `DATABASE_URL`, `POSTGRES_URL_NON_POOLING`, `AUTH_SECRET`, `APP_URL`, `RESEND_API_KEY`, `RESEND_FROM`. Set `NOTIFIER_MODE=console` in `.env` so magic-link emails log to the terminal instead of hitting Resend during local dev.

- [ ] Copy `.env.example` from [`../ops/deployment.md#envexample`](../ops/deployment.md#envexample) into `apps/web/.env.example` and `.env.example` at the repo root.

### Verify

```bash
pnpm dev:web                                      # http://localhost:3000
# In another shell:
curl -i http://localhost:3000/                    # 307 -> /login
```

Then in the browser:

1. Visit `/signup`, enter a fresh test email, submit.
2. Console shows the magic-link URL (NOTIFIER_MODE=console). Copy it.
3. Paste into the browser address bar.
4. Land at `/dashboard` with TopBar, empty Sidebar, UserDropdown rendered.
5. Click UserDropdown -> Sign out. Redirected to `/login`.
6. Visit `/dashboard` directly. Middleware 307s to `/login?next=%2Fdashboard`.

Expected: signup -> magic-link -> dashboard end-to-end works in console mode. Sign-in is **fully functional** at end of Phase 2 — this is the project's first verifiable "it runs" milestone.

### Rollback

Revert the apps/web PRs with `git revert`. `@alauda/auth` and `@alauda/db` from Phase 1 remain intact and reusable. If the dev Neon branch's `User` table holds stale rows from a failed signup test, truncate with `pnpm db:studio` -> User -> delete, or drop and recreate the dev branch from the Neon dashboard.

## Phase 3: apps/worker stand-up

### Goals

End-of-phase: `pnpm dev:worker` starts and idles on BLPOP. No jobs yet — Phase 4 produces them. Per [`../specs/scan-integration.md#file-mapping-appsworker-side`](../specs/scan-integration.md#file-mapping-appsworker-side).

### Steps

- [ ] Verbatim copy `Local_Map_SEO/apps/worker/` into `alauda-app/apps/worker/`.
  ```bash
  cp -r ../Local_Map_SEO/apps/worker apps/worker
  ```

- [ ] Update import paths from `@repo/db` to `@alauda/db` and `@repo/jobs` to `@alauda/jobs`. One ripgrep sweep handles both:
  ```bash
  rg -l '@repo/(db|jobs)' apps/worker | xargs sed -i '' \
      -e 's|@repo/db|@alauda/db|g' \
      -e 's|@repo/jobs|@alauda/jobs|g'
  ```
  Confirm no stragglers:
  ```bash
  rg '@repo/' apps/worker || echo "clean"
  ```

- [ ] Update `apps/worker/package.json`: rename `"name": "@repo/worker"` to `"name": "@alauda/worker"`, update dep specs `"@repo/db"` -> `"@alauda/db": "workspace:*"` and `"@repo/jobs"` -> `"@alauda/jobs": "workspace:*"`.

- [ ] Add `apps/worker/.env.example` with the worker-side variables from [`../ops/deployment.md#environment-variable-groups`](../ops/deployment.md#environment-variable-groups): `DATABASE_URL`, `POSTGRES_URL_NON_POOLING`, `REDIS_URL`, `RESEND_API_KEY`, `RESEND_FROM`, `SERPER_API_KEY`, `SERP_QPS=4`, `SERP_WORKER_CONCURRENCY=25`.

- [ ] Add provenance headers to every lifted file under `apps/worker/src/`. The header references `Local_Map_SEO` and the SHA captured in Phase 0.

### Verify

```bash
pnpm install                # refreshes the lockfile after worker deps
pnpm dev:worker
```

Look for log lines like:

```
[worker] starting
[worker] redis connected
[serp-adapter] using serper (qps=4)
[worker] serp-fetch ready
```

Expected: worker idles waiting on BLPOP. No jobs to consume yet (Phase 4 connects the producer side). Press `CTRL-C` to stop.

If the worker logs `redis connection refused`, double-check `REDIS_URL` in `apps/worker/.env`. If it logs `prisma client error`, double-check `DATABASE_URL` and that `pnpm db:migrate:deploy` ran against the dev Neon branch.

### Rollback

Revert the apps/worker PR with `git revert`. apps/web from Phase 2 remains functional. The worker has no migrations and writes nothing to Postgres at this phase, so there is no DB cleanup to do.

## Phase 4: Lift Scan

### Goals

End-of-phase: signup -> onboarding -> `/scan/new` -> `/scan/reports/[id]` -> public share works locally. Per [`../specs/scan-integration.md`](../specs/scan-integration.md).

### Steps

- [ ] Apply the file mapping from [`../specs/scan-integration.md#file-mapping-appsweb-side`](../specs/scan-integration.md#file-mapping-appsweb-side). Five batches:

  1. Lift the platform tool routes:
     ```bash
     cp -r ../Local_Map_SEO/apps/web/src/app/\(platform\)/seo-map \
           apps/web/src/app/\(platform\)/scan
     ```

  2. Lift the public share routes (move out of top-level `(public)/r/` into the `scan` namespace per [ADR-005](../architecture/decisions.md#adr-005-public-route-namespacing-r1)):
     ```bash
     mkdir -p apps/web/src/app/\(public\)/scan
     cp -r ../Local_Map_SEO/apps/web/src/app/\(public\)/r \
           apps/web/src/app/\(public\)/scan/r
     ```

  3. Lift the API routes:
     ```bash
     cp -r ../Local_Map_SEO/apps/web/src/app/api/scans   apps/web/src/app/api/scan
     mkdir -p apps/web/src/app/api/scan/business
     cp -r ../Local_Map_SEO/apps/web/src/app/api/business/* \
           apps/web/src/app/api/scan/business/
     ```

  4. Lift the lib + hooks files (first-mover wins on naming; Reviews lift in Phase 5 namespaces under `components/reviews/` to avoid collisions):
     ```bash
     cp ../Local_Map_SEO/apps/web/src/lib/{business,cookies,google-places,google-maps-link,grid,business-radius,queue,scan-metrics,scan-status,server-timing}.ts \
        apps/web/src/lib/
     cp ../Local_Map_SEO/apps/web/src/hooks/{use-scan-status,use-point-detail,use-competitor-view}.ts \
        apps/web/src/hooks/
     ```

  5. Mechanical sweep: rewrite internal links and `redirect()` calls to follow the new namespace. The route renames cascade:
     ```bash
     rg -l '/seo-map' apps/web | xargs sed -i '' 's|/seo-map|/scan|g'
     rg -l "/api/scans" apps/web | xargs sed -i '' 's|/api/scans|/api/scan|g'
     rg -l "/api/business" apps/web | xargs sed -i '' 's|/api/business|/api/scan/business|g'
     rg -l "from '@/lib/prisma'" apps/web | xargs sed -i '' "s|from '@/lib/prisma'|from '@alauda/db'|g"
     ```
     Run `rg "/seo-map|/api/scans" apps/web` after the sweep — expect zero hits.

- [ ] Apply identity-bridging changes per [`../specs/scan-integration.md#identity-bridging-changes-only`](../specs/scan-integration.md#identity-bridging-changes-only):

  1. Lift `BusinessProvider` Context to `apps/web/src/app/(platform)/layout.tsx`. Discard the Local_Map_SEO `(platform)/seo-map/layout.tsx` mount — the platform layout owns the provider for both tools.
  2. Replace cookie-based identity in every server query: at the top of each Route Handler or Server Component, resolve `const currentUser = await requireOwner()` from `@alauda/auth`, and add `where: { userId: currentUser.id }` to every Prisma call that previously read identity from `cookies()`. Cookie-based reads in Local_Map_SEO source files become session-based reads.
  3. Verify the baseline migration enforced `TrackedBusiness.userId NOT NULL` — no app-level change needed if the Phase 1 baseline is correct. Sanity-check with:
     ```bash
     rg 'userId\s+String\?' packages/db/prisma/schema.prisma || echo "tightened"
     ```

- [ ] Add provenance headers to every lifted file (see [Phase 1-5 universal: provenance comments](#phase-1-5-universal-provenance-comments) below).

- [ ] Implement the onboarding component if it didn't already land in Phase 2. Add `apps/web/src/components/Onboarding.tsx` per [`../specs/shell.md#onboarding-forced-flow`](../specs/shell.md#onboarding-forced-flow). The detection logic in `(platform)/layout.tsx` queries both Reviews `Business` and Scan `TrackedBusiness` counts; if both zero, render `Onboarding` in place of `{children}`. The dual-write transaction creates one `Place`, one `TrackedBusiness`, and one `Business` per [`../architecture/integration-points.md#7-onboarding-dual-write`](../architecture/integration-points.md#7-onboarding-dual-write).

### Verify

```bash
pnpm dev:web        # terminal 1
pnpm dev:worker     # terminal 2
```

Browser flow:

1. Sign up at `/signup` with a fresh email.
2. Click the console-mode magic-link URL.
3. Land on onboarding (zero businesses detected).
4. Enter business name + Place lookup -> confirm the matched Place.
5. Land on `/dashboard` (real businesses now exist; onboarding gate clears).
6. Navigate to `/scan/new`. Submit keyword + radius.
7. Worker logs show 25 jobs being processed (`[serp-fetch]` lines).
8. Visit `/scan/reports/[id]`. The map renders with right panel; if `NEXT_PUBLIC_MAPBOX_TOKEN` is unset, the "Map disabled" card renders instead.
9. Click Share -> copy `/scan/r/[token]` URL.
10. Open the share URL in incognito -> public read-only report renders. Visit `/scan/r/[token]/opengraph-image` -> OG image loads.

Expected: full Scan tool works end-to-end. Each failed step pinpoints which file mapping needs another pass — see the diagnostic table in [`../specs/scan-integration.md#verification`](../specs/scan-integration.md#verification).

### Rollback

Revert the Phase 4 PR. Phase 2 + 3 still work; alauda-app reverts to the "shell + login + idling worker" state. The dev Neon branch may carry test scan rows; either delete via `pnpm db:studio` or recreate the branch.

## Phase 5: Lift Reviews

### Goals

End-of-phase: review request creation -> console-mode log -> customer rating page -> AI draft -> private feedback all work. Per [`../specs/reviews-integration.md`](../specs/reviews-integration.md).

### Steps

- [ ] Apply the file mapping from [`../specs/reviews-integration.md#file-mapping-kept-and-moved`](../specs/reviews-integration.md#file-mapping-kept-and-moved). Six batches:

  1. Lift the dashboard, new-request, and settings pages with the `owner -> reviews` rename:
     ```bash
     mkdir -p apps/web/src/app/\(platform\)/reviews
     cp -r ../Review_MLP/src/app/owner/dashboard apps/web/src/app/\(platform\)/reviews/
     cp -r ../Review_MLP/src/app/owner/new       apps/web/src/app/\(platform\)/reviews/new
     cp -r ../Review_MLP/src/app/owner/settings  apps/web/src/app/\(platform\)/reviews/settings
     # owner/dashboard/page.tsx becomes the reviews-namespace root page:
     mv apps/web/src/app/\(platform\)/reviews/dashboard/page.tsx \
        apps/web/src/app/\(platform\)/reviews/page.tsx
     rmdir apps/web/src/app/\(platform\)/reviews/dashboard
     ```
     The `login` and `signup` pages already landed in Phase 2 (promoted to `(public)/`); no copy here.

  2. Lift the public customer rating page:
     ```bash
     mkdir -p apps/web/src/app/\(public\)/reviews/r
     cp -r ../Review_MLP/src/app/r/\[token\] \
           apps/web/src/app/\(public\)/reviews/r/
     ```

  3. Lift the API routes with the namespace renames:
     ```bash
     mkdir -p apps/web/src/app/api/reviews
     cp -r ../Review_MLP/src/app/api/owner/business        apps/web/src/app/api/reviews/business
     cp -r ../Review_MLP/src/app/api/owner/review-request  apps/web/src/app/api/reviews/review-request
     cp -r ../Review_MLP/src/app/api/review-request/route.ts \
           apps/web/src/app/api/reviews/review-request/route.ts
     # Top-level /api/r/* retained per ADR-005 (Reviews owns "r" semantics):
     cp -r ../Review_MLP/src/app/api/r apps/web/src/app/api/r
     # Cron and SMS webhook paths unchanged:
     mkdir -p apps/web/src/app/api/cron apps/web/src/app/api/sms
     cp -r ../Review_MLP/src/app/api/cron/send-reviews \
           apps/web/src/app/api/cron/send-reviews
     cp -r ../Review_MLP/src/app/api/sms/status-callback \
           apps/web/src/app/api/sms/status-callback
     ```

  4. Lift the lib files (no collisions with Scan lib files at this phase):
     ```bash
     cp ../Review_MLP/src/lib/{ai-review,contact,scheduling,notifier,email,phone,sms-template}.ts \
        apps/web/src/lib/
     ```

  5. Lift the components (namespaced under `components/reviews/` to avoid future collision with shell components):
     ```bash
     mkdir -p apps/web/src/components/reviews
     cp ../Review_MLP/src/components/{RatingForm,DeleteRequestButton}.tsx \
        apps/web/src/components/reviews/
     ```

  6. Mechanical sweep: rewrite namespace-renamed paths and replace deleted-import references:
     ```bash
     rg -l '/owner/' apps/web | xargs sed -i '' 's|/owner/|/reviews/|g'
     rg -l "/api/owner" apps/web | xargs sed -i '' 's|/api/owner|/api/reviews|g'
     rg -l "/api/review-request" apps/web | xargs sed -i '' 's|/api/review-request|/api/reviews/review-request|g'
     rg -l "from '@/lib/(auth|magic-link|session|token|prisma|env)'" apps/web | \
        xargs sed -i '' \
          -e "s|from '@/lib/auth'|from '@alauda/auth'|g" \
          -e "s|from '@/lib/magic-link'|from '@alauda/auth'|g" \
          -e "s|from '@/lib/session'|from '@alauda/auth'|g" \
          -e "s|from '@/lib/token'|from '@alauda/auth'|g" \
          -e "s|from '@/lib/prisma'|from '@alauda/db'|g" \
          -e "s|from '@/lib/env'|from '@/env'|g"
     ```
     Run `rg "/owner/|/api/owner|@/lib/(auth|magic-link|session|token|prisma)" apps/web` and expect zero hits.

- [ ] Delete files explicitly per [`../specs/reviews-integration.md#files-explicitly-deleted`](../specs/reviews-integration.md#files-explicitly-deleted). These do NOT lift because Phase 1 already extracted them into `@alauda/auth` and `@alauda/db`:

  - `Review_MLP/src/lib/{auth,magic-link,session,token,prisma,env}.ts` — already in `@alauda/auth` (auth/magic-link/session/token), `@alauda/db` (prisma), or merged into `apps/web/env.ts` (env).
  - `Review_MLP/src/app/api/auth/*` — already lifted in Phase 2. Do not overwrite the Phase 2 versions; if the Phase 2 stubs were minimal, refresh them now from Review_MLP source by copying anew (the Phase 2 routes were intentionally left as a forward-merge target).
  - `Review_MLP/prisma/migrations/*` — history reset; the Phase 1 baseline migration is the new origin per [ADR-007](../architecture/decisions.md#adr-007-flat-prisma-schema-s1).
  - `Review_MLP/prisma/seed.ts` — dropped; alauda-app starts empty.

- [ ] Apply identity-bridging changes per [`../specs/reviews-integration.md#identity-bridging-changes-only`](../specs/reviews-integration.md#identity-bridging-changes-only):

  1. Every Reviews server-side `findFirst({ where: { ownerEmail } })` reads `ownerEmail` from `currentUser.email` resolved via `getSession()` from `@alauda/auth`, not from a cookie payload. The locations are `app/(platform)/reviews/page.tsx`, `app/api/reviews/review-request/*`, `app/api/reviews/business/*`, and `app/api/r/[token]/*`. Soft bridge — no FK from `Business.ownerEmail` to `User.email` per [`../specs/auth.md#reviews`](../specs/auth.md#reviews).
  2. `Business.lastMagicLinkSentAt` was already removed from the schema in the Phase 1 baseline migration. Confirm the lifted code does not reference it:
     ```bash
     rg 'lastMagicLinkSentAt' apps/web/src/app/api apps/web/src/lib
     ```
     Expect every hit to read `User.lastMagicLinkSentAt` (rate-limit relocated per [`../architecture/integration-points.md#4-magic-link-rate-limit-relocation`](../architecture/integration-points.md#4-magic-link-rate-limit-relocation)). Any hit on `Business.lastMagicLinkSentAt` is a stale reference and must be rewritten to `User.lastMagicLinkSentAt`.

- [ ] Merge `Review_MLP/vercel.json` cron config into `apps/web/vercel.json` per [`../ops/deployment.md#vercel-cron`](../ops/deployment.md#vercel-cron):
  ```json
  {
    "crons": [
      { "path": "/api/cron/send-reviews", "schedule": "* * * * *" }
    ]
  }
  ```

- [ ] Add provenance headers to every lifted file.

### Verify

```bash
pnpm dev:web
```

Browser flow (`NOTIFIER_MODE=console` in `.env`):

1. Login (account from Phase 2 or fresh signup).
2. Navigate to `/reviews/new`. Schedule a review request with a real phone number or email.
3. Console log shows the formatted SMS or Email body that would have been sent.
4. Open the `/r/[token]` URL from the console log in incognito.
5. Submit 4 stars + a short note. AI draft appears (Anthropic API call); "Open Google Reviews" link present.
6. Repeat with a fresh request, submit 1 star. Routed to private feedback form. Submit. Confirmation page renders.
7. Reload `/reviews`. Both requests appear in funnel + recent + private feedback panels.

Manual cron tick (Vercel Cron only fires in deployed environments):

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
     http://localhost:3000/api/cron/send-reviews
```

Expected: full Reviews tool works. The cron tick advances any due `pending` rows. Diagnostics for failed steps live in [`../specs/reviews-integration.md#verification`](../specs/reviews-integration.md#verification).

### Rollback

Revert the Phase 5 PR. Phase 1-4 still functional; alauda-app reverts to the "shell + Scan working" state. Twilio test sends from local dev never hit a real number when `NOTIFIER_MODE=console`, so there is no SMS delivery to undo.

## Phase 1-5 universal: provenance comments

Every lifted source file (web, worker, packages) carries a header at the top of the file:

```ts
// origin: AlaudaAI/<repo>@<sha>:<path>
// last-synced: YYYY-MM-DD
```

Used for:

- **Traceability** — any reader can git-blame back to upstream. The header is machine-grep-able, which is the basis for source-side bug-fix backports.
- **Sync signal** — Phase 7 cherry-pick decisions key on the `last-synced` SHA. When source-repo `main` moves past the recorded SHA, the sync tool flags the file as drifted. See [`./sync-strategy.md`](./sync-strategy.md).

Files NOT lifted from a single source — shell components written for alauda-app, the composed `apps/web/middleware.ts`, route renames purely for namespace, the merged `apps/web/env.ts` — carry `origin: alauda-app (integration)` to mark them as integration-layer artifacts. The sync tool skips these cleanly because they have no upstream to compare against.

The header is mandatory. A lifted file without a header is a bug; the Phase 4 and Phase 5 PRs should fail review until every file has one.

## Phase 6: First deploy (dogfood-only)

### Goals

alauda-app's own production goes live, dogfood-only. NOT a point of no return — alauda-app's Vercel + Railway can be turned off any time; source-repo production is unaffected. Per [`../ops/deployment.md`](../ops/deployment.md) and [ADR-010](../architecture/decisions.md#adr-010-source-repo-coexistence-alpha--isolation).

### Steps

- [ ] **Vercel project (created in Phase 0):** import the alauda-app repo, confirm the project settings.
  - Root Directory: `apps/web`
  - Plan: Pro (already confirmed in Phase 0)
  - Framework preset: Next.js
  - Build Command: `pnpm --filter @alauda/db migrate:deploy && pnpm --filter @alauda/web build`
  - Install Command: `pnpm install --frozen-lockfile`
  - Node version: 20

  Fill all env vars per [`../ops/deployment.md#environment-variable-groups`](../ops/deployment.md#environment-variable-groups). Set scope to Production. The required set for `apps/web`: `DATABASE_URL`, `POSTGRES_URL_NON_POOLING`, `REDIS_URL`, `AUTH_SECRET`, `APP_URL=https://alauda.ai`, `RESEND_API_KEY`, `RESEND_FROM=noreply@app.alauda.ai`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `CRON_SECRET`, `ANTHROPIC_API_KEY`, `GOOGLE_PLACES_API_KEY`, `NEXT_PUBLIC_MAPBOX_TOKEN`. Trigger the first build. Verify in Vercel logs:
  - `prisma migrate deploy` runs and reports `1 migration found, 1 applied` (the baseline).
  - Next.js builds without warnings.
  - Deploy promotes to production URL `https://alauda.ai` once the first build succeeds (after DNS, see below).

- [ ] **Railway project (created in Phase 0):** confirm the project settings.
  - Root Directory: empty (Railpack discovers the workspace root)
  - Build Command: `echo skip`
  - Start Command: `pnpm --filter @alauda/worker start`
  - Restart policy: on-failure

  Fill worker env vars: `DATABASE_URL`, `POSTGRES_URL_NON_POOLING`, `REDIS_URL`, `RESEND_API_KEY`, `RESEND_FROM`, `SERPER_API_KEY`, `SERP_QPS=4`, `SERP_WORKER_CONCURRENCY=25`. Trigger the first deploy. Verify Railway logs:
  ```
  [worker] starting
  [worker] redis connected
  [serp-adapter] using serper (qps=4)
  [worker] serp-fetch ready
  ```

- [ ] **Twilio console:** open the alauda-app phone number (purchased Phase 0) and set its **Status callback URL** to `https://alauda.ai/api/sms/status-callback`. Save. Send a test SMS to the number and confirm a callback fires (visible in Vercel function logs as a 200 from `/api/sms/status-callback`). See [`../ops/deployment.md#twilio-configuration`](../ops/deployment.md#twilio-configuration).

- [ ] **DNS:** configure the `alauda.ai` apex to point to Vercel per [`../ops/deployment.md#dns--domain`](../ops/deployment.md#dns--domain). Vercel surfaces the exact A/CNAME records in the project's Domain settings; copy them into the DNS provider. Wait for propagation (`dig alauda.ai +short` shows Vercel's IPs). Re-verify the production deploy resolves at `https://alauda.ai` once DNS is live.

- [ ] **Production smoke test.** Jason and Yifan each run the full flow on real infrastructure. Use real phone numbers and real email addresses; do NOT use customer phone numbers per [`../ops/deployment.md#first-deploy-posture-dogfood-only`](../ops/deployment.md#first-deploy-posture-dogfood-only). Both flows below should pass within the first hour after deploy.
  - Scan: signup -> onboarding -> `/scan/new` with a real keyword -> wait for the 25 SERP jobs to complete (real Serper key consumed) -> `/scan/reports/[id]` renders with map and right panel.
  - Reviews: `/reviews/new` with a real phone number -> real SMS arrives within seconds -> click `/r/[token]` from the SMS -> submit a 4-star rating -> AI draft renders -> copy and paste into Google Reviews to verify the link works.

### Verify

End-to-end flow passes for both Scan and Reviews on production.

- Vercel function logs show 200s on `/api/auth/verify`, `/api/scan`, `/api/reviews/review-request`, `/api/r/[token]/rate`, `/api/cron/send-reviews`.
- Railway worker logs show `[serp-fetch]` lines processing the 25 jobs from the smoke-test scan.
- Neon dashboard's "Tables" view shows non-zero row counts in `User`, `TrackedBusiness`, `Business`, `Place`, `GridPoint`, `Scan`, `ReviewRequest`.
- `gh issue list --state open` shows zero open issues filed during the smoke test.
- A manual cron tick during smoke (Vercel auto-fires it every minute, but you can also force one) advances any pending Reviews to `sent`.

### Rollback

Delete alauda-app's Vercel + Railway projects from each PaaS dashboard. Source-repo production is unaffected because [ADR-010](../architecture/decisions.md#adr-010-source-repo-coexistence-alpha--isolation) isolates infrastructure at the project boundary — different DB, different Redis, different Twilio number, different Resend sender. Internal seed users fall back to the source-repo apps in another tab the same minute.

If only one of the two PaaS deploys broke, you can delete just the broken one and try again on another day after fixing the root cause locally. The DNS record can also be reverted (point `alauda.ai` away from Vercel) without deleting the Vercel project, which preserves env-var configuration for the next attempt.

## Rollback strategy summary

| Phase | If it fails | Cost |
|---|---|---|
| 0 | Tear down provisioned services from each vendor dashboard | none — no code, no users |
| 1 | Revert PR; if baseline migration half-applied to dev Neon, drop the Neon dev branch and recreate | low |
| 2 | Revert apps/web PRs; Phase 1 packages remain | low |
| 3 | Revert apps/worker PR; Phase 2 web remains | low |
| 4 | Revert lift Scan PR; Phase 2 shell still works | low — alauda-app still functional, just no Scan |
| 5 | Revert lift Reviews PR; Phase 4 Scan still works | low — no Reviews, but Scan unaffected |
| 6 | Delete Vercel + Railway projects; source-repo prod untouched | low — isolation guarantees no spillover |
| 7 | Sync that doesn't go smoothly is just skipped, retried later | continuous — see [`./sync-strategy.md`](./sync-strategy.md) |

The key invariant: **Phases 1-5 are local file changes; only Phase 6 touches production infrastructure**. And Phase 6 itself is reversible — alauda-app's prod is dogfood-only with isolated infrastructure per [ADR-010](../architecture/decisions.md#adr-010-source-repo-coexistence-alpha--isolation), so a failed first deploy reduces to "delete the two new PaaS projects and try again next week."

Phase 7 is the only phase that runs continuously after fork & lift — see [`./sync-strategy.md`](./sync-strategy.md) for the cherry-pick cadence and the upstream-diff workflow that keeps alauda-app in step with source-repo evolution.
