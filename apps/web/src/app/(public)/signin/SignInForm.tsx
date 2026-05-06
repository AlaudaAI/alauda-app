// origin: AlaudaAI/Local_Map_SEO@bd17057:apps/web/src/app/(public)/signin/SignInForm.tsx
// last-synced: 2026-05-06
"use client";

import { useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";

export function SignInForm({ callbackUrl }: { callbackUrl: string }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<"google" | "email" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function withGoogle() {
    if (busy) return;
    setBusy("google");
    setError(null);
    try {
      await signIn("google", { callbackUrl });
    } catch {
      setError("Couldn't start Google sign-in.");
      setBusy(null);
    }
  }

  async function withEmail(e: FormEvent) {
    e.preventDefault();
    if (busy || !email.trim()) return;
    setBusy("email");
    setError(null);
    try {
      const res = await signIn("resend", {
        email: email.trim(),
        callbackUrl,
        redirect: true,
      });
      // signIn redirects to /signin/check-email on success; we only see
      // a return value if it stayed on the page, which means failure.
      if (res?.error) {
        setError("Couldn't send the magic link. Check the email and try again.");
        setBusy(null);
      }
    } catch {
      setError("Network error. Try again.");
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={withGoogle}
        disabled={busy !== null}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-900 shadow-sm hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <GoogleGlyph />
        {busy === "google" ? "Opening Google…" : "Continue with Google"}
      </button>

      <div className="flex items-center gap-3 text-[11px] uppercase tracking-wider text-neutral-400">
        <div className="h-px flex-1 bg-neutral-200" />
        or
        <div className="h-px flex-1 bg-neutral-200" />
      </div>

      <form onSubmit={withEmail} className="space-y-2">
        <label htmlFor="email" className="block text-xs font-medium text-neutral-700">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-900 focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy !== null || !email.trim()}
          className="w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === "email" ? "Sending…" : "Send magic link"}
        </button>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.5 29.3 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.1l6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.5 29.3 4.5 24 4.5 16.3 4.5 9.7 8.8 6.3 14.1z" />
      <path fill="#4CAF50" d="M24 43.5c5.2 0 9.9-2 13.5-5.2l-6.2-5.2c-2 1.4-4.6 2.4-7.3 2.4-5.3 0-9.7-3.4-11.3-8l-6.5 5C9.5 39.1 16.2 43.5 24 43.5z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6.2 5.2c-.4.4 6.5-4.7 6.5-14.7 0-1.2-.1-2.4-.4-3.5z" />
    </svg>
  );
}
