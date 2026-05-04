# Shell Specification

The shell is the authed-context chrome of alauda-app: TopBar, Sidebar,
BusinessSwitcher, UserDropdown, and the **onboarding forced flow** that
triggers on first login. All authed routes (`/dashboard`, `/scan/*`,
`/reviews/*`) render inside the shell; public routes (`/login`,
`/signup`, `/scan/r/...`, `/reviews/r/...`) render outside it.

The shell lives in `apps/web/src/app/(platform)/layout.tsx`. That layout
is the single owner of session resolution (`requireOwner()` from
`@alauda/auth`), business-context lookup, and onboarding gating. Public
routes mount under `(public)/` and never touch any of the surfaces
described below.

## Layout

```
+------------------------------------------------------+
| TopBar                                                |
| +------+                              +-------------+ |
| | Logo | BusinessSwitcher (current)   | avatar ▼    | |
| +------+                              +-------------+ |
+-------------+----------------------------------------+
| Sidebar     |                                         |
|             |                                         |
| Scan        |     {children}                          |
| Reviews     |                                         |
| Reports     |                                         |
|   (soon)    |                                         |
+-------------+----------------------------------------+
```

The TopBar spans the full viewport width. The Sidebar pins to the left
below the TopBar. The remaining region renders the route's
`{children}`, which on first login is replaced wholesale by the
onboarding form (see below).

## Sidebar v2

