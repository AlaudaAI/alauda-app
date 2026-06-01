export const metadata = {
  title: "Alauda — Sub Demo",
  description: "Monorepo demo: independent sub-app",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
        {children}
      </body>
    </html>
  );
}
