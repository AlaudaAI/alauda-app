# alauda-app

## What is alauda-app

alauda-app is a unified product platform that integrates two existing
Alauda products into a single LocalRank-style Next.js app.

- **Scan** delivers geographic SERP visibility through a 5×5 grid scan,
  lifted from [`AlaudaAI/Local_Map_SEO`](https://github.com/AlaudaAI/Local_Map_SEO).
- **Reviews** runs a Google review request funnel (SMS / Email → rating
  page → AI-drafted review or private feedback), lifted from
  [`AlaudaAI/Review_MLP`](https://github.com/AlaudaAI/Review_MLP).
- **Reports** is reserved as a sidebar placeholder ("Coming Soon") with
  no implementation.

The reference dashboard form is
[`app.localrank.so/dashboard`](https://app.localrank.so/dashboard).
The reference blueprint shape is the first commit of
[`AlaudaAI/website-rebuild`](https://github.com/AlaudaAI/website-rebuild)
— pure documentation, zero code.

## What is this directory

This repository is a **documentation blueprint**. It contains no
application code, no `apps/`, no `packages/`, no migrations — only the
markdown files that articulate the integration decisions.

Actual implementation (fork & lift the two source repos into a monorepo)
happens later via the runbook in
[`plan/fork-and-lift-day.md`](plan/fork-and-lift-day.md), on Jason's
schedule, with zero disruption to ongoing source-repo development.

## Directory map

```
alauda-app/
├── README.md                        ← this file
├── architecture/
│   ├── decisions.md                 ← all ADRs (meta principle + 8 decisions + α/isolation + sync)
│   ├── system-diagram.md            ← mermaid: Next app + Worker + DB + Redis + external services
│   ├── integration-points.md        ← catalog of seams where the two products meet
│   └── constants.md                 ← index of inherited operational constants
├── domain/
│   └── data-model.md                ← merged Prisma schema sketch + ER diagram
├── specs/
│   ├── shell.md                     ← Sidebar v2, header dropdown, BusinessSwitcher, root route
│   ├── auth.md                      ← @alauda/auth API, middleware, magic-link callback
│   ├── routing.md                   ← full route table: public + authed, web + api
│   ├── scan-integration.md          ← Local_Map_SEO → alauda-app file mapping
│   └── reviews-integration.md       ← Review_MLP → alauda-app file mapping
├── ops/
│   ├── deployment.md                ← Vercel + Railway, env variable groups, external services
│   └── database.md                  ← Neon + PostGIS setup, baseline migration strategy
└── plan/
    ├── fork-and-lift-day.md         ← Phase 0-6 step-by-step runbook (one-time)
    └── sync-strategy.md             ← Phase 7 ongoing cherry-pick flow (continuous)
```

Every file is hyperlinked in the reading order below.

## How to read this

1. Start with [`architecture/decisions.md`](architecture/decisions.md) —
   the 8 ADRs plus the meta principle. Every other document is downstream
   of these decisions; reading them first makes everything else cohere.
2. Then [`domain/data-model.md`](domain/data-model.md) — the merged
   Prisma schema sketch. The data model is the substrate the routing,
   auth, and integration specs sit on top of.
3. Then [`architecture/system-diagram.md`](architecture/system-diagram.md)
   — the runtime topology (Vercel + Railway + Neon + Upstash + external
   services) so the deployment and ops files have a picture to anchor
   against.
4. Then the per-area specs in [`specs/`](specs/):
   [`shell.md`](specs/shell.md), [`auth.md`](specs/auth.md),
   [`routing.md`](specs/routing.md),
   [`scan-integration.md`](specs/scan-integration.md), and
   [`reviews-integration.md`](specs/reviews-integration.md). These define
   the contracts the runbook executes against.
5. Then the operational guides in [`ops/`](ops/):
   [`deployment.md`](ops/deployment.md) and
   [`database.md`](ops/database.md). Read these before standing up real
   infrastructure.
6. Then the runbooks in [`plan/`](plan/):
   [`fork-and-lift-day.md`](plan/fork-and-lift-day.md) for the one-time
   migration, [`sync-strategy.md`](plan/sync-strategy.md) for the
   continuous post-lift workflow.
7. The supporting references
   [`architecture/constants.md`](architecture/constants.md) and
   [`architecture/integration-points.md`](architecture/integration-points.md)
   are best read alongside the specs they cross-reference, not
   front-to-back.

## What this blueprint does NOT include

- **D1 Business / TrackedBusiness field unification.** The two product
  schemas coexist with separate models and a soft email bridge.
  Field-level merging is a future migration, not a blueprint decision.
- **Agency / multi-location / membership / role model.** alauda-app's
  identity is a flat `User` with owned businesses. Multi-tenant role
  logic does not exist and is not designed here.
- **Stripe billing, async-base unification (Inngest, BullMQ for
  Reviews), and any global Settings page.** Each tool keeps its
  inherited async pattern; no account-level settings exist yet, so no
  surface is created.
- **Marketing site and internal feature redesign.** alauda-app is
  platform integration, not a new product. Internal feature decisions
  (BullMQ choice, Resend choice, AI prompts, env names, etc.) are
  inherited verbatim from the source repos.
- **Freezing or sunsetting the source repos.** `Local_Map_SEO` and
  `Review_MLP` continue independent development. Their eventual sunset
  is a separate future decision outside this blueprint's scope.

## Source repos

- [`AlaudaAI/Local_Map_SEO`](https://github.com/AlaudaAI/Local_Map_SEO)
  — geographic SERP visibility tool that runs a 5×5 grid scan via BullMQ
  + Railway worker, backed by Serper / DataForSEO and Mapbox; provides
  the Scan tool and the `packages/db` + `packages/jobs` skeleton lifted
  into alauda-app.
- [`AlaudaAI/Review_MLP`](https://github.com/AlaudaAI/Review_MLP)
  — Google review request funnel that sends SMS / email via Twilio +
  Resend, drives a customer rating page, and drafts public reviews or
  private feedback through Anthropic; provides the Reviews tool and the
  magic-link auth lifted into `packages/auth`.
