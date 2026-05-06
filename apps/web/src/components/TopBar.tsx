// origin: AlaudaAI/Local_Map_SEO@bd17057:apps/web/src/components/TopBar.tsx
// last-synced: 2026-05-06
//
// alauda-app deltas:
//   - `user` prop is non-nullable (the (platform) layout redirects before
//     rendering when there is no session, so the fallback Sign-in button is gone)
//   - dropped `BusinessSwitcher` block driven by `useBusiness()` (lives with
//     Scan business context, Phase 4 lift)

"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { signOut } from "next-auth/react";

interface SessionUser {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
}

export function TopBar({ user }: { user: SessionUser }) {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-neutral-200 bg-white px-5">
      <Link href="/" className="flex items-center gap-2">
        <Image src="/logo.svg" alt="Alauda" width={22} height={22} priority />
        <span className="text-sm font-semibold tracking-tight">Alauda</span>
      </Link>
      <UserMenu user={user} />
    </header>
  );
}

function UserMenu({ user }: { user: SessionUser }) {
  const [open, setOpen] = useState(false);
  const label = user.name ?? user.email ?? "Account";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full p-1 text-xs hover:bg-neutral-100"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Avatar user={user} />
        <span className="hidden max-w-[140px] truncate text-neutral-700 sm:inline">
          {label}
        </span>
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-30"
            aria-hidden
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className="absolute right-0 top-full z-40 mt-1 w-56 overflow-hidden rounded-md border border-neutral-200 bg-white shadow-lg"
          >
            <div className="border-b border-neutral-100 px-3 py-2">
              <div className="truncate text-sm font-medium" title={label}>
                {label}
              </div>
              {user.email && user.name && (
                <div
                  className="truncate text-[11px] text-neutral-500"
                  title={user.email}
                >
                  {user.email}
                </div>
              )}
            </div>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                void signOut({ callbackUrl: "/" });
              }}
              className="block w-full px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50"
            >
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Avatar({ user }: { user: SessionUser }) {
  if (user.image) {
    // Plain <img> — these are Google CDN URLs we don't proxy.
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={user.image}
        alt={user.name ?? "Avatar"}
        width={28}
        height={28}
        referrerPolicy="no-referrer"
        className="h-7 w-7 rounded-full object-cover"
      />
    );
  }
  const initials = (user.name ?? user.email ?? "?")
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-900 text-[11px] font-semibold text-white">
      {initials}
    </span>
  );
}
