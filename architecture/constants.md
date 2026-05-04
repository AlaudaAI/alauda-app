# Operational Constants

alauda-app inherits all operational constants from source repos. This
index points to where each lives so readers do not have to grep two
upstream codebases. When a number changes, the source-of-truth lookup
should take seconds, not minutes.

**Why an index, not values:** alauda-app does not redefine constants —
that would create drift. Tuning happens in source repos and propagates
via **Phase 7 sync** (see [`../plan/sync-strategy.md`](../plan/sync-strategy.md)).
Treat every row below as a pointer: when a number changes, it changes
upstream first, and the next sync window pulls the new value into the
fork. The blueprint deliberately avoids restating the values inline,
because the moment a duplicate appears in this repo it starts aging.

The same rule applies to env-driven knobs. Where a constant has an env
var name (for example `SERP_QPS`, `VELOCITY_CAP`, `SERP_WORKER_CONCURRENCY`),
the row points at the file that reads the env var, not at a deployment
manifest. Production values live in the deployment platform; defaults
live in code; this index points at the code.

## Inherited constants

The table below covers every operational constant that integration
crosses. Auth and Reviews rows point into `Review_MLP`; SERP, BullMQ,
Place Cache, and Scan Grid rows point into `Local_Map_SEO`; the Cron
rows point at the existing Vercel Cron wiring in `Review_MLP`.

| Domain | Constant | Source |
|---|---|---|
| Auth | magic-link expiry: 15 minutes | `Review_MLP/src/lib/auth.ts` (purpose:"magic" JWT) |
| Auth | session expiry: 30 days | `Review_MLP/src/lib/auth.ts` (purpose:"session" JWT) |
| Auth | session cookie: HttpOnly, SameSite=Lax | `Review_MLP/src/lib/session.ts` |
| Auth | `AUTH_SECRET` minimum length: 32 bytes | `Review_MLP/src/lib/env.ts` |
| BullMQ | worker concurrency: 25 (env-driven via `SERP_WORKER_CONCURRENCY`) | `Local_Map_SEO/apps/worker/src/index.ts` |
| BullMQ | retry: exponential backoff | `Local_Map_SEO/apps/worker/src/processors/serp-fetch.ts` |
| SERP | per-provider QPS cap: env `SERP_QPS` (TokenBucket lazy refill) | `Local_Map_SEO/packages/jobs/src/rate-limit.ts` |
| Reviews | velocity cap: `VELOCITY_CAP` env, default 3 per rolling 24h | `Review_MLP/src/lib/scheduling.ts` |
| Reviews | per-business 30-day dedup window (phone + email hash) | `Review_MLP/src/lib/contact.ts` |
| Reviews | send window: 9am-9pm CT, jitter 60-180min | `Review_MLP/src/lib/scheduling.ts` |
| Place Cache | 7-day memoization (Place lookup) | `Local_Map_SEO/apps/web/src/app/api/business/select/route.ts` |
| Cron | Vercel Cron cadence: every minute (Pro plan required) | `Review_MLP/vercel.json` |
| Cron | cron batch size: 10 rows per tick | `Review_MLP/src/app/api/cron/send-reviews/route.ts` |
| Scan Grid | 5x5 grid, 25 points | `Local_Map_SEO/apps/web/src/lib/grid.ts` |
| Magic-Link Rate-Limit | per-User cooldown via `User.lastMagicLinkSentAt` | `alauda-app/packages/auth/src/...` (post-Phase 1 **fork & lift**; was `Review_MLP/src/lib/auth.ts` `Business.lastMagicLinkSentAt` pre-lift) |

The last row is the only constant whose owning module moves during
integration: the cooldown field is lifted off `Business` and rehomed on
`User` when the auth surfaces merge. Every other row points at code
that ships unchanged into the fork. Readers chasing the magic-link
cooldown after Phase 1 should expect the field on `User`, not on
`Business`, even though the upstream history reads the other way.

A few rows deserve a closer read:

- The **Auth** rows split magic-link expiry and session expiry into two
  distinct JWT purposes. The same `auth.ts` module signs both, which is
  why both rows point at the same file. Search for `purpose:"magic"`
  versus `purpose:"session"` to find the right block.
- The **BullMQ** worker concurrency default (25) is a code default; the
  deployed value is whatever `SERP_WORKER_CONCURRENCY` resolves to in
  the worker's environment. The same pattern applies to `SERP_QPS` and
  `VELOCITY_CAP`.
- The **Cron** rows are Pro-plan-dependent. The `vercel.json` cadence
  of every minute is the floor that the Reviews send loop assumes; the
  batch size of 10 rows per tick is the matching ceiling. They are
  tuned together, so changing one without the other is a Phase 7
  review item.

## Source repo references

- [`AlaudaAI/Local_Map_SEO`](https://github.com/AlaudaAI/Local_Map_SEO) — Scan SERP fetch, BullMQ worker, Place cache, grid math
- [`AlaudaAI/Review_MLP`](https://github.com/AlaudaAI/Review_MLP) — magic-link auth, Reviews scheduling, Vercel Cron, Twilio SMS

When a value in the table looks wrong, fix it in the source repo first,
then let the Phase 7 sync window propagate the change. Editing the
constant in the alauda-app fork without an upstream change is exactly
the drift this index exists to prevent.
