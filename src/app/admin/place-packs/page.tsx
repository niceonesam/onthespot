

import Link from "next/link";
import fs from "node:fs";
import path from "node:path";
import AppShell from "@/components/AppShell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PlacePackListItem = {
  slug: string;
  name: string;
  summary: string;
  region: string;
  country: string;
  approvedCount: number;
  candidateCount: number;
};

function loadPlacePacks(): PlacePackListItem[] {
  const packDir = path.resolve(process.cwd(), "data/place-packs");

  if (!fs.existsSync(packDir)) {
    return [];
  }

  const files = fs
    .readdirSync(packDir)
    .filter((file) => file.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b));

  const packs: PlacePackListItem[] = [];

  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(packDir, file), "utf8");
      const json = JSON.parse(raw);

      packs.push({
        slug: String(json?.place?.slug ?? file.replace(/\.json$/, "")),
        name: String(json?.place?.name ?? file.replace(/\.json$/, "")),
        summary: String(json?.place?.summary ?? "No summary yet."),
        region: String(json?.place?.region ?? "Unknown region"),
        country: String(json?.place?.country ?? "Unknown country"),
        approvedCount: Array.isArray(json?.entries) ? json.entries.length : 0,
        candidateCount: Array.isArray(json?.candidates) ? json.candidates.length : 0,
      });
    } catch {
      packs.push({
        slug: file.replace(/\.json$/, ""),
        name: file.replace(/\.json$/, ""),
        summary: "This pack could not be parsed.",
        region: "Unknown region",
        country: "Unknown country",
        approvedCount: 0,
        candidateCount: 0,
      });
    }
  }

  return packs;
}

export default function AdminPlacePacksIndexPage() {
  const packs = loadPlacePacks();

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
          <a href="/admin/submissions" className="ots-link">
            Submissions
          </a>
          <a
            href="/admin/place-packs"
            className="ots-link"
            style={{ fontWeight: 700 }}
          >
            Place Packs
          </a>
        </div>
      }
    >
      <div style={{ display: "grid", gap: 16 }}>
        <div>
          <h1 className="ots-h1" style={{ marginBottom: 8 }}>
            Place Packs
          </h1>
          <p className="ots-story-text" style={{ color: "#555", maxWidth: 760 }}>
            Curated place packs are the editorial backbone of OnTheSpot. Each one
            combines approved timeline entries with draft candidates so you can grow a
            place deliberately instead of hurling random facts into the abyss.
          </p>
        </div>

        <div
          className="ots-surface ots-surface--border"
          style={{
            padding: 14,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontSize: 14, color: "#555" }}>
            <strong>{packs.length}</strong> pack{packs.length === 1 ? "" : "s"} found
          </div>

          <div style={{ fontSize: 13, color: "#666" }}>
            Index page first, then editor pages by slug. Civilisation advances.
          </div>
        </div>

        {packs.length === 0 ? (
          <div
            className="ots-surface ots-surface--border"
            style={{ padding: 18, color: "#555" }}
          >
            No place packs found in <code>data/place-packs</code>.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {packs.map((pack) => (
              <Link
                key={pack.slug}
                href={`/admin/place-packs/${pack.slug}`}
                className="ots-surface ots-surface--border"
                style={{
                  display: "grid",
                  gap: 10,
                  padding: 16,
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    alignItems: "start",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 800,
                        textTransform: "uppercase",
                        letterSpacing: 0.35,
                        color: "#666",
                        marginBottom: 4,
                      }}
                    >
                      {pack.slug}
                    </div>
                    <div
                      className="ots-brand-heading"
                      style={{ fontSize: 20, fontWeight: 800, color: "#111" }}
                    >
                      {pack.name}
                    </div>
                  </div>

                  <div
                    style={{
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
                        background: "rgba(0,0,0,0.05)",
                        border: "1px solid rgba(0,0,0,0.08)",
                        fontSize: 12,
                        fontWeight: 800,
                        color: "#333",
                      }}
                    >
                      {pack.region}, {pack.country}
                    </span>
                    <span
                      style={{
                        padding: "4px 8px",
                        borderRadius: 999,
                        background: "rgba(0,255,251,0.10)",
                        border: "1px solid rgba(0,255,251,0.24)",
                        fontSize: 12,
                        fontWeight: 800,
                        color: "#0F2A44",
                      }}
                    >
                      {pack.approvedCount} approved
                    </span>
                    <span
                      style={{
                        padding: "4px 8px",
                        borderRadius: 999,
                        background: "rgba(251,146,60,0.12)",
                        border: "1px solid rgba(251,146,60,0.24)",
                        fontSize: 12,
                        fontWeight: 800,
                        color: "#7c2d12",
                      }}
                    >
                      {pack.candidateCount} candidates
                    </span>
                  </div>
                </div>

                <div className="ots-story-text" style={{ color: "#444" }}>
                  {pack.summary}
                </div>

                <div style={{ fontSize: 13, color: "#0b57d0", fontWeight: 700 }}>
                  Open editor →
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}