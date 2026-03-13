// The full file is replaced by the user-provided contents.
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";

type MediaItem = {
  type: string;
  url: string;
  caption: string;
};

type PackEntry = {
  id: string;
  title: string;
  date_start: string | null;
  date_end: string | null;
  category: string;
  description: string;
  significance: string;
  source_url: string;
  confidence: number;
  lat: number;
  lng: number;
  area_note: string | null;
  era: string;
  tags: string[];
  media: MediaItem[];
  review_status: "draft" | "reviewed" | "approved";
  origin: "manual" | "generated";
  visibility: "public" | "private";
  status: "active" | "inactive";
};

type PlacePack = {
  place: {
    slug: string;
    name: string;
    lat: number;
    lng: number;
    radius_m: number;
    summary: string;
    country: string;
    region: string;
    hero_image_url: string | null;
  };
  entries: PackEntry[];
  candidates: PackEntry[];
  metadata: {
    created_by: string;
    review_status: string;
    source_mix: string[];
    notes: string;
  };
};

type CandidateDraft = {
  id: string;
  title: string;
  date_start: string;
  date_end: string;
  category: string;
  era: string;
  significance: string;
  area_note: string;
  confidence: string;
};

const FIELD_HELP: Record<string, string> = {
  title:
    "Short name shown in the app timeline and story cards. Keep it specific and place-relevant.",
  date_start:
    "The start date used for chronology. Use YYYY-MM-DD when known. Leave blank if genuinely unknown.",
  date_end:
    "Optional end date for spans like construction periods, battles, or multi-year events.",
  category:
    "Controls how the story is grouped and filtered in the app. Pick the best thematic fit, not just the broadest one.",
  era:
    "Human-readable historical layer, such as Roman Britain, Medieval York, or 20th Century.",
  significance:
    "Why this entry matters at this location. This is the editorial meaning, not just the raw fact.",
  confidence:
    "How confident you are in the entry's accuracy and dating, on a rough 1-5 scale.",
};

function InfoTip({ label }: { label: keyof typeof FIELD_HELP }) {
  return (
    <span
      title={FIELD_HELP[label]}
      style={{
        display: "inline-grid",
        placeItems: "center",
        width: 18,
        height: 18,
        borderRadius: 999,
        border: "1px solid rgba(0,0,0,0.12)",
        background: "rgba(0,0,0,0.04)",
        color: "#444",
        fontSize: 12,
        cursor: "help",
        flex: "0 0 auto",
      }}
      aria-label={FIELD_HELP[label]}
    >
      i
    </span>
  );
}

function labelRow(text: string, helpKey?: keyof typeof FIELD_HELP) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        marginBottom: 6,
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 800, color: "#222" }}>
        {text}
      </span>
      {helpKey ? <InfoTip label={helpKey} /> : null}
    </div>
  );
}

function entryYear(entry: PackEntry): number | null {
  const raw = entry.date_start ?? entry.date_end;
  if (!raw) return null;
  const year = Number(String(raw).slice(0, 4));
  return Number.isFinite(year) ? year : null;
}

function formatYearLabel(year: number | null): string {
  if (year == null) return "Unknown";
  if (year < 0) return `${Math.abs(year)} BCE`;
  return String(year);
}

function emptyDraft(entry: PackEntry): CandidateDraft {
  return {
    id: entry.id,
    title: entry.title ?? "",
    date_start: entry.date_start ?? "",
    date_end: entry.date_end ?? "",
    category: entry.category ?? "cultural",
    era: entry.era ?? "Unclassified",
    significance: entry.significance ?? "",
    area_note: entry.area_note ?? "",
    confidence: String(entry.confidence ?? 2),
  };
}

