"use client";

import { useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setBusy(true);

    try {
      const res = await fetch("/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ email }),
      });

      const text = await res.text().catch(() => "");
      let j: any = null;
      try {
        j = text ? JSON.parse(text) : null;
      } catch {}

      if (!res.ok) {
        setMsg(j?.error ?? `Request failed (${res.status})`);
        return;
      }

      setMsg(
        "If that email exists, we’ve sent a password reset link. Check your inbox (and spam)."
      );
      setEmail("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 20,
        background:
          "radial-gradient(1200px 600px at 20% 10%, rgba(0,255,251,0.14), transparent 55%), radial-gradient(900px 500px at 80% 30%, rgba(255,183,0,0.14), transparent 55%), linear-gradient(180deg, rgba(0,0,0,0.02), rgba(0,0,0,0.04))",
      }}
    >
      <div className="ots-surface ots-surface--shadow" style={{ width: "min(440px, 100%)", padding: 18 }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: "#111" }}>Reset password</div>
        <div style={{ color: "#555", fontSize: 13, marginTop: 6 }}>
          Enter your email and we’ll send a reset link.
        </div>

        <form onSubmit={submit} style={{ display: "grid", gap: 12, marginTop: 14 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>Email</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              className="ots-input"
              style={{ color: "#111" }}
              required
            />
          </label>

          <button type="submit" className="ots-btn" disabled={busy}>
            {busy ? "Sending…" : "Send reset link"}
          </button>

          <a href="/login" className="ots-link" style={{ fontSize: 13 }}>
            Back to login
          </a>

          {msg && (
            <div
              role="status"
              style={{
                background: "rgba(0,255,251,0.10)",
                border: "1px solid rgba(0,0,0,0.08)",
                padding: 12,
                borderRadius: 12,
                color: "#333",
                fontWeight: 600,
                whiteSpace: "pre-wrap",
              }}
            >
              {msg}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}