# Deployment Operations

alauda-app deploys to two PaaS targets — Vercel for `apps/web` (UI + APIs + Cron) and Railway for `apps/worker` (BullMQ consumer). Both run on alauda-app's own dedicated infrastructure, isolated from source-repo accounts (per [ADR-010](../architecture/decisions.md#adr-010-source-repo-coexistence-alpha--isolation)). Phase 6 of [`../plan/fork-and-lift-day.md`](../plan/fork-and-lift-day.md) executes the first deploy in dogfood-only posture.

This document is the operational runbook for that deploy. It enumerates the project-creation settings on each PaaS, the cron and webhook endpoints they must hit, the full environment variable matrix, the external-service inventory, the local-dev flow, the canonical `.env.example` template, and the inherited limitations the team accepts going in.

The two-target split is not a deployment convenience — it is a topology decision pinned in [ADR-006](../architecture/decisions.md#adr-006-worker-topology-unchanged-w1). Vercel hosts the request/response surface plus the per-minute Reviews send loop (Vercel Cron). Railway hosts the long-lived BullMQ Scan worker that does not fit Vercel's function timeout. Both deploy targets share one Postgres database and one Redis broker, both provisioned NEW on alauda-app's own accounts; nothing here touches Local_Map_SEO's or Review_MLP's running production.

Read this document end-to-end before the first deploy. The Phase 6 checklist in [`../plan/fork-and-lift-day.md`](../plan/fork-and-lift-day.md) assumes the operator has already absorbed the project-creation settings, env matrix, and dogfood posture documented here, and skips back to this file only for the table lookups.

Where this document conflicts with anything implemented in code, the code wins and this document gets updated to match. Where it conflicts with an ADR, the ADR wins and the divergence is a bug to fix.

## Vercel (`apps/web`)

Vercel hosts the entire user-facing surface — every authed page, every public page, every internal API, the auth callback, the Twilio status webhook, and the Reviews send-loop cron. The worker does NOT live here (see [ADR-006](../architecture/decisions.md#adr-006-worker-topology-unchanged-w1)).

### Project setup

- **Root Directory:** `apps/web`
- **Plan:** Pro (required for sub-hour Vercel Cron; inherited from Review_MLP per [ADR-006](../architecture/decisions.md#adr-006-worker-topology-unchanged-w1))
- **Framework preset:** Next.js
- **Build Command:** `pnpm --filter @alauda/db migrate:deploy && pnpm --filter @alauda/web build`
- **Install Command:** `pnpm install --frozen-lockfile`
- **Output Directory:** (Next.js default)
- **Node version:** 20 (matches `engines.node` in `package.json`)

Notes:

- Migration runs before web build; a failed `prisma migrate deploy` short-circuits the build before Next.js compiles, so a broken schema can never go live alongside a healthy bundle.
- alauda-app provisions a NEW Vercel project, not under any source-repo account. The Local_Map_SEO and Review_MLP Vercel projects are untouched by this deploy.
- The `migrate:deploy` script in `@alauda/db` wraps `prisma migrate deploy`; both scripts are inherited from Local_Map_SEO without modification.
- `pnpm install --frozen-lockfile` is mandatory: a drifted lockfile on the deploy host would silently install different transitive versions than local dev resolved. The build fails fast if `pnpm-lock.yaml` is out of sync with `package.json`.
- Vercel's monorepo detection points at `apps/web` as the project root, but the install step still runs from the workspace root so the shared `@alauda/db`, `@alauda/auth`, and `@alauda/worker` packages resolve correctly.

### Vercel Cron

Reviews uses a per-minute send loop instead of BullMQ (see [ADR-006](../architecture/decisions.md#adr-006-worker-topology-unchanged-w1)). The schedule lives in `apps/web/vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/send-reviews", "schedule": "* * * * *" }
  ]
}
```

- **Schedule:** every minute (sub-hour cadence requires the Pro plan)
- **Path:** `/api/cron/send-reviews` (Reviews send loop, see [`../specs/routing.md`](../specs/routing.md))
- **Verification:** the endpoint validates `Authorization: Bearer $CRON_SECRET` before running. Vercel's cron invocations carry that header automatically when `CRON_SECRET` is set in the project's env vars.

The send-reviews handler is idempotent — it scans the database for `Review` rows in `pending` state with `scheduledFor <= now()`, advances them through the state machine, and posts to Twilio. A skipped or duplicated invocation cannot double-send because the state transition is gated on the row's current state. See [`../specs/reviews-integration.md`](../specs/reviews-integration.md) for the full send-loop semantics.

A missed minute (e.g., transient cron outage) self-heals on the next invocation: the next tick picks up every overdue row in one pass, since the query is `scheduledFor <= now()`, not `scheduledFor = now()`. There is no "missed sends" recovery procedure to document because the design treats the cron as a level-triggered scanner rather than an edge-triggered scheduler.

## Railway (`apps/worker`)

Railway hosts the long-lived Scan SERP-fetch worker. It is a pure Redis BLPOP consumer with no public HTTP entry — Vercel function timeouts cannot accommodate a BullMQ worker, which is why this split exists at all.

### Project setup

- **Root Directory:** empty (let Railpack discover the workspace root)
- **Build Command:** `echo skip` (worker uses `tsx`; no build step)
- **Start Command:** `pnpm --filter @alauda/worker start`
- **Restart policy:** on-failure
- **Service type:** worker (no public networking; no domain; pure Redis BLPOP consumer)

Notes:

- alauda-app provisions a NEW Railway project, not under any source-repo account. Local_Map_SEO's Railway worker keeps running on its own production.
- The worker connects to alauda-app's Upstash Redis instance and Neon Postgres instance — both also new, both isolated.
- Concurrency and SERP rate-limit are governed by `SERP_WORKER_CONCURRENCY` and `SERP_QPS` env vars (see the env table below). The TokenBucket implementation is inherited verbatim from Local_Map_SEO; alauda-app does not retune defaults at first deploy.
- Worker logs surface in Railway's per-service log view. There is no separate observability stack at first deploy — Vercel logs cover `apps/web`, Railway logs cover `apps/worker`, and that is sufficient for dogfood traffic.
- A single Railway service is sufficient at first deploy. Horizontal scaling (multiple worker replicas) is BullMQ-safe because each job is delivered to exactly one consumer, but it is not configured at first deploy and is not needed at dogfood volume.
- Restart-on-failure is the only restart policy in use. If a worker process crashes, Railpack restarts it; if the same crash repeats, Railway's built-in backoff prevents a tight loop. Persistent crashes surface in the Railway dashboard and require a code-level fix, not an ops-level retry.

## Twilio configuration

Twilio handles outbound Reviews SMS and posts delivery-status callbacks back to `apps/web`. alauda-app uses a NEW phone number on the shared Twilio account.

- **Phone number:** alauda-app's own (NEW Twilio number, not Review_MLP's)
- **Status callback URL:** `https://alauda.ai/api/sms/status-callback`
- **Inbound webhook URL:** none in v1 (STOP/HELP inbound is on the future-work list, inherited from Review_MLP)

The status-callback handler validates Twilio's signature header before persisting the delivery state — see [`../specs/reviews-integration.md`](../specs/reviews-integration.md) for the full webhook contract.

Buying a new number on the existing Twilio account is deliberate: it gives alauda-app its own sender identity (so opt-out/STOP lists stay scoped per app) without forcing a separate billing relationship. The Review_MLP number continues serving Review_MLP traffic; the two numbers never share state.

Twilio's status callbacks fire for every message lifecycle transition (`queued`, `sent`, `delivered`, `failed`, `undelivered`). The `/api/sms/status-callback` handler persists each transition to the `Review` row's audit fields. A retry of the same callback is safe — the handler upserts on the message SID. The endpoint is allowlisted in middleware (no session cookie required) and verifies Twilio's `X-Twilio-Signature` header on every request; an unsigned or mis-signed request is rejected with 401 before any database write.

## DNS / domain

- `alauda.ai` → A/CNAME record at the apex pointing to Vercel `apps/web`
- No sub-domains (single Next app, single cookie scope, single TLS cert per Topology 1, see [ADR-003](../architecture/decisions.md#adr-003-single-nextjs-app-topology-1))
- Railway worker has no public networking; no domain needed

Vercel's automatic preview URLs (`*.vercel.app`) are left in place for PR previews; production traffic always lands on the apex. There are no environment-specific subdomains (no `staging.alauda.ai`, no `app.alauda.ai`) — the dogfood-only posture means staging is not yet earned, and a single environment keeps the cookie scope unambiguous.

The session cookie is set on the apex host with `Secure` and `HttpOnly`, scoped to the entire domain. Because there are no subdomains, there is also no third-party cookie partitioning concern, no cross-subdomain CSRF surface, and no per-subdomain TLS certificate to manage. This is the operational payoff of Topology 1.

## Environment variable groups

The full env matrix below is the single source of truth for what each app needs. Each app validates required vars via `env.ts` (zod, fail-fast) at startup — a missing var crashes boot rather than 500-ing later.

| Group | Vars | apps/web | apps/worker |
|---|---|---|---|
| **DB** | `DATABASE_URL`, `POSTGRES_URL_NON_POOLING` | yes | yes |
| **Queue** | `REDIS_URL` (or `KV_URL` fallback) | yes | yes |
| **Auth** | `AUTH_SECRET`, `APP_URL` | yes | — |
| **Email** | `RESEND_API_KEY`, `RESEND_FROM` | yes | yes (scan-complete email) |
| **SMS (Reviews)** | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` | yes | — |
| **Cron** | `CRON_SECRET` | yes | — |
| **AI (Reviews)** | `ANTHROPIC_API_KEY` | yes | — |
| **SERP (Scan)** | `SERPER_API_KEY` (or `DATAFORSEO_API_KEY`), `SERP_QPS`, `SERP_WORKER_CONCURRENCY` | — | yes |
| **Places** | `GOOGLE_PLACES_API_KEY` | yes | — |
| **Map (Scan)** | `NEXT_PUBLIC_MAPBOX_TOKEN` | yes | — |

`POSTGRES_URL_NON_POOLING` is required because Prisma migrations run against a direct connection, while runtime queries use the pooled `DATABASE_URL`. `REDIS_URL` and `KV_URL` are interchangeable — Upstash exposes both names depending on integration path. `NEXT_PUBLIC_MAPBOX_TOKEN` is the only public-prefix var; everything else is server-side and must never leak to the client bundle.

`AUTH_SECRET` and `CRON_SECRET` are independent random strings generated at provisioning time; rotating either is a single env-var update plus a redeploy. `APP_URL` is `https://alauda.ai` in production and `http://localhost:3000` in local dev — magic-link emails embed it as the link host, so it must match the actual origin the user lands on. `RESEND_FROM` should be `noreply@app.alauda.ai` once the sender domain is verified; until verification completes, dev environments fall back to Resend's default test sender.

The `apps/web` and `apps/worker` env scopes are configured separately in their respective PaaS dashboards. Vercel keeps env vars scoped per environment (Production / Preview / Development); Railway keeps them per service. There is no shared env-var store across PaaS providers — when a value rotates (e.g., `DATABASE_URL` after a Neon password reset), it must be updated in both places.

## External services

The full inventory of third-party services alauda-app talks to. Every entry is provisioned NEW or uses a new sender identity, so source-repo production stays untouched.

| Service | Use | alauda-app instance |
|---|---|---|
| Neon Postgres + PostGIS | App DB | NEW project (not source-repo's) |
| Upstash Redis | BullMQ broker | NEW instance |
| Resend | auth email + Reviews email + Scan completion email | shared account, NEW sender domain `noreply@app.alauda.ai` |
| Twilio | Reviews SMS + status webhook | shared account, NEW phone number |
| Anthropic | Reviews AI draft | shared account/key |
| Serper / DataForSEO | Scan SERP | shared account/key |
| Google Places API | Place lookup (Scan + Reviews + onboarding) | shared key |
| Mapbox | Scan report map | shared public token |

"Shared account/key" means the existing Anthropic / Serper / Google / Mapbox credentials are reused — these vendors are stateless from alauda-app's point of view, so a new project is unnecessary. Neon, Upstash, Resend sender, and Twilio number are all NEW because each carries app-scoped state (data, queues, sender reputation, phone-number identity) that must not bleed across deployments.

The PostGIS extension is required on the Neon project for Scan's geospatial queries — enable it once at project creation via `CREATE EXTENSION IF NOT EXISTS postgis`. The baseline migration assumes the extension is present and will fail loudly at deploy-time if it is not. See [`./database.md`](./database.md) for the migration workflow.

Resend, Twilio, Anthropic, Serper, Google, and Mapbox all bill on the existing accounts. Cost-attribution between source-repo apps and alauda-app traffic shows up in each provider's per-key or per-sender breakdown — there is no automated cost split, but the dimension exists for the team to read manually if it ever matters. At dogfood volume the spend is negligible.

## Local development

Local dev runs the full stack against alauda-app's dev resources (a Neon dev branch and an Upstash dev Redis instance — never prod):

```bash
# postinstall runs `prisma generate`
pnpm install

# fill DB / Redis / API keys
cp .env.example .env

# applies the baseline migration (and any subsequent ones)
pnpm db:migrate:deploy

# terminal 1: Next.js dev server
pnpm dev:web        # http://localhost:3000

# terminal 2: BullMQ worker
pnpm dev:worker     # connects to Upstash dev Redis (NOT prod)
```

Both terminals must be running for full-stack testing — Scan creation enqueues to Redis from `apps/web` and is consumed by `apps/worker`. Without `pnpm dev:worker` running, scans queue but never complete. This is the same workaround source repos use; see "Inherited limitations" below for why.

Reviews local dev does NOT need a running cron. The `/api/cron/send-reviews` endpoint can be hit manually via `curl` with the `Authorization: Bearer $CRON_SECRET` header to force a send-loop tick during development. SMS sends in dev should target a Twilio test number or the developer's own phone — never a real customer.

Local Postgres is a Neon dev branch, not a local Docker container. Branch creation is one click in the Neon console and the connection string drops straight into `.env`. Working off a real Neon branch means schema changes via `prisma migrate dev` produce migration files that match what production will receive — there is no "works on my Docker, breaks on Neon" gap to bridge.

Local Redis is the alauda-app Upstash dev instance. Production Redis is a separate Upstash instance; never share `REDIS_URL` values between dev and prod, since BullMQ state lives in Redis and a leaked dev write into prod queues would surface as ghost jobs.

## `.env.example`

The blueprint ships a complete `.env.example` so new contributors don't have to hunt for variable names. The template:

```
# === DB ===
# Provided by Neon (or Vercel Postgres) on prod; locally point at a Neon dev branch.
DATABASE_URL=
POSTGRES_URL_NON_POOLING=

# === Queue ===
REDIS_URL=

# === Auth ===
AUTH_SECRET=
APP_URL=http://localhost:3000

# === Email ===
RESEND_API_KEY=
RESEND_FROM=

# === SMS (Reviews) ===
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# === Cron ===
CRON_SECRET=

# === AI (Reviews) ===
ANTHROPIC_API_KEY=

# === SERP (Scan) ===
SERPER_API_KEY=
SERP_QPS=4
SERP_WORKER_CONCURRENCY=25

# === Places ===
GOOGLE_PLACES_API_KEY=

# === Map (Scan) ===
NEXT_PUBLIC_MAPBOX_TOKEN=
```

`SERP_QPS` and `SERP_WORKER_CONCURRENCY` defaults match the Scan worker's TokenBucket settings inherited from Local_Map_SEO; see [`../architecture/constants.md`](../architecture/constants.md) for the canonical values.

The template intentionally leaves every secret blank. Provisioning instructions for filling each block — which provider dashboard to visit, which scope to grant, where to copy the value from — belong in the Phase 0 checklist of [`../plan/fork-and-lift-day.md`](../plan/fork-and-lift-day.md), not in this runbook. A new contributor whose only job is to bring up a local environment should be able to start from `cp .env.example .env` without reading anything else.

## Inherited limitations

### PR preview + Scan worker

PR preview deploys: Vercel auto-builds `apps/web` per PR. Railway does NOT auto-deploy preview workers. The result on a PR preview: "create scan" enqueues a job into the shared dev Redis, but no preview-scoped worker consumes it — scans stay `queued`. Reviews send-loop, auth, and scan-report viewing all work on previews; only "create new scan" is broken.

This is inherited as-is from the source repos. Both Local_Map_SEO and Review_MLP work around it with local dev (`pnpm dev:web` + `pnpm dev:worker`) for full-stack testing. alauda-app does the same. Solving preview workers is post-blueprint follow-up work, not a blueprint decision.

The practical impact for PR review: a reviewer testing a non-Scan code path can use the deployed preview URL as-is. A reviewer testing Scan creation must pull the branch locally and run the worker. This split is documented up front so reviewers don't waste time waiting for a preview-Scan that never completes.

## First-deploy posture: dogfood only

After Phase 6 (first deploy):

- alauda-app does NOT receive real end users — dogfood-only with Jason + Yifan + invited internal seeds
- Source repos continue serving their real users on their own production
- "When to migrate real users to alauda-app" is a future independent decision, not in this blueprint

This is NOT a point of no return. alauda-app's Vercel + Railway projects can be turned off any time; source-repo production is unaffected because the isolation guarantees in [ADR-010](../architecture/decisions.md#adr-010-source-repo-coexistence-alpha--isolation) hold at the infrastructure boundary — different DB, different Redis, different Twilio number, different Resend sender. A failed first deploy reduces to "delete the two new PaaS projects and try again next week."

Operational checklist for the dogfood window:

- Smoke-test `/login` magic-link, `/dashboard`, scan creation, and a manual `send-reviews` cron tick within the first hour of going live.
- Watch Vercel function logs and Railway worker logs side-by-side; any 5xx in the first hour blocks expanding the seed list.
- Keep the source-repo apps reachable in another tab — if alauda-app needs to be torn down, internal users can fall back to the source apps the same minute.
- Do not point any real customer phone numbers, real SMS recipients, or real customer emails at alauda-app during dogfood. Internal seed accounts only.

When the team is ready to migrate real users — that decision lives outside this document and outside this blueprint. The expected sequence will involve provisioning a separate observability stack, agreeing on an SLO, planning a per-product cutover, and communicating with affected source-repo customers. None of that work is required to ship Phase 6, and none of it should leak backwards into the dogfood deploy's checklist.

Until that future decision is made, this runbook is the only operational document the team needs to bring alauda-app up and keep it running. The companion documents [`./database.md`](./database.md), [`../plan/fork-and-lift-day.md`](../plan/fork-and-lift-day.md), and [`../plan/sync-strategy.md`](../plan/sync-strategy.md) cover, respectively, the schema and migration workflow, the day-of fork-and-lift execution, and the ongoing source-repo sync cadence.
