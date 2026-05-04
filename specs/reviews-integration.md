# Reviews Integration Specification

This spec documents how `AlaudaAI/Review_MLP` lifts into alauda-app:
file-by-file mapping for kept files, files explicitly DELETED (because
`@alauda/auth` and `@alauda/db` provide them), the `vercel.json` cron
config merge, the runtime ownership-resolution change, what does NOT
change, and verification. Consumed by Phase 5 (lift Reviews) of
[`../plan/fork-and-lift-day.md`](../plan/fork-and-lift-day.md).

The lift is mostly mechanical: most files copy verbatim with a
provenance header and a route-namespace rename. The integration-layer
edits are bounded — two named identity-bridging changes — and a
short list of source files explicitly disappears because Phase 1
already extracted their contents into `@alauda/auth` and `@alauda/db`.

## File mapping (kept and moved)

Source paths are relative to `Review_MLP/src/`. Target paths are
relative to `alauda-app/apps/web/src/` unless otherwise noted. Route
moves into the `reviews` tool namespace per
[`./routing.md`](./routing.md). Public auth pages promote into the
shared `(public)/` group per [`./shell.md`](./shell.md).

| Source (`Review_MLP/src/`) | Target (`alauda-app/apps/web/src/`) | Note |
|---|---|---|
| `app/owner/login/page.tsx` | `app/(public)/login/page.tsx` | promoted to public group; Phase 2 already lifts auth |
| `app/owner/signup/page.tsx` | `app/(public)/signup/page.tsx` | same as above |
| `app/owner/dashboard/page.tsx` | `app/(platform)/reviews/page.tsx` | Reviews dashboard (funnel + private feedback + recent requests) |
| `app/owner/new/page.tsx` | `app/(platform)/reviews/new/page.tsx` | schedule new review request |
| `app/owner/settings/page.tsx` | `app/(platform)/reviews/settings/page.tsx` | per-tool settings (Place ID, ownerDescription, SMS template, velocity cap) |
| `app/r/[token]/page.tsx` | `app/(public)/reviews/r/[token]/page.tsx` | customer rating page; R1 namespace |
| `app/api/auth/signup/route.ts`, `app/api/auth/request/route.ts`, `app/api/auth/verify/route.ts` | `app/api/auth/*` | already lifted in Phase 2 (apps/web shell + login); these copies re-merged in Phase 5 if Phase 2 used a stub |
| `app/api/owner/business/route.ts`, `app/api/owner/business/lookup/route.ts` | `app/api/reviews/business/*` | rename `/api/owner/*` to `/api/reviews/*` |
| `app/api/owner/review-request/[id]/route.ts` | `app/api/reviews/review-request/[id]/route.ts` | rename `/api/review-request` namespace |
| `app/api/review-request/route.ts` | `app/api/reviews/review-request/route.ts` | same rename |
| `app/api/r/[token]/rate/route.ts`, `suggest/route.ts`, `feedback/route.ts`, `google-click/route.ts` | `app/api/r/[token]/*` | top-level `/api/r/*` retained (Reviews owns `r` semantics) |
| `app/api/cron/send-reviews/route.ts` | `app/api/cron/send-reviews/route.ts` | unchanged path; Vercel Cron config merged into `apps/web/vercel.json` |
| `app/api/sms/status-callback/route.ts` | `app/api/sms/status-callback/route.ts` | unchanged path; Twilio webhook URL stays |
| `lib/ai-review.ts`, `lib/contact.ts`, `lib/scheduling.ts`, `lib/notifier.ts`, `lib/email.ts`, `lib/google-places.ts`, `lib/google.ts`, `lib/phone.ts`, `lib/sms-template.ts` | `apps/web/src/lib/*` | first-mover wins on naming if Scan lift took the same name (none of these collide as-is) |
| `components/RatingForm.tsx`, `components/DeleteRequestButton.tsx` | `apps/web/src/components/reviews/*` | namespace under `components/reviews/` to avoid collision with shell components |
| `middleware.ts` | composed into `apps/web/middleware.ts` | Review_MLP's `/owner/*` allowlist replaced by `(platform)/*` group + `(public)/*` group from [`./auth.md`](./auth.md#public-allowlist) |
| `prisma/schema.prisma` | merged into `packages/db/prisma/schema.prisma` | `Business` + `ReviewRequest` models merge; `lastMagicLinkSentAt` removed from `Business` (moved to `User`) |
| `prisma/seed.ts` | dropped | Review_MLP's seed is product-specific test data; alauda-app starts empty |

