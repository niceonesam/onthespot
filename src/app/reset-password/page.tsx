"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

function scorePassword(pw: string) {
  // Lightweight UX hint (not security logic)
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (pw.length >= 12) score += 1;
  if (/[A-Z]/.test(pw)) score += 1;
  if (/[0-9]/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;
  return Math.min(score, 5);
}

export default function ResetPasswordPage() {
  const supabase = getSupabaseBrowser();
  const router = useRouter();

  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState<boolean>(false);
  const [saving, setSaving] = useState(false);
  const [showPw, setShowPw] = useState(false);

  useEffect(() => {
    // When arriving from the Supabase recovery link, supabase-js should
    // pick up the recovery session from the URL and establish a session.
    (async () => {
      const { data } = await supabase.auth.getSession();
      setHasSession(!!data.session);
      setReady(true);

      if (!data.session) {
        setMsg(
          "This reset link is missing or expired. Please request a new password reset email."
        );
      }
    })();
  }, [supabase]);

  const pwScore = useMemo(() => scorePassword(pw), [pw]);
  const pwLabel = useMemo(() => {
    if (!pw) return "";
    if (pwScore <= 1) return "Weak";
    if (pwScore === 2) return "Okay";
    if (pwScore === 3) return "Good";
    return "Strong";
  }, [pw, pwScore]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (pw.length < 8) {
      setMsg("Password must be at least 8 characters.");
      return;
    }
    if (pw !== pw2) {
      setMsg("Passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) {
        setMsg(error.message);
        return;
      }

      setMsg("Password updated. Redirecting…");
      // Small delay so the success message is visible
      setTimeout(() => router.replace("/"), 700);
    } finally {
      setSaving(false);
    }
  }

  if (!ready) {
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
        <div
          className="ots-surface ots-surface--shadow"
          style={{ width: "min(460px, 100%)", padding: 18 }}
        >
          Loading…
        </div>
      </div>
    );
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
      <div
        className="ots-surface ots-surface--shadow"
        style={{ width: "min(460px, 100%)", padding: 18 }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            aria-hidden
            style={{
              width: 34,
              height: 34,
              borderRadius: 999,
              display: "grid",
              placeItems: "center",
              background: "rgba(0,255,251,0.18)",
              border: "1px solid rgba(0,0,0,0.08)",
              flex: "0 0 auto",
            }}
          >
            🔑
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: "#111" }}>
              Set a new password
            </div>
            <div style={{ color: "#555", fontSize: 13, marginTop: 2 }}>
              Choose something strong. You’ll be signed in on success.
            </div>
          </div>
        </div>

        {!hasSession && (
          <div
            role="status"
            style={{
              marginTop: 14,
              background: "rgba(255,183,0,0.12)",
              border: "1px solid rgba(0,0,0,0.10)",
              padding: 12,
              borderRadius: 12,
              color: "#333",
              fontWeight: 650,
              whiteSpace: "pre-wrap",
            }}
          >
            {msg}
            <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <a className="ots-link" href="/auth/forgot">
                Request a new reset email
              </a>
              <a className="ots-link" href="/login">
                Back to login
              </a>
            </div>
          </div>
        )}

        <form onSubmit={save} style={{ display: "grid", gap: 12, marginTop: 14 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#111" }}>
              New password
            </span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type={showPw ? "text" : "password"}
                placeholder="At least 8 characters"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                className="ots-input"
                style={{ color: "#111", flex: "1 1 auto" }}
                autoComplete="new-password"
                disabled={!hasSession || saving}
                required
              />
              <button
                type="button"
                className="ots-btn"
                onClick={() => setShowPw((v) => !v)}
                disabled={!hasSession || saving}
                style={{ padding: "8px 10px" }}
                aria-label={showPw ? "Hide password" : "Show password"}
              >
                {showPw ? "Hide" : "Show"}
              </button>
            </div>
            {!!pw && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <div
                  aria-hidden
                  style={{
                    height: 6,
                    borderRadius: 999,
                    background: "rgba(0,0,0,0.10)",
                    overflow: "hidden",
                    flex: "1 1 auto",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${(pwScore / 5) * 100}%`,
                      background: "rgba(0,255,251,0.55)",
                      transition: "width 120ms ease",
                    }}
                  />
                </div>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#333" }}>
                  {pwLabel}
                </div>
              </div>
            )}
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#111" }}>
              Confirm password
            </span>
            <input
              type={showPw ? "text" : "password"}
              placeholder="Repeat password"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              className="ots-input"
              style={{ color: "#111" }}
              autoComplete="new-password"
              disabled={!hasSession || saving}
              required
            />
          </label>

          <button
            type="submit"
            className="ots-btn"
            disabled={!hasSession || saving}
            style={{
              background: "#111",
              color: "white",
              borderColor: "rgba(0,0,0,0.25)",
              fontWeight: 800,
            }}
          >
            {saving ? "Updating…" : "Update password"}
          </button>

          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <a href="/login" className="ots-link" style={{ fontSize: 13 }}>
              Back to login
            </a>
            <a href="/auth/forgot" className="ots-link" style={{ fontSize: 13 }}>
              Request a new reset link
            </a>
          </div>

          {msg && hasSession && (
            <div
              role="status"
              style={{
                background: "rgba(0,255,251,0.10)",
                border: "1px solid rgba(0,0,0,0.08)",
                padding: 12,
                borderRadius: 12,
                color: "#333",
                fontWeight: 650,
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