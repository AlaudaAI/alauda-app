// alauda-app: blank dashboard landing.
//
// Phase 2 verify target: sign-in flows here. Real content (recent scans /
// pending review requests / etc.) lands in Phase 4-5 once Scan and Reviews
// business code lifts.

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Welcome to alauda-app. Tools come online here as Scan and Reviews lift in.
      </p>
    </div>
  );
}
