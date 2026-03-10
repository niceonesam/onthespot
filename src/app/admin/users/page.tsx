"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

type UserRow = {
  id: string;
  email: string | null;
  created_at: string;
  role: "user" | "super" | "admin";
  credit_balance: number;
  approved_count: number;
  rejected_count: number;
  sourced_count: number;
  trust_tier: "new" | "trusted" | "verified" | string;
};

type LedgerRow = {
  id: number;
  created_at: string;
  delta: number;
  reason: string;
  submission_id: string | null;
  stripe_payment_intent_id: string | null;
};

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function prettyTrustTier(tier: string | null | undefined) {
  if (tier === "verified") return "Verified contributor";
  if (tier === "trusted") return "Trusted contributor";
  return "New contributor";
}

function trustTierStyle(tier: string | null | undefined) {
  if (tier === "verified") {
    return {
      background: "rgba(230, 179, 37, 0.14)",
      border: "1px solid rgba(230, 179, 37, 0.38)",
      color: "#0F2A44",
    };
  }

  if (tier === "trusted") {
    return {
      background: "rgba(31, 182, 166, 0.12)",
      border: "1px solid rgba(31, 182, 166, 0.34)",
      color: "#0F2A44",
    };
  }

  return {
    background: "rgba(107, 114, 128, 0.10)",
    border: "1px solid rgba(107, 114, 128, 0.24)",
    color: "#374151",
  };
}

function rejectionRate(approved: number, rejected: number) {
  const totalReviewed = approved + rejected;
  if (totalReviewed <= 0) return 0;
  return rejected / totalReviewed;
}

function contributorRisk(approved: number, rejected: number) {
  const rate = rejectionRate(approved, rejected);
  if (rejected >= 5 || rate > 0.5) return "warning";
  return null;
}

