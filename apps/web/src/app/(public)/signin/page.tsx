// origin: AlaudaAI/Local_Map_SEO@bd17057:apps/web/src/app/(public)/signin/page.tsx
// last-synced: 2026-05-06
import Image from "next/image";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SignInForm } from "./SignInForm";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams?: { callbackUrl?: string; error?: string };
}

// `callbackUrl` is user-supplied via the query string. `redirect()` accepts
// absolute URLs, so passing it through unchecked would be an open-redirect:
// `/signin?callbackUrl=https://evil.example` bounces signed-in users off-site.
// Only allow relative paths that begin with a single `/` (not `//`, which is
// protocol-relative and resolves to a different host).
function safeCallback(url: string | undefined): string {
  if (!url || typeof url !== "string") return "/";
  if (!url.startsWith("/") || url.startsWith("//")) return "/";
  return url;
}

export default async function SignInPage({ searchParams }: PageProps) {
  const callbackUrl = safeCallback(searchParams?.callbackUrl);
  // Already signed in? bounce home (or to the validated callback).
  const session = await auth();
  if (session?.user) redirect(callbackUrl);

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2">
          <Image src="/logo.svg" alt="Alauda" width={22} height={22} priority />
          <span className="text-sm font-semibold tracking-tight">Alauda</span>
        </div>

        <h1 className="mt-8 text-2xl font-semibold tracking-tight">
          Sign in
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Use Google or get a one-time link by email.
        </p>

        {searchParams?.error && (
          <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {prettyError(searchParams.error)}
          </p>
        )}

        <div className="mt-6">
          <SignInForm callbackUrl={callbackUrl} />
        </div>

        <p className="mt-8 text-[11px] text-neutral-400">
          By continuing you agree to be a friendly pilot user. No T&amp;Cs yet.
        </p>
      </div>
    </main>
  );
}

function prettyError(code: string): string {
  switch (code) {
    case "AccessDenied":
      return "You cancelled the sign-in.";
    case "OAuthAccountNotLinked":
      return "This email is already linked to a different sign-in method. Use the original method.";
    case "Verification":
      return "That magic link is invalid or expired. Try again.";
    default:
      return "Couldn't sign you in. Try again.";
  }
}
