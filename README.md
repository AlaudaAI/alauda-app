# alauda-app

Unified product platform integrating two existing Alauda products into one Next.js app:

- **Scan** — geographic SERP visibility (5×5 grid scan), backed by [`AlaudaAI/Local_Map_SEO`](https://github.com/AlaudaAI/Local_Map_SEO).
- **Reviews** — Google review request funnel (SMS / email → rating page → AI-drafted review or private feedback), backed by [`AlaudaAI/Review_MLP`](https://github.com/AlaudaAI/Review_MLP).
- **Reports** — sidebar placeholder ("Coming Soon"), no implementation.

Reference dashboard form: [`app.localrank.so/dashboard`](https://app.localrank.so/dashboard).

## Status

Currently in **dev-cycle step 2 (Design)** — awaiting Glen review.

- **Authoritative design**: [`AlaudaAI/contexts` PR #3](https://github.com/AlaudaAI/contexts/pull/3) → `design-docs/alauda-app-blueprint.md` (spec, 660 lines) + `design-docs/alauda-app-blueprint-execution.md` (1859-line, 15-task plan to write the full 13-file blueprint here in a later step).
- **Working summary for early-execution sessions**: [`docs/BLUEPRINT.md`](docs/BLUEPRINT.md) — 8 ADRs in one-liner form + Phase 0/1/2 checklist + don't-duplicate guardrails.

## Why "fork & lift", not "redesign"

alauda-app inherits internal logic (BullMQ choice, Resend choice, Vercel Pro plan dependency, env variable names, Prisma migration strategy, internal field shapes, AI prompts, etc.) verbatim from source repos. **The blueprint only decides the unavoidable seams that appear when two products fold into one Next.js app, one Postgres database, one auth flow, one URL space.**

Source repos (`Local_Map_SEO`, `Review_MLP`) continue independent development. alauda-app does **not** require Yifan to pause source-repo work; alauda-app **opportunistically cherry-picks** logic-relevant changes after fork & lift.

## Stack

Next.js 14 + Prisma + Neon Postgres (PostGIS) + BullMQ on Upstash + Vercel (web) + Railway (worker) + NextAuth v5 (Google + Resend magic-link, lifted from Local_Map_SEO PR #19).

## How to read this repo (early-stage)

1. Skim [`docs/BLUEPRINT.md`](docs/BLUEPRINT.md) for the 8 ADRs and what's lifted from where.
2. Open the [contexts PR #3](https://github.com/AlaudaAI/contexts/pull/3) for full design rationale.
3. Phase 0 / 1 / 2 are the pre-Glen-sign-off prep work — see `docs/BLUEPRINT.md` checklist.

## When this README evolves

After Glen signs off contexts PR #3 + the 15-task blueprint runs, this repo will gain `architecture/`, `domain/`, `specs/`, `ops/`, `plan/` directories per the spec's final folder layout. This README will then point at `architecture/decisions.md` as the canonical ADR source instead of `docs/BLUEPRINT.md`.