export default function PlacePackEditor({ slug }: { slug: string }) {
  const [pack, setPack] = useState<PlacePack | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [generateQuery, setGenerateQuery] = useState("");
  const [generateLimit, setGenerateLimit] = useState("8");
  const [candidateDrafts, setCandidateDrafts] = useState<
    Record<string, CandidateDraft>
  >({});
  const [notice, setNotice] = useState<string | null>(null);

  const loadPack = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/place-packs/${slug}`, {
        cache: "no-store",
      });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? "Failed to load pack");
      }

      const nextPack: PlacePack = json.pack;
      setPack(nextPack);
      setCandidateDrafts(
        Object.fromEntries(
          (nextPack.candidates ?? []).map((entry) => [entry.id, emptyDraft(entry)])
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pack");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    loadPack();
  }, [loadPack]);

  const approvedCount = pack?.entries?.length ?? 0;
  const candidateCount = pack?.candidates?.length ?? 0;

  const sortedEntries = useMemo(
    () =>
      [...(pack?.entries ?? [])].sort((a, b) =>
        (a.date_start ?? "9999-12-31").localeCompare(
          b.date_start ?? "9999-12-31"
        )
      ),
    [pack]
  );

  const sortedCandidates = useMemo(
    () =>
      [...(pack?.candidates ?? [])].sort((a, b) =>
        (a.date_start ?? "9999-12-31").localeCompare(
          b.date_start ?? "9999-12-31"
        )
      ),
    [pack]
  );

  const timelineEntries = useMemo(() => {
    const withYears = [...(pack?.entries ?? [])]
      .map((entry) => ({ entry, year: entryYear(entry) }))
      .filter((item) => item.year != null) as Array<{
      entry: PackEntry;
      year: number;
    }>;

    const sorted = withYears.sort((a, b) => a.year - b.year);
    const years = sorted.map((item) => item.year);
    const minYear = years.length ? Math.min(...years) : null;
    const maxYear = years.length ? Math.max(...years) : null;

    return { items: sorted, minYear, maxYear };
  }, [pack]);

  const miniMapSrc = useMemo(() => {
    if (!pack) return null;

    const params = new URLSearchParams({
      lat: String(pack.place.lat),
      lng: String(pack.place.lng),
      radius_m: String(pack.place.radius_m ?? 250),
      place_pack_preview: "1",
      place_pack_slug: pack.place.slug,
    });

    return `/?${params.toString()}`;
  }, [pack]);

  function patchDraft(id: string, patch: Partial<CandidateDraft>) {
    setCandidateDrafts((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] ??
          emptyDraft(pack!.candidates.find((entry) => entry.id === id)!)),
        ...patch,
      },
    }));
  }

  async function handleGenerate() {
    setBusyAction("generate");
    setNotice(null);
    try {
      const res = await fetch(`/api/place-packs/${slug}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: generateQuery.trim() || undefined,
          limit: Number(generateLimit) || 8,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? "Failed to generate candidates");
      }
      setNotice(`Generated ${json.generatedEntries?.length ?? 0} candidate entries.`);
      await loadPack();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to generate candidates"
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleApprove(id: string) {
    const draft = candidateDrafts[id];
    if (!draft) return;

    setBusyAction(`approve:${id}`);
    setNotice(null);
    try {
      const res = await fetch(`/api/place-packs/${slug}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          title: draft.title,
          date_start: draft.date_start || null,
          date_end: draft.date_end || null,
          category: draft.category,
          era: draft.era,
          significance: draft.significance,
          area_note: draft.area_note || null,
          confidence: Number(draft.confidence) || 2,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? "Failed to approve candidate");
      }
      setNotice(`Approved '${json.entry?.title ?? id}'.`);
      await loadPack();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to approve candidate"
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleReject(id: string) {
    setBusyAction(`reject:${id}`);
    setNotice(null);
    try {
      const res = await fetch(`/api/place-packs/${slug}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? "Failed to reject candidate");
      }
      setNotice(`Rejected '${json.removed?.title ?? id}'.`);
      await loadPack();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to reject candidate"
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleImportApproved() {
    setBusyAction("import");
    setNotice(null);
    try {
      const res = await fetch(`/api/place-packs/${slug}/import`, {
        method: "POST",
      }).catch(() => null as Response | null);

      if (!res) {
        setNotice(
          "Import route is not wired yet. Your review UI is ready; import can stay CLI for one more tiny step."
        );
        return;
      }

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? "Failed to import approved entries");
      }
      setNotice(
        `Imported ${json.inserted ?? 0} of ${json.total ?? approvedCount} approved entries.`
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to import approved entries"
      );
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <AppShell
      title="Place Pack Editor"
      subtitle={`Editing ${slug}`}
      right={<Link href="/admin">Back to admin</Link>}
    >
      <div style={{ display: "grid", gap: 16, paddingBottom: 24 }}>
        {error ? (
          <div
            style={{
              padding: 12,
              borderRadius: 16,
              border: "1px solid rgba(220,38,38,0.18)",
              background: "rgba(220,38,38,0.08)",
              color: "#7f1d1d",
            }}
          >
            {error}
          </div>
        ) : null}

        {notice ? (
          <div
            style={{
              padding: 12,
              borderRadius: 16,
              border: "1px solid rgba(8,145,178,0.18)",
              background: "rgba(0,255,251,0.08)",
              color: "#164e63",
            }}
          >
            {notice}
          </div>
        ) : null}

        <section
          style={{
            border: "1px solid rgba(0,0,0,0.08)",
            borderRadius: 20,
            padding: 18,
            background: "white",
            display: "grid",
            gap: 14,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 16,
              alignItems: "start",
              flexWrap: "wrap",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                  color: "#666",
                }}
              >
                Place pack
              </div>
              <h1
                style={{
                  margin: "6px 0 8px",
                  fontSize: 28,
                  lineHeight: 1.1,
                  color: "#111",
                }}
              >
                {loading ? "Loading…" : pack?.place.name ?? slug}
              </h1>
              <p
                style={{
                  margin: 0,
                  color: "#444",
                  maxWidth: 760,
                  lineHeight: 1.45,
                }}
              >
                {pack?.place.summary ?? "Loading place summary…"}
              </p>
            </div>

            <div style={{ display: "grid", gap: 10, minWidth: 240 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(110px, 1fr))",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    border: "1px solid rgba(0,0,0,0.08)",
                    borderRadius: 16,
                    padding: 12,
                    background: "rgba(0,0,0,0.02)",
                  }}
                >
                  <div style={{ fontSize: 12, color: "#666", fontWeight: 800 }}>
                    Approved
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: "#111" }}>
                    {approvedCount}
                  </div>
                </div>
                <div
                  style={{
                    border: "1px solid rgba(0,0,0,0.08)",
                    borderRadius: 16,
                    padding: 12,
                    background: "rgba(0,255,251,0.06)",
                  }}
                >
                  <div style={{ fontSize: 12, color: "#666", fontWeight: 800 }}>
                    Candidates
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: "#111" }}>
                    {candidateCount}
                  </div>
                </div>
              </div>

              <div style={{ fontSize: 13, color: "#555", lineHeight: 1.45 }}>
                <div>
                  <strong>Region:</strong> {pack?.place.region ?? "—"},{" "}
                  {pack?.place.country ?? "—"}
                </div>
                <div>
                  <strong>Location:</strong> {pack?.place.lat ?? "—"},{" "}
                  {pack?.place.lng ?? "—"}
                </div>
                <div>
                  <strong>Radius:</strong> {pack?.place.radius_m ?? "—"} m
                </div>
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "end",
            }}
          >
            <div style={{ minWidth: 260, flex: "1 1 320px" }}>
              {labelRow("Generate query override")}
              <input
                value={generateQuery}
                onChange={(e) => setGenerateQuery(e.target.value)}
                placeholder="Optional: York Minster stained glass medieval"
                style={{
                  width: "100%",
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.14)",
                  padding: "10px 12px",
                }}
              />
            </div>

            <div style={{ width: 120 }}>
              {labelRow("Candidate limit")}
              <input
                value={generateLimit}
                onChange={(e) => setGenerateLimit(e.target.value)}
                inputMode="numeric"
                style={{
                  width: "100%",
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.14)",
                  padding: "10px 12px",
                }}
              />
            </div>

            <button
              type="button"
              onClick={handleGenerate}
              disabled={loading || busyAction === "generate"}
              style={{
                borderRadius: 12,
                border: "1px solid rgba(0,0,0,0.16)",
                background: "#111",
                color: "white",
                padding: "10px 14px",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              {busyAction === "generate" ? "Generating…" : "Generate candidates"}
            </button>

            <button
              type="button"
              onClick={loadPack}
              disabled={loading}
              style={{
                borderRadius: 12,
                border: "1px solid rgba(0,0,0,0.16)",
                background: "white",
                color: "#111",
                padding: "10px 14px",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              Refresh
            </button>

            <button
              type="button"
              onClick={handleImportApproved}
              disabled={loading || busyAction === "import"}
              style={{
                borderRadius: 12,
                border: "1px solid rgba(0,0,0,0.16)",
                background: "rgba(0,255,251,0.14)",
                color: "#111",
                padding: "10px 14px",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              {busyAction === "import" ? "Importing…" : "Import approved"}
            </button>
          </div>
        </section>

        <section style={{ display: "grid", gap: 16 }}>
          <div
            style={{
              border: "1px solid rgba(0,0,0,0.08)",
              borderRadius: 20,
              padding: 18,
              background: "white",
              display: "grid",
              gap: 14,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: 20, color: "#111" }}>
                  Timeline preview
                </h2>
                <p style={{ margin: "6px 0 0", color: "#555", lineHeight: 1.4 }}>
                  A quick visual stack of approved entries through time. This helps you spot gaps, clusters, and accidental chronology weirdness at a glance.
                </p>
              </div>

              <div style={{ fontSize: 13, color: "#666", fontWeight: 700 }}>
                {timelineEntries.minYear != null && timelineEntries.maxYear != null
                  ? `${formatYearLabel(timelineEntries.minYear)} → ${formatYearLabel(
                      timelineEntries.maxYear
                    )}`
                  : "No dated approved entries yet"}
              </div>
            </div>

            {timelineEntries.items.length === 0 ? (
              <div style={{ color: "#666" }}>
                No approved entries with usable dates yet.
              </div>
            ) : (
              <div
                style={{
                  position: "relative",
                  display: "grid",
                  gap: 12,
                  paddingLeft: 18,
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: 5,
                    top: 8,
                    bottom: 8,
                    width: 2,
                    background:
                      "linear-gradient(to bottom, rgba(0,255,251,0.4), rgba(0,0,0,0.08))",
                    borderRadius: 999,
                  }}
                />

                {timelineEntries.items.map(({ entry, year }) => (
                  <div
                    key={entry.id}
                    style={{
                      position: "relative",
                      display: "grid",
                      gap: 4,
                      padding: "10px 12px 10px 16px",
                      borderRadius: 14,
                      border: "1px solid rgba(0,0,0,0.08)",
                      background: "rgba(0,0,0,0.02)",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        left: -17,
                        top: 15,
                        width: 10,
                        height: 10,
                        borderRadius: 999,
                        background: "#00d5d1",
                        border: "2px solid white",
                        boxShadow: "0 0 0 1px rgba(0,0,0,0.08)",
                      }}
                    />

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ fontWeight: 900, color: "#111" }}>
                        {entry.title}
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 800,
                          color: "#0f766e",
                        }}
                      >
                        {formatYearLabel(year)}
                      </div>
                    </div>

                    <div style={{ fontSize: 13, color: "#555" }}>
                      {entry.category} • {entry.era}
                    </div>

                    <div style={{ fontSize: 13, color: "#444", lineHeight: 1.4 }}>
                      {entry.significance}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div
            style={{
              border: "1px solid rgba(0,0,0,0.08)",
              borderRadius: 20,
              padding: 18,
              background: "white",
              display: "grid",
              gap: 14,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: 20, color: "#111" }}>
                  Mini map preview
                </h2>
                <p style={{ margin: "6px 0 0", color: "#555", lineHeight: 1.4 }}>
                  A live embedded map using the existing OnTheSpot map stack, centred on this place pack. This lets you judge spatial coherence using the real map behaviour instead of a cardboard approximation.
                </p>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  alignItems: "center",
                  fontSize: 12,
                  color: "#555",
                  fontWeight: 700,
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "4px 8px",
                    borderRadius: 999,
                    background: "rgba(0,255,251,0.10)",
                    border: "1px solid rgba(0,255,251,0.24)",
                  }}
                >
                  {approvedCount} approved
                </span>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "4px 8px",
                    borderRadius: 999,
                    background: "rgba(251,146,60,0.12)",
                    border: "1px solid rgba(251,146,60,0.24)",
                  }}
                >
                  {candidateCount} candidates
                </span>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "4px 8px",
                    borderRadius: 999,
                    background: "rgba(0,0,0,0.04)",
                    border: "1px solid rgba(0,0,0,0.08)",
                  }}
                >
                  Radius {pack?.place.radius_m ?? "—"} m
                </span>
              </div>
            </div>

            <div
              style={{
                borderRadius: 18,
                overflow: "hidden",
                border: "1px solid rgba(0,0,0,0.08)",
                minHeight: 360,
                background: "rgba(0,0,0,0.03)",
              }}
            >
              {miniMapSrc ? (
                <iframe
                  src={miniMapSrc}
                  title={`Mini map preview for ${pack?.place.name ?? slug}`}
                  style={{
                    display: "block",
                    width: "160%",
                    height: 420,
                    border: 0,
                    background: "white",
                    transform: "scale(0.75)",
                    transformOrigin: "top left",
                  }}
                />
              ) : (
                <div
                  style={{
                    minHeight: 360,
                    display: "grid",
                    placeItems: "center",
                    color: "#666",
                    fontSize: 14,
                  }}
                >
                  Loading map preview…
                </div>
              )}
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1.05fr) minmax(0, 1.2fr)",
              gap: 16,
            }}
          >
            <div
              style={{
                border: "1px solid rgba(0,0,0,0.08)",
                borderRadius: 20,
                padding: 18,
                background: "white",
                minHeight: 240,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 12,
                }}
              >
                <h2 style={{ margin: 0, fontSize: 20, color: "#111" }}>
                  Approved timeline
                </h2>
                <span style={{ fontSize: 13, color: "#666", fontWeight: 700 }}>
                  {approvedCount} entries
                </span>
              </div>

              <div style={{ display: "grid", gap: 12 }}>
                {sortedEntries.map((entry) => (
                  <div
                    key={entry.id}
                    style={{
                      border: "1px solid rgba(0,0,0,0.08)",
                      borderRadius: 16,
                      padding: 14,
                      background: "rgba(0,0,0,0.02)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                        alignItems: "start",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 900, color: "#111" }}>
                          {entry.title}
                        </div>
                        <div style={{ fontSize: 13, color: "#555", marginTop: 4 }}>
                          {entry.date_start ?? "no-date"}
                          {entry.date_end ? ` → ${entry.date_end}` : ""}
                          {` • ${entry.category} • ${entry.era}`}
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 800,
                          color: "#0f766e",
                          background: "rgba(0,255,251,0.12)",
                          padding: "4px 8px",
                          borderRadius: 999,
                        }}
                      >
                        {entry.review_status}
                      </span>
                    </div>
                    <p
                      style={{
                        margin: "10px 0 0",
                        color: "#444",
                        lineHeight: 1.4,
                      }}
                    >
                      {entry.description}
                    </p>
                  </div>
                ))}

                {!sortedEntries.length && !loading ? (
                  <div style={{ color: "#666" }}>No approved entries yet.</div>
                ) : null}
              </div>
            </div>

            <div
              style={{
                border: "1px solid rgba(0,0,0,0.08)",
                borderRadius: 20,
                padding: 18,
                background: "white",
                minHeight: 240,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 12,
                }}
              >
                <h2 style={{ margin: 0, fontSize: 20, color: "#111" }}>
                  Candidate review
                </h2>
                <span style={{ fontSize: 13, color: "#666", fontWeight: 700 }}>
                  {candidateCount} candidates
                </span>
              </div>

              <div style={{ display: "grid", gap: 14 }}>
                {sortedCandidates.map((entry) => {
                  const draft = candidateDrafts[entry.id] ?? emptyDraft(entry);
                  const actionBusy =
                    busyAction === `approve:${entry.id}` ||
                    busyAction === `reject:${entry.id}`;

                  return (
                    <article
                      key={entry.id}
                      style={{
                        border: "1px solid rgba(0,0,0,0.08)",
                        borderRadius: 18,
                        padding: 14,
                        background: "rgba(0,255,251,0.04)",
                        display: "grid",
                        gap: 12,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 10,
                          alignItems: "start",
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontSize: 12,
                              color: "#666",
                              fontWeight: 800,
                              textTransform: "uppercase",
                              letterSpacing: 0.35,
                            }}
                          >
                            {entry.id}
                          </div>
                          <div
                            style={{
                              marginTop: 4,
                              fontWeight: 900,
                              color: "#111",
                              fontSize: 18,
                            }}
                          >
                            {entry.title}
                          </div>
                        </div>
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 800,
                            color: "#7c2d12",
                            background: "rgba(251,146,60,0.14)",
                            padding: "4px 8px",
                            borderRadius: 999,
                          }}
                        >
                          {entry.review_status}
                        </span>
                      </div>

                      {entry.media?.[0]?.url ? (
                        <img
                          src={entry.media[0].url}
                          alt={entry.media[0].caption || entry.title}
                          style={{
                            width: "100%",
                            maxHeight: 220,
                            objectFit: "cover",
                            borderRadius: 14,
                            border: "1px solid rgba(0,0,0,0.08)",
                          }}
                        />
                      ) : null}

                      <p style={{ margin: 0, color: "#444", lineHeight: 1.45 }}>
                        {entry.description}
                      </p>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                          gap: 12,
                        }}
                      >
                        <div>
                          {labelRow("Title", "title")}
                          <input
                            value={draft.title}
                            onChange={(e) =>
                              patchDraft(entry.id, { title: e.target.value })
                            }
                            style={{
                              width: "100%",
                              borderRadius: 12,
                              border: "1px solid rgba(0,0,0,0.14)",
                              padding: "10px 12px",
                            }}
                          />
                        </div>

                        <div>
                          {labelRow("Category", "category")}
                          <input
                            value={draft.category}
                            onChange={(e) =>
                              patchDraft(entry.id, { category: e.target.value })
                            }
                            style={{
                              width: "100%",
                              borderRadius: 12,
                              border: "1px solid rgba(0,0,0,0.14)",
                              padding: "10px 12px",
                            }}
                          />
                        </div>

                        <div>
                          {labelRow("Start date", "date_start")}
                          <input
                            value={draft.date_start}
                            onChange={(e) =>
                              patchDraft(entry.id, { date_start: e.target.value })
                            }
                            placeholder="YYYY-MM-DD"
                            style={{
                              width: "100%",
                              borderRadius: 12,
                              border: "1px solid rgba(0,0,0,0.14)",
                              padding: "10px 12px",
                            }}
                          />
                        </div>

                        <div>
                          {labelRow("End date", "date_end")}
                          <input
                            value={draft.date_end}
                            onChange={(e) =>
                              patchDraft(entry.id, { date_end: e.target.value })
                            }
                            placeholder="YYYY-MM-DD"
                            style={{
                              width: "100%",
                              borderRadius: 12,
                              border: "1px solid rgba(0,0,0,0.14)",
                              padding: "10px 12px",
                            }}
                          />
                        </div>

                        <div>
                          {labelRow("Era", "era")}
                          <input
                            value={draft.era}
                            onChange={(e) =>
                              patchDraft(entry.id, { era: e.target.value })
                            }
                            style={{
                              width: "100%",
                              borderRadius: 12,
                              border: "1px solid rgba(0,0,0,0.14)",
                              padding: "10px 12px",
                            }}
                          />
                        </div>

                        <div>
                          {labelRow("Confidence", "confidence")}
                          <input
                            value={draft.confidence}
                            onChange={(e) =>
                              patchDraft(entry.id, { confidence: e.target.value })
                            }
                            inputMode="numeric"
                            style={{
                              width: "100%",
                              borderRadius: 12,
                              border: "1px solid rgba(0,0,0,0.14)",
                              padding: "10px 12px",
                            }}
                          />
                        </div>
                      </div>

                      <div>
                        {labelRow("Significance", "significance")}
                        <textarea
                          value={draft.significance}
                          onChange={(e) =>
                            patchDraft(entry.id, { significance: e.target.value })
                          }
                          rows={3}
                          style={{
                            width: "100%",
                            borderRadius: 12,
                            border: "1px solid rgba(0,0,0,0.14)",
                            padding: "10px 12px",
                            resize: "vertical",
                          }}
                        />
                      </div>

                      <div
                        style={{
                          display: "flex",
                          gap: 10,
                          flexWrap: "wrap",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <a
                          href={entry.source_url}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: "#0b57d0", fontWeight: 700 }}
                        >
                          Open source
                        </a>

                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() => handleReject(entry.id)}
                            style={{
                              borderRadius: 12,
                              border: "1px solid rgba(220,38,38,0.22)",
                              background: "white",
                              color: "#991b1b",
                              padding: "10px 14px",
                              fontWeight: 800,
                              cursor: "pointer",
                            }}
                          >
                            {busyAction === `reject:${entry.id}`
                              ? "Rejecting…"
                              : "Reject"}
                          </button>
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() => handleApprove(entry.id)}
                            style={{
                              borderRadius: 12,
                              border: "1px solid rgba(0,0,0,0.16)",
                              background: "#111",
                              color: "white",
                              padding: "10px 14px",
                              fontWeight: 800,
                              cursor: "pointer",
                            }}
                          >
                            {busyAction === `approve:${entry.id}`
                              ? "Approving…"
                              : "Approve"}
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}

                {!sortedCandidates.length && !loading ? (
                  <div style={{ color: "#666" }}>
                    No candidates waiting for review. Very tidy. Slightly suspicious,
                    but tidy.
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}