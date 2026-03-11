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
  const [cardActive, setCardActive] = useState(false);
  const [emailValue, setEmailValue] = useState("");
  const [passwordValue, setPasswordValue] = useState("");
  const action = useMemo(
    () => (mode === "login" ? "/auth/signin" : "/auth/signup"),
    [mode]
  );
  const hasStartedTyping = emailValue.trim().length > 0 || passwordValue.length > 0;

  return (
    <div
      style={{
        position: "relative",
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 20,
        background: "linear-gradient(180deg, #f4f6f7 0%, #eef2f3 100%)",
        boxShadow: "inset 0 140px 220px rgba(255,255,255,0.26), inset 0 -120px 180px rgba(15,42,68,0.03)",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
          backgroundImage: "url(/brand/login-map.jpg)",
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "grayscale(100%) blur(1.6px) brightness(1.02)",
          opacity: 0.32,
          transform: "scale(1.05)",
          pointerEvents: "none",
        }}
      />
      <div
        className="ots-surface ots-surface--shadow"
        style={{
          position: "relative",
          zIndex: 1,
          width: "min(480px, 100%)",
          padding: 26,
          borderRadius: 22,
          border: "1px solid rgba(15,42,68,0.08)",
          background: "rgba(255,255,255,0.94)",
          boxShadow: cardActive
            ? "0 26px 70px rgba(15,42,68,0.18)"
            : "0 18px 50px rgba(15,42,68,0.12)",
          transform: cardActive ? "translateY(-2px)" : "translateY(0)",
          transition: "box-shadow 180ms ease, transform 180ms ease",
        }}
      >
        {/* Brand */}
        <div style={{ display: "grid", gap: 12, marginBottom: 18 }}>
          <img
            src="/brand/onthespot-logo.svg"
            alt="OnTheSpot"
            style={{
              display: "block",
              height: 40,
              width: "auto",
              maxWidth: "min(72vw, 240px)",
              objectFit: "contain",
            }}
          />

          <div style={{ minWidth: 0 }}>
            <div className="ots-story-text" style={{ color: "#555", fontSize: 15, lineHeight: 1.5 }}>
              {mode === "login"
                ? "Log in to continue discovering nearby stories."
                : "Create an account and start discovering stories hidden in the world around you."}
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
            background: "linear-gradient(180deg, rgba(15,42,68,0.05), rgba(15,42,68,0.035))",
            padding: 6,
            borderRadius: 16,
            border: "1px solid rgba(15,42,68,0.08)",
            marginBottom: 20,
          }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "login"}
            onClick={() => setMode("login")}
            className="ots-btn"
            style={{
              border: mode === "login"
                ? "1px solid rgba(15,42,68,0.18)"
                : "1px solid rgba(15,42,68,0.08)",
              background: mode === "login"
                ? "linear-gradient(180deg, rgba(255,255,255,1), rgba(246,249,251,1))"
                : "transparent",
              boxShadow: mode === "login"
                ? "0 8px 20px rgba(15,42,68,0.12), inset 0 1px 0 rgba(255,255,255,0.95)"
                : "none",
              color: mode === "login" ? "#0F2A44" : "#374151",
              transform: mode === "login" ? "translateY(-1px)" : "none",
              fontWeight: 800,
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
              border: mode === "signup"
                ? "1px solid rgba(15,42,68,0.18)"
                : "1px solid rgba(15,42,68,0.08)",
              background: mode === "signup"
                ? "linear-gradient(180deg, rgba(255,255,255,1), rgba(246,249,251,1))"
                : "transparent",
              boxShadow: mode === "signup"
                ? "0 8px 20px rgba(15,42,68,0.12), inset 0 1px 0 rgba(255,255,255,0.95)"
                : "none",
              color: mode === "signup" ? "#0F2A44" : "#374151",
              transform: mode === "signup" ? "translateY(-1px)" : "none",
              fontWeight: 800,
            }}
          >
            Sign up
          </button>
        </div>

        <form
          action={action}
          method="post"
          onFocusCapture={() => setCardActive(true)}
          onBlurCapture={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setCardActive(false);
            }
          }}
          onSubmit={() => {
            setSubmitting(true);
          }}
          style={{ display: "grid", gap: 16 }}
        >
          <input type="hidden" name="next" value={next} />

          <label style={{ display: "grid", gap: 8 }}>
            <span className="ots-brand-heading" style={{ fontSize: 15, color: "#111", letterSpacing: "0.01em" }}>Email</span>
            <input
              name="email"
              placeholder="you@example.com"
              autoComplete="email"
              className="ots-input"
              style={{ color: "#111", minHeight: 52 }}
              onChange={(e) => setEmailValue(e.target.value)}
              required
            />
          </label>

          <label style={{ display: "grid", gap: 8 }}>
            <span className="ots-brand-heading" style={{ fontSize: 15, color: "#111", letterSpacing: "0.01em" }}>Password</span>
            <input
              name="password"
              placeholder={mode === "signup" ? "Create a password" : "Your password"}
              type={showPassword ? "text" : "password"}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              className="ots-input"
              style={{ color: "#111", minHeight: 52 }}
              onChange={(e) => setPasswordValue(e.target.value)}
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
                border: "1px solid rgba(15,42,68,0.16)",
                background: "rgba(255,255,255,0.92)",
                color: "#0F2A44",
                fontWeight: 700,
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
              borderColor: hasStartedTyping
                ? "rgba(15,42,68,0.18)"
                : "rgba(15,42,68,0.14)",
              background: hasStartedTyping
                ? "linear-gradient(180deg, rgba(31,182,166,0.32), rgba(31,182,166,0.16))"
                : "linear-gradient(180deg, rgba(31,182,166,0.24), rgba(31,182,166,0.12))",
              color: "#0F2A44",
              fontWeight: 800,
              minHeight: 52,
              boxShadow: hasStartedTyping
                ? "0 14px 32px rgba(31,182,166,0.22), inset 0 1px 0 rgba(255,255,255,0.65)"
                : "0 12px 28px rgba(31,182,166,0.16), inset 0 1px 0 rgba(255,255,255,0.55)",
              transform: hasStartedTyping ? "translateY(-1px)" : "translateY(0)",
              transition: "background 180ms ease, box-shadow 180ms ease, transform 180ms ease, border-color 180ms ease",
            }}
          >
            {submitting ? "Working…" : mode === "login" ? "Continue" : "Create account"}
          </button>

          {error && (
            <div
              role="alert"
              style={{
                background: "rgba(220, 38, 38, 0.10)",
                border: "1px solid rgba(220, 38, 38, 0.24)",
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
                background: "rgba(31,182,166,0.10)",
                border: "1px solid rgba(15,42,68,0.08)",
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

          <div style={{ display: "flex", justifyContent: "space-between", gap: 14, marginTop: 2, alignItems: "start" }}>
            <span className="ots-story-text" style={{ fontSize: 12, color: "#666", lineHeight: 1.5 }}>
              By continuing you agree to OnTheSpot’s terms and privacy policy.
            </span>
            <a
              href="/auth/forgot"
              className="ots-link"
              style={{ fontSize: 12, whiteSpace: "nowrap", fontWeight: 700 }}
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
        position: "relative",
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 20,
        background: "linear-gradient(180deg, #f4f6f7 0%, #eef2f3 100%)",
        boxShadow: "inset 0 140px 220px rgba(255,255,255,0.26), inset 0 -120px 180px rgba(15,42,68,0.03)",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
          backgroundImage: "url(/brand/login-map.jpg)",
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "grayscale(100%) blur(1.6px) brightness(1.02)",
          opacity: 0.32,
          transform: "scale(1.05)",
          pointerEvents: "none",
        }}
      />
      <div className="ots-surface ots-surface--shadow" style={{
        position: "relative",
        zIndex: 1,
        width: "min(480px, 100%)",
        padding: 26,
        borderRadius: 22,
        border: "1px solid rgba(15,42,68,0.08)",
        background: "rgba(255,255,255,0.94)",
        boxShadow: "0 18px 50px rgba(15,42,68,0.12)",
      }}>
        <div style={{ display: "grid", gap: 12, marginBottom: 18 }}>
          <div style={{ height: 40, width: 220, borderRadius: 10, background: "#e5e7eb" }} />
          <div style={{ height: 14, width: "86%", borderRadius: 10, background: "#eef2f7" }} />
        </div>

        <div style={{ height: 52, width: "100%", borderRadius: 16, background: "#eef2f7" }} />
        <div style={{ height: 14, width: 120, borderRadius: 10, background: "#eef2f7", marginTop: 18 }} />
        <div style={{ height: 52, width: "100%", borderRadius: 12, background: "#e5e7eb", marginTop: 10 }} />
        <div style={{ height: 14, width: 120, borderRadius: 10, background: "#eef2f7", marginTop: 18 }} />
        <div style={{ height: 52, width: "100%", borderRadius: 12, background: "#e5e7eb", marginTop: 10 }} />
        <div style={{ height: 52, width: "100%", borderRadius: 12, background: "#eef2f7", marginTop: 18 }} />
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