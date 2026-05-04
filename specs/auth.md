# Auth Specification

`@alauda/auth` is the magic-link authentication package, ported verbatim from `Review_MLP/src/lib` per [ADR-004 (A1)](../architecture/decisions.md#adr-004-magic-link-auth-in-packagesauth-a1). All inheritances are documented; the only deliberate change at the integration layer is moving `lastMagicLinkSentAt` from `Business` to `User`.

## Public API

The package exports seven functions covering session reads, redirect-style guards, magic-link issuance and verification, and **session cookie** lifecycle.

Every function is async; every function is safe to call from the Next.js App Router server runtime (Server Components, Route Handlers, Server Actions).

Cookie reads go through `next/headers`; cookie writes go through the same surface. The package never reaches into `document.cookie` or `Headers` directly — keeping the cookie surface single-source means a future swap (for example, a runtime change) needs only one update.

| Function | Signature | Purpose |
|---|---|---|
| `getSession()` | `() => Promise<{ userId: string; email: string } \| null>` | Returns the current session from the auth cookie, or `null` if unauth'd. Safe to call from Server Components, Route Handlers, Server Actions. Reads cookies via `next/headers`. |
| `requireOwner(redirectTo?)` | `(redirectTo?: string) => Promise<{ userId: string; email: string }>` | Strict version of `getSession()`. Throws a Next.js redirect to `/login?next=<encoded redirectTo or current path>` if unauth'd. |
| `signMagicLink(email)` | `(email: string) => Promise<string>` | Generates a **magic-link JWT** (purpose:"magic", 15-min expiry, signed with `AUTH_SECRET`). Returns the token string. Does NOT send email. |
| `sendMagicLinkEmail(email, options?)` | `(email: string, options?: { next?: string }) => Promise<void>` | Calls `signMagicLink(email)` and sends the resulting link to `email` via Resend. The link points to `${APP_URL}/api/auth/verify?token=...&next=...`. |
| `verifyMagicLink(token)` | `(token: string) => Promise<{ email: string }>` | Verifies a magic-link JWT. Throws if expired, malformed, or wrong purpose. Returns the email payload. |
| `setSessionCookie(userId, email)` | `(userId: string, email: string) => Promise<void>` | Writes session JWT (purpose:"session", 30-day expiry) as `HttpOnly` `SameSite=Lax` cookie. Called after successful magic-link verify. |
| `clearSessionCookie()` | `() => Promise<void>` | Deletes the session cookie. Called from sign-out. |

### Function reference

#### `getSession()`

Use this when a page or handler wants to *display* differently for signed-in vs anonymous callers but should still render either way. It returns `null` rather than redirecting, so it never short-circuits the request.

Public pages that show a conditional "Sign in" link use it; the auth gate itself does not.

The function is also useful in the few API endpoints that *optionally* take a session — for example, an analytics ping that records `userId` if available — though most authed APIs go through `requireOwner` instead.

#### `requireOwner(redirectTo?)`

Use this in any Server Component, Route Handler, or Server Action that must be authed to function. It either returns the user or throws a Next.js redirect — there is no third path, and you should not wrap it in `try/catch`.

The optional `redirectTo` argument lets a caller override the default (which is the current request path), useful when guarding a Server Action that should bounce back to a different page than its trigger.

Note that `requireOwner` does NOT replace the middleware session gate. The middleware redirects unauthed callers before the request even reaches a Server Component.

`requireOwner` is the belt-and-braces inside the handler so a future regression in the allowlist cannot leak an authed-only page. It is cheap (one cookie read, one JWT verify) and the layered defence is worth its weight.

#### `signMagicLink(email)`

Use this only when generating a token without sending the email — for example, in tests, in admin flows, or in any path that wants to inspect the URL before delivery.

Production code paths sending an actual login email should call `sendMagicLinkEmail(email)` instead so token generation and delivery share one timestamp and one error handler.

The token expires 15 minutes after issuance; this matches Review_MLP and is short enough that a forwarded email is unlikely to be replayable, long enough that a slow mail-server hop does not invalidate the link.

#### `sendMagicLinkEmail(email, options?)`

Use this from `/api/auth/request` (the login form's POST target) and from any signup flow that issues a magic link.

The `options.next` parameter flows through into the verify URL so post-verify redirect targets survive the round trip.

For example, when a deep link `/reviews/campaigns/123` triggers the auth gate, the login page passes `next=/reviews/campaigns/123` into `sendMagicLinkEmail`, the verify URL embeds it, and the callback honours it on the final redirect.

The function does not enforce the rate limit — that is the caller's job, reading and writing `User.lastMagicLinkSentAt`.

We deliberately keep rate-limit policy in the calling endpoint rather than in the auth package because the policy may differ between request paths (a re-send button has a different threshold from an automated retry).

#### `verifyMagicLink(token)`

Use this only inside `/api/auth/verify`. It throws on any invalid token (expired, wrong purpose claim, signature mismatch); the callback wraps the throw and converts to the `/login?error=invalid_or_expired` redirect.

Do not catch the throw and continue. A thrown verify always means the user must restart the flow, and silently treating an invalid token as anonymous would lose the user's `next` target without any feedback.

The `purpose` claim is checked explicitly: a session JWT presented at this endpoint fails verification even if its signature is valid. This prevents a class of confused-deputy errors where a leaked session cookie could otherwise be replayed as a magic-link token.

#### `setSessionCookie(userId, email)`

Use this only from `/api/auth/verify` after `verifyMagicLink` succeeds and the `User` row has been resolved (created on first login, looked up otherwise).

The cookie is `HttpOnly` and `SameSite=Lax`; do not write it from client code, and do not parse it from client code either.

`Lax` is deliberate — `Strict` would break the magic-link flow because the verify redirect arrives as a top-level navigation from the user's mail client, which `Strict` would not consider same-site.

`HttpOnly` keeps the JWT out of any XSS surface in the app.

The cookie is also `Secure` in production environments; the inherited Review_MLP code conditions this on `NODE_ENV === 'production'` so local development over `http://localhost` continues to work.

#### `clearSessionCookie()`

Use this from `/api/auth/logout`. It deletes the cookie and returns; the route handler is responsible for the redirect that follows (typically to `/login`).

Logout does not need a CSRF token because the worst case of a forged logout is the user being signed out, not data exfiltration.

The cookie's `SameSite=Lax` limits the surface further: a cross-site `POST` to the logout endpoint will not include the session cookie, so the endpoint will not have a session to clear in the first place.

## Middleware decision tree

The middleware runs on every request that is not a static asset. It is the single chokepoint that converts an unauthed request into a `/login` redirect; nothing downstream of the middleware needs to repeat that check.

```
1. matchPublicAllowlist(request.path)         → public hit → next()
2. matchPublicApiAllowlist(request.path)      → public api → next() (endpoint self-verifies)
3. getSession(request)                        → null → 307 /login?next=<encoded path>
4. parseBusinessIdParam(request.url)          → has ?businessId= → write currentBusinessId cookie + 307 sans query
5. checkBusinessSelection(request, session)   → no currentBusinessId cookie AND path != /dashboard → 307 /dashboard
6. next()
```

**Step 1 — public page allowlist.** The middleware first compares the request path against the static page allowlist (root, `/login`, `/signup`, public Reviews and Scan share routes). A match means the page renders without auth and without further middleware work.

Ordering matters here, because public pages must not be forced to `/dashboard` by the later business-selection guard. The allowlist is the single source of truth — there is no per-page `export const auth = false` escape hatch.

**Step 2 — public API allowlist.** Public API prefixes (`/api/auth/*`, `/api/r/*`, `/api/cron/*`, `/api/sms/*`) bypass the session gate because each endpoint runs its own verification — magic-link tokens for auth, public-token signatures for `/api/r/*`, the `CRON_SECRET` header for `/api/cron/*`, and the SMS provider's signature header for `/api/sms/*`.

The middleware does not unwrap any of those; it just lets the request through and trusts the endpoint to verify. This split keeps the middleware ignorant of every API's individual auth scheme — it only knows "these prefixes self-verify."

**Step 3 — session gate.** The middleware reads the session cookie. If `getSession` returns `null`, the request is rewritten to a `307` redirect to `/login`, with the original path preserved as URL-encoded `?next=<path>`.

The login page reads `next` and threads it back into the magic-link URL so post-verify lands on the originally-requested page. Using `307` rather than `302` preserves the request method, which matters for any future client-side `POST` to a guarded endpoint that loses its session mid-flight; today every authed surface is `GET`-driven, but the redirect code is correct for the general case.

**Step 4 — businessId hand-off.** When a Reviews link arrives carrying `?businessId=<id>` (Reviews uses this to switch the active business via URL — for example, in dashboard quick-switcher links and in deep links from email), the middleware writes `currentBusinessId` into a cookie and `307`s to the same path with the query stripped.

The cookie persists the choice for subsequent requests; the strip keeps URLs canonical and prevents the same query from re-firing the rewrite on every navigation.

The middleware does NOT validate that the user owns the requested business — that is the page's job in step 6, where the per-tool ownership predicate runs.

**Step 5 — business-selection guard.** If the user is authed but has no `currentBusinessId` cookie and is requesting any path other than `/dashboard`, the middleware redirects to `/dashboard`.

When the underlying `User` has zero owned businesses, `(platform)/layout.tsx` then renders the onboarding forced flow at `/dashboard` (see [`./shell.md`](./shell.md)).

This means `/dashboard` is both the post-login landing route and the onboarding entry point: a brand-new user signs in, the cookie is unset, the middleware bounces them to `/dashboard`, and the layout takes over to gate the rest of the app behind onboarding completion.

An existing user with one or more businesses gets the same bounce on first request after login, but `/dashboard` resolves their `currentBusinessId` from the most-recently-touched business and the cookie is set going forward.

**Step 6 — fall through.** If none of the earlier steps fired, the middleware calls `next()` and the matched route renders normally.

The route is then responsible for any per-resource ownership check (see "Ownership resolution per product" below); the middleware does not — and cannot — know which `Business` or `TrackedBusiness` the route is about to read.

## Public allowlist

The allowlist is a static, hand-maintained constant in the middleware module — no dynamic discovery, no configuration.

Keep it grouped by URL prefix so reviewers can scan it in one pass.

- **Pages:** `/`, `/login`, `/signup`, `/scan/r/*`, `/reviews/r/*`
- **API:** `/api/auth/*`, `/api/r/*`, `/api/cron/*`, `/api/sms/*`
- **Static:** `/static/*`, `/_next/*`, `/favicon.ico`, framework assets

`/scan/r/*` and `/reviews/r/*` are the public report and rating routes namespaced per [ADR-005](../architecture/decisions.md#adr-005-public-route-namespacing-r1) — the `r` segment is the public-route convention.

Adding any new public route requires updating both this list and the public-route convention; the allowlist is the source of truth at runtime. A public route that is not on the list will be redirected to `/login` by step 3 of the middleware, which is a louder failure mode than the alternative (silently authed access to a route intended to be public) and therefore the safer default.

## Magic-link callback

`/api/auth/verify?token=<token>&next=<encoded-path>` is the magic-link landing endpoint, inherited verbatim from Review_MLP.

It is a `GET` because it is opened by the user's mail client, so it has to work as an idempotent navigation. `POST`-on-click would require JavaScript on the verify page, which would defeat the "click the link in your email" affordance.

1. The handler validates the token via `verifyMagicLink(token)`.
2. **On success:**
   - Look up `User` by email; create the row if not exists (signup flow); update `lastLoginAt` if exists.
   - Call `setSessionCookie(user.id, user.email)`.
   - `307` redirect to the `next` query param (default `/dashboard`).
3. **On failure:**
   - `307` redirect to `/login?error=invalid_or_expired`. The login page surfaces a banner and a "send another link" form.

The signup branch is intentionally inside the same handler — there is no separate signup verify route. First-time email + valid token equals account creation; this matches Review_MLP's behaviour and keeps the surface small.

A worked example: a customer clicks "manage campaigns" from a marketing email that links to `/reviews/campaigns`.

The middleware sees no session cookie and `307`s to `/login?next=%2Freviews%2Fcampaigns`. The user submits their email; the login page calls `sendMagicLinkEmail(email, { next: '/reviews/campaigns' })`.

The email arrives with a link `${APP_URL}/api/auth/verify?token=<jwt>&next=%2Freviews%2Fcampaigns`. Clicking the link runs the success branch of the callback, sets the session cookie, and `307`s to `/reviews/campaigns`.

The user lands where they originally tried to go, with one round trip through email. No password, no second factor, no separate signup form.

The same flow handles signup. A new email submitted to the login form follows the identical path; the only branch that differs is "create the row if not exists" inside the success path, which runs once and is idempotent for any subsequent verify with the same email.

## Inherited from Review_MLP without redesign

Everything below is ported character-for-character from `Review_MLP/src/lib`. We do not reopen these decisions in v1; if any of them needs to change, that is a separate ADR.

Listing them explicitly here is the point of the section — readers should be able to confirm that any item below means "look at Review_MLP" rather than "look at the alauda-app codebase for novel implementation."

- **JWT library — `jose` HS256.** Symmetric signing keyed on `AUTH_SECRET`; no asymmetric keys, no rotation policy in v1. Review_MLP picked `jose` for its small footprint and edge-runtime compatibility, both of which still apply.
- **`AUTH_SECRET` env var — 32+ byte random.** Same name, same length requirement. The value is rotated by reissuing it and forcing all sessions to log out, which is acceptable in v1 because the user base is small enough to email through any disruption.
- **Session cookie name.** Matches Review_MLP's name (whatever it is in `src/lib/session.ts`). This preserves existing semantics so any port-level test or harness pointing at the Review_MLP cookie name keeps working unchanged.
- **Magic-link / session JWT claim shapes (`sub`, `exp`, `purpose`, `iat`).** Verbatim from Review_MLP. The `purpose` claim is the discriminator that prevents a session JWT from being accepted by `verifyMagicLink`, and vice versa.
- **Resend email template body.** Subject line and link CTA copy carry over unchanged from Review_MLP. The template is plain text plus a single CTA link; no marketing styling, no images. We may revisit copy in a future visual-polish pass but treat it as fixed for v1.
- **Magic-link rate-limit pattern.** The window length and the comparison rule are inherited; the only change is the column it reads (now `User.lastMagicLinkSentAt` rather than `Business.lastMagicLinkSentAt`). See the next section.

The combined effect is that `@alauda/auth` adds no novel cryptography, no novel cookie semantics, and no novel email-delivery surface.

Anything in those areas behaves exactly as it does in Review_MLP, which is the point of A1 — the package exists to be lifted, not to be redesigned.

Treat any future PR that adds a new crypto primitive, a new cookie attribute, or a new email channel as out of scope for this package; that work would be a separate ADR and a separate package.

## Sole integration-layer change

`Business.lastMagicLinkSentAt` moves to `User.lastMagicLinkSentAt`.

This is the only schema-shaped edit `@alauda/auth` makes to the inherited code; the rest of the package is byte-for-byte the Review_MLP source.

Review_MLP put this column on `Business` because in that product owner equals business (1:1 by construction). alauda-app's identity is `User`, and the same user can own multiple businesses, so a per-`Business` rate-limit is wrong on its face — a single owner with N businesses would get N independent rate-limit windows, which defeats the rate limit.

Per-`User` rate-limit is the correct semantic. The rate window itself does not change; only the row that records the timestamp does.

This is a passive consequence of A1 plus the `User` table existing as the platform identity, not a new design decision.

The schema move is a small one — drop the column from `Business`, add it to `User`, update the two reads and one write that touch it — and the lift is documented in [`integration-points.md` entry 4](../architecture/integration-points.md#4-magic-link-rate-limit-relocation) for the cross-product rationale.

For the column placements, see [`data-model.md` User](../domain/data-model.md#user) and [Business](../domain/data-model.md#business).

## Ownership resolution per product

Both tools resolve "is this user allowed to see this resource" against the session, but the *shape* of that check differs because the two source schemas are different.

Auth itself is shared; the ownership predicate is per-tool. The middleware does not perform the predicate (it cannot — it does not know which resource a route is about to read), so each route runs its own check after `requireOwner` resolves the session.

### Reviews

- Runtime check: `Business.findFirst({ where: { ownerEmail: currentUser.email } })`.
- **Soft bridge** — no FK from `Business.ownerEmail` to `User.email`.
- Rationale: zero schema change to the `Business` model; trades referential integrity for minimum-disruption fork-and-lift.

If a `User` updates their email, Reviews ownership re-resolves on next request because the predicate matches against the current session email, not a stored FK.

The downside — there is no database-level constraint that ties a `Business` row to a `User` — is acceptable in v1 because the only writer that creates `Business` rows is the Reviews onboarding flow, which always pairs the new row with the current session email.

Cross-link: [`integration-points.md` entry 3](../architecture/integration-points.md#3-user-identity-bridging).

### Scan

- Query filter: `where: { userId: currentUser.id }`.
- **Hard FK** from `TrackedBusiness.userId` to `User.id`, NOT NULL after the baseline migration.
- Rationale: `TrackedBusiness.userId` already existed as nullable in the source; the baseline tightens it (Local_Map_SEO's README documents this as the planned post-pilot migration, which alauda-app's baseline performs).

Because the column is a real FK, Scan ownership checks reduce to a primary-key lookup with no risk of stale-email drift; the cost is a one-time backfill in the baseline migration, which is acceptable because Local_Map_SEO's pilot dataset is small.

Cross-link: [`integration-points.md` entry 3](../architecture/integration-points.md#3-user-identity-bridging).

### Why the two predicates do not share a helper

We considered exposing a single `requireOwnedBusiness(id)` wrapper from `@alauda/auth`, but the predicates differ in *both* table and column type — `Business.ownerEmail` (string) for Reviews, `TrackedBusiness.userId` (FK) for Scan.

The abstraction would either leak the difference (so callers still pass a discriminator argument) or hide it confusingly (so identical-looking calls perform very different reads).

Keeping each tool's predicate inline at the call site is clearer and matches the meta principle in [ADR-001](../architecture/decisions.md#adr-001-meta-principle): inherit the source patterns; do not invent middleware that is not earning its weight.

## What this spec does NOT cover

- **SSO / SAML / passkey / WebAuthn** — no plans; A2 / A3 / A4 alternatives were rejected, see [ADR-004](../architecture/decisions.md#adr-004-magic-link-auth-in-packagesauth-a1). The SMB owner persona this product targets does not consume hosted-IDP benefits, and adding a federated identity surface trades vendor lock-in for capabilities we cannot use yet.
- **Password login** — magic-link only. We do not plan a password fallback; the link itself is the credential, and a forgotten-password flow would just re-issue a magic link, so adding passwords would only add an attack surface.
- **Account self-management** — email change, account deletion, profile settings; out of scope for v1. Users who need a change today can email support; the volume is low enough that a self-serve UI is not justified yet.
- **Per-tool authorization (resource-level RBAC)** — both tools rely on the simple ownership filters described above; no role / permission model exists in v1. Multi-user Businesses, agency seats, or read-only invitees are all out of scope; the product is single-owner-per-account by design.
- **Audit logging** — `lastLoginAt` is the only auth-side event we record. A full audit trail for sign-ins, sign-outs, and verify failures is not part of v1.
