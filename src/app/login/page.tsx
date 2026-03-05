"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

function LoginInner() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";
  const error = searchParams.get("error");
  const message = searchParams.get("message");

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const action = useMemo(
    () => (mode === "login" ? "/auth/signin" : "/auth/signup"),
    [mode]
  );

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
        style={{
          width: "min(440px, 100%)",
          padding: 18,
        }}
      >
        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <div
            aria-hidden="true"
            style={{
              width: 38,
              height: 38,
              borderRadius: 14,
              display: "grid",
              placeItems: "center",
              background: "rgba(0,255,251,0.12)",
              border: "1px solid rgba(0,0,0,0.08)",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" style={{ display: "block" }}>
              <path
                d="M12 22s7-4.35 7-11a7 7 0 1 0-14 0c0 6.65 7 11 7 11z"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              />
              <circle cx="12" cy="11" r="2.5" fill="#ffb700" />
            </svg>
          </div>

          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1.1, color: "#111" }}>
              OnTheSpot
            </div>
            <div style={{ color: "#555", fontSize: 13, marginTop: 2 }}>
              {mode === "login" ? "Log in to continue" : "Create an account"}
            </div>
          </div>
        </div>

        {/* Mode toggle (segmented control) */}
        <div
          role="tablist"
          aria-label="Auth mode"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
            background: "rgba(0,0,0,0.04)",
            padding: 6,
            borderRadius: 14,
            border: "1px solid rgba(0,0,0,0.06)",
            marginBottom: 14,
          }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "login"}
            onClick={() => setMode("login")}
            className="ots-btn"
            style={{
              border: "1px solid rgba(0,0,0,0.10)",
              background: mode === "login" ? "white" : "transparent",
              boxShadow: mode === "login" ? "0 6px 18px rgba(0,0,0,0.10)" : "none",
            }}
          >
            Log in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "signup"}
            onClick={() => setMode("signup")}
            className="ots-btn"
            style={{
              border: "1px solid rgba(0,0,0,0.10)",
              background: mode === "signup" ? "white" : "transparent",
              boxShadow: mode === "signup" ? "0 6px 18px rgba(0,0,0,0.10)" : "none",
            }}
          >
            Sign up
          </button>
        </div>

        <form
          action={action}
          method="post"
          onSubmit={() => {
            setSubmitting(true);
          }}
          style={{ display: "grid", gap: 12 }}
        >
          <input type="hidden" name="next" value={next} />

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>Email</span>
            <input
              name="email"
              placeholder="you@example.com"
              autoComplete="email"
              className="ots-input"
              style={{ color: "#111" }}
              required
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>Password</span>
            <input
              name="password"
              placeholder={mode === "signup" ? "Create a password" : "Your password"}
              type={showPassword ? "text" : "password"}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              className="ots-input"
              style={{ color: "#111" }}
              required
            />
            <button
              type="button"
              className="ots-btn"
              onClick={() => setShowPassword((v) => !v)}
              style={{
                justifySelf: "start",
                padding: "6px 10px",
                borderRadius: 999,
                fontSize: 12,
                border: "1px solid rgba(0,0,0,0.18)",
                background: "white",
              }}
            >
              {showPassword ? "Hide password" : "Show password"}
            </button>
          </label>

          <button
            type="submit"
            className="ots-btn"
            disabled={submitting}
            style={{
              borderColor: "rgba(0,0,0,0.18)",
              background: "linear-gradient(180deg, rgba(0,255,251,0.20), rgba(0,255,251,0.08))",
              fontWeight: 800,
            }}
          >
            {submitting ? "Working…" : mode === "login" ? "Continue" : "Create account"}
          </button>

          {error && (
            <div
              role="alert"
              style={{
                background: "rgba(255,183,0,0.14)",
                border: "1px solid rgba(255,183,0,0.35)",
                padding: 12,
                borderRadius: 12,
                color: "#333",
                fontWeight: 600,
              }}
            >
              {error}
            </div>
          )}

          {!error && message && (
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
              {message}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 4 }}>
            <span style={{ fontSize: 12, color: "#666" }}>
              By continuing you agree to OnTheSpot’s terms and privacy policy.
            </span>
            <a
              href="/auth/forgot"
              className="ots-link"
              style={{ fontSize: 12, color: "#0b57d0", whiteSpace: "nowrap" }}
            >
              Forgot password?
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}

function LoginFallback() {
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
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{ width: 38, height: 38, borderRadius: 14, background: "#dbeafe" }} />
          <div style={{ flex: 1 }}>
            <div style={{ height: 18, width: 140, borderRadius: 10, background: "#e5e7eb" }} />
            <div style={{ height: 12, width: 220, borderRadius: 10, background: "#eef2f7", marginTop: 8 }} />
          </div>
        </div>

        <div style={{ height: 44, width: "100%", borderRadius: 14, background: "#eef2f7" }} />
        <div style={{ height: 14, width: 120, borderRadius: 10, background: "#eef2f7", marginTop: 14 }} />
        <div style={{ height: 42, width: "100%", borderRadius: 12, background: "#e5e7eb", marginTop: 8 }} />
        <div style={{ height: 14, width: 120, borderRadius: 10, background: "#eef2f7", marginTop: 14 }} />
        <div style={{ height: 42, width: "100%", borderRadius: 12, background: "#e5e7eb", marginTop: 8 }} />
        <div style={{ height: 42, width: "100%", borderRadius: 12, background: "#eef2f7", marginTop: 14 }} />
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginInner />
    </Suspense>
  );
}