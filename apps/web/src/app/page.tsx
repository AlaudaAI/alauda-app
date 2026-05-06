// alauda-app: redirect-by-auth root.
//
// `/` is always a server-side redirect:
//   - logged-in   -> /dashboard
//   - logged-out  -> /signin
//
// Renders nothing (the redirect throws). The (platform) and (public) route
// groups own the actual rendered surfaces.

import { redirect } from "next/navigation";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

export default async function RootPage() {
  const session = await auth();
  redirect(session?.user ? "/dashboard" : "/signin");
}
