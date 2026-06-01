export const metadata = {
  title: "Alauda — sub-b",
  description: "Monorepo demo: sub-b with its own auth + DB",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}
