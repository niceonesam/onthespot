"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

export default function ResetPasswordPage() {
  const supabase = getSupabaseBrowser();
  const router = useRouter();

  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Make sure we actually have a session from the recovery link
    supabase.auth.getSession().then(({ data }) => {
      setReady(true);
      if (!data.session) {
        setMsg("This reset link is missing or expired. Please request a new password reset email.");
      }
    });
  }, [supabase]);

  async function save() {
    setMsg(null);

    if (pw.length < 8) return setMsg("Password must be at least 8 characters.");
    if (pw !== pw2) return setMsg("Passwords do not match.");

    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setSaving(false);

    if (error) return setMsg(error.message);

    setMsg("Password updated. Redirecting…");
    router.replace("/"); // or /account
  }

  if (!ready) return <div style={{ padding: 16 }}>Loading…</div>;

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
      <div style={{ width: "min(420px, 100%)", border: "1px solid #e5e5e5", borderRadius: 16, padding: 16, background: "white" }}>
        <h1 style={{ marginTop: 0, color: "#111" }}>Set a new password</h1>

        <div style={{ display: "grid", gap: 10 }}>
          <input
            type="password"
            placeholder="New password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            style={{ padding: 10, borderRadius: 12, border: "1px solid #ddd" }}
          />
          <input
            type="password"
            placeholder="Confirm new password"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            style={{ padding: 10, borderRadius: 12, border: "1px solid #ddd" }}
          />

          <button
            type="button"
            onClick={save}
            disabled={saving}
            style={{ padding: 10, borderRadius: 12, border: "1px solid #ddd", background: "white", fontWeight: 700, cursor: "pointer" }}
          >
            {saving ? "Saving…" : "Update password"}
          </button>

          {msg && <div style={{ color: "crimson" }}>{msg}</div>}
        </div>
      </div>
    </div>
  );
}