"use client";

import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";
  const error = searchParams.get("error");

  const [mode, setMode] = useState<"login" | "signup">("login");
  const action = useMemo(() => (mode === "login" ? "/auth/signin" : "/auth/signup"), [mode]);

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
      <div style={{ width: "min(420px, 100%)", border: "1px solid #e5e5e5", borderRadius: 16, padding: 16, background: "white" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "black", marginBottom: 4 }}>OnTheSpot</h1>
        <p style={{ marginTop: 0, color: "#555", marginBottom: 16 }}>
          {mode === "login" ? "Log in to continue" : "Create an account"}
        </p>

        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button
            type="button"
            onClick={() => setMode("login")}
            style={{ flex: 1, padding: 10, borderRadius: 12, border: "1px solid #ddd", background: mode === "login" ? "#f3f3f3" : "white", color: "#555", cursor: "pointer" }}
          >
            Log in
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            style={{ flex: 1, padding: 10, borderRadius: 12, border: "1px solid #ddd", background: mode === "signup" ? "#f3f3f3" : "white", color: "#555", cursor: "pointer" }}
          >
            Sign up
          </button>
        </div>

        <form action={action} method="post" style={{ display: "grid", gap: 10 }}>
          <input type="hidden" name="next" value={next} />

          <input
            name="email"
            placeholder="Email"
            autoComplete="email"
            style={{ padding: 10, borderRadius: 12, border: "1px solid #ddd" }}
          />
          <input
            name="password"
            placeholder="Password"
            type="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            style={{ padding: 10, borderRadius: 12, border: "1px solid #ddd" }}
          />

          <button
            type="submit"
            style={{ padding: 10, borderRadius: 12, border: "1px solid #ddd", background: "white", color: "#555", cursor: "pointer", fontWeight: 700 }}
          >
            {mode === "login" ? "Continue" : "Create account"}
          </button>

          {error && (
            <div style={{ background: "#fff3cd", border: "1px solid #ffeeba", padding: 10, borderRadius: 12, color: "#333" }}>
              {error}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}