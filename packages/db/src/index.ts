// origin: AlaudaAI/Local_Map_SEO@bd17057:packages/db/src/index.ts
// last-synced: 2026-05-06
//
// Shared Prisma client. Both `apps/web` (Next.js) and `apps/worker` import
// from here. Reusing one client avoids dev-time connection-pool exhaustion
// from Next.js HMR re-instantiating the client on every reload.

import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  globalThis.__prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "production"
        ? ["error"]
        : ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}

export * from "@prisma/client";