export default function AdminUsersPage() {
  const supabase = useMemo(() => getSupabaseBrowser(), []);

  const [q, setQ] = useState("");
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditUser, setAuditUser] = useState<UserRow | null>(null);
  const [auditRows, setAuditRows] = useState<LedgerRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  async function load(query?: string) {
    setLoading(true);
    setMsg(null);

    const { data, error } = await supabase.rpc("admin_search_users", {
      p_query: query ?? q,
      p_limit: 100,
    });

    if (error) {
      setRows([]);
      setMsg(error.message);
      setLoading(false);
      return;
    }

    const out = (data ?? []) as UserRow[];
    setRows(out);

    if (out.length === 0) {
      setMsg(
        "No users returned. This usually means your admin_search_users RPC is returning zero rows for this session (not admin / missing profiles row / RLS)."
      );
    }

    setLoading(false);
  }

  useEffect(() => {
    load("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeAudit();
    }

    if (auditOpen) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auditOpen]);

  async function setRole(userId: string, role: UserRow["role"]) {
    setMsg(null);

    const ok = confirm(`Set role for ${userId.slice(0, 8)}… to "${role}"?`);
    if (!ok) return;

    const { error } = await supabase.rpc("set_user_role", {
      p_user_id: userId,
      p_role: role,
    });

    if (error) {
      setMsg(error.message);
      return;
    }

    await load();
    setMsg(`Updated role to "${role}".`);
  }

  async function adjustCredits(userId: string) {
    setMsg(null);

    const raw = prompt("Adjust credits by (e.g. 5, -1):");
    if (raw === null) return;

    const delta = Number(raw);
    if (!Number.isInteger(delta) || delta === 0) {
      setMsg("Please enter a whole number that isn’t 0 (e.g. 5 or -1).");
      return;
    }

    const ok = confirm(`Apply credit adjustment of ${delta} to ${userId.slice(0, 8)}… ?`);
    if (!ok) return;

    const { error } = await supabase.rpc("admin_adjust_user_credits", {
      p_user_id: userId,
      p_delta: delta,
      p_note: null,
    });

    if (error) {
      setMsg(error.message);
      return;
    }

    await load();
    setMsg(`Adjusted credits by ${delta}.`);
  }

  async function openAudit(u: UserRow) {
    setMsg(null);
    setAuditUser(u);
    setAuditRows([]);
    setAuditOpen(true);
    setAuditLoading(true);

    const { data, error } = await supabase.rpc("admin_get_user_ledger", {
      p_user_id: u.id,
      p_limit: 10,
    });

    setAuditLoading(false);

    if (error) {
      setMsg(error.message);
      return;
    }

    setAuditRows((data ?? []) as LedgerRow[]);
  }

  function closeAudit() {
    setAuditOpen(false);
    setAuditUser(null);
    setAuditRows([]);
  }

  return (
    <AppShell
      subtitle="Admin"
      right={
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Link href="/" className="ots-link">
            Home
          </Link>
          <Link href="/admin/users" className="ots-link" style={{ fontWeight: 800 }}>
            Users
          </Link>
          <Link href="/admin/submissions" className="ots-link">
            Submissions
          </Link>
        </div>
      }
    >
      <div style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>
        <h1 className="ots-h1" style={{ fontSize: 22, fontWeight: 800, marginBottom: 12, color: "#111" }}>
          Users
        </h1>

        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
            marginBottom: 12,
            color: "#111",
          }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search email or UUID…"
            style={{
              padding: 10,
              borderRadius: 12,
              border: "1px solid #ddd",
              minWidth: 260,
              background: "white",
            }}
          />
          <button
            type="button"
            onClick={() => load()}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #ddd",
              background: "white",
              cursor: "pointer",
              color: "#111",
              fontWeight: 700,
            }}
          >
            Search
          </button>
          <button
            type="button"
            onClick={() => {
              setQ("");
              load("");
            }}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #ddd",
              background: "white",
              cursor: "pointer",
              color: "#111",
            }}
          >
            Clear
          </button>

          {loading && <span style={{ fontSize: 14 }}>Loading…</span>}
          {!loading && (
            <span style={{ fontSize: 14, color: "#555" }}>{rows.length} users</span>
          )}
        </div>

        {msg && (
          <div
            style={{
              background: "#fff3cd",
              border: "1px solid #ffeeba",
              padding: 10,
              borderRadius: 12,
              marginBottom: 12,
              color: "#333",
              fontSize: 14,
            }}
          >
            {msg}
          </div>
        )}

        <div style={{ display: "grid", gap: 10 }}>
          {rows.map((u) => {
  const risk = contributorRisk(u.approved_count ?? 0, u.rejected_count ?? 0);
  const rate = rejectionRate(u.approved_count ?? 0, u.rejected_count ?? 0);
  return (
            <div
              key={u.id}
              className="ots-surface ots-surface--border"
              style={{
                padding: 12,
                background: "white",
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "center",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div className="ots-brand-heading" style={{ fontWeight: 700, fontSize: 15, color: "#111" }}>
                  {u.email ?? "(no email)"}{" "}
                  <span style={{ fontWeight: 400, color: "#666" }}>
                    · {u.id.slice(0, 8)}…
                  </span>
                </div>
                <div style={{ fontSize: 13, color: "#555", marginTop: 2 }}>
                  Created: {fmtDate(u.created_at)} · Current role: <strong>{u.role}</strong>
                </div>

                <div
                  style={{
                    marginTop: 8,
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      padding: "4px 8px",
                      borderRadius: 999,
                      fontSize: 12,
                      fontWeight: 800,
                      ...trustTierStyle(u.trust_tier),
                    }}
                  >
                    {prettyTrustTier(u.trust_tier)}
                  </span>

                  {risk === "warning" && (
                    <span
                      title={`Rejection rate ${Math.round(rate * 100)}%`}
                      style={{
                        padding: "4px 8px",
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 800,
                        background: "rgba(220, 38, 38, 0.10)",
                        border: "1px solid rgba(220, 38, 38, 0.28)",
                        color: "#991b1b",
                      }}
                    >
                      Warning · {Math.round(rate * 100)}% rejected
                    </span>
                  )}

                  <span style={{ fontSize: 12, color: "#555" }}>
                    {u.approved_count ?? 0} approved
                  </span>
                  <span style={{ fontSize: 12, color: "#555" }}>
                    {u.rejected_count ?? 0} rejected
                  </span>
                  <span style={{ fontSize: 12, color: "#555" }}>
                    {u.sourced_count ?? 0} sourced
                  </span>
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div style={{ fontSize: 13, color: "#555" }}>
                  Credits: <strong style={{ color: "#111" }}>{u.credit_balance ?? 0}</strong>
                </div>

                <button
                  type="button"
                  onClick={() => adjustCredits(u.id)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 12,
                    border: "1px solid #ddd",
                    background: "white",
                    cursor: "pointer",
                    color: "#111",
                  }}
                  title="Grant or remove credits"
                >
                  Credits…
                </button>

                <button
                  type="button"
                  onClick={() => openAudit(u)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 12,
                    border: "1px solid #ddd",
                    background: "white",
                    cursor: "pointer",
                    color: "#111",
                  }}
                  title="View last 10 credit ledger entries"
                >
                  Audit…
                </button>

                <select
                  defaultValue={u.role}
                  onChange={(e) => setRole(u.id, e.target.value as UserRow["role"])}
                  style={{
                    padding: 8,
                    borderRadius: 12,
                    border: "1px solid #ddd",
                    background: "white",
                    color: "#111",
                  }}
                  title="Change role"
                >
                  <option value="user">user</option>
                  <option value="super">super</option>
                  <option value="admin">admin</option>
                </select>
              </div>
            </div>
          )})}

          {!loading && rows.length === 0 && (
            <div className="ots-story-text" style={{ padding: 16, color: "#555", fontSize: 14 }}>No users found.</div>
          )}
        </div>

        <div className="ots-story-text" style={{ marginTop: 14, fontSize: 13, color: "#666" }}>
          Tip: Give friends/family <strong>super</strong>. Keep <strong>admin</strong> for you.
        </div>

        {auditOpen && (
          <div
            onClick={closeAudit}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
              zIndex: 50,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="ots-surface ots-surface--shadow"
              style={{
                width: "min(720px, 100%)",
                background: "white",
                borderRadius: 16,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: 12,
                  borderBottom: "1px solid #eee",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div className="ots-brand-heading" style={{ fontWeight: 800, fontSize: 16, color: "#111" }}>
                    Credit Ledger (last 10)
                  </div>
                  {auditUser && (
                    <div style={{ fontSize: 13, color: "#666", marginTop: 2 }}>
                      {auditUser.email ?? "(no email)"} · {auditUser.id.slice(0, 8)}… · current credits{" "}
                      <strong style={{ color: "#111" }}>{auditUser.credit_balance ?? 0}</strong>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={closeAudit}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 12,
                    border: "1px solid #ddd",
                    background: "white",
                    cursor: "pointer",
                    color: "#111",
                  }}
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>

              <div style={{ padding: 12 }}>
                {auditLoading && (
                  <div style={{ fontSize: 14, color: "#555" }}>Loading…</div>
                )}

                {!auditLoading && auditRows.length === 0 && (
                  <div style={{ fontSize: 14, color: "#555" }}>
                    No ledger entries found.
                  </div>
                )}

                {!auditLoading && auditRows.length > 0 && (
                  <div style={{ display: "grid", gap: 8 }}>
                    {auditRows.map((r) => (
                      <div
                        key={r.id}
                        className="ots-surface ots-surface--border"
                        style={{ padding: 10, display: "grid", gap: 4 }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 12,
                          }}
                        >
                          <div className="ots-brand-heading" style={{ fontWeight: 700, color: "#111" }}>
                            {r.delta > 0 ? `+${r.delta}` : `${r.delta}`} · {r.reason}
                          </div>
                          <div style={{ fontSize: 12, color: "#666" }}>
                            {fmtDate(r.created_at)}
                          </div>
                        </div>

                        <div
                          style={{
                            fontSize: 12,
                            color: "#666",
                            wordBreak: "break-word",
                          }}
                        >
                          {r.submission_id && (
                            <div>
                              submission_id: <code>{r.submission_id}</code>
                            </div>
                          )}
                          {r.stripe_payment_intent_id && (
                            <div>
                              payment_intent: <code>{r.stripe_payment_intent_id}</code>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}