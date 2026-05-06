// origin: AlaudaAI/Local_Map_SEO@bd17057:apps/web/src/auth.ts
// last-synced: 2026-05-06
//
// alauda-app deltas (per BLUEPRINT.md ADR amendment 2026-05-06):
//   - import `@alauda/db` instead of `@repo/db`
//   - signIn callback's cookie-only TrackedBusiness adoption block dropped
//     (alauda-app has no cookie-only legacy users to migrate); jwt + session
//     callbacks kept verbatim.

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@alauda/db";

// Module augmentation: surface `user.id` on the session, so server
// components can read it without an extra DB hit.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
      image?: string | null;
    };
  }
}

// NextAuth v5 (Auth.js) — Google + Resend magic link.
//
// JWT session strategy: no Session table needed. The PrismaAdapter still
// owns User, Account, VerificationToken (magic-link tokens).

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  trustHost: true,
  pages: {
    signIn: "/signin",
    verifyRequest: "/signin/check-email",
  },
  providers: [
    Google({
      clientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
      clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    }),
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.EMAIL_FROM,
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // Persist userId on the JWT so server components can read it without
      // hitting the DB on every request.
      if (user?.id) token.userId = user.id;
      return token;
    },
    async session({ session, token }) {
      if (token.userId && session.user) {
        session.user.id = token.userId as string;
      }
      return session;
    },
  },
});
