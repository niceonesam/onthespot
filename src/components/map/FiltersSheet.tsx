"use client";

import React from "react";
import Link from "next/link";
import type { SpotCategory } from "@/map/types";

type FiltersSheetProps = {
  showFilters: boolean;
  isMobile: boolean;
  filterSheetDragY: number;

  searchText: string;
  setSearchText: (value: string) => void;

  categoryFilter: string;
  setCategoryFilter: (value: string) => void;

  visibilityFilter: string;
  setVisibilityFilter: (value: string) => void;

  eraFilter: "all" | "modern" | "human" | "prehistoric" | "geological";
  setEraFilter: (value: "all" | "modern" | "human" | "prehistoric" | "geological") => void;

  tagFilter: string;
  setTagFilter: (value: string) => void;

  radiusM: number;
  setRadiusM: (value: number) => void;

  importedOnly: boolean;
  setImportedOnly: (value: boolean) => void;

  availableTags: string[];
  categoriesLoaded: boolean;
  categories: SpotCategory[];

  isAdmin: boolean;
  addHref: string;

  onClose: () => void;
  onOverlayClose: () => void;

  onTouchStart: (e: React.TouchEvent<HTMLDivElement>) => void;
  onTouchMove: (e: React.TouchEvent<HTMLDivElement>) => void;
  onTouchEnd: () => void;

  onResetFilters: () => void;
};

