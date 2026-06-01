import Link from "next/link";
import { greet } from "@alauda/shared";
import { auth, signOut } from "@/auth";

export default async function BaseHomePage() {
  const session = await auth();

  return (
    <main style={{ maxWidth: 640, margin: "4rem auto", fontFamily: "system-ui, sans-serif" }}>
      <h1>{greet("base")}</h1>
      <p style={{ color: "#666" }}>
        <code>@alauda/base</code> · port 3000 · its own SQLite db ·
        its own user table
      </p>

      {session?.user ? (
        <section style={cardStyle}>
          <p>
            Signed in as <strong>{session.user.email}</strong>
          </p>
          <p style={{ color: "#888", fontSize: 13 }}>
            user.id: <code>{session.user.id}</code>
          </p>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button type="submit" style={buttonStyle}>
              Sign out
            </button>
          </form>
        </section>
      ) : (
        <section style={cardStyle}>
          <p>Not signed in.</p>
          <Link href="/signin" style={linkStyle}>
            Sign in to base →
          </Link>
        </section>
      )}

      <hr style={{ margin: "2rem 0", border: "none", borderTop: "1px solid #eee" }} />

      <h2 style={{ fontSize: 18, marginBottom: 8 }}>Demo notes</h2>
      <ul style={{ color: "#555", fontSize: 14, lineHeight: 1.6 }}>
        <li>
          <code>greet()</code> lives in <code>@alauda/shared</code> — edit it
          while all 3 apps run, every browser auto-reloads.
        </li>
        <li>
          Signing in here creates a user only in <em>base&apos;s</em>{" "}
          db. The other two apps don&apos;t see this account.
        </li>
        <li>
          <code>@alauda/db</code> is one Prisma schema; each app applies the
          same migration against its own DB.
        </li>
      </ul>
    </main>
  );
}

const cardStyle: React.CSSProperties = {
  padding: "1rem 1.25rem",
  border: "1px solid #e5e5e5",
  borderRadius: 8,
  marginTop: 16,
};

const linkStyle: React.CSSProperties = {
  display: "inline-block",
  marginTop: 8,
  color: "#0070f3",
  textDecoration: "none",
};

const buttonStyle: React.CSSProperties = {
  marginTop: 12,
  padding: "8px 14px",
  fontSize: 13,
  background: "#111",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
};
