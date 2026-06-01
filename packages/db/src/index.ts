// Shared Prisma client — each app process imports this and gets a client
// scoped to its OWN DATABASE_URL (loaded from the app's .env.local at
// startup). Reusing one client per process avoids dev-time connection-pool
// exhaustion from Next.js HMR re-instantiating on every reload.
//
// Same code, 3 different databases. The 3 apps never share user rows.

import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  globalThis.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "production" ? ["error"] : ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}

export * from "@prisma/client";
