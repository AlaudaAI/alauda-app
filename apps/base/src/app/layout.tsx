export const metadata = {
  title: "Alauda — Base",
  description: "Monorepo demo: base app with its own auth + DB",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}
