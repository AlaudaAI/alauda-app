# Integration Points

The blueprint exists to address the unavoidable seams that appear when two
independent products fold into one Next.js app, one database, and one
auth flow. Each entry below names a seam, states the resolution, and
points to the spec file that defines the resolution in detail.

Every resolution traces back to an ADR in
[`decisions.md`](decisions.md); this file is the seam-first index, the
ADR file is the decision-first index, and the specs hold the
implementation detail.

## Catalog

### 1. Route namespace collision

**Conflict:** Both source repos ship a `/r/[token]` public route — Scan
serves the share-report page from it, Reviews serves the customer
rating page from it. A single Next.js app cannot mount two route files
at the same path.

**Resolution:** Adopt **R1 namespacing** under
[ADR-005](decisions.md#adr-005-public-route-namespacing-r1) — Scan
share moves to `/scan/r/[token]`, Reviews customer rating moves to
`/reviews/r/[token]`, and both render as first-class route files with
no rewrites. **(R1)**

**Spec:** [`../specs/routing.md`](../specs/routing.md)

### 2. Prisma schema coexistence

**Conflict:** Each source repo owns a `prisma/schema.prisma` with its
own models, enums, and migration history. Merging into one Postgres
database forces a single schema layout, and Prisma offers several —
multi-schema, prefixed models, or flat merge.

**Resolution:** Adopt the **flat merge** under
[ADR-007](decisions.md#adr-007-flat-prisma-schema-s1) — `packages/db`
holds one `schema.prisma`, every model lives in the `public` schema,
no model is renamed because no name collisions exist, and PostGIS is
the one shared extension. **(S1)**

**Spec:** [`../domain/data-model.md`](../domain/data-model.md)

### 3. User identity bridging

**Conflict:** Local_Map_SEO ships a `User` table that is empty in
practice — its frontend identifies callers by an anonymous cookie.
Review_MLP ships no `User` table at all — `Business.ownerEmail` is the
de facto identity, and the magic-link flow signs JWTs directly off
that field. The merged platform needs one identity table that both
products can speak to.

**Resolution:** Promote `User` to the **shared identity** under
[ADR-004](decisions.md#adr-004-magic-link-auth-in-packagesauth-a1) —
Reviews keeps `Business.ownerEmail` and resolves ownership at runtime
via `Business.ownerEmail = currentUser.email`, a **soft email bridge**
that leaves Review_MLP's schema otherwise untouched. Scan tightens
`TrackedBusiness.userId` to NOT NULL and treats it as a **hard FK**
against `User.id`. **(A1)**

**Spec:** [`../specs/auth.md`](../specs/auth.md)

### 4. Magic-link rate-limit relocation

**Conflict:** Review_MLP stores `lastMagicLinkSentAt` on `Business`
because, in that product, owner equals business. Once `User` becomes
the platform identity, attaching the rate-limit timestamp to
`Business` is wrong — one user with two businesses would get two
independent rate-limit windows.

**Resolution:** Move `lastMagicLinkSentAt` from `Business` onto
`User`. The semantics now match the entity that the rate limit
protects, and the change falls out of the identity decision rather
than a redesign — it is a passive consequence of **(A1)**, not a new
ADR. This is the only integration-layer schema edit auth requires.

**Spec:** [`../specs/auth.md`](../specs/auth.md)

### 5. Async pattern coexistence

**Conflict:** Scan runs long-lived SERP fetches via BullMQ on a
Railway worker — its consumer holds a BLPOP forever. Reviews runs a
per-minute send loop via Vercel Cron — its jobs are short and
function-friendly. A merged platform must either pick one async base
or run both.

**Resolution:** Run both under
[ADR-006](decisions.md#adr-006-worker-topology-unchanged-w1) — BullMQ
plus a Railway worker for Scan, Vercel Cron for Reviews, no migration
to a unified base. alauda-app deploys to two targets, Vercel for
`apps/web` and the Reviews cron, Railway for `apps/worker`. **(W1)**

**Spec:** [`../ops/deployment.md`](../ops/deployment.md)

### 6. Cookie semantics

**Conflict:** Local_Map_SEO sets a `currentBusinessId` cookie and uses
a `?businessId=` query parameter promoted by middleware to scope the
active business. Review_MLP sets a session cookie carrying the signed
email JWT. Each pattern serves a distinct purpose — selection versus
identity — and the merged platform needs both.

**Resolution:** Compose both cookies in middleware. The
`@alauda/auth` session cookie carries identity in the Review_MLP
shape, and the `currentBusinessId` cookie carries the active-business
selection in the Local_Map_SEO shape. Middleware promotes
`?businessId=` to the cookie when present and reads the session JWT
on every authed request. **(A1)**

**Spec:** [`../specs/auth.md`](../specs/auth.md)

### 7. Onboarding dual-write

**Conflict:** A first-login `User` owns zero businesses. Each tool
needs its own row — Reviews needs a `Business`, Scan needs a
`TrackedBusiness` — and both rows should describe the same physical
place so a user adding one business gets a working state in both
tools.

**Resolution:** The `(platform)/layout.tsx` detects the zero-business
state and renders an onboarding flow that writes a `Business` row, a
`TrackedBusiness` row, and a shared `Place` row in **one transaction**.
Both per-tool rows reference the same `Place`, so the user lands in
both Scan and Reviews with one onboarding step. **(A1)**

**Spec:** [`../specs/shell.md`](../specs/shell.md)

### 8. Migration history reset

**Conflict:** Each source repo carries its own Prisma migration
history with overlapping table names, conflicting indexes, and
incompatible baselines. Replaying both histories into one database
would either fail or produce a Frankenstein schema, and merging the
histories file-by-file is hard with no production data to validate
against.

**Resolution:** Apply a **baseline reset** under
[ADR-007](decisions.md#adr-007-flat-prisma-schema-s1) — alauda-app's
`prisma/migrations/` starts empty, and the first migration is the
merged-schema initialization. Neither source-repo history is
replayed. The reset is acceptable because alauda-app has no paid
users to protect. **(S1)**

**Spec:** [`../ops/database.md`](../ops/database.md)

### 9. Marketing landing collision

**Conflict:** Each source repo ships a `/` landing page with its own
marketing copy, hero, and CTA. The merged app has one root path and
two competing landings, neither of which describes the combined
product.

**Resolution:** Retain neither landing under
[ADR-008](decisions.md#adr-008-no-marketing-site-t3) — `/` becomes a
307 redirect by auth state, sending logged-out users to `/login` and
logged-in users to `/dashboard`. No marketing surface ships in the
blueprint, and the evolution path to T1 (marketing on the same
domain) or T2 (sub-domain split) stays open. **(T3)**

**Spec:** [`../specs/routing.md`](../specs/routing.md)

### 10. Settings page collision

**Conflict:** Each source repo ships a `/settings` page with its own
per-product configuration UI — Scan settings cover scan cadence and
notifications, Reviews settings cover sender identity and templates.
A single `/settings` route would have to fold both, and the platform
has no account-level settings (no billing, no profile, no global
notifications) to anchor a global page.

**Resolution:** Keep settings **per-tool and namespaced** under
[ADR-009](decisions.md#adr-009-tools-only-sidebar-sidebar-v2) —
`/scan/settings` and `/reviews/settings` live inside the
`(platform)/` group, no global `/settings` route exists, and the
sidebar carries no Settings entry. Sign-out moves to the account
dropdown in the header right.

**Spec:** [`../specs/shell.md`](../specs/shell.md)
