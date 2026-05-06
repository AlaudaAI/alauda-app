// origin: AlaudaAI/Local_Map_SEO@bd17057:apps/web/src/app/api/auth/[...nextauth]/route.ts
// last-synced: 2026-05-06
//
// NextAuth v5 catch-all handler. Owns:
//   /api/auth/signin            — POST (form submit) and GET (built-in form)
//   /api/auth/signin/<provider> — POST to start OAuth or magic link
//   /api/auth/callback/<provider>
//   /api/auth/signout
//   /api/auth/session
//   /api/auth/csrf
// We use the custom /signin page for the UI; this just exposes the API.

import { handlers } from "@/auth";
export const { GET, POST } = handlers;