**Sidebar v2** is the tools-only sidebar fixed by
[ADR-009](../architecture/decisions.md#adr-009-tools-only-sidebar-sidebar-v2).
It contains exactly three items, in this order:

- **Scan** — links to `/scan` (the Local_Map_SEO tool home and
  report-list landing).
- **Reviews** — links to `/reviews` (the Review_MLP dashboard
  equivalent).
- **Reports** — disabled "Coming Soon" placeholder. Renders greyed
  out, exposes no route, and does not accept clicks.

Behaviour notes:

- The active route receives a subtle visual cue (background tint,
  accent rule, or equivalent — implementation detail, not pinned by
  this spec).
- No global Settings entry exists. Per-tool settings live under each
  tool at `/scan/settings` and `/reviews/settings`. See
  [ADR-009](../architecture/decisions.md#adr-009-tools-only-sidebar-sidebar-v2).
- On small viewports, the Sidebar collapses into a mobile drawer,
  inheriting the pattern from Local_Map_SEO.

## TopBar

The TopBar is a single horizontal bar with three slots: Logo on the
left, BusinessSwitcher in the centre, UserDropdown on the right.

### Logo

- Pins top-left.
- Links to `/dashboard`.
- Renders the alauda-app wordmark (specific mark — text vs. graphic —
  is an implementation detail).

### BusinessSwitcher

- Sits centre-top of the TopBar.
- Lists the current User's businesses, drawing from two model sources:
  Reviews `Business` rows where `ownerEmail = currentUser.email`, and
  Scan `TrackedBusiness` rows where `userId = currentUser.id`. The UI
  layer dedupes the combined list by `googlePlaceId` so a user who has
  onboarded the same business into both tools sees one entry.
- On selection, writes the `currentBusinessId` cookie and reloads the
  current page. The reloaded request reads the new cookie and renders
  with the newly active business.
- Collapses to a read-only text label (no dropdown chevron) when the
  user has exactly one business.
- Does not render at all when the user has zero businesses — in that
  case the **onboarding forced flow** has already replaced
  `{children}`, so the TopBar never appears with an empty switcher.
- Reuses the `BusinessProvider` Context and `useBusiness()` hook
  pattern from Local_Map_SEO, lifted into `(platform)/layout.tsx` as
  the single context owner.
- Cross-link: see `../domain/data-model.md` for the `Business`,
  `TrackedBusiness`, and `Place` model definitions and the dedup
  contract.

### UserDropdown

- Pins top-right.
- Renders the user's avatar (or initials placeholder) next to their
  email.
- The dropdown contains exactly one item: **Sign out**.
- Sign out clears the session cookie via `clearSessionCookie()` from
  `@alauda/auth` and 307-redirects to `/login`.
- Reserves visual slots for future Account and Billing entries; v1
  ships none of them and renders no stubs.

## Root route behaviour (T3)

The root path `/` is a server-side redirect-by-auth-state, fixed by
[ADR-008](../architecture/decisions.md#adr-008-no-marketing-site-t3).
There is no marketing content at the root.

- Logged-out users receive a 307 redirect to `/login`.
- Logged-in users receive a 307 redirect to `/dashboard`.

The redirect implementation lives in
`apps/web/src/app/(public)/page.tsx` and resolves the auth state via
`getSession()` from `@alauda/auth`. See
[`./routing.md`](./routing.md) for the broader public/platform split.

## Onboarding forced flow

The **onboarding forced flow** triggers when an authed user has zero
businesses. It blocks access to `{children}` until the user attaches
a Google Place to their account, then lets them through to
`/dashboard` with full shell chrome.

**Detection rule.** In `(platform)/layout.tsx`, after `requireOwner()`
resolves the session, query the database for two counts:

- `Business` rows where `ownerEmail = currentUser.email` (Reviews
  side), and
- `TrackedBusiness` rows where `userId = currentUser.id` (Scan side).

If both counts are zero, render the onboarding component in place of
`{children}`. The TopBar and Sidebar still mount, but the
BusinessSwitcher hides itself and the main content area shows the
onboarding form.

**Flow.**

1. Show a single-page form with a business-name input and a Google
   Place lookup field (free-text search or share-URL paste).
2. On submit, call the Google Places API via
   `/api/onboarding/place-lookup` (or reuse the existing
   `/api/scan/business/select` endpoint, whichever is wired first).
3. Render the matched Place as a confirmation card with name,
   address, and rating preview.
4. On confirm, the server action runs a single-transaction
   **dual-write** that creates or fetches:
   - the canonical `Place` row (created if absent, reused if cached),
   - a `TrackedBusiness` row with `userId = currentUser.id` and
     `placeId = place.id` (Scan side), and
   - a `Business` row with `ownerEmail = currentUser.email`,
     `googlePlaceId = place.googlePlaceId`, and `name = place.name`
     (Reviews side).
5. Set the `currentBusinessId` cookie. The canonical convention is
   to write the new `TrackedBusiness.id`, since the BusinessSwitcher
   list is keyed off TrackedBusiness rows deduped by `googlePlaceId`.
6. 307-redirect to `/dashboard`.

After the dual-write commits, subsequent logins skip the flow entirely
because the user now satisfies both detection-rule counts.

Cross-references:

- `../architecture/integration-points.md` entry 7 — Onboarding
  dual-write transaction shape.
- `../domain/data-model.md` — Bridging rules → Onboarding dual-write.

## Out of scope (for the shell)

- **Global Settings page** — fixed by
  [ADR-009](../architecture/decisions.md#adr-009-tools-only-sidebar-sidebar-v2).
  Per-tool settings live under each tool at `/scan/settings` and
  `/reviews/settings`.
- **Account / Billing dropdown items** — visual slot reserved in the
  UserDropdown, but v1 ships no entries and no stub pages.
- **Marketing-style landing page** — fixed by
  [ADR-008](../architecture/decisions.md#adr-008-no-marketing-site-t3).
  The root redirects by auth state; no landing template exists.
- **Multi-business creation UI** — v1 supports adding businesses only
  through the first-login onboarding path. Adding additional
  businesses after onboarding is deferred under the same minimal-shell
  principle as
  [ADR-009](../architecture/decisions.md#adr-009-tools-only-sidebar-sidebar-v2).
- **Theme / dark mode** — implementation detail, not a shell-spec
  concern.