The route renames (`/owner/*` to `(platform)/reviews/*`,
`/api/owner/*` to `/api/reviews/*`) cascade through every internal
link, every `redirect()` call, and every `Link href={...}` in the
lifted files. The Phase 5 lift includes one mechanical sweep that
rewrites these in-place after the verbatim copy.

## Files explicitly DELETED

Phase 1 of the fork-and-lift day extracts auth and db primitives into
`@alauda/auth` and `@alauda/db`. The Review_MLP files below are the
source-of-truth for that extraction; once `@alauda/auth` and
`@alauda/db` exist, the originals do not lift.

| Source | Reason |
|---|---|
| ~~`Review_MLP/src/lib/auth.ts`~~ | Already in `@alauda/auth` (Phase 1 extraction) |
| ~~`Review_MLP/src/lib/magic-link.ts`~~ | Already in `@alauda/auth` |
| ~~`Review_MLP/src/lib/session.ts`~~ | Already in `@alauda/auth` |
| ~~`Review_MLP/src/lib/token.ts`~~ | Already in `@alauda/auth` |
| ~~`Review_MLP/src/lib/prisma.ts`~~ | Replaced by `@alauda/db` singleton import |
| ~~`Review_MLP/src/lib/env.ts`~~ | Merged into `apps/web/env.ts` (combined Scan + Reviews env vars) |
| ~~`Review_MLP/prisma/migrations/*`~~ | History reset; `packages/db/prisma/migrations/baseline/` is the new origin |

Every consumer of these deleted files in lifted Review_MLP code
rewrites its import. `import { getSession } from '@/lib/auth'`
becomes `import { getSession } from '@alauda/auth'`. `import { prisma }
from '@/lib/prisma'` becomes `import { prisma } from '@alauda/db'`.
The Phase 5 lift performs this rewrite as a single ripgrep-and-replace
pass after the verbatim copy.

## Configuration merges

### vercel.json

Source: `Review_MLP/vercel.json`. Target:
`alauda-app/apps/web/vercel.json`.

The cron config (`/api/cron/send-reviews` every minute) is appended to
`apps/web/vercel.json`. If apps/web has no other cron jobs at this
point in the lift, the merged file is effectively a copy of
Review_MLP's `vercel.json` with the path retained.

```json
{
  "crons": [
    { "path": "/api/cron/send-reviews", "schedule": "* * * * *" }
  ]
}
```

Pro plan required (per [`../ops/deployment.md`](../ops/deployment.md) —
file lands in Task 12; reference is forward).

## Identity-bridging changes (only)

The merge touches Reviews server-side code in exactly two places. Every
other line of every other Reviews source file ships verbatim from
Review_MLP after the rename and provenance pass.

