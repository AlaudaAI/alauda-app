// origin: AlaudaAI/Local_Map_SEO@bd17057:apps/web/src/app/(public)/signin/check-email/page.tsx
// last-synced: 2026-05-06
import Image from "next/image";
import Link from "next/link";

export default function CheckEmailPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-6 py-12">
      <div className="w-full max-w-sm text-center">
        <div className="flex items-center justify-center gap-2">
          <Image src="/logo.svg" alt="Alauda" width={22} height={22} priority />
          <span className="text-sm font-semibold tracking-tight">Alauda</span>
        </div>

        <h1 className="mt-8 text-2xl font-semibold tracking-tight">
          Check your inbox
        </h1>
        <p className="mt-2 text-sm text-neutral-500">
          We sent a one-time sign-in link. Click it from this device to
          continue. The link expires in 15 minutes.
        </p>

        <Link
          href="/signin"
          className="mt-6 inline-block text-xs text-neutral-500 hover:text-neutral-900"
        >
          ← Use a different email
        </Link>
      </div>
    </main>
  );
}
