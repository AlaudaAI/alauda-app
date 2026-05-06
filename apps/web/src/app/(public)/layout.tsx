// origin: AlaudaAI/Local_Map_SEO@bd17057:apps/web/src/app/(public)/layout.tsx
// last-synced: 2026-05-06
//
// Chrome-free route group for public-facing pages: /signin (lifted in 2-3),
// /scan/r/[token] (Phase 4), /reviews/r/[token] (Phase 5). Layout stays empty
// so each public page renders without sidebar/topbar.
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