1. **Ownership query rewrite.** Every Reviews server-side
   `findFirst({ where: { ownerEmail } })` call (in
   `app/owner/dashboard`, `app/api/review-request`,
   `app/api/owner/business`, `app/api/r/[token]/*`) now sources
   `ownerEmail` from `currentUser.email` (via `getSession()` from
   `@alauda/auth`), not from a cookie payload. Soft bridge — no schema
   FK change to `Business.ownerEmail`. Detail:
   [`./auth.md#reviews`](./auth.md#reviews).

2. **`Business.lastMagicLinkSentAt` field removal.** The baseline
   migration (Phase 1) drops this field from `Business`; magic-link
   rate-limit moves to `User.lastMagicLinkSentAt`. Reviews codebase has
   no remaining references after the lift; any Review_MLP code that
   read `Business.lastMagicLinkSentAt` was in `lib/auth.ts` which is
   deleted. Background:
   [`../architecture/integration-points.md`](../architecture/integration-points.md)
   entry 4.

## What does NOT change

Reviews ships its product semantics intact. Every item below is the
same string, the same wire format, the same SQL, and the same
behavior in alauda-app as in Review_MLP `main`.

- AI prompt text — `PUBLIC_SYSTEM_PROMPT`, `PRIVATE_SYSTEM_PROMPT`,
  `Business.aiPromptOverride` semantic
- Anthropic SDK calls and model selection
- Twilio webhook signature verification (HMAC-SHA1 against
  `TWILIO_AUTH_TOKEN`)
- Twilio raw HTTPS POST to `Messages.json` (no Twilio SDK)
- Resend email templates (magic link + email-channel review request)
- Per-business 30-day phone/email dedup hashing (SHA-256 phone hash,
  lowercase email hash)
- Send window: 9am-9pm CT
- Jitter: 60-180 minute randomization on default scheduling
- Velocity cap: `VELOCITY_CAP` env, default 3 per rolling 24h
- Cron tick body: optimistic claim
  (`updateMany where sentAt is null`) + rollback on Notifier failure
- Per-business `smsTemplate` override (set via SQL only)
- Customer-side rating UX: 4-5 stars yields AI draft + Google Reviews
  link; 1-3 stars yields private feedback; "Submit privately" opt-out
  available at any rating
- `routedTo` semantics: `'google'` (4-5 stars + not opted out) vs
  `'private'`

The list is exhaustive for the surfaces a Reviews maintainer would
recognize. If a behavior is not in this list and not in the
"Identity-bridging changes" list above, the Phase 5 lift did not edit
it; if a Phase 5 PR proposes such an edit, that PR is out of scope for
the blueprint.

## Verification

Phase 5 verify is one end-to-end flow run locally with `pnpm dev:web`
plus a dev Neon database. No worker needed for Reviews. The cron
endpoint is invokable directly via `curl localhost:3000/api/cron/send-reviews`
during local verification — Vercel Cron only fires in deployed
environments.

1. Sign up at `/signup` with a fresh email — console-mode magic-link
   logs to terminal
2. Click magic link — land on onboarding (zero businesses) — enter
   business name + Google Place lookup — confirm
3. After onboarding, navigate to `/reviews/new`
4. Schedule a review request with a real phone number or email
   (`NOTIFIER_MODE=console` so no actual send)
5. Console logs show the formatted SMS / Email body that would have
   been sent
6. Open the `/r/[token]` URL from the console log in incognito
7. Submit 4 stars + a short note — AI draft appears (Anthropic call) —
   "Open Google Reviews" link present
8. Repeat with 1 star — routed to private feedback form — submit —
   returns to confirmation
9. Reload `/reviews` dashboard — both the 4-star (Google-routed) and
   the 1-star (private-routed) requests appear in funnel + recent +
   private feedback panels

A green run of all nine steps proves the identity bridge holds (steps
1-3), the cron-eligible scheduling path writes correctly (step 4), the
public R1 route serves (steps 6-8), and the dashboard reads the
ownership predicate against `currentUser.email` (step 9).

If step 7 fails with a 401 or "no business found", the ownership
rewrite is wrong — the route is still reading from the cookie payload
instead of `getSession()`. If step 9 shows the request belongs to a
different `Business` than the one onboarded in step 2, the soft email
bridge is mismatched; verify `User.email` casing matches
`Business.ownerEmail`. Both regressions point back to the two bullets
in "Identity-bridging changes".

## Provenance

Every lifted file in `apps/web` from Review_MLP carries the standard
provenance header:

```ts
// origin: AlaudaAI/Review_MLP@<commit-sha>:src/lib/ai-review.ts
// last-synced: YYYY-MM-DD
```

Used for: traceability of every line back to its source file in the
upstream repo, and as the Phase 7 sync signal — when Review_MLP `main`
moves, the headers tell the sync script which files to diff against.
Detail: [`../plan/sync-strategy.md`](../plan/sync-strategy.md).
