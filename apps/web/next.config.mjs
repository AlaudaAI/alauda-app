// origin: AlaudaAI/Local_Map_SEO@bd17057:apps/web/next.config.mjs
// last-synced: 2026-05-06
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@alauda/db", "@alauda/jobs"],
  // Don't let Next bundle Prisma. When bundled, the engine-loading
  // require.resolve paths get rewritten and the .so.node lookup fails.
  // Marking it external keeps Prisma in node_modules, where its own
  // resolver works as designed.
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client", ".prisma/client"],
  },
  // Trace from the workspace root so the tracer follows pnpm's symlinks
  // into ../../node_modules.
  outputFileTracingRoot: path.join(__dirname, "../.."),
  // Force-include Prisma's native engine. The glob is explicit (no
  // wildcard segments through symlinks) because Next's tracer's globber
  // doesn't always recurse through pnpm's symlink layout.
  outputFileTracingIncludes: {
    "/**": [
      "../../node_modules/.pnpm/@prisma+client*/node_modules/.prisma/client/libquery_engine-*",
      "../../node_modules/.pnpm/@prisma+client*/node_modules/.prisma/client/schema.prisma",
      "../../node_modules/.pnpm/@prisma+client*/node_modules/@prisma/client/**",
    ],
  },
};

export default nextConfig;
