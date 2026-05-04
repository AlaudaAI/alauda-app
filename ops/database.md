# Database Operations

alauda-app runs on a single Neon Postgres instance with the PostGIS
extension. The Prisma schema is flat (S1, all models in `public`,
[ADR-007](../architecture/decisions.md#adr-007-flat-prisma-schema-s1)),
the migration history starts at a baseline (no source-repo history
retained), and the PrismaClient is a singleton exported from
`@alauda/db` consumed by both `apps/web` and `apps/worker`.

## Neon project setup

1. Create a NEW Neon project. Do NOT reuse a Neon project that lives
   under any source-repo account; per
   [ADR-010](../architecture/decisions.md#adr-010-source-repo-coexistence-alpha--isolation),
   alauda-app runs on isolated infrastructure from Local_Map_SEO and
   Review_MLP.
2. Pick a region close to Vercel's `apps/web` region for latency.
   US-East is the typical default for Vercel's free/hobby tier; match
   the worker region too if Railway exposes the option.
3. Enable PostGIS in the Neon SQL editor before running the baseline
   migration. The `GridPoint.location` column requires the
   `geography(Point, 4326)` type:

   ```sql
   CREATE EXTENSION IF NOT EXISTS postgis;
   ```

4. Note the two connection strings exposed by Neon's dashboard:
   - `DATABASE_URL` — pooled connection (PgBouncer), used by runtime
     code in both `apps/web` and `apps/worker`.
   - `POSTGRES_URL_NON_POOLING` — direct connection, used by Prisma
     migrations (the migration engine cannot run through PgBouncer in
     transaction-pooling mode).

5. Set both env vars on Vercel `apps/web` AND Railway `apps/worker`
   (per [`./deployment.md#environment-variable-groups`](./deployment.md#environment-variable-groups)).
   The two services share the same Neon project; isolation between
   alauda-app and source repos lives at the Neon-project boundary, not
   at the connection-string level.

## Migration strategy: baseline reset

alauda-app has no production data at fork-and-lift time (per
[ADR-010](../architecture/decisions.md#adr-010-source-repo-coexistence-alpha--isolation),
source repos and alauda-app run on isolated infrastructure), so there
is no migration history worth preserving. Merging two independent
migration graphs (Local_Map_SEO + Review_MLP) creates a tangled
history with no operational value. A single baseline migration
captures the merged schema cleanly; future migrations build forward
from there.

Recipe (run once, by Phase 1 of fork-and-lift):

```bash
# inside packages/db
rm -rf prisma/migrations
pnpm prisma migrate dev --name baseline
git add prisma/migrations
git commit -m "feat(db): baseline migration"
```

The baseline migration captures three integration-layer changes
documented in [`../domain/data-model.md`](../domain/data-model.md):

- `User.lastMagicLinkSentAt` field added (was on `Business` in the
  Review_MLP source).
- `Business.lastMagicLinkSentAt` field removed (moved to `User`).
- `TrackedBusiness.userId` NOT NULL (was nullable in the
  Local_Map_SEO source; alauda-app starts with no rows so the
  tightening needs no backfill).

The PostGIS extension must already exist in the target database
before `migrate dev` runs, or the `GridPoint.location` column will
fail to create. Run the `CREATE EXTENSION` statement above first.

## Migration deploy

The Vercel build command runs migrations before the Next.js build:

```
pnpm --filter @alauda/db migrate:deploy && pnpm --filter @alauda/web build
```

- `migrate:deploy` (defined in `@alauda/db/package.json`) wraps
  `prisma migrate deploy`, which applies all pending migrations
  against the production database using `POSTGRES_URL_NON_POOLING`.
- A failed migration fails the build. No half-migrated schema goes
  live; the previous deployment continues to serve traffic.
- Local dev uses `prisma migrate dev` instead (interactive, creates a
  shadow DB, prompts for a migration name). Production uses
  `migrate deploy` (non-interactive, no shadow DB, applies pending
  migrations only).
- Railway `apps/worker` does NOT run migrations on deploy. Only the
  Vercel build does, to keep migration ordering single-writer and
  prevent races between two deployments racing the same migration.

## Singleton PrismaClient

Pattern (illustrative; the real source lives in
`packages/db/src/index.ts` and is inherited from Local_Map_SEO):

```typescript
// packages/db/src/index.ts (illustrative)
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

Rationale:

- Next.js dev mode hot-reloads server modules. Without the global
  guard, every reload spawns a fresh `PrismaClient` and leaks the
  previous instance's database connections until Neon's pool limit
  trips and dev-mode requests start failing.
- `apps/web` and `apps/worker` both `import { prisma } from '@alauda/db'`.
  Same instance across the workspace, same pool config, same query
  log behaviour.
- BullMQ workers in `apps/worker` use the same client; no separate
  connection-pool config is needed. The Neon pooled `DATABASE_URL`
  handles connection multiplexing for both processes.
- The singleton is module-scoped, not request-scoped. Server
  Components and Route Handlers that need transactional isolation
  use `prisma.$transaction(...)` rather than instantiating a fresh
  client.

## BullMQ job types

Job-data types live at `packages/db/src/jobs.ts`, preserving
Local_Map_SEO's existing convention. The module exports:

- `QUEUE_NAMES` — string-literal constants for queue identifiers
  (`serp-fetch`, `echo`, etc.). Producers and consumers import the
  same constants; renaming a queue is a single-file change.
- `SerpFetchJobData` — TypeScript type for the SERP-fetch job
  payload (`gridPointId`, `scanId`, `keyword`, and related fields).
- `EchoJobData` — Day-1 smoke-test payload type used by the worker
  health check.

Why co-locate job types with `@alauda/db` instead of putting them in
`@alauda/jobs`:

- Job-data shapes share semantics with Prisma model shapes
  (`SerpFetchJobData.gridPointId` is a `GridPoint.id`,
  `SerpFetchJobData.scanId` is a `Scan.id`). Co-locating types with
  their source-of-truth schema keeps producer (`apps/web`) and
  consumer (`apps/worker`) in sync — both import from `@alauda/db`,
  so a schema change that renames `GridPoint.id` surfaces as a
  TypeScript error in the job-data type immediately.
- `@alauda/jobs` holds the SERP plumbing (rate-limit policy, provider
  adapters, the cache-lookup layer driven by the 7-day TTL in
  [`../architecture/constants.md`](../architecture/constants.md));
  it is not the right home for cross-cutting job-shape types.

## Backup / disaster recovery

- **Neon built-in backups** are alauda-app's primary recovery
  mechanism. Neon takes continuous WAL-based snapshots; point-in-time
  recovery is available within Neon's retention window (length
  depends on the active plan tier — confirm in the Neon dashboard
  before relying on a specific window).
- **Manual backup before risky operations** — for one-time risky ops
  (large schema migrations, data backfills, vendor cutovers), run a
  `pg_dump` against `POSTGRES_URL_NON_POOLING` before the change:

  ```bash
  pg_dump "$POSTGRES_URL_NON_POOLING" --no-owner --no-acl > alauda-snapshot-$(date +%Y%m%d-%H%M%S).sql
  ```

  Store the dump outside the Neon project (local disk, S3, or a
  separate object store). The dump is plain SQL; restore via
  `psql "$POSTGRES_URL_NON_POOLING" < alauda-snapshot-YYYYMMDD-HHMMSS.sql`
  into a fresh database or a Neon dev branch.

- **Restore path** — Neon's "branch from a point in time" is the
  fast path for accidental data loss: branch production at a
  timestamp before the incident, validate the data, then promote the
  branch. Manual restore from `pg_dump` is the slow fallback for
  scenarios outside Neon's retention window or for cross-project
  recovery.

## Schema evolution policy

- Source-repo schema changes propagate to alauda-app via the Phase 7
  sync workflow (see [`../plan/sync-strategy.md`](../plan/sync-strategy.md)).
  alauda-app is downstream of Local_Map_SEO and Review_MLP; schema
  drift is reconciled deliberately, not automatically.
- alauda-app does NOT copy migration files from source repos. Each
  upstream schema change generates a hand-written alauda-app
  migration that captures the equivalent DDL, with a provenance
  comment naming the source-repo migration it mirrors.
- Test new migrations on a Neon dev branch before merging the schema
  PR. Neon dev branches are zero-cost copies of the production
  schema; you can apply the candidate migration, run integration
  tests against the branch's connection string, and discard the
  branch when done. This avoids ever testing a migration directly on
  production.
- Bigger schema changes (column rename, enum value swap, NOT NULL
  tightening on populated tables) follow standard Postgres-safe
  migration patterns: add the new column, backfill, flip reads, drop
  the old column — each step in its own migration and its own
  deploy. Document the multi-PR sequence in the migration's
  comment, or in a sibling `docs/migrations/<name>.md` if it spans
  more than two PRs.
- The flat-schema invariant (all models in `public`,
  [ADR-007](../architecture/decisions.md#adr-007-flat-prisma-schema-s1))
  is preserved across every migration. New tables go in `public`;
  resist the urge to introduce a `scan` or `reviews` schema even
  when a feature feels self-contained.
