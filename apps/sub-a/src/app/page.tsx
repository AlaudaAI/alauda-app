import Link from "next/link";
import { greet } from "@alauda/shared";
import { auth, signOut } from "@/auth";

export default async function SubAHomePage() {
  const session = await auth();

  return (
    <main style={{ maxWidth: 640, margin: "4rem auto", fontFamily: "system-ui, sans-serif" }}>
      <h1>{greet("sub-a")}</h1>
      <p style={{ color: "#666" }}>
        <code>@alauda/sub-a</code> · port 3001 · its own SQLite db ·
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
            Sign in to sub-a →
          </Link>
        </section>
      )}

      <hr style={{ margin: "2rem 0", border: "none", borderTop: "1px solid #eee" }} />

      <p style={{ color: "#999", fontSize: 13 }}>
        Same code as <code>@alauda/base</code> and <code>@alauda/sub-b</code>,
        but signing in here creates an account only in sub-a&apos;s database.
        Cross-app users are independent.
      </p>
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
