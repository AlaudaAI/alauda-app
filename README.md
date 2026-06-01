# alauda-app

Monorepo holding the future **base + sub-app** product family. Layout follows
the design in [`AlaudaAI/contexts` design-docs/local-map-seo-modularization.md](https://github.com/AlaudaAI/contexts/blob/main/design-docs/local-map-seo-modularization.md).

## Layout

```
apps/
├── base/        @alauda/base    port 3000   its own SQLite db + auth
├── sub-a/       @alauda/sub-a   port 3001   its own SQLite db + auth
└── sub-b/       @alauda/sub-b   port 3002   its own SQLite db + auth

packages/
├── db/          @alauda/db      shared Prisma schema (applied to each app's db)
└── shared/      @alauda/shared  shared helpers + SigninForm UI
```

## What the demo proves

- **Workspace symlink** — all 3 apps `import { greet, SigninForm } from "@alauda/shared"`. Edit shared code, all 3 apps hot-reload simultaneously.
- **Schema reuse, data isolation** — one `packages/db/prisma/schema.prisma`, three independent SQLite db files (`apps/*/dev.db`), three independent user tables. Sign in to one app, the others don't know you exist.
- **Same UI, different auth backend** — `<SigninForm />` is shared. Each app's `auth.ts` uses its own `AUTH_RESEND_KEY` / `AUTH_SECRET` / `DATABASE_URL`. Send-from address, db, user data all per-app.
- **Per-app deployment-ready** — each `apps/*` builds as a separate artifact and is meant to ship as a separate Vercel project with its own env + domain. (Demo uses SQLite locally; Vercel deploy requires switching to Postgres — see "Switching to Supabase" below.)

## Local setup (SQLite — zero cost)

### 1. Install

```bash
pnpm install
```

### 2. Per-app .env.local

```bash
cp apps/base/.env.local.example  apps/base/.env.local
cp apps/sub-a/.env.local.example apps/sub-a/.env.local
cp apps/sub-b/.env.local.example apps/sub-b/.env.local
```

Generate a fresh `AUTH_SECRET` per app:

```bash
openssl rand -base64 32   # paste into apps/base/.env.local AUTH_SECRET
# repeat for sub-a, sub-b
```

`DATABASE_URL` defaults to a per-app SQLite file (`apps/<name>/dev.db`). No external service needed.

### 3. Build each db

```bash
pnpm db:push:all
```

(or run them one at a time: `pnpm db:push:base`, `pnpm db:push:sub-a`, `pnpm db:push:sub-b`)

Three SQLite files appear at `apps/base/dev.db` / `apps/sub-a/dev.db` / `apps/sub-b/dev.db`, each with the same schema (User / Account / VerificationToken) but separate storage.

### 4. Run

```bash
pnpm dev:base   # http://localhost:3000
pnpm dev:sub-a  # http://localhost:3001
pnpm dev:sub-b  # http://localhost:3002
```

Visit each port, sign in. With the placeholder Resend key, the magic-link URL prints to the dev server console — copy and paste it into the browser to complete signin. Each app stores users in its own SQLite file, completely separate from the others.

## Switching to Supabase / Postgres

Demo runs on SQLite for zero cost. To move to production-grade Postgres (e.g. before Vercel deploy):

1. Open 3 Supabase projects (or your Postgres of choice), one per app
2. Change `packages/db/prisma/schema.prisma`:
   - `provider = "sqlite"` → `provider = "postgresql"`
   - Add back: `directUrl = env("POSTGRES_URL_NON_POOLING")` under `datasource db`
3. Update each `apps/*/.env.local`:
   - Replace `DATABASE_URL="file:.../dev.db"` with the Supabase pooler URL
   - Add `POSTGRES_URL_NON_POOLING` (direct URL)
4. Re-run `pnpm db:push:all` to materialize the schema in each new db
5. (Optional) Switch from `db:push` to proper migration files: `pnpm --filter @alauda/base exec prisma migrate dev --name init --schema=../../packages/db/prisma/schema.prisma` once per app

Application code (auth.ts / Prisma client usage) does not change — Prisma is portable across providers.

## Vercel deploy (per app, after Postgres switch)

Three Vercel projects, all linked to this repo:

| Vercel project | Root directory | Build command |
|---|---|---|
| `alauda-base`  | `apps/base`  | `cd ../.. && pnpm install --frozen-lockfile && pnpm --filter @alauda/base build` |
| `alauda-sub-a` | `apps/sub-a` | `cd ../.. && pnpm install --frozen-lockfile && pnpm --filter @alauda/sub-a build` |
| `alauda-sub-b` | `apps/sub-b` | `cd ../.. && pnpm install --frozen-lockfile && pnpm --filter @alauda/sub-b build` |

Each project's environment variables hold only that app's secrets — no cross-pollination.

## Status

`main` carries this demo scaffold. Production `@alauda/business` / `@alauda/ui` packages land here when the [modularization plan](https://github.com/AlaudaAI/contexts/blob/main/design-docs/local-map-seo-modularization.md) lifts off Backlog.
