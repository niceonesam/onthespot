"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import AppShell from "@/components/AppShell";

type Submission = {
  id: string;
  user_id: string;
  title: string;
  description: string;
  category: string | null;
  source_url: string | null;
  what3words: string | null;
  photo_url: string | null;
  photo_path: string | null;
  confidence: number | null;
  credit_consumed: boolean;
  status: "pending" | "approved" | "rejected";
  created_at: string;
};

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function AdminSubmissionsPage() {
  const supabase = useMemo(() => getSupabaseBrowser(), []);
  const [rows, setRows] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected">(
    "pending"
  );

  async function load() {
    setLoading(true);
    setMsg(null);

    const { data, error } = await supabase
      .from("spot_submissions")
      .select(
        "id,user_id,title,description,category,source_url,what3words,photo_url,photo_path,confidence,credit_consumed,status,created_at"
      )
      .eq("status", filter)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      setMsg(error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((data ?? []) as Submission[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function approve(id: string) {
    setMsg(null);
    const ok = confirm("Approve this submission and publish it as a Spot?");
    if (!ok) return;

    const { error } = await supabase.rpc("approve_submission", {
      p_submission_id: id,
    });
    if (error) {
      setMsg(error.message);
      return;
    }
    await load();
  }

  async function reject(id: string) {
    setMsg(null);
    const note = prompt("Reject note (optional):") ?? null;

    const { error } = await supabase.rpc("reject_submission", {
      p_submission_id: id,
      p_note: note,
    });

    if (error) {
      setMsg(error.message);
      return;
    }
    await load();
  }

  return (
    <AppShell
      subtitle="Admin"
      right={
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <a href="/" className="ots-link">
            Home
          </a>
          <a href="/admin/users" className="ots-link">
            Users
          </a>
          <a
            href="/admin/submissions"
            className="ots-link"
            style={{ fontWeight: 700 }}
          >
            Submissions
          </a>
        </div>
      }
    >
      <h1 className="ots-h1">Submissions</h1>

      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          marginBottom: 12,
          flexWrap: "wrap",
        }}
      >
        <label style={{ fontSize: 14 }}>
          Status:&nbsp;
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className="ots-select"
          >
            <option value="pending">pending</option>
            <option value="approved">approved</option>
            <option value="rejected">rejected</option>
          </select>
        </label>

        <button type="button" onClick={load} className="ots-btn">
          Refresh
        </button>

        {loading && <span style={{ fontSize: 14 }}>Loading…</span>}
        {!loading && (
          <span style={{ fontSize: 14, color: "#555" }}>{rows.length} items</span>
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
        {rows.map((s) => (
          <div
            key={s.id}
            className="ots-surface ots-surface--border"
            style={{
              padding: 12,
              display: "grid",
              gap: 8,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 16, color: "#111" }}>
                  {s.title}
                </div>
                <div style={{ fontSize: 13, color: "#555", marginTop: 2 }}>
                  {fmtDate(s.created_at)} · user {s.user_id.slice(0, 8)}… ·{" "}
                  {s.category ?? "uncategorised"} · credit_consumed:{" "}
                  <strong>{String(s.credit_consumed)}</strong>
                </div>
              </div>

              {filter === "pending" && (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button
                    type="button"
                    onClick={() => approve(s.id)}
                    className="ots-btn"
                    style={{ borderRadius: 999, borderColor: "#cfe8cf" }}
                    title="Approve and publish"
                  >
                    ✅ Approve
                  </button>

                  <button
                    type="button"
                    onClick={() => reject(s.id)}
                    className="ots-btn"
                    style={{ borderRadius: 999, borderColor: "#f0c7c7" }}
                    title="Reject (refund if credit was consumed)"
                  >
                    🛑 Reject
                  </button>
                </div>
              )}
            </div>

            <div style={{ fontSize: 14, color: "#222", whiteSpace: "pre-wrap" }}>
              {s.description}
            </div>

            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                fontSize: 13,
                color: "#444",
              }}
            >
              {s.source_url && (
                <span>
                  Source:{" "}
                  <a href={s.source_url} target="_blank" rel="noreferrer">
                    {s.source_url}
                  </a>
                </span>
              )}
              {s.what3words && <span>what3words: {s.what3words}</span>}
              {typeof s.confidence === "number" && (
                <span>confidence: {s.confidence}</span>
              )}
              {s.photo_url && (
                <span>
                  photo_url:{" "}
                  <a href={s.photo_url} target="_blank" rel="noreferrer">
                    open
                  </a>
                </span>
              )}
              {s.photo_path && <span>photo_path: {s.photo_path}</span>}
            </div>
          </div>
        ))}

        {!loading && rows.length === 0 && (
          <div style={{ padding: 16, color: "#555" }}>
            No submissions in <strong>{filter}</strong>.
          </div>
        )}
      </div>
    </AppShell>
  );
}