"use client";

import React from "react";
import Link from "next/link";
import type { Spot, SpotVisibility } from "@/map/types";

type NearbySheetProps = {
  isMobile: boolean;

  mobileListSnap: "peek" | "half" | "full";
  mobileListExpanded: boolean;
  mobileListDragY: number;

  onMobileListTouchStart: (e: React.TouchEvent<HTMLDivElement>) => void;
  onMobileListTouchMove: (e: React.TouchEvent<HTMLDivElement>) => void;
  onMobileListTouchEnd: () => void;
  onCycleMobileListSnap: () => void;

  rankedFilteredSpots: Spot[];
  selectedSpotId: string | null;
  userId: string | null;

  loadingSpots: boolean;
  spotsError: string | null;

  addHref: string;

  onSelectSpot: (spot: Spot) => void;
  onDeleteSpot: (spot: Spot) => void;

  nearbySheetPeekMinHeight: number;
  mobileListHeightForSnap: () => number;

  formatDistance: (meters: number) => string;
  formatStoryDate: (date?: string | null) => string | null;
  storyPeriodLabel: (date?: string | null) => string | null;

  effectiveTimeScale: (
    spot: Pick<Spot, "date_start" | "time_scale_out">
  ) => {
    scale: "human" | "ancient" | "geological";
    color: string;
  };

  sourceBadgeLabel: (url?: string | null) => string | null;
  visibilityStoryLabel: (visibility?: string | null) => string | null;

  dedupeChronologyTags: (
    tags: string[] | null | undefined,
    date?: string | null,
    periodLabelOut?: string | null
  ) => string[];

  VisibilityBadge: React.ComponentType<{ visibility: SpotVisibility }>;
  TagPills: React.ComponentType<{ tags?: string[] | null; max?: number }>;
};

function splitStory(description: string) {
  const parts = description.trim().split(/(?<=[.!?])\s+/);
  const intro = parts.slice(0, 2).join(" ").trim();
  const rest = parts.slice(2).join(" ").trim();
  return { intro, rest };
}

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

