# Routing Specification

alauda-app's `apps/web` is a single Next.js 14 app (Topology 1, [ADR-003](../architecture/decisions.md#adr-003-single-nextjs-app-topology-1)) with two App Router groups: `(public)/` (no shell chrome, public allowlist) and `(platform)/` (sidebar + topbar + business context, requires authenticated session). All routes below sit in one of those two groups.

The middleware (`apps/web/middleware.ts`) gates every request: a public-page or public-API allowlist hit calls `next()`, anything else requires an authenticated session and otherwise redirects to `/login?next=<encoded path>`. See [`specs/auth.md`](./auth.md#middleware-decision-tree) for the full decision tree.

Routing in alauda-app falls into four concrete categories:

1. **Public pages** — render anonymously, sit under `apps/web/src/app/(public)/`, no shell chrome.
2. **Public APIs** — middleware-allowlisted, each handler self-verifies (token, signature, or bearer secret).
3. **Authed pages** — require a session, sit under `apps/web/src/app/(platform)/`, render inside the platform shell.
4. **Authed APIs** — require a session, additionally call `requireOwner()` and scope queries by ownership key.

The remainder of this document enumerates each category, restates the R1 namespace policy that gives the layout its shape, and records why R1 won over the rejected alternatives.

## Public pages (`(public)/` group)

These routes render without sidebar or topbar chrome. They sit under `apps/web/src/app/(public)/`. The middleware allowlist matches each path literal or prefix — anonymous callers reach them directly, authenticated callers reach them too (no auto-redirect away from public pages).

| Path | Purpose | Origin |
|---|---|---|
| `/` | Logged-out → 307 `/login`; logged-in → 307 `/dashboard` (T3 redirect, [ADR-008](../architecture/decisions.md#adr-008-no-marketing-site-t3)) | new |
| `/login` | Magic-link request form | `Review_MLP/src/app/owner/login` |
| `/signup` | Self-serve signup form | `Review_MLP/src/app/owner/signup` |
| `/scan/r/[token]` | Scan public read-only report share (+ OG image) | `Local_Map_SEO` original `/r/<token>` |
| `/reviews/r/[token]` | Reviews customer rating page | `Review_MLP` original `/r/[token]` |

`/` performs the redirect inside a Server Component by calling `getSession()` and branching to `/login` or `/dashboard`; it never renders marketing copy because alauda-app has no marketing site (see [ADR-008](../architecture/decisions.md#adr-008-no-marketing-site-t3)). `/login` and `/signup` post to `/api/auth/request` and `/api/auth/signup` respectively — both inherit Review_MLP's magic-link UX without server-side redesign. The two `/r/[token]` pages are anonymous-friendly by design: a customer following an SMS or share link reaches them with no session and never gets bounced to `/login`.

The Scan share page co-locates its Open Graph image as `opengraph-image.tsx`, matching Local_Map_SEO's existing structure (see [ADR-005](../architecture/decisions.md#adr-005-public-route-namespacing-r1)). The Reviews customer rating page renders its own metadata inline; no OG image co-location is required because the page targets SMS recipients who do not preview-render the link.

## Public APIs (middleware-allowlisted; each endpoint self-verifies)

The middleware lets these paths through without a session check; each endpoint runs its own verification. The allowlist matches by prefix — `/api/auth/*`, `/api/r/*`, `/api/cron/*`, `/api/sms/*` — and static assets pass through too.

| Path | Verification |
|---|---|
| `/api/auth/signup` | Magic-link mechanism itself (Resend rate limit + `User.lastMagicLinkSentAt` cooldown) |
| `/api/auth/request` | Same as above (resend magic link to existing User) |
| `/api/auth/verify?token=...&next=...` | Magic-link JWT verify ([specs/auth.md](./auth.md#magic-link-callback)) |
| `/api/r/[token]/rate` | Token is the public `ReviewRequest.token`; idempotent on rating |
| `/api/r/[token]/suggest` | Same token; returns AI draft |
| `/api/r/[token]/feedback` | Same token; private feedback path (1-3 stars or opt-out) |
| `/api/r/[token]/google-click` | Same token; beacon-style POST when "Open Google" tapped |
| `/api/cron/send-reviews` | `Authorization: Bearer $CRON_SECRET` (Vercel Cron) |
| `/api/sms/status-callback` | Twilio HMAC-SHA1 signature against `TWILIO_AUTH_TOKEN` |

The verification column reads as a contract: nothing on the allowlist is "open." `/api/auth/*` relies on the magic-link mechanism's own controls — Resend's per-recipient rate limit plus a `User.lastMagicLinkSentAt` cooldown enforced inside the handler. `/api/r/[token]/*` keys every action off the public `ReviewRequest.token`, which is unguessable, single-business-scoped, and rotated per request. `/api/cron/send-reviews` checks the `Authorization` header against `CRON_SECRET` before doing any work; only Vercel Cron carries that secret. `/api/sms/status-callback` validates Twilio's HMAC-SHA1 signature against `TWILIO_AUTH_TOKEN` before trusting any field in the body. If a path is on the allowlist, the handler is responsible for its own gate — the middleware deliberately does not impose a default policy on public APIs.

## Authed pages (`(platform)/` group)

These routes require a session and render inside the platform shell (sidebar + topbar + `BusinessProvider` context). They sit under `apps/web/src/app/(platform)/`. The middleware redirects unauthenticated callers to `/login?next=<encoded path>` before the request reaches the page; the page itself can rely on `requireOwner()` from `@alauda/auth` for a defence-in-depth check.

| Path | Purpose | Origin |
|---|---|---|
| `/dashboard` | Cross-tool overview: current Business + Scan/Reviews/Reports cards | new |
| `/scan` | Scan tool home (redirect to `/scan/reports` or tools grid) | `Local_Map_SEO` `/seo-map` |
| `/scan/new` | Create new scan (keyword + radius form) | `Local_Map_SEO` `/seo-map/new` |
| `/scan/reports` | List of all scans for current Business | `Local_Map_SEO` `/seo-map/reports` |
| `/scan/reports/[id]` | Single scan report (map + right panel) | `Local_Map_SEO` `/seo-map/reports/[id]` |
| `/scan/settings` | Scan-specific settings (Place selection if not already set via dashboard) | `Local_Map_SEO` `/settings` |
| `/reviews` | Reviews dashboard (funnel + private feedback + recent requests) | `Review_MLP` `/owner/dashboard` |
| `/reviews/new` | Schedule a review request | `Review_MLP` `/owner/new` |
| `/reviews/settings` | Reviews-specific settings (Place ID, ownerDescription, SMS template, velocity cap) | `Review_MLP` `/owner/settings` |

`/dashboard` is the canonical authed landing surface — middleware redirects sessions with no `currentBusinessId` cookie there from any other authed path so onboarding can run inside the platform shell ([`specs/shell.md`](./shell.md)). On first login (zero businesses), `(platform)/layout.tsx` detects the empty state and renders the onboarding flow instead of tool content, dual-writing a Reviews `Business` row plus a Scan `TrackedBusiness` row sharing the same `Place` so both tools become immediately usable.

The `/scan/*` and `/reviews/*` subtrees mirror their source repos so closely that most port files keep their inner structure verbatim — Phase 4 of the lift renames `app/(platform)/seo-map/*` to `app/(platform)/scan/*` and `app/(public)/r/*` to `app/(public)/scan/r/*`; Phase 5 renames `app/owner/*` to `app/(platform)/reviews/*` and `app/r/*` to `app/(public)/reviews/r/*`. The route-name changes are mechanical, but the inner components inherit unchanged.

## Authed APIs

Every endpoint below sits behind the middleware session gate. Each handler additionally calls `requireOwner()` from `@alauda/auth` and scopes its database queries by `userId` (Scan) or `ownerEmail` (Reviews) — never trusting the client to specify ownership.

The endpoint lists below are authoritative for the blueprint scope. The lift renames each path mechanically — `/api/scans/*` becomes `/api/scan/*`, `/api/business/*` becomes `/api/scan/business/*`, `/api/owner/*` becomes `/api/reviews/*`, and `/api/review-request` becomes `/api/reviews/review-request` — and removes auth-related endpoints from each source repo because `@alauda/auth` already owns them. New endpoints beyond the lists below are out of blueprint scope; adding one is a normal product change, not a routing-spec edit.

### `/api/scan/*`

Inherited from Local_Map_SEO's `/api/scans/*` and `/api/business/*`. Endpoints include:

- `POST /api/scan` — create new scan (was `POST /api/scans`)
- `GET /api/scan/[id]/status` — poll scan status
- `GET /api/scan/[id]/points/[idx]` — per-grid-point detail
- `GET /api/scan/[id]/competitors/[placeId]` — per-competitor ranks
- `DELETE /api/scan/[id]` — owner-scoped delete (cascades to GridPoints + ScanResults)
- `POST /api/scan/business/select` — Google Place lookup + selection (cookie-promoted via middleware)
- `POST /api/scan/business/search` — Google Place text search

The Scan endpoints scope every query by `userId`. The lift replaces the source repo's cookie-based identity (an anonymous client-side cookie) with `currentUser.id` from the session — every `where { userId }` clause sources its value from `requireOwner()`, never from a request body or query parameter. Business selection writes the chosen `currentBusinessId` cookie, which the middleware promotes on subsequent requests so the right business stays in scope without a query string.

### `/api/reviews/*`

Inherited from Review_MLP's `/api/owner/*` and `/api/review-request`. Endpoints include:

- `POST /api/reviews/review-request` — schedule a customer review request
- `DELETE /api/reviews/review-request/[id]` — remove a row from dashboard
- `PATCH /api/reviews/business` — update Business config (name, ownerDescription, etc.)
- `POST /api/reviews/business/lookup` — Google Place ID lookup (text or share-URL)

The Reviews endpoints scope every query by `ownerEmail` rather than `userId`, matching the source repo's existing data model — `Business.ownerEmail` is the join key. Each handler resolves `ownerEmail` from `currentUser.email` (the session payload), never from a request body. The two ownership predicates do not share a helper because their join keys differ; see [`specs/auth.md`](./auth.md#ownership-resolution-per-product) for the rationale.

## Request lifecycle by category

Each category travels a different path through the middleware and into the handler. The four cases:

**Public page (e.g. `/login`, `/scan/r/<token>`)**

1. Request hits middleware.
2. Middleware matches the public-page allowlist (`/`, `/login`, `/signup`, `/scan/r/*`, `/reviews/r/*`, static assets) and calls `next()`.
3. Route group `(public)` provides the no-chrome layout.
4. The page Server Component renders. It may call `getSession()` to display "Sign in" vs the user's email differently, but it does not require a session.

**Public API (e.g. `/api/r/<token>/rate`, `/api/cron/send-reviews`)**

1. Request hits middleware.
2. Middleware matches the public-API allowlist (`/api/auth/*`, `/api/r/*`, `/api/cron/*`, `/api/sms/*`) and calls `next()`.
3. The Route Handler runs its own verification before doing any work — token lookup, `Authorization` header check, or HMAC validation.
4. On verification failure, the handler returns 401/403 directly; the middleware never sees that decision.

**Authed page (e.g. `/scan/reports`, `/reviews/new`)**

1. Request hits middleware.
2. No allowlist hit; middleware reads the session cookie via `@alauda/auth/middleware-helper`.
3. No session → 307 to `/login?next=<encoded path>`.
4. Session present, `?businessId=` query → write `currentBusinessId` cookie + 307 to the same path without the query.
5. Session present, `currentBusinessId` cookie missing, path != `/dashboard` → 307 to `/dashboard` so onboarding (or business selection) runs first.
6. All checks pass → `next()`. The route group `(platform)` mounts the shell and the page renders inside it. The page may additionally call `requireOwner()` for defence-in-depth.

**Authed API (e.g. `POST /api/scan`, `PATCH /api/reviews/business`)**

1. Request hits middleware.
2. No allowlist hit; middleware enforces the same session check as authed pages — no session means 401 (or 307 to `/login` for navigations; APIs return 401 directly).
3. Handler runs, calls `requireOwner()` to bind `userId`/`email` from the session payload.
4. Every database query carries an ownership predicate (`where { userId }` for Scan, `where { ownerEmail }` for Reviews) sourced from the session, never from a request parameter.

## File-system layout

The four categories above project to the App Router file tree as follows. Paths shown are inside `apps/web/src/app/`; the two route groups (`(public)` and `(platform)`) do not appear in URL paths but they do partition the layout tree.

```
app/
  (public)/
    page.tsx                          → /
    login/page.tsx                    → /login
    signup/page.tsx                   → /signup
    scan/r/[token]/
      page.tsx                        → /scan/r/[token]
      opengraph-image.tsx             → OG image for above
    reviews/r/[token]/page.tsx        → /reviews/r/[token]
  (platform)/
    layout.tsx                        → shell + onboarding gate
    dashboard/page.tsx                → /dashboard
    scan/page.tsx                     → /scan
    scan/new/page.tsx                 → /scan/new
    scan/reports/page.tsx             → /scan/reports
    scan/reports/[id]/page.tsx        → /scan/reports/[id]
    scan/settings/page.tsx            → /scan/settings
    reviews/page.tsx                  → /reviews
    reviews/new/page.tsx              → /reviews/new
    reviews/settings/page.tsx         → /reviews/settings
  api/
    auth/{signup,request,verify}/     → public; magic-link
    r/[token]/{rate,suggest,feedback,google-click}/
                                      → public; Reviews token
    cron/send-reviews/                → public; Vercel Cron
    sms/status-callback/              → public; Twilio
    scan/                             → authed; userId-scoped
    reviews/                          → authed; ownerEmail-scoped
  middleware.ts                       → auth gate + business cookie promo
```

Two layout files own the chrome split: `(public)/layout.tsx` is minimal (it inherits the root layout but adds no sidebar/topbar), and `(platform)/layout.tsx` mounts the `BusinessProvider`, sidebar, and topbar — and renders the onboarding flow when the current User has zero businesses. See [`specs/shell.md`](./shell.md) for the shell composition.

Lifted route files carry provenance comments at the top so a future reader can trace back to upstream and any sync-trigger comparison reads the `last-synced` sha directly:

```ts
// origin: AlaudaAI/Local_Map_SEO@<sha>:apps/web/src/app/(platform)/seo-map/reports/[id]/page.tsx
// last-synced: 2026-05-04
```

## R1 namespace policy

alauda-app namespaces every public flow under its owning tool — `/scan/r/[token]` for Scan share reports and `/reviews/r/[token]` for Reviews customer rating pages — per [ADR-005](../architecture/decisions.md#adr-005-public-route-namespacing-r1). The implementation rules:

- Both `/scan/r/[token]` and `/reviews/r/[token]` are first-class real route files. There are no `next.config.mjs` rewrite tricks, no middleware path rewrites, no symlinks. Each route maps directly to a `page.tsx` under `apps/web/src/app/(public)/`:
  - `apps/web/src/app/(public)/scan/r/[token]/page.tsx` (+ `opengraph-image.tsx`)
  - `apps/web/src/app/(public)/reviews/r/[token]/page.tsx`
- `/api/r/*` is reserved for Reviews. Reviews owns the `/r` semantics — the customer-facing rating endpoints (`rate`, `suggest`, `feedback`, `google-click`) all key off the public `ReviewRequest.token`, and bringing Scan public APIs under the same prefix would muddle that.
- Scan public pages have no public API namespace at all. They render server-side and read-only; no client-side fetcher needs a public endpoint, so there is nothing to namespace.

This policy directly resolves the route namespace collision documented in [`architecture/integration-points.md`](../architecture/integration-points.md#1-route-namespace-collision) — both source repos shipped a `/r/[token]` page, and a single Next.js app cannot mount two route files at the same path.

The "no rewrites" rule deserves emphasis because Next.js makes the alternative tempting: a `next.config.mjs` rewrite or a middleware path rewrite could mount one route file at two URLs. R1 rejects both because they hide the URL shape from the file tree — a developer reading `apps/web/src/app/(public)/` would not see `/scan/r/[token]` exists if it lived only in a config rewrite. First-class route files keep the file tree authoritative: every public URL maps to exactly one `page.tsx`, and grep over the app directory finds every public surface.

## Why R1 over R2 / R3

R2 — semantic top-level paths (`/r/[token]` for Reviews and `/share/[token]` for Scan) — was rejected for inconsistency. Two structurally similar public flows would carry different prefix shapes, and adding a third public flow later (Reports public share, an analytics public link, etc.) would force a fresh naming debate every time instead of following an established pattern. R1 makes the rule mechanical: every tool namespaces its own public surface under its own tool prefix, and a future Reports public route lands at `/reports/r/[token]` with no further deliberation.

R3 — sub-domain split for public flows (e.g. `share.alauda.ai/<token>`) — was rejected because Topology 1 commits to a single Next.js app and a single cookie scope ([ADR-003](../architecture/decisions.md#adr-003-single-nextjs-app-topology-1)). Sub-domain split requires multiple deployments and fragments the cookie domain for a use case (read-only public pages) that gains nothing from the isolation. The SMS-segment cost concern (longer URL = potentially more SMS segments per outbound message) is real but reversible: a future `next.config.mjs` rewrite can transparently shorten `/reviews/r/[token]` to `/r/[token]` without moving the route file or breaking existing share URLs. The optimization stays available the day real message-cost data justifies it; until then, R1 keeps the URL space legible.

A worked example of why R1's reversibility matters: the SMS that Reviews sends today contains the URL `https://alauda.ai/reviews/r/abc123`. If real cost data later shows that the `/reviews` prefix pushes outbound messages over a segment boundary often enough to matter, alauda-app adds one entry to `next.config.mjs` rewrites — `source: '/r/:token', destination: '/reviews/r/:token'` — points Reviews at the shorter URL when minting new tokens, and the route file does not move. Existing share URLs continue to resolve through the original path. R3 cannot offer this transition because it requires a new sub-domain, a new deployment, and a cookie-domain change; R2 cannot offer it cleanly because the top-level `/r/[token]` would have already been claimed by Reviews from day one and a future Reports public flow would be back to a fresh naming debate.

## Future considerations (not blueprint scope)

The following are explicitly deferred. None of them block the blueprint, and each has a clean later-introduction path:

- **Shorter Reviews public path.** If SMS segment cost becomes material, shorten `/reviews/r/[token]` to a top-level `/r/[token]` via a `next.config.mjs` rewrite, not by moving the route file. The rewrite preserves the namespacing invariant (Reviews still owns `/r` semantics) while saving characters in the outbound link, and existing share URLs continue to resolve unchanged.
- **Sub-domain split (T2 / T3).** Split `app.alauda.ai` for product and `alauda.ai` for marketing once a marketing site exists. Deferred under [ADR-008](../architecture/decisions.md#adr-008-no-marketing-site-t3); the current `/` route stays a 307 redirect to `/login` or `/dashboard` until that day.
- **Multi-locale routing.** A `/[lang]/...` segment for localized variants is not in the product roadmap and is deferred indefinitely. Adding it later would prepend a `[lang]` segment to every route; there is nothing in the current shape that blocks that addition.
- **Public Reports surface.** A `/reports/r/[token]` public flow could land later if a Reports tool grows a public-share feature. Under R1 it slots in mechanically — same pattern as `/scan/r/[token]` and `/reviews/r/[token]`, no naming debate required.
