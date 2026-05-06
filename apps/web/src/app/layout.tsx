// origin: AlaudaAI/Local_Map_SEO@bd17057:apps/web/src/app/layout.tsx
// last-synced: 2026-05-06
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Alauda",
  description: "Local SEO + reviews — one platform.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-neutral-50 text-neutral-900 antialiased">
        {children}
      </body>
    </html>
  );
}
