import React from "react";
import type { Spot, SpotVisibility } from "@/map/types";

type SpotSheetProps = {
  selected: Spot | null;
  selectedSheetSnap: "peek" | "half" | "full";
  spotSheetDragY: number;
  onTouchStart: (e: React.TouchEvent<HTMLDivElement>) => void;
  onTouchMove: (e: React.TouchEvent<HTMLDivElement>) => void;
  onTouchEnd: () => void;
  onCycleSnap: () => void;
  onClose: () => void;
  selectedSheetHeightForSnap: () => number;
  spotSheetPeekMinHeight: number;
  selectedStoryParts: { intro: string; rest: string } | null;
  selectedStoryDate: string | null;
  selectedSourceBadge: string | null;
  selectedStoryPeriod: string | null;
  selectedVisibilityLabel: string | null;
  selectedSheetIsPeek: boolean;
  selectedSheetIsHalf: boolean;
  selectedSheetIsFull: boolean;
  placeThroughTimeSpots: Spot[];
  placeThroughTimeEraLabel: (spot: Spot) => string;
  onSelectPlaceThroughTimeSpot: (spot: Spot) => void;
  formatDistance: (meters: number) => string;
  VisibilityBadge: React.ComponentType<{ visibility: SpotVisibility }>;
  TagPills: React.ComponentType<{ tags?: string[] | null; max?: number }>;
  formatStoryDate: (date?: string | null) => string | null;
};

function formatGeologicalPeriod(
  spot: Pick<
    Spot,
    "time_scale_out" | "years_ago_start_out" | "years_ago_end_out" | "period_label_out"
  >
) {
  if (spot.time_scale_out !== "geological") return null;

  if (spot.period_label_out) return spot.period_label_out;

  const start = spot.years_ago_start_out;
  const end = spot.years_ago_end_out;

  const fmt = (value: number) => {
    if (value >= 1000000) {
      const m = value / 1000000;
      return `${Number.isInteger(m) ? m.toFixed(0) : m.toFixed(1)} million years ago`;
    }
    if (value >= 1000) {
      const k = value / 1000;
      return `${Number.isInteger(k) ? k.toFixed(0) : k.toFixed(1)} thousand years ago`;
    }
    return `${value} years ago`;
  };

  if (typeof start === "number" && typeof end === "number") {
    return `${fmt(start)} → ${fmt(end)}`;
  }
  if (typeof start === "number") return fmt(start);
  if (typeof end === "number") return fmt(end);
  return "Deep time";
}