export default function FiltersSheet(props: FiltersSheetProps) {
  const {
    showFilters,
    filterSheetDragY,
    searchText,
    setSearchText,
    categoryFilter,
    setCategoryFilter,
    visibilityFilter,
    setVisibilityFilter,
    eraFilter,
    setEraFilter,
    tagFilter,
    setTagFilter,
    radiusM,
    setRadiusM,
    importedOnly,
    setImportedOnly,
    availableTags,
    categoriesLoaded,
    categories,
    isAdmin,
    addHref,
    onClose,
    onOverlayClose,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onResetFilters,
  } = props;

  if (!showFilters) return null;

  return (
    <div className="ots-sheet-overlay" onClick={onOverlayClose}>
      <div
        className="ots-sheet"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          transform: filterSheetDragY ? `translateY(${filterSheetDragY}px)` : undefined,
          transition: filterSheetDragY ? "none" : "transform 180ms ease",
        }}
      >
        <div className="ots-sheet-handle" />

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <strong style={{ fontSize: 16, color: "#111" }}>Filters</strong>
        </div>

        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
          <div
            className="ots-surface ots-surface--border"
            style={{ padding: 12, display: "grid", gap: 12 }}
          >
            <div style={{ fontWeight: 800, color: "#111" }}>Find spots</div>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, color: "#333", fontWeight: 700 }}>Search</span>
              <input
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Title, description, what3words…"
                style={{
                  padding: 10,
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.2)",
                }}
              />
            </label>
          </div>

          <div
            className="ots-surface ots-surface--border"
            style={{ padding: 12, display: "grid", gap: 12 }}
          >
            <div style={{ fontWeight: 800, color: "#111" }}>Narrow results</div>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, color: "#333", fontWeight: 700 }}>Category</span>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                style={{
                  padding: 10,
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.2)",
                  background: "white",
                }}
              >
                <option value="all">All categories</option>
                {(categoriesLoaded ? categories : []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, color: "#333", fontWeight: 700 }}>Visibility</span>
              <select
                value={visibilityFilter}
                onChange={(e) => setVisibilityFilter(e.target.value)}
                style={{
                  padding: 10,
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.2)",
                  background: "white",
                }}
              >
                <option value="all">All visibility</option>
                <option value="public">Public</option>
                <option value="friends">Friends</option>
                <option value="group">Group</option>
                <option value="private">Private</option>
              </select>
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, color: "#333", fontWeight: 700 }}>Time layer</span>
              <select
                value={eraFilter}
                onChange={(e) =>
                  setEraFilter(
                    e.target.value as "all" | "modern" | "human" | "prehistoric" | "geological"
                  )
                }
                style={{
                  padding: 10,
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.2)",
                  background: "white",
                }}
              >
                <option value="all">All time layers</option>
                <option value="modern">Modern</option>
                <option value="human">Human history</option>
                <option value="prehistoric">Prehistory</option>
                <option value="geological">Geological</option>
              </select>
            </label>

            {availableTags.length > 0 && (
              <div style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, color: "#333", fontWeight: 700 }}>Tag</span>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="ots-btn"
                    onClick={() => setTagFilter("all")}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 999,
                      fontWeight: tagFilter === "all" ? 800 : 700,
                      background: tagFilter === "all" ? "rgba(0,255,251,0.16)" : "white",
                    }}
                  >
                    All tags
                  </button>

                  {availableTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      className="ots-btn"
                      onClick={() => setTagFilter(tag)}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 999,
                        fontWeight: tagFilter === tag ? 800 : 700,
                        background: tagFilter === tag ? "rgba(0,255,251,0.16)" : "white",
                      }}
                    >
                      #{tag}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, color: "#333", fontWeight: 700 }}>Radius</span>
              <select
                value={radiusM}
                onChange={(e) => setRadiusM(Number(e.target.value))}
                style={{
                  padding: 10,
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.2)",
                  background: "white",
                }}
              >
                <option value={1000}>1 km</option>
                <option value={2500}>2.5 km</option>
                <option value={5000}>5 km</option>
                <option value={10000}>10 km</option>
                <option value={100000}>100 km</option>
                <option value={250000}>250 km</option>
                <option value={500000}>500 km</option>
                <option value={1000000}>1000 km</option>
              </select>
            </label>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: 10,
                borderRadius: 12,
                border: "1px solid rgba(0,0,0,0.08)",
                background: "rgba(0,0,0,0.02)",
              }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>Imported only</div>
                <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
                  Show only imported spots
                </div>
              </div>
              <input
                type="checkbox"
                checked={importedOnly}
                onChange={(e) => setImportedOnly(e.target.checked)}
                style={{ width: 18, height: 18 }}
              />
            </label>
          </div>

          <div
            className="ots-surface ots-surface--border"
            style={{ padding: 12, display: "grid", gap: 10 }}
          >
            <div style={{ fontWeight: 800, color: "#111" }}>Quick actions</div>

            {isAdmin && (
              <div style={{ display: "grid", gap: 10 }}>
                <Link
                  href="/admin/users"
                  onClick={onClose}
                  style={{
                    display: "block",
                    textAlign: "center",
                    padding: 12,
                    borderRadius: 12,
                    border: "1px solid rgba(0,0,0,0.2)",
                    background: "white",
                    textDecoration: "none",
                    color: "#111",
                    fontWeight: 700,
                  }}
                >
                  Admin: Users
                </Link>

                <Link
                  href="/admin/submissions"
                  onClick={onClose}
                  style={{
                    display: "block",
                    textAlign: "center",
                    padding: 12,
                    borderRadius: 12,
                    border: "1px solid rgba(0,0,0,0.2)",
                    background: "white",
                    textDecoration: "none",
                    color: "#111",
                    fontWeight: 700,
                  }}
                >
                  Admin: Submissions
                </Link>
              </div>
            )}

            <Link
              href={addHref}
              onClick={onClose}
              style={{
                display: "block",
                textAlign: "center",
                padding: 12,
                borderRadius: 12,
                border: "1px solid rgba(0,0,0,0.2)",
                background: "white",
                textDecoration: "none",
                color: "#111",
                fontWeight: 700,
              }}
            >
              + Add Spot
            </Link>

            <Link
              href="/account"
              onClick={onClose}
              style={{
                display: "block",
                textAlign: "center",
                padding: 12,
                borderRadius: 12,
                border: "1px solid rgba(0,0,0,0.2)",
                background: "white",
                textDecoration: "none",
                color: "#111",
                fontWeight: 700,
              }}
            >
              Account
            </Link>

            <form action="/auth/logout" method="post">
              <button
                type="submit"
                style={{
                  width: "100%",
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.2)",
                  background: "white",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                Log out
              </button>
            </form>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              className="ots-btn"
              onClick={onResetFilters}
              style={{ flex: 1, fontWeight: 700 }}
            >
              Reset filters
            </button>

            <button
              type="button"
              className="ots-btn"
              onClick={onClose}
              style={{ flex: 1, fontWeight: 800 }}
            >
              Show results
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}