// alauda-app: Sidebar v2 (per BLUEPRINT.md ADR Sidebar v2).
//
// Component shape lifted from AlaudaAI/Local_Map_SEO@bd17057:apps/web/src/components/Sidebar.tsx
// alauda-app deltas:
//   - 3 items only: Scan / Reviews / Reports (all "Coming Soon" until Phase 4-5
//     lifts business code)
//   - dropped `Workspace` section + `Settings` bottom item (per BLUEPRINT.md:
//     no global Settings; per-product settings live under each tool)

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  label: string;
  href: string;
  matchPrefix?: string;
  disabled?: boolean;
  hint?: string;
}

const TOOLS: NavItem[] = [
  { label: "Scan", href: "/scan", matchPrefix: "/scan", disabled: true, hint: "Coming with Phase 4 lift" },
  { label: "Reviews", href: "/reviews", matchPrefix: "/reviews", disabled: true, hint: "Coming with Phase 5 lift" },
  { label: "Reports", href: "/reports", disabled: true, hint: "Coming soon" },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden w-56 shrink-0 border-r border-neutral-200 bg-white md:block">
      <nav className="sticky top-14 flex h-[calc(100vh-3.5rem)] flex-col px-3 py-5">
        <Section title="Tools">
          {TOOLS.map((item) => (
            <Item key={item.label} item={item} pathname={pathname} />
          ))}
        </Section>
      </nav>
    </aside>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="px-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
        {title}
      </div>
      <ul className="mt-2 space-y-0.5">{children}</ul>
    </div>
  );
}

function Item({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = item.matchPrefix
    ? pathname.startsWith(item.matchPrefix)
    : pathname === item.href;
  if (item.disabled) {
    return (
      <li>
        <span
          className="flex cursor-not-allowed items-center justify-between rounded-md px-2 py-1.5 text-sm text-neutral-400"
          title={item.hint ?? "Coming soon"}
        >
          <span>{item.label}</span>
          <span className="rounded-sm bg-neutral-100 px-1 text-[9px] uppercase tracking-wide">
            Soon
          </span>
        </span>
      </li>
    );
  }
  return (
    <li>
      <Link
        href={item.href}
        className={
          active
            ? "block rounded-md bg-neutral-900 px-2 py-1.5 text-sm font-medium text-white"
            : "block rounded-md px-2 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100"
        }
      >
        {item.label}
      </Link>
    </li>
  );
}
