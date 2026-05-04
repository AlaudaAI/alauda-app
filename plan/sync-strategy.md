# Sync Strategy (Phase 7, Continuous)

After [fork & lift](./fork-and-lift-day.md), alauda-app and source repos run as **fully independent codebases** ([alpha + isolation, ADR-010](../architecture/decisions.md#adr-010-source-repo-coexistence-alpha--isolation)). Phase 7 is the continuous workflow that keeps alauda-app's logic aligned with upstream changes via opportunistic cherry-pick.

## Goal

Keep alauda-app's logic in sync with source-repo evolution **without** mechanical coupling. No git subtree, no submodule, no automated mirror. Sync is human-judged, file-by-file, with explicit adaptation at integration boundaries.

## Triggers

Meaningful upstream changes warrant a Phase 7 review:

- **Schema changes** — Prisma model edits, migration additions
- **Bug fixes** — defect repairs in shared logic (AI prompts, scheduling math, SERP adapters)
- **New features** — additions that match alauda-app's product surface
- **Prompt tweaks** — Anthropic system prompt revisions, scheduling-window tuning
- **Dependency upgrades** — security patches, major SDK bumps (e.g., Prisma, Next.js, Twilio)
- **Infrastructure shifts** — provider swaps that affect env vars or deployment shape

Cosmetic-only changes (formatting, comments, README edits in source) are NOT triggers.

## Cadence

Run a sync sweep weekly. Don't track every commit; weekly granularity matches the rate of meaningful upstream change without burning cycles. A skipped week costs nothing — the next sweep covers the gap because `last-synced` is per-file, not global.

Out-of-band sweeps trigger only on:

- A security advisory against a dependency present in alauda-app (run a same-day sweep).
- A source-repo author flagging a specific commit as "you'll want this" in chat.
- A schema change in source — rare, but rare-but-heavy events justify breaking cadence.

Otherwise: weekly is the default and the ceiling. Doing it more often is wasted attention, not a virtue.

## The provenance header

Every lifted file in alauda-app carries this header (see [`./fork-and-lift-day.md#phase-1-5-universal-provenance-comments`](./fork-and-lift-day.md#phase-1-5-universal-provenance-comments)):

```ts
// origin: AlaudaAI/Local_Map_SEO@<sha>:apps/web/src/lib/grid.ts
// last-synced: 2026-05-04
```

The `last-synced` line answers: as of which upstream sha did we last reconcile this file? Phase 7 cherry-pick decisions key on this value.

Files NOT lifted from source (shell components, middleware composition, etc.) carry `// origin: alauda-app (integration)` and have no `last-synced` field — these are alauda-app's own.

## Flow

### Step 1: Detect upstream changes

```bash
# Inside the Local_Map_SEO checkout:
cd /path/to/Local_Map_SEO
git pull
git log <last-synced-sha>..HEAD -- apps/web/src/lib/grid.ts
# Or for a whole tree:
git log <last-synced-sha>..HEAD -- apps/web/src/

# Inside the Review_MLP checkout:
cd /path/to/Review_MLP
git pull
git log <last-synced-sha>..HEAD -- src/lib/scheduling.ts
```

Read the commit messages and diffs. Decide per-file (or per-coherent-change-group) what falls into the next step's three-way classification. The `last-synced-sha` for any given file is the value in its own provenance header — `grep "last-synced"` on the alauda-app side recovers it cheaply.

To enumerate every `last-synced` value at once (useful when starting a sweep cold):

```bash
cd /path/to/alauda-app
rg "^// last-synced:" --no-heading -n apps packages
```

The output is a flat `<file>:<line>:<value>` listing — pipe through `sort` and skim for files whose `last-synced` is older than the source-repo `main` SHA you just pulled.

### Step 2: Decide

For each upstream change, decide one of:

- **Cherry-pick** when the change is small and has no integration side effects (e.g., a bug fix in `lib/scheduling.ts` that doesn't touch auth, routing, or schema). Just port the patch directly.

- **Adapt** when the change touches a boundary that was modified during fork & lift — auth (`@alauda/auth`), routing namespace (`/scan/*` vs `/seo-map/*`), DB bridging (`Business.ownerEmail` soft bridge), cookie semantics. Rewrite the equivalent logic in alauda-app's terms. Don't blind-port — the resulting code may diverge meaningfully from upstream.

- **Skip** when the change is meaningful only in the source-repo product shape — e.g., a Local_Map_SEO change to single-tenant cookie identity (alauda-app uses User identity, doesn't apply); a Review_MLP change to single-business owner fields (alauda-app already moved them).

If you're not sure: when in doubt, skip and revisit next sweep. Skipping doesn't cost anything; bad porting costs you debugging time. Skip is a first-class option, not a footnote — most upstream commits over the long arc will be skipped, and that's healthy.

Boundary checklist (use this to disambiguate cherry-pick vs adapt):

- Touches `import { ... } from '@/lib/auth'` or `@/lib/session` in source? -> adapt (alauda-app uses `@alauda/auth`).
- Touches `import { prisma } from '@/lib/prisma'` in source? -> adapt the import path; the call may still cherry-pick cleanly.
- Touches a route under `/owner/*` or `/seo-map/*` or `/api/scans/*`? -> adapt (namespace renamed in alauda-app).
- Touches `Business.ownerEmail` or `Business.lastMagicLinkSentAt`? -> adapt (soft-bridged / relocated).
- None of the above? -> cherry-pick is probably safe.

### Step 3: Apply in alauda-app

For cherry-picks:

```bash
cd /path/to/alauda-app
# Apply the change manually (cleanest):
git checkout -b sync/<area>-from-<repo>
# Edit the target file by hand to match the upstream patch
# Verify the file's provenance header still reflects the original origin
```

For adaptations: write fresh code in alauda-app's idiom; document the upstream sha in the commit message but don't try to mechanically replicate the upstream patch. If the adapted code diverges enough that the file no longer feels like a port, that's fine — the provenance header still records where it started.

Worked example (cherry-pick):

- Upstream `Local_Map_SEO/apps/web/src/lib/grid.ts` adds a 6x6 grid mode (commit `abc1234`).
- alauda-app's `apps/web/src/lib/grid.ts` adopts the same constants + branching.
- Commit message: `sync: 6x6 grid mode from Local_Map_SEO@abc1234`.
- Update the file header: `// last-synced: 2026-08-15`.

Worked example (adapt):

- Upstream `Review_MLP/src/app/api/owner/business/route.ts` adds an owner-impersonation header for support cases (commit `def5678`).
- alauda-app's equivalent lives at `apps/web/src/app/api/reviews/business/route.ts` and identity comes from `getSession()` not from the cookie payload — the header logic doesn't translate directly.
- Decision: write fresh impersonation logic in alauda-app's idiom, gated on a `User.role` field if/when added; record the upstream sha in the commit body.
- Commit message: `sync: owner impersonation (adapted) from Review_MLP@def5678`.

### Step 4: Update last-synced sha

After the cherry-pick or adaptation lands, bump the file's `last-synced` value to the new upstream sha:

```ts
// origin: AlaudaAI/Local_Map_SEO@abc1234:apps/web/src/lib/grid.ts
// last-synced: 2026-08-15
```

This is the single mechanical artifact that makes Phase 7 work without git subtree complexity. Don't skip the bump — without it, the next sweep re-evaluates already-synced commits.

If you skipped a commit (Step 2 chose "skip"), still bump `last-synced` to that commit's sha. "Skip" means "decided, not relevant" — not "deferred." Leaving `last-synced` behind tells the next sweep you have not yet looked at the commit, which is wrong.

### Step 5: Open PR

PR title format: `sync: <area> from <repo>@<short-sha>`.

Examples:

- `sync: 6x6 grid mode from Local_Map_SEO@abc1234`
- `sync: AI prompt tightening from Review_MLP@def5678`
- `sync: scheduling window jitter from Review_MLP@9012cde`

PR body must include:

- Upstream commits being synced (sha + one-line summary each)
- Adaptation choices made (if Step 2 picked "adapt")
- What was deliberately skipped from the same period and why

A sync PR can roll up multiple commits across multiple files when they form a coherent change. Don't open one PR per file unless the changes are genuinely independent — reviewer fatigue is a real cost.

Sample PR body template:

```
Synced from Local_Map_SEO commits:
- abc1234 grid: add 6x6 mode for dense urban scans
- bcd2345 grid: tune ring spacing constants

Adaptation notes:
- None for this batch (pure cherry-pick).

Skipped from the same range:
- ef34567 — touches single-tenant cookie identity, doesn't apply (alauda-app uses User identity).
- f045678 — README-only edit, not a Phase 7 trigger.

Provenance headers updated:
- apps/web/src/lib/grid.ts last-synced -> bcd2345
```

## What NOT to use

- **`git subtree`** — pulls all upstream changes mechanically; doesn't allow adapt-or-skip per file. Brittle when integration boundaries diverge.
- **`git submodule`** — couples alauda-app's working tree to a specific upstream sha; doesn't help with adaptation, complicates clones.
- **Automated mirror tooling** (e.g., custom GitHub Actions that auto-PR upstream patches) — produces noise that drowns out the sync decisions that matter; encourages blind cherry-picks.

The blueprint commits to human-judged sync because integration-layer adaptation is irreducibly judgment work. Tooling that pretends otherwise produces churn, not value.

## Responsibility

- **alauda-app maintainer (Jason)** pulls sync. Owns deciding which upstream changes flow through.
- **Source-repo authors (Yifan + others)** do NOT need to push to alauda-app. They keep iterating on Local_Map_SEO and Review_MLP at their own pace. Phase 7 is pull, not push.
- This division means source-repo authors don't need to know alauda-app's internal naming, cookie semantics, or routing namespace. They keep working in their own product's frame; alauda-app translates.

## Schema-change special handling

Schema deltas in source repo are the heaviest sync event. Rules:

- **alauda-app does NOT copy migration files from source repos.** Source migrations were built atop the source's own migration history; alauda-app reset to baseline ([`../ops/database.md#migration-strategy-baseline-reset`](../ops/database.md#migration-strategy-baseline-reset)).
- **Write equivalent alauda-app migrations manually** capturing the same DDL. Use `pnpm prisma migrate dev --name <change>` against a Neon dev branch so Prisma generates the SQL from the schema delta — don't hand-author the migration file.
- **Test on a Neon dev branch** before merging the schema PR. Apply the candidate migration, run integration tests, discard the branch if it fails.
- **PR title:** `sync(schema): <change> from <repo>@<sha>`.
- **PR body** explains the upstream schema change, the equivalent alauda-app migration, and any data-shape compatibility concerns.

If the upstream schema change touches one of the three integration-layer fields modified during fork & lift (`Business.ownerEmail` soft bridge, `User.lastMagicLinkSentAt` relocation, `TrackedBusiness.userId` NOT NULL), the adaptation is non-trivial — write a brief design note in the PR body explaining how alauda-app's bridging interacts with the upstream change.

## Long-term: when does sync stop?

Phase 7 is open-ended. Two scenarios eventually retire it:

- **alauda-app reaches feature parity** with both source repos AND real users migrate over to alauda-app's production. Source repos enter maintenance mode (security fixes only) or are formally deprecated.
- **A specific source-repo change makes Phase 7 cherry-pick infeasible** — e.g., the source repo refactors fundamentally enough that file-by-file mapping no longer holds. At that point, alauda-app forks irrevocably.

The decision to stop Phase 7 is a separate future call — not in this blueprint's scope. Until that decision lands, Phase 7 runs indefinitely.
