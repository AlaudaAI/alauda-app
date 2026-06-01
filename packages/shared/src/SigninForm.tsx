"use client";

import { useState, type FormEvent } from "react";

export interface SigninFormProps {
  /** The app's display name, e.g. "base", "sub-a", "sub-b". Shown on the form. */
  appName: string;
  /** Callback the host app provides. Receives the email and triggers the
   *  app's own NextAuth signIn (Resend / magic-link / etc). */
  onSubmit: (email: string) => Promise<void>;
}

/**
 * Shared signin UI. Same look-and-feel across all 3 apps. Auth wiring
 * is per-app — each host provides its own onSubmit that calls its own
 * NextAuth `signIn("resend", { email })` or similar.
 */
export function SigninForm({ appName, onSubmit }: SigninFormProps) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await onSubmit(email);
      setMessage("Check your inbox for the sign-in link.");
    } catch (err) {
      setMessage(
        err instanceof Error ? `Failed: ${err.message}` : "Sign-in failed",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={containerStyle}>
      <h1 style={titleStyle}>Sign in to {appName}</h1>
      <p style={subtitleStyle}>We&apos;ll email you a magic link.</p>
      <form onSubmit={handleSubmit} style={formStyle}>
        <input
          type="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
          style={inputStyle}
        />
        <button type="submit" disabled={busy || !email} style={buttonStyle}>
          {busy ? "Sending…" : "Send magic link"}
        </button>
      </form>
      {message && <p style={messageStyle}>{message}</p>}
      <p style={footerStyle}>
        This UI is shared from <code>@alauda/shared</code>. The auth backend
        wiring (OAuth client, Resend key, DB) is independent per app.
      </p>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  maxWidth: 380,
  margin: "4rem auto",
  padding: "2rem",
  border: "1px solid #e5e5e5",
  borderRadius: 12,
  fontFamily: "system-ui, sans-serif",
};

const titleStyle: React.CSSProperties = {
  fontSize: 24,
  fontWeight: 600,
  margin: "0 0 0.5rem 0",
};

const subtitleStyle: React.CSSProperties = {
  color: "#666",
  margin: "0 0 1.5rem 0",
};

const formStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const inputStyle: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: 14,
  borderRadius: 6,
  border: "1px solid #d4d4d4",
  outline: "none",
};

const buttonStyle: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: 14,
  fontWeight: 500,
  borderRadius: 6,
  border: "none",
  background: "#111",
  color: "#fff",
  cursor: "pointer",
};

const messageStyle: React.CSSProperties = {
  marginTop: 16,
  padding: "10px 12px",
  background: "#f5f5f5",
  borderRadius: 6,
  fontSize: 13,
  color: "#333",
};

const footerStyle: React.CSSProperties = {
  marginTop: 24,
  fontSize: 12,
  color: "#999",
  lineHeight: 1.5,
};
