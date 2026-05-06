// alauda-app: logged-in app shell (sidebar + topbar).
//
// Lifted from AlaudaAI/Local_Map_SEO@bd17057:apps/web/src/app/(platform)/layout.tsx
// alauda-app deltas:
//   - explicit `await auth() + redirect("/signin")` gate at the layout level
//     (Local_Map_SEO doesn't gate here; alauda-app enforces page-level redirect
//     via this (platform) layout per BLUEPRINT A1)
//   - carries `callbackUrl` so deep links round-trip through sign-in (path
//     read from the `x-pathname` header set by middleware.ts)
//   - dropped `BusinessProvider` + `getCurrentBusiness()` (Scan business
//     context lifts in Phase 4)
//   - dropped `requireOwner` helper — inline `auth()` + redirect matches PR #19

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/auth";
import { TopBar } from "@/components/TopBar";
import { Sidebar } from "@/components/Sidebar";

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    const pathname = headers().get("x-pathname") ?? "/";
    redirect(`/signin?callbackUrl=${encodeURIComponent(pathname)}`);
  }

  const user = {
    id: session.user.id ?? "",
    email: session.user.email ?? null,
    name: session.user.name ?? null,
    image: session.user.image ?? null,
  };

  return (
    <>
      <TopBar user={user} />
      <div className="flex">
        <Sidebar />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </>
  );
}