export default function SpotSheet({
  selected,
  spotSheetDragY,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  onCycleSnap,
  onClose,
  selectedSheetHeightForSnap,
  spotSheetPeekMinHeight,
  selectedStoryParts,
  selectedStoryDate,
  selectedSourceBadge,
  selectedStoryPeriod,
  selectedVisibilityLabel,
  selectedSheetIsPeek,
  selectedSheetIsHalf,
  selectedSheetIsFull,
  placeThroughTimeSpots,
  placeThroughTimeEraLabel,
  onSelectPlaceThroughTimeSpot,
  formatDistance,
  VisibilityBadge,
  TagPills,
  formatStoryDate,
}: SpotSheetProps) {
  if (!selected) return null;

  const selectedGeologicalPeriod = formatGeologicalPeriod(selected);
  const displayStoryDate = selectedGeologicalPeriod ?? selectedStoryDate;
  const displayStoryPeriod = selectedGeologicalPeriod ? null : selectedStoryPeriod;

  return (
    <div
      className="ots-surface ots-surface--shadow"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        backdropFilter: "blur(10px)",
        borderTopLeftRadius: 18,
        borderTopRightRadius: 18,
        padding: 16,
        height: `min(calc(100vh - 24px), ${Math.max(
          spotSheetPeekMinHeight,
          selectedSheetHeightForSnap() - spotSheetDragY
        )}px)`,
        overflowY: "auto",
        boxShadow: "0 -10px 40px rgba(0,0,0,0.25)",
        transition: spotSheetDragY
          ? "none"
          : "height 320ms cubic-bezier(0.16, 1, 0.3, 1)",
        willChange: "height",
      }}
    >
      <button
        type="button"
        onClick={onCycleSnap}
        aria-label="Resize details sheet"
        style={{
          display: "block",
          width: 44,
          height: 12,
          padding: 0,
          border: "none",
          background: "transparent",
          margin: "0 auto 12px auto",
          cursor: "pointer",
        }}
      >
        <div
          style={{
            width: 40,
            height: 4,
            borderRadius: 999,
            background: "rgba(0,0,0,0.2)",
            margin: "4px auto 0 auto",
          }}
        />
      </button>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 8,
          alignItems: "start",
        }}
      >
        <div style={{ minWidth: 0, flex: 1, display: "grid", gap: 8 }}>
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              minWidth: 0,
              flexWrap: "wrap",
            }}
          >
            <h3 className="ots-brand-heading" style={{ margin: 0 }}>
              {selected.title}
            </h3>
            <VisibilityBadge visibility={selected.visibility} />
          </div>

          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            {displayStoryDate && (
              <span
                style={{
                  padding: "4px 8px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#0F2A44",
                  background:
                    selected.time_scale_out === "geological"
                      ? "rgba(139,92,246,0.14)"
                      : "rgba(31,182,166,0.10)",
                  border:
                    selected.time_scale_out === "geological"
                      ? "1px solid rgba(139,92,246,0.26)"
                      : "1px solid rgba(31,182,166,0.24)",
                }}
              >
                {displayStoryDate}
              </span>
            )}

            {displayStoryPeriod && displayStoryPeriod !== displayStoryDate && (
              <span
                style={{
                  padding: "4px 8px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#0F2A44",
                  background: "rgba(107,33,168,0.10)",
                  border: "1px solid rgba(107,33,168,0.24)",
                }}
              >
                {displayStoryPeriod}
              </span>
            )}

            {selected.time_scale_out === "geological" && (
              <span
                style={{
                  padding: "4px 8px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#4c1d95",
                  background: "rgba(139,92,246,0.10)",
                  border: "1px solid rgba(139,92,246,0.20)",
                }}
              >
                Geological
              </span>
            )}

            {selectedSourceBadge && (
              <span
                style={{
                  padding: "4px 8px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#0F2A44",
                  background: "rgba(31,182,166,0.10)",
                  border: "1px solid rgba(31,182,166,0.24)",
                }}
              >
                {selectedSourceBadge}
              </span>
            )}

            {selectedVisibilityLabel && selected.visibility !== "public" && (
              <span
                style={{
                  padding: "4px 8px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#0F2A44",
                  background: "rgba(15,42,68,0.06)",
                  border: "1px solid rgba(15,42,68,0.12)",
                }}
              >
                {selectedVisibilityLabel}
              </span>
            )}
          </div>

          <TagPills tags={selected.tags} max={selectedSheetIsPeek ? 3 : 6} />
        </div>

        <button
          type="button"
          onClick={onClose}
          style={{
            border: "none",
            background: "transparent",
            fontSize: 18,
            cursor: "pointer",
          }}
        >
          ✕
        </button>
      </div>

      {selectedSheetIsPeek && (
        <>
          <p style={{ opacity: 0.75, margin: "10px 0 0 0" }}>
            {selected.what3words ? `///${selected.what3words}` : null}
            {selected.distance_m
              ? ` • ${formatDistance(selected.distance_m)} away`
              : null}
          </p>

          <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${selected.lat_out},${selected.lng_out}`}
              target="_blank"
              rel="noreferrer"
              style={{
                padding: "8px 12px",
                borderRadius: 999,
                border: "1px solid rgba(0,0,0,0.2)",
                textDecoration: "none",
                color: "#111",
                fontWeight: 700,
              }}
            >
              Navigate
            </a>
          </div>
        </>
      )}

      {(selectedSheetIsHalf || selectedSheetIsFull) && selected.photo_url && (
        <img
          src={selected.photo_url}
          alt={selected.title}
          style={{
            width: "100%",
            borderRadius: 12,
            marginTop: 10,
            maxHeight: selectedSheetIsFull ? 260 : 220,
            objectFit: "cover",
          }}
        />
      )}

      {(selectedSheetIsHalf || selectedSheetIsFull) && selectedStoryParts?.intro && (
        <div
          className="ots-story-text"
          style={{ marginTop: 12, lineHeight: 1.55, fontSize: 15 }}
        >
          {selectedStoryParts.intro}
        </div>
      )}

      {selectedSheetIsFull && selectedStoryParts?.rest && (
        <div
          className="ots-story-text"
          style={{ marginTop: 12, lineHeight: 1.6, fontSize: 15 }}
        >
          {selectedStoryParts.rest}
        </div>
      )}

      {(selectedSheetIsHalf || selectedSheetIsFull) && (
        <p style={{ opacity: 0.75, margin: "10px 0 0 0" }}>
          {selected.what3words ? `///${selected.what3words}` : null}
          {selected.distance_m
            ? ` • ${formatDistance(selected.distance_m)} away`
            : null}
        </p>
      )}

      {(selectedSheetIsHalf || selectedSheetIsFull) && (
        <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${selected.lat_out},${selected.lng_out}`}
            target="_blank"
            rel="noreferrer"
            style={{
              padding: "8px 12px",
              borderRadius: 999,
              border: "1px solid rgba(0,0,0,0.2)",
              textDecoration: "none",
              color: "#111",
              fontWeight: 700,
            }}
          >
            Navigate
          </a>

          {selected.source_url && (
            <a
              href={selected.source_url}
              target="_blank"
              rel="noreferrer"
              style={{
                padding: "8px 12px",
                borderRadius: 999,
                border: "1px solid rgba(0,0,0,0.2)",
                textDecoration: "none",
                color: "#111",
                fontWeight: 700,
              }}
            >
              Source
            </a>
          )}
        </div>
      )}

      {(selectedSheetIsHalf || selectedSheetIsFull) && placeThroughTimeSpots.length > 0 && (
        <div style={{ marginTop: 18, display: "grid", gap: 10 }}>
          <div>
            <div
              className="ots-brand-heading ots-brand-heading--gold"
              style={{ fontSize: 16, color: "#111" }}
            >
              This place through time
            </div>
            <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
              {selectedSheetIsHalf
                ? "A quick glimpse of nearby layers of story around this same place."
                : "Nearby layers of story around this same place."}
            </div>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {(() => {
                const visibleSpots = selectedSheetIsHalf
                ? placeThroughTimeSpots.slice(0, 2)
                : placeThroughTimeSpots;

                let lastEraLabel: string | null = null;

                return visibleSpots.map((spot, index) => {
                const geologicalPeriod = formatGeologicalPeriod(spot);
                const period = geologicalPeriod ?? spot.period_label_out ?? null;
                const eraLabel = placeThroughTimeEraLabel(spot);
                const showEraDivider = eraLabel !== lastEraLabel;
                lastEraLabel = eraLabel;

                return (
                    <React.Fragment key={spot.id}>
                    {showEraDivider && (
                        <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            marginTop: index > 0 ? 4 : 0,
                        }}
                        >
                        <span
                            style={{
                            fontSize: 11,
                            fontWeight: 800,
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                            color:
                                eraLabel === "Geological"
                                ? "#6b21a8"
                                : eraLabel === "Prehistory"
                                    ? "#B7791F"
                                    : eraLabel === "Modern"
                                    ? "#0F2A44"
                                    : "#1F6A5A",
                            whiteSpace: "nowrap",
                            }}
                        >
                            {eraLabel}
                        </span>
                        <div
                            style={{
                            height: 1,
                            flex: 1,
                            background:
                                eraLabel === "Geological"
                                ? "rgba(107,33,168,0.18)"
                                : eraLabel === "Prehistory"
                                    ? "rgba(183,121,31,0.18)"
                                    : eraLabel === "Modern"
                                    ? "rgba(15,42,68,0.18)"
                                    : "rgba(31,106,90,0.18)",
                            }}
                        />
                        </div>
                    )}

                    <div
                        role="button"
                        tabIndex={0}
                        onClick={() => onSelectPlaceThroughTimeSpot(spot)}
                        onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onSelectPlaceThroughTimeSpot(spot);
                        }
                        }}
                        className="ots-surface ots-surface--border"
                        style={{
                        padding: 12,
                        borderRadius: 14,
                        display: "grid",
                        gap: 6,
                        cursor: "pointer",
                        transition:
                            "transform 140ms ease, box-shadow 180ms ease, border-color 180ms ease, background 180ms ease",
                        boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
                        }}
                    >
                        <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 8,
                            alignItems: "start",
                        }}
                        >
                        <div style={{ minWidth: 0 }}>
                            <div
                            className="ots-brand-heading"
                            style={{ fontSize: 15, color: "#111" }}
                            >
                            {spot.title}
                            </div>
                          <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
                            {geologicalPeriod
                                ? geologicalPeriod
                                : formatStoryDate(spot.date_start)
                                  ? `${formatStoryDate(spot.date_start)}`
                                  : eraLabel}
                            {period &&
                            !geologicalPeriod &&
                            period !== formatStoryDate(spot.date_start)
                                ? ` • ${period}`
                                : ""}
                            {spot.time_scale_out === "geological"
                                ? " • deep time"
                                : ""}
                            </div>
                        </div>

                        <div
                            style={{
                            fontSize: 12,
                            color: "#666",
                            whiteSpace: "nowrap",
                            display: "grid",
                            justifyItems: "end",
                            gap: 4,
                            }}
                        >
                            <span>{formatDistance(spot.distance_m)}</span>
                            <span
                            style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: "#1FB6A6",
                            }}
                            >
                            Open
                            </span>
                        </div>
                        </div>

                      <div
                        className="ots-story-text"
                        style={{
                            fontSize: 14,
                            lineHeight: 1.45,
                            opacity: 0.88,
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                        }}
                        >
                        {spot.time_scale_out === "geological" ? "🪨 " : ""}
                        {spot.description}
                        </div>
                    </div>
                    </React.Fragment>
                );
                });
            })()}
            </div>
          {selectedSheetIsHalf && placeThroughTimeSpots.length > 2 && (
            <div style={{ fontSize: 12, color: "#666" }}>
              Expand for {placeThroughTimeSpots.length - 2} more layers through time.
            </div>
          )}
        </div>
      )}
    </div>
  );
}