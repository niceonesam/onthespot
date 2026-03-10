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

type ContributorReputation = {
  id: string;
  approved_count: number;
  rejected_count: number;
  sourced_count: number;
  trust_tier: string;
};

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function prettyTrustTier(tier: string | null | undefined) {
  if (!tier) return "New contributor";
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

function trustTierRank(tier: string | null | undefined) {
  if (tier === "verified") return 3;
  if (tier === "trusted") return 2;
  return 1;
}

function sortSubmissionsByTrust(
  rows: Submission[],
  reputationByUser: Record<string, ContributorReputation>,
  filter: "pending" | "approved" | "rejected"
) {
  if (filter !== "pending") return rows;

  return [...rows].sort((a, b) => {
    const repA = reputationByUser[a.user_id];
    const repB = reputationByUser[b.user_id];

    const tierDiff = trustTierRank(repB?.trust_tier) - trustTierRank(repA?.trust_tier);
    if (tierDiff !== 0) return tierDiff;

    const approvedDiff = (repB?.approved_count ?? 0) - (repA?.approved_count ?? 0);
    if (approvedDiff !== 0) return approvedDiff;

    const sourcedDiff = (repB?.sourced_count ?? 0) - (repA?.sourced_count ?? 0);
    if (sourcedDiff !== 0) return sourcedDiff;

    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

export default function AdminSubmissionsPage() {
  const supabase = useMemo(() => getSupabaseBrowser(), []);
  const [rows, setRows] = useState<Submission[]>([]);
  const [reputationByUser, setReputationByUser] = useState<Record<string, ContributorReputation>>({});
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected">(
    "pending"
  );

  const displayedRows = useMemo(
    () => sortSubmissionsByTrust(rows, reputationByUser, filter),
    [rows, reputationByUser, filter]
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

    const nextRows = (data ?? []) as Submission[];
    setRows(nextRows);

    const userIds = Array.from(new Set(nextRows.map((r) => r.user_id).filter(Boolean)));

    if (userIds.length === 0) {
      setReputationByUser({});
      setLoading(false);
      return;
    }

    const { data: repRows, error: repError } = await supabase
      .from("profiles")
      .select("id,approved_count,rejected_count,sourced_count,trust_tier")
      .in("id", userIds);

    if (repError) {
      setMsg((prev) => prev ?? repError.message);
      setReputationByUser({});
      setLoading(false);
      return;
    }

    const nextRepMap: Record<string, ContributorReputation> = {};
    (repRows ?? []).forEach((row: any) => {
      nextRepMap[String(row.id)] = {
        id: String(row.id),
        approved_count: Number(row.approved_count ?? 0),
        rejected_count: Number(row.rejected_count ?? 0),
        sourced_count: Number(row.sourced_count ?? 0),
        trust_tier: String(row.trust_tier ?? "new"),
      };
    });

    setReputationByUser(nextRepMap);
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
          <span style={{ fontSize: 14, color: "#555" }}>{displayedRows.length} items</span>
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
        {displayedRows.map((s) => {
          const rep = reputationByUser[s.user_id];
          const risk = contributorRisk(rep?.approved_count ?? 0, rep?.rejected_count ?? 0);
          const rate = rejectionRate(rep?.approved_count ?? 0, rep?.rejected_count ?? 0);
          return (
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
                <div className="ots-brand-heading" style={{ fontWeight: 700, fontSize: 16, color: "#111" }}>
                  {s.title}
                </div>
                <div style={{ fontSize: 13, color: "#555", marginTop: 2 }}>
                  {fmtDate(s.created_at)} · user {s.user_id.slice(0, 8)}… ·{" "}
                  {s.category ?? "uncategorised"} · credit_consumed:{" "}
                  <strong>{String(s.credit_consumed)}</strong>
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
                      ...trustTierStyle(rep?.trust_tier),
                    }}
                  >
                    {prettyTrustTier(rep?.trust_tier)}
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
                    {rep?.approved_count ?? 0} approved
                  </span>
                  <span style={{ fontSize: 12, color: "#555" }}>
                    {rep?.rejected_count ?? 0} rejected
                  </span>
                  <span style={{ fontSize: 12, color: "#555" }}>
                    {rep?.sourced_count ?? 0} sourced
                  </span>
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

            <div className="ots-story-text" style={{ fontSize: 14, color: "#222", whiteSpace: "pre-wrap" }}>
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
        )})}

        {!loading && displayedRows.length === 0 && (
          <div className="ots-story-text" style={{ padding: 16, color: "#555", fontSize: 14 }}>
            No submissions in <strong>{filter}</strong>.
          </div>
        )}
      </div>
    </AppShell>
  );
}