export default function NearbySheet(props: NearbySheetProps) {
  const {
    isMobile,
    mobileListSnap,
    mobileListExpanded,
    mobileListDragY,
    onMobileListTouchStart,
    onMobileListTouchMove,
    onMobileListTouchEnd,
    onCycleMobileListSnap,
    rankedFilteredSpots,
    selectedSpotId,
    userId,
    loadingSpots,
    spotsError,
    addHref,
    onSelectSpot,
    onDeleteSpot,
    nearbySheetPeekMinHeight,
    mobileListHeightForSnap,
    formatDistance,
    formatStoryDate,
    storyPeriodLabel,
    effectiveTimeScale,
    sourceBadgeLabel,
    visibilityStoryLabel,
    dedupeChronologyTags,
    VisibilityBadge,
    TagPills,
  } = props;

  const peekSpot = rankedFilteredSpots[0] ?? null;

  return (
    <aside
      className="ots-list ots-surface ots-surface--border"
      onTouchStart={onMobileListTouchStart}
      onTouchMove={onMobileListTouchMove}
      onTouchEnd={onMobileListTouchEnd}
      style={
        isMobile
          ? {
              position: "absolute",
              left: 8,
              right: 8,
              bottom: 8,
              zIndex: 20,
              height: `min(calc(100vh - 24px), ${Math.max(
                nearbySheetPeekMinHeight,
                mobileListHeightForSnap() - mobileListDragY
              )}px)`,
              borderRadius: 16,
              boxShadow: "0 16px 40px rgba(0,0,0,0.22)",
              overflow: "hidden",
              background: "white",
              transition: mobileListDragY
                ? "none"
                : "height 320ms cubic-bezier(0.16, 1, 0.3, 1)",
              willChange: "height",
            }
          : undefined
      }
    >
      <div
        style={{
          display: "grid",
          gap: 8,
          marginBottom: isMobile && mobileListSnap === "peek" ? 0 : 10,
          position: isMobile ? "sticky" : undefined,
          top: isMobile ? 0 : undefined,
          background: isMobile ? "white" : undefined,
          paddingTop: isMobile ? 4 : undefined,
          zIndex: isMobile ? 1 : undefined,
          cursor: isMobile ? "pointer" : undefined,
        }}
        onClick={isMobile ? onCycleMobileListSnap : undefined}
      >
        {isMobile && (
          <div
            style={{
              width: 40,
              height: 4,
              borderRadius: 999,
              background: "rgba(0,0,0,0.18)",
              margin: "0 auto",
            }}
          />
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div>
            <h3 style={{ margin: 0 }}>Nearby Spots</h3>
            {isMobile && (
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                {loadingSpots
                  ? "Loading nearby stories…"
                  : `${rankedFilteredSpots.length} found nearby${
                      mobileListSnap === "peek"
                        ? " • tap to expand"
                        : mobileListSnap === "half"
                          ? " • tap for full list"
                          : ""
                    }`}
              </div>
            )}
          </div>

          {isMobile && (
            <button
              type="button"
              className="ots-btn"
              onClick={(e) => {
                e.stopPropagation();
                onCycleMobileListSnap();
              }}
              style={{ padding: "8px 10px", borderRadius: 999 }}
            >
              {mobileListSnap === "peek"
                ? "Show"
                : mobileListSnap === "half"
                  ? "Full"
                  : "Hide"}
            </button>
          )}
        </div>

        {isMobile &&
          mobileListSnap === "peek" &&
          !loadingSpots &&
          !spotsError &&
          peekSpot && (
            <div
              className="ots-surface ots-surface--border"
              style={{
                padding: 10,
                borderRadius: 12,
                display: "grid",
                gap: 6,
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
                  <div style={{ fontWeight: 800, color: "#111", lineHeight: 1.2 }}>
                    {peekSpot.title}
                  </div>
                  <TagPills tags={peekSpot.tags} max={2} />
                  <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                    {peekSpot.what3words
                      ? `///${peekSpot.what3words}`
                      : "Tap to browse nearby stories"}
                  </div>
                </div>

                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    opacity: 0.8,
                    whiteSpace: "nowrap",
                  }}
                >
                  {formatDistance(peekSpot.distance_m)}
                </div>
              </div>

              <div style={{ fontSize: 13, opacity: 0.8 }}>
                {peekSpot.description.length > 70
                  ? `${peekSpot.description.slice(0, 70)}…`
                  : peekSpot.description}
              </div>
            </div>
          )}
      </div>

      {(!isMobile || mobileListExpanded) && (
        <div
          style={{
            overflowY: "auto",
            maxHeight: isMobile
              ? mobileListSnap === "half"
                ? "calc(38vh - 56px)"
                : "calc(72vh - 56px)"
              : undefined,
          }}
        >
          {loadingSpots ? (
            <p style={{ opacity: 0.7 }}>Loading nearby stories…</p>
          ) : spotsError ? (
            <div
              className="ots-surface ots-surface--border"
              style={{
                padding: 12,
                borderColor: "rgba(220, 38, 38, 0.24)",
                background: "rgba(220, 38, 38, 0.06)",
                color: "#7f1d1d",
                fontWeight: 600,
              }}
            >
              Couldn’t load nearby stories.
              <div style={{ marginTop: 6, fontSize: 13, opacity: 0.85 }}>
                {spotsError}
              </div>
            </div>
          ) : rankedFilteredSpots.length === 0 ? (
            <p style={{ opacity: 0.7 }}>
              No stories found with these filters. Try widening your radius.
            </p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {rankedFilteredSpots.map((s) => {
                const geologicalPeriod = formatGeologicalPeriod(s);
                const storyDate = geologicalPeriod ?? formatStoryDate(s.date_start);
                const storyPeriod = geologicalPeriod
                  ? null
                  : s.period_label_out ?? storyPeriodLabel(s.date_start);
                const sourceBadge = sourceBadgeLabel(s.source_url);
                const visibilityLabel = visibilityStoryLabel(s.visibility);
                const storyParts = splitStory(s.description);
                const cleanTags = dedupeChronologyTags(
                  s.tags,
                  s.date_start,
                  s.period_label_out
                );
                const timeScale = effectiveTimeScale({
                  date_start: s.date_start,
                  time_scale_out: s.time_scale_out,
                });

                return (
                  <div
                    key={s.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelectSpot(s)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelectSpot(s);
                      }
                    }}
                    style={{
                      textAlign: "left",
                      padding: 12,
                      borderRadius: 14,
                      border:
                        selectedSpotId === s.id
                          ? "2px solid black"
                          : "1px solid rgba(0,0,0,0.10)",
                      background:
                        selectedSpotId === s.id ? "rgba(0,0,0,0.05)" : "white",
                      cursor: "pointer",
                      display: "grid",
                      gap: 8,
                      boxShadow:
                        selectedSpotId === s.id
                          ? "0 10px 22px rgba(0,0,0,0.10)"
                          : "0 4px 14px rgba(0,0,0,0.05)",
                      transition:
                        "transform 140ms ease, box-shadow 180ms ease, border-color 180ms ease, background 180ms ease",
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
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            alignItems: "center",
                            minWidth: 0,
                            flexWrap: "wrap",
                          }}
                        >
                          <strong style={{ lineHeight: 1.2, fontSize: 16 }}>
                            {s.title}
                          </strong>
                          <VisibilityBadge visibility={s.visibility} />
                        </div>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          alignItems: "center",
                          flexShrink: 0,
                        }}
                      >
                        <span
                          style={{
                            opacity: 0.75,
                            whiteSpace: "nowrap",
                            fontSize: 13,
                          }}
                        >
                          {formatDistance(s.distance_m)}
                        </span>

                        {userId && s.user_id === userId && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteSpot(s);
                            }}
                            style={{
                              padding: "4px 8px",
                              borderRadius: 999,
                              border: "1px solid rgba(0,0,0,0.2)",
                              background: "white",
                              cursor: "pointer",
                            }}
                            title="Delete this Spot"
                          >
                            Delete
                          </button>
                        )}
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
                      {storyDate && (
                        <span
                          style={{
                            padding: "4px 8px",
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 700,
                            color: "#0F2A44",
                            background:
                              s.time_scale_out === "geological"
                                ? "rgba(139,92,246,0.14)"
                                : `${timeScale.color}18`,
                            border:
                              s.time_scale_out === "geological"
                                ? "1px solid rgba(139,92,246,0.26)"
                                : `1px solid ${timeScale.color}33`,
                          }}
                        >
                          {storyDate}
                        </span>
                      )}

                      {storyPeriod && storyPeriod !== storyDate && (
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
                          {storyPeriod}
                        </span>
                      )}

                      {s.time_scale_out === "geological" && (
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

                      {sourceBadge && (
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
                          {sourceBadge}
                        </span>
                      )}

                      {visibilityLabel && s.visibility !== "public" && (
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
                          {visibilityLabel}
                        </span>
                      )}
                    </div>

                    <TagPills tags={cleanTags} max={3} />

                    {s.photo_url && (
                      <img
                        src={s.photo_url}
                        alt={s.title}
                        style={{
                          width: "100%",
                          height: 138,
                          objectFit: "cover",
                          borderRadius: 12,
                          marginTop: 2,
                        }}
                      />
                    )}

                    <div
                      className="ots-story-text"
                      style={{
                        opacity: 0.9,
                        lineHeight: 1.5,
                        fontSize: 14,
                        display: "-webkit-box",
                        WebkitLineClamp: s.photo_url ? 2 : 3,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {storyParts.intro || s.description}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 10,
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ opacity: 0.7, fontSize: 13 }}>
                        {s.what3words ? `///${s.what3words}` : ""}
                      </div>

                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${s.lat_out},${s.lng_out}`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          padding: "7px 12px",
                          borderRadius: 999,
                          textDecoration: "none",
                          color: "#111",
                          fontWeight: 800,
                          background: "rgba(0,255,251,0.16)",
                          border: "1px solid rgba(0,0,0,0.08)",
                        }}
                      >
                        Navigate
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!isMobile && (
            <div style={{ marginTop: 12 }}>
              <Link
                href={addHref}
                style={{
                  display: "block",
                  textAlign: "center",
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.2)",
                  background: "white",
                  textDecoration: "none",
                  color: "#111",
                }}
              >
                + Add Spot
              </Link>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}