"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GoogleMap, useLoadScript } from "@react-google-maps/api";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import Link from "next/link";

import AppShell from "@/components/AppShell";
import NearbySheet from "@/components/map/NearbySheet";
import FiltersSheet from "@/components/map/FiltersSheet";
import MapView from "@/components/map/MapView";

import type { Spot, SpotCategory } from "@/map/types";

import {
  formatStoryDate,
  effectiveTimeScale,
  timeScaleKey,
  storyPeriodLabel,
  isModernHumanDate,
  eraKeyForSpot,
  backendTimeFilterForEra,
  dedupeChronologyTags,
} from "@/map/temporal";
import { discoveryScore } from "@/map/discoveryRanking";
import {
  buildClusterCalculator,
  clusterBubbleDataUrl,
} from "@/map/clusterStyles";
import {
  markerIconForVisibility,
  markerIconForUser,
} from "@/map/markerIcons";
import {
  NEARBY_SHEET_SNAP,
  SPOT_SHEET_SNAP,
  CLUSTERING_THRESHOLD,
  nearbySheetHeightForSnap,
  spotSheetHeightForSnap,
} from "@/map/mapConfig";

const CURRENT_ONBOARDING_VERSION = 1;

const MAP_REFETCH_THRESHOLD_M = 150;
const MAP_REFETCH_THROTTLE_MS = 350;

const ONBOARDING_STEPS = [
  {
    title: "Browse the map",
    icon: "🗺️",
    body: "Nearby Spots appear on the map and in the list. Click any spot to centre the map and open its story card.",
  },
  {
    title: "Add a Spot",
    icon: "📍",
    body: "Use Add Spot to drop a location, write the story, and attach a photo if you have one.",
  },
  {
    title: "Choose who can see it",
    icon: "👀",
    body: "Public is open to everyone. Friends is for your network. Group is only for members of that group.",
  },
  {
    title: "Use filters",
    icon: "🔎",
    body: "Filter by radius, category, visibility, and search text so you can find the interesting stuff fast.",
  },
  {
    title: "Build your circle",
    icon: "🤝",
    body: "Visit Account to add friends, manage groups, and update your profile.",
  },
] as const;

// ---------- local formatting / utility helpers ----------
function formatDistance(meters: number) {
  if (!Number.isFinite(meters)) return "";
  if (meters < 1000) return `${Math.round(meters)} m`;

  const km = meters / 1000;

  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

function distanceMetersBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
) {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return R * c;
}




function sourceBadgeLabel(url?: string | null) {
  if (!url) return null;

  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host.includes("wikipedia.org")) return "Wikipedia source";
    if (host.includes("gov.uk")) return "Government source";
    if (host.includes("archive")) return "Archive source";
    return "External source";
  } catch {
    return "External source";
  }
}

function visibilityStoryLabel(visibility?: string | null) {
  if (visibility === "friends") return "Shared with friends";
  if (visibility === "group") return "Shared with group";
  if (visibility === "private") return "Private story";
  return "Public story";
}

function VisibilityBadge(props: { visibility: Spot["visibility"] }) {
  const v = props.visibility;
  if (v === "public") return null;

  const color =
    v === "friends" ? "#0b57d0" : v === "group" ? "#a855f7" : "#6b7280";

  const label = v === "friends" ? "Friends" : v === "group" ? "Group" : "Private";

  const title =
    v === "friends"
      ? "Visible to friends"
      : v === "group"
        ? "Visible to group members"
        : "Only visible to you";

  return (
    <span
      style={{
        fontSize: 12,
        padding: "2px 8px",
        borderRadius: 999,
        border: "1px solid rgba(0,0,0,0.2)",
        color,
        whiteSpace: "nowrap",
      }}
      title={title}
    >
      {label}
    </span>
  );
}

function TagPills(props: { tags?: string[] | null; max?: number }) {
  const tags = (props.tags ?? []).filter(Boolean);
  if (!tags.length) return null;

  const max = props.max ?? 3;
  const shown = tags.slice(0, max);
  const remaining = tags.length - shown.length;

  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
      {shown.map((tag) => (
        <span
          key={tag}
          style={{
            fontSize: 12,
            padding: "3px 8px",
            borderRadius: 999,
            background: "rgba(0,255,251,0.10)",
            border: "1px solid rgba(0,0,0,0.08)",
            color: "#111",
            fontWeight: 700,
            lineHeight: 1.2,
          }}
        >
          #{tag}
        </span>
      ))}
      {remaining > 0 && (
        <span
          style={{
            fontSize: 12,
            padding: "3px 8px",
            borderRadius: 999,
            background: "rgba(0,0,0,0.04)",
            border: "1px solid rgba(0,0,0,0.08)",
            color: "#333",
            fontWeight: 700,
            lineHeight: 1.2,
          }}
        >
          +{remaining}
        </span>
      )}
    </div>
  );
}

function vibrateLight() {
  if (typeof window !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(10);
  }
}

function vibrateSuccess() {
  if (typeof window !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate([12, 30, 18]);
  }
}

function dampedDrag(delta: number) {
  if (!Number.isFinite(delta) || delta === 0) return 0;
  const sign = delta < 0 ? -1 : 1;
  const abs = Math.abs(delta);
  const softened = abs <= 120 ? abs : 120 + (abs - 120) * 0.35;
  return softened * sign;
}

function clamp<T extends number>(value: T, min: number, max: number) {
  return Math.max(min, Math.min(max, value)) as T;
}

function splitStory(description: string) {
  const parts = description.trim().split(/(?<=[.!?])\s+/);
  const intro = parts.slice(0, 2).join(" ").trim();
  const rest = parts.slice(2).join(" ").trim();
  return { intro, rest };
}

// ---------- page component ----------
export default function HomePage() {
  const supabase = getSupabaseBrowser();

  const placePackPreviewParams = useMemo(() => {
    if (typeof window === "undefined") {
      return {
        isPreview: false,
        lat: null as number | null,
        lng: null as number | null,
        radiusM: null as number | null,
        slug: null as string | null,
      };
    }

    const params = new URLSearchParams(window.location.search);
    const lat = Number(params.get("lat"));
    const lng = Number(params.get("lng"));
    const radiusRaw = Number(params.get("radius_m"));
    const slug = params.get("place_pack_slug");
    const isPreview = params.get("place_pack_preview") === "1";

    return {
      isPreview: isPreview && Number.isFinite(lat) && Number.isFinite(lng),
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      radiusM: Number.isFinite(radiusRaw) ? radiusRaw : null,
      slug: slug?.trim() ? slug.trim() : null,
    };
  }, []);

  const isPlacePackPreview = placePackPreviewParams.isPreview;

  const { isLoaded } = useLoadScript({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!,
  });

  // ---------- core app state ----------
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [spots, setSpots] = useState<Spot[]>([]);
  const [selected, setSelected] = useState<Spot | null>(null);
  const [selectedSheetSnap, setSelectedSheetSnap] = useState<"peek" | "half" | "full">("half");
  const [pulsingMarkerId, setPulsingMarkerId] = useState<string | null>(null);
  const [radiusM, setRadiusM] = useState(2500);
  const [userId, setUserId] = useState<string | null>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [mapCenter, setMapCenter] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [viewportRadiusM, setViewportRadiusM] = useState<number | null>(null);
  const [viewportBounds, setViewportBounds] = useState<{
    north: number;
    south: number;
    east: number;
    west: number;
  } | null>(null);
  const [queryCenter, setQueryCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [crosshairPulseKey, setCrosshairPulseKey] = useState(0);
  const markerPulseTimeoutRef = useRef<number | null>(null);
  const mapPanTimeoutRef = useRef<number | null>(null);
  const mapQueryThrottleTimeoutRef = useRef<number | null>(null);
  const pendingMapCenterRef = useRef<{ lat: number; lng: number } | null>(null);

  function panSelectedSpotIntoView(lat: number, lng: number) {
    if (!map) return;

    const projection = map.getProjection();
    const zoom = map.getZoom();
    if (!projection || zoom == null) return;

    const scale = Math.pow(2, zoom);
    const worldPoint = projection.fromLatLngToPoint(
      new google.maps.LatLng(lat, lng)
    );
    if (!worldPoint) return;

    const yOffsetPixels = isMobile ? 136 : 0;

    const pixelPoint = new google.maps.Point(
      worldPoint.x * scale,
      worldPoint.y * scale
    );

    const adjusted = new google.maps.Point(
      pixelPoint.x,
      pixelPoint.y - yOffsetPixels
    );

    const adjustedLatLng = projection.fromPointToLatLng(
      new google.maps.Point(adjusted.x / scale, adjusted.y / scale)
    );

    if (!adjustedLatLng) return;

    map.panTo(adjustedLatLng);
  }

  const [showFilters, setShowFilters] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileListSnap, setMobileListSnap] = useState<"peek" | "half" | "full">("peek");
  const mobileListTouchStartYRef = useRef<number | null>(null);
  const mobileListTouchCurrentYRef = useRef<number | null>(null);
  const [mobileListDragY, setMobileListDragY] = useState(0);
  const filterTouchStartYRef = useRef<number | null>(null);
  const filterTouchCurrentYRef = useRef<number | null>(null);
  const [filterSheetDragY, setFilterSheetDragY] = useState(0);
  // Spot sheet drag state
  const spotTouchStartYRef = useRef<number | null>(null);
  const spotTouchCurrentYRef = useRef<number | null>(null);
  const [spotSheetDragY, setSpotSheetDragY] = useState(0);
  // New filters
  const [searchText, setSearchText] = useState("");
  const [debouncedSearchText, setDebouncedSearchText] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [visibilityFilter, setVisibilityFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [eraFilter, setEraFilter] = useState<"all" | "modern" | "human" | "prehistoric" | "geological">("all");
  // Optional: only works if your RPC returns is_imported (won't break if it doesn't)
  const [importedOnly, setImportedOnly] = useState(false);
  // Admin button for Admin users
  const [isAdmin, setIsAdmin] = useState(false);
  // Categories state
  const [categories, setCategories] = useState<SpotCategory[]>([]);
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);
  // DB-backed onboarding
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [checkingOnboarding, setCheckingOnboarding] = useState(false);
  const [savingOnboarding, setSavingOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);

  const [loadingSpots, setLoadingSpots] = useState(false);
  const [spotsError, setSpotsError] = useState<string | null>(null);

  // ---------- data loading / persistence effects ----------
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data, error } = await supabase
          .from("spot_categories")
          .select("id,label")
          .order("label", { ascending: true });

        if (cancelled) return;

        if (error) {
          console.warn("Failed to load spot_categories:", error.message);
          setCategories([]);
          setCategoriesLoaded(true);
          return;
        }

        setCategories((data ?? []) as SpotCategory[]);
        setCategoriesLoaded(true);
      } catch (e) {
        if (cancelled) return;
        console.warn("Failed to load spot_categories:", e);
        setCategories([]);
        setCategoriesLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    if (!userId) {
      setShowOnboarding(false);
      return;
    }

    let cancelled = false;

    (async () => {
      setCheckingOnboarding(true);
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("onboarding_version")
          .eq("id", userId)
          .maybeSingle();

        if (cancelled) return;

        if (error) {
          console.warn("Failed to load onboarding status:", error.message);
          return;
        }

        const version = Number((data as any)?.onboarding_version ?? 0);
        setShowOnboarding(version < CURRENT_ONBOARDING_VERSION);
        if (version < CURRENT_ONBOARDING_VERSION) setOnboardingStep(0);
      } catch (e) {
        if (cancelled) return;
        console.warn("Failed to load onboarding status:", e);
      } finally {
        if (!cancelled) setCheckingOnboarding(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, supabase]);

  // ---------- derived map / filter state ----------
  const filteredSpots = spots.filter((s) => {
    const catOk = categoryFilter === "all" || s.category === categoryFilter;
    const vis = (s as any).visibility ?? "public";
    const visOk = visibilityFilter === "all" || vis === visibilityFilter;
    const eraOk = eraFilter === "all" || eraKeyForSpot(s) === eraFilter;
    return catOk && visOk && eraOk;
  });

  const rankedFilteredSpots = [...filteredSpots].sort((a, b) => {
    const scoreDiff = discoveryScore(b) - discoveryScore(a);
    if (scoreDiff !== 0) return scoreDiff;
    return Number(a.distance_m ?? 999999) - Number(b.distance_m ?? 999999);
  });

  const selectedStoryParts = selected ? splitStory(selected.description) : null;
  const selectedStoryDate = selected ? formatStoryDate(selected.date_start) : null;
  const selectedSourceBadge = selected ? sourceBadgeLabel(selected.source_url) : null;
  const selectedStoryPeriod = selected
    ? (selected.period_label_out ?? storyPeriodLabel(selected.date_start))
    : null;
  const selectedVisibilityLabel = selected ? visibilityStoryLabel((selected as any).visibility) : null;

  const placeThroughTimeSpots = selected
    ? spots
        .filter((s) => {
          if (s.id === selected.id) return false;

          const toRad = (v: number) => (v * Math.PI) / 180;

          const R = 6371000;
          const lat1 = toRad(selected.lat_out);
          const lat2 = toRad(s.lat_out);
          const dLat = toRad(s.lat_out - selected.lat_out);
          const dLng = toRad(s.lng_out - selected.lng_out);

          const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);

          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          const meters = R * c;

          return meters <= 400;
        })
        .sort((a, b) => {
          const scaleRank = (spot: Spot) => {
            const scale = timeScaleKey(spot);
            return scale === "geological" ? 0 : scale === "ancient" ? 1 : isModernHumanDate(spot.date_start) ? 3 : 2;
          };

          const rankDiff = scaleRank(a) - scaleRank(b);
          if (rankDiff !== 0) return rankDiff;

          const dateA = a.date_start ?? "";
          const dateB = b.date_start ?? "";
          const periodA = a.period_label_out ?? storyPeriodLabel(a.date_start) ?? "";
          const periodB = b.period_label_out ?? storyPeriodLabel(b.date_start) ?? "";

          const labelDiff = `${dateA} ${periodA}`.localeCompare(`${dateB} ${periodB}`);
          if (labelDiff !== 0) return labelDiff;

          return 0;
        })
        .slice(0, 5)
    : [];

  function placeThroughTimeEraLabel(spot: Spot) {
    const era = eraKeyForSpot(spot);
    if (era === "geological") return "Geological";
    if (era === "prehistoric") return "Prehistory";
    if (era === "modern") return "Modern";
    return "Human history";
  }

  const availableTags = Array.from(
    new Set(
      filteredSpots.flatMap((s) =>
        (s.tags ?? []).map((t) => String(t).trim()).filter(Boolean)
      )
    )
  )
    .sort((a, b) => a.localeCompare(b))
    .slice(0, 16);

  const selectedCategoryLabel =
    categoryFilter === "all"
      ? null
      : categories.find((c) => c.id === categoryFilter)?.label ?? "Category";

  const effectiveDisplayRadiusM = Math.max(
    250,
    Math.min(radiusM, viewportRadiusM ?? radiusM)
  );

  const activeFilterParts = [
    radiusM !== 2500 ? formatDistance(effectiveDisplayRadiusM) : null,
    selectedCategoryLabel,
    visibilityFilter !== "all"
      ? visibilityFilter.charAt(0).toUpperCase() + visibilityFilter.slice(1)
      : null,
    eraFilter !== "all"
      ? eraFilter === "modern"
        ? "Modern"
        : eraFilter === "human"
          ? "Human history"
          : eraFilter === "prehistoric"
            ? "Prehistory"
            : "Geological"
      : null,
    tagFilter !== "all" ? `#${tagFilter}` : null,
    importedOnly ? "Imported" : null,
    searchText.trim() ? `“${searchText.trim()}”` : null,
  ].filter(Boolean) as string[];

  const filterSummary = activeFilterParts.length
    ? activeFilterParts.join(" • ")
    : null;

  const filterSummaryShort = activeFilterParts.length
    ? activeFilterParts.length <= 3
      ? activeFilterParts.join(" • ")
      : `${activeFilterParts.slice(0, 3).join(" • ")}…`
    : null;

  const mobileListExpanded = mobileListSnap !== "peek";
  const mobileSnapOrder: Array<"peek" | "half" | "full"> = ["peek", "half", "full"];
  const shouldClusterMarkers =
    filteredSpots.length >=
    (isMobile ? CLUSTERING_THRESHOLD.mobile : CLUSTERING_THRESHOLD.desktop);
  const temporalClusterGroups =
    eraFilter === "all"
      ? [
          {
            key: "geological",
            spots: rankedFilteredSpots.filter((s) => eraKeyForSpot(s) === "geological"),
          },
          {
            key: "prehistoric",
            spots: rankedFilteredSpots.filter((s) => eraKeyForSpot(s) === "prehistoric"),
          },
          {
            key: "human",
            spots: rankedFilteredSpots.filter((s) => {
              const era = eraKeyForSpot(s);
              return era === "human" || era === "modern";
            }),
          },
        ].filter((group) => group.spots.length > 0)
      : [
          {
            key: eraFilter,
            spots: rankedFilteredSpots,
          },
        ];
  const clusterAnchorText: [number, number] = [0, 0];

  const clusterCalculator = buildClusterCalculator();
  
  const clusterStyles = [
    // Human
    {
      url: clusterBubbleDataUrl("#0F2A44", "#1FB6A6", "#54d9cb"),
      height: 52,
      width: 52,
      textColor: "#ffffff",
      textSize: 17,
      fontWeight: "800",
      anchorText: clusterAnchorText,
    },
    {
      url: clusterBubbleDataUrl("#0F2A44", "#1FB6A6", "#54d9cb"),
      height: 64,
      width: 64,
      textColor: "#ffffff",
      textSize: 18,
      fontWeight: "800",
      anchorText: clusterAnchorText,
    },
    {
      url: clusterBubbleDataUrl("#0F2A44", "#1FB6A6", "#54d9cb"),
      height: 78,
      width: 78,
      textColor: "#ffffff",
      textSize: 20,
      fontWeight: "800",
      anchorText: clusterAnchorText,
    },
    // Ancient
    {
      url: clusterBubbleDataUrl("#0F2A44", "#E6B325", "#F2C94C"),
      height: 52,
      width: 52,
      textColor: "#ffffff",
      textSize: 17,
      fontWeight: "800",
      anchorText: clusterAnchorText,
    },
    {
      url: clusterBubbleDataUrl("#0F2A44", "#E6B325", "#F2C94C"),
      height: 64,
      width: 64,
      textColor: "#ffffff",
      textSize: 18,
      fontWeight: "800",
      anchorText: clusterAnchorText,
    },
    {
      url: clusterBubbleDataUrl("#0F2A44", "#E6B325", "#F2C94C"),
      height: 78,
      width: 78,
      textColor: "#ffffff",
      textSize: 20,
      fontWeight: "800",
      anchorText: clusterAnchorText,
    },
    // Geological
    {
      url: clusterBubbleDataUrl("#0F2A44", "#6b21a8", "#8b5cf6"),
      height: 52,
      width: 52,
      textColor: "#ffffff",
      textSize: 17,
      fontWeight: "800",
      anchorText: clusterAnchorText,
    },
    {
      url: clusterBubbleDataUrl("#0F2A44", "#6b21a8", "#8b5cf6"),
      height: 64,
      width: 64,
      textColor: "#ffffff",
      textSize: 18,
      fontWeight: "800",
      anchorText: clusterAnchorText,
    },
    {
      url: clusterBubbleDataUrl("#0F2A44", "#6b21a8", "#8b5cf6"),
      height: 78,
      width: 78,
      textColor: "#ffffff",
      textSize: 20,
      fontWeight: "800",
      anchorText: clusterAnchorText,
    },
  ];

  // ---------- sheet / gesture handlers ----------
  function cycleMobileListSnap() {
    setMobileListSnap((prev) =>
      prev === "peek" ? "half" : prev === "half" ? "full" : "peek"
    );
    vibrateLight();
  }

  function mobileListHeightForSnap() {
    return nearbySheetHeightForSnap(mobileListSnap);
  }

  function resetMobileListDrag() {
    mobileListTouchStartYRef.current = null;
    mobileListTouchCurrentYRef.current = null;
    setMobileListDragY(0);
  }

  function onMobileListTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    if (!isMobile) return;
    const y = e.touches[0]?.clientY;
    if (typeof y !== "number") return;
    mobileListTouchStartYRef.current = y;
    mobileListTouchCurrentYRef.current = y;
  }

  function onMobileListTouchMove(e: React.TouchEvent<HTMLDivElement>) {
    if (!isMobile) return;
    if (mobileListTouchStartYRef.current == null) return;

    const y = e.touches[0]?.clientY;
    if (typeof y !== "number") return;
    mobileListTouchCurrentYRef.current = y;

    const delta = y - mobileListTouchStartYRef.current;
    setMobileListDragY(dampedDrag(delta));
  }

  function onMobileListTouchEnd() {
    if (!isMobile) {
      resetMobileListDrag();
      return;
    }

    const startY = mobileListTouchStartYRef.current;
    const endY = mobileListTouchCurrentYRef.current;
    const delta =
      typeof startY === "number" && typeof endY === "number"
        ? endY - startY
        : 0;

    const currentIndex = mobileSnapOrder.indexOf(mobileListSnap);
    let nextIndex = currentIndex;

    if (delta <= -36) {
      nextIndex = clamp(currentIndex + (delta <= -140 ? 2 : 1), 0, mobileSnapOrder.length - 1);
    } else if (delta >= 36) {
      nextIndex = clamp(currentIndex - (delta >= 140 ? 2 : 1), 0, mobileSnapOrder.length - 1);
    }

    const nextSnap = mobileSnapOrder[nextIndex];
    if (nextSnap !== mobileListSnap) {
      setMobileListSnap(nextSnap);
      vibrateLight();
    }

    resetMobileListDrag();
  }

  const mobileQuickChips = [
    {
      key: "all",
      label: "All",
      active: visibilityFilter === "all" && eraFilter === "all" && !importedOnly,
      onClick: () => {
        setVisibilityFilter("all");
        setEraFilter("all");
        setImportedOnly(false);
      },
    },
    {
      key: "public",
      label: "Public",
      active: visibilityFilter === "public",
      onClick: () => setVisibilityFilter("public"),
    },
    {
      key: "friends",
      label: "Friends",
      active: visibilityFilter === "friends",
      onClick: () => setVisibilityFilter("friends"),
    },
    {
      key: "group",
      label: "Group",
      active: visibilityFilter === "group",
      onClick: () => setVisibilityFilter("group"),
    },
    {
      key: "modern",
      label: "Modern",
      active: eraFilter === "modern",
      onClick: () => setEraFilter(eraFilter === "modern" ? "all" : "modern"),
    },
    {
      key: "prehistoric",
      label: "Prehistory",
      active: eraFilter === "prehistoric",
      onClick: () => setEraFilter(eraFilter === "prehistoric" ? "all" : "prehistoric"),
    },
    {
      key: "geological",
      label: "Geological",
      active: eraFilter === "geological",
      onClick: () => setEraFilter(eraFilter === "geological" ? "all" : "geological"),
    },
    {
      key: "imported",
      label: "Imported",
      active: importedOnly,
      onClick: () => setImportedOnly((v) => !v),
    },
  ] as const;

  const addHref = mapCenter
    ? `/add?lat=${mapCenter.lat}&lng=${mapCenter.lng}`
    : pos
      ? `/add?lat=${pos.lat}&lng=${pos.lng}`
      : "/add";

    // ---------- auth / user helpers ----------
    async function refreshAuthFlags() {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;

        const res = await fetch("/api/me", {
          cache: "no-store",
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
        });
        if (!res.ok) {
          setUserId(null);
          setIsAdmin(false);
          return;
        }

        const j = (await res.json()) as {
          email: string | null;
          user_id: string | null;
          is_admin: boolean;
        };

        setUserId(j.user_id);
        setIsAdmin(Boolean(j.is_admin));
      } catch (e: any) {
        setUserId(null);
        setIsAdmin(false);
      }
    }

    useEffect(() => {
      refreshAuthFlags();

      const { data: sub } = supabase.auth.onAuthStateChange(() => {
        refreshAuthFlags();
      });

      const onFocus = () => refreshAuthFlags();
      window.addEventListener("focus", onFocus);

      return () => {
        sub.subscription.unsubscribe();
        window.removeEventListener("focus", onFocus);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

  useEffect(() => {
    if (
      isPlacePackPreview &&
      placePackPreviewParams.lat != null &&
      placePackPreviewParams.lng != null
    ) {
      const next = {
        lat: placePackPreviewParams.lat,
        lng: placePackPreviewParams.lng,
      };
      setPos(next);
      setQueryCenter(next);
      setMapCenter(next);
      if (placePackPreviewParams.radiusM != null) {
        setRadiusM(placePackPreviewParams.radiusM);
      }
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (p) => {
        const next = { lat: p.coords.latitude, lng: p.coords.longitude };
        setPos(next);
        setQueryCenter(next);
      },
      () => {
        const fallback = { lat: 51.5074, lng: -0.1278 };
        setPos(fallback);
        setQueryCenter(fallback);
      }
    );
  }, [isPlacePackPreview, placePackPreviewParams.lat, placePackPreviewParams.lng, placePackPreviewParams.radiusM]);

  // Throttle map-driven query recentering so tiny pan bursts do not spam refetches.
  useEffect(() => {
    if (!mapCenter) return;

    const tryCommitMapCenter = () => {
      const candidate = pendingMapCenterRef.current ?? mapCenter;

      setQueryCenter((prev) => {
        if (!prev) return candidate;
        const moved = distanceMetersBetween(prev, candidate);
        return moved >= MAP_REFETCH_THRESHOLD_M ? candidate : prev;
      });

      pendingMapCenterRef.current = null;
      mapQueryThrottleTimeoutRef.current = null;
    };

    if (mapQueryThrottleTimeoutRef.current != null) {
      pendingMapCenterRef.current = mapCenter;
      return;
    }

    pendingMapCenterRef.current = mapCenter;
    mapQueryThrottleTimeoutRef.current = window.setTimeout(() => {
      tryCommitMapCenter();
    }, MAP_REFETCH_THROTTLE_MS);
  }, [mapCenter]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");

    const apply = () => {
      const mobile = mq.matches;
      setIsMobile(mobile);
      setMobileListSnap(mobile ? "peek" : "full");
    };

    apply();

    const listener = () => apply();
    if (mq.addEventListener) {
      mq.addEventListener("change", listener);
      return () => mq.removeEventListener("change", listener);
    }

    mq.addListener(listener);
    return () => mq.removeListener(listener);
  }, []);

  useEffect(() => {
    if (!isPlacePackPreview || !map || placePackPreviewParams.lat == null || placePackPreviewParams.lng == null) {
      return;
    }

    const center = {
      lat: placePackPreviewParams.lat,
      lng: placePackPreviewParams.lng,
    };

    map.panTo(center);

    const radius = placePackPreviewParams.radiusM ?? 600;
    const zoom = radius <= 250 ? 17 : radius <= 600 ? 16 : radius <= 1200 ? 15 : 14;
    map.setZoom(zoom);
  }, [isPlacePackPreview, map, placePackPreviewParams.lat, placePackPreviewParams.lng, placePackPreviewParams.radiusM]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchText(searchText);
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [searchText]);

  useEffect(() => {
    return () => {
      if (markerPulseTimeoutRef.current != null) {
        window.clearTimeout(markerPulseTimeoutRef.current);
      }
      if (mapPanTimeoutRef.current != null) {
        window.clearTimeout(mapPanTimeoutRef.current);
      }
      if (mapQueryThrottleTimeoutRef.current != null) {
        window.clearTimeout(mapQueryThrottleTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!viewportBounds) return;

    let cancelled = false;

    (async () => {
      setLoadingSpots(true);
      setSpotsError(null);

      const { data, error } = await supabase.rpc("spots_in_bounds", {
        north: viewportBounds.north,
        south: viewportBounds.south,
        east: viewportBounds.east,
        west: viewportBounds.west,
        category: categoryFilter === "all" ? null : categoryFilter,
        visibility: visibilityFilter === "all" ? null : visibilityFilter,
        time_filter: backendTimeFilterForEra(eraFilter),
        tag_filter: tagFilter === "all" ? null : tagFilter,
        q: debouncedSearchText.trim() ? debouncedSearchText.trim() : null,
        imported_only: importedOnly,
      });

      if (cancelled) return;

      if (error) {
        setSpotsError(error.message);
        setSpots([]);
      } else {
        setSpots((data ?? []) as Spot[]);
      }

      setLoadingSpots(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    viewportBounds,
    categoryFilter,
    debouncedSearchText,
    importedOnly,
    supabase,
    visibilityFilter,
    tagFilter,
    eraFilter,
  ]);

  // Close on Escape
  useEffect(() => {
    if (!showFilters) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowFilters(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showFilters]);

  // Lock background scroll when sheet open (mobile UX)
  useEffect(() => {
    if (!showFilters) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [showFilters]);

  // Load saved filters on first render
  useEffect(() => {
    try {
      const raw = localStorage.getItem("ots_filters_v1");
      if (!raw) return;
      const v = JSON.parse(raw);

      if (typeof v.radiusM === "number") setRadiusM(v.radiusM);
      if (typeof v.searchText === "string") setSearchText(v.searchText);
      if (typeof v.categoryFilter === "string") setCategoryFilter(v.categoryFilter);
      if (typeof v.visibilityFilter === "string") setVisibilityFilter(v.visibilityFilter);
      if (typeof v.tagFilter === "string") setTagFilter(v.tagFilter);
      if (typeof v.eraFilter === "string") setEraFilter(v.eraFilter);
      else if (typeof v.timeFilter === "string") {
        setEraFilter(v.timeFilter === "ancient" ? "prehistoric" : v.timeFilter as any);
      }
      if (typeof v.importedOnly === "boolean") setImportedOnly(v.importedOnly);
    } catch {
      // ignore bad saved state
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save whenever filters change
  useEffect(() => {
    try {
      localStorage.setItem(
        "ots_filters_v1",
        JSON.stringify({ radiusM, searchText, categoryFilter, visibilityFilter, tagFilter, eraFilter, importedOnly })
      );
    } catch {
      // ignore storage errors
    }
  }, [radiusM, searchText, categoryFilter, visibilityFilter, tagFilter, eraFilter, importedOnly]);

  if (!isLoaded || !pos) return <div style={{ padding: 16 }}>Loading…</div>;

  // ---------- spot actions ----------
  async function deleteSpot(spot: Spot) {
    const ok = window.confirm("Delete this Spot? This cannot be undone.");
    if (!ok) return;

    // 1) Delete photo from Storage (if there is one)
    if (spot.photo_path) {
      const { error: storageError } = await supabase.storage
        .from("spot-photos")
        .remove([spot.photo_path]);

      // If this fails due to policy, show a useful message
      if (storageError) {
        alert(`Could not delete photo: ${storageError.message}`);
        return;
      }
    }

    // 2) Delete row from database
    const { error: dbError } = await supabase
      .from("spots")
      .delete()
      .eq("id", spot.id);
    if (dbError) {
      alert(`Could not delete spot: ${dbError.message}`);
      return;
    }

    // 3) Update UI
    setSpots((prev) => prev.filter((s) => s.id !== spot.id));
    setSelected((prev) => (prev?.id === spot.id ? null : prev));
  }

  function selectSpot(s: Spot) {
    setSelected(s);
    setSelectedSheetSnap("half");
    vibrateLight();
    if (isMobile) setMobileListSnap("peek");

    setPulsingMarkerId(s.id);
    vibrateSuccess();
    if (markerPulseTimeoutRef.current != null) {
      window.clearTimeout(markerPulseTimeoutRef.current);
    }
    markerPulseTimeoutRef.current = window.setTimeout(() => {
      setPulsingMarkerId((prev) => (prev === s.id ? null : prev));
      markerPulseTimeoutRef.current = null;
    }, 1100);

    if (mapPanTimeoutRef.current != null) {
      window.clearTimeout(mapPanTimeoutRef.current);
      mapPanTimeoutRef.current = null;
    }

    if (map) {
      panSelectedSpotIntoView(s.lat_out, s.lng_out);

      const z = map.getZoom();
      if (typeof z === "number" && z < 13) map.setZoom(13);
    }
  }

  async function dismissOnboarding() {
    if (!userId) {
      setShowOnboarding(false);
      return;
    }

    setSavingOnboarding(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          onboarding_version: CURRENT_ONBOARDING_VERSION,
          onboarding_seen_at: new Date().toISOString(),
        })
        .eq("id", userId);

      if (error) {
        console.warn("Failed to save onboarding state:", error.message);
      }

      setShowOnboarding(false);
    } finally {
      setSavingOnboarding(false);
    }
  }

  function hideOnboardingForNow() {
    setShowOnboarding(false);
    setOnboardingStep(0);
  }

  function onFilterSheetTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    if (!isMobile) return;
    const y = e.touches[0]?.clientY;
    if (typeof y !== "number") return;
    filterTouchStartYRef.current = y;
    filterTouchCurrentYRef.current = y;
  }

  function onFilterSheetTouchMove(e: React.TouchEvent<HTMLDivElement>) {
    if (!isMobile) return;
    if (filterTouchStartYRef.current == null) return;

    const y = e.touches[0]?.clientY;
    if (typeof y !== "number") return;

    filterTouchCurrentYRef.current = y;
    const delta = y - filterTouchStartYRef.current;

    // Only allow dragging downward
    setFilterSheetDragY(delta > 0 ? delta : 0);
  }

  function resetFilterSheetDrag() {
    filterTouchStartYRef.current = null;
    filterTouchCurrentYRef.current = null;
    setFilterSheetDragY(0);
  }

  function onFilterSheetTouchEnd() {
    if (!isMobile) {
      resetFilterSheetDrag();
      return;
    }

    const startY = filterTouchStartYRef.current;
    const endY = filterTouchCurrentYRef.current;
    const delta =
      typeof startY === "number" && typeof endY === "number"
        ? endY - startY
        : 0;

    if (delta > 90) {
      setShowFilters(false);
      vibrateLight();
    }

    resetFilterSheetDrag();
  }

  const selectedSnapOrder: Array<"peek" | "half" | "full"> = ["peek", "half", "full"];

  const selectedSheetIsPeek = selectedSheetSnap === "peek";
  const selectedSheetIsHalf = selectedSheetSnap === "half";
  const selectedSheetIsFull = selectedSheetSnap === "full";

  function selectedSheetHeightForSnap() {
    return spotSheetHeightForSnap(selectedSheetSnap);
  }

  function cycleSelectedSheetSnap() {
    setSelectedSheetSnap((prev) =>
      prev === "peek" ? "half" : prev === "half" ? "full" : "peek"
    );
    vibrateLight();
  }

  // Spot sheet drag helpers
  function onSpotSheetTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    const y = e.touches[0]?.clientY;
    if (typeof y !== "number") return;
    spotTouchStartYRef.current = y;
    spotTouchCurrentYRef.current = y;
  }

  function onSpotSheetTouchMove(e: React.TouchEvent<HTMLDivElement>) {
    if (spotTouchStartYRef.current == null) return;

    const y = e.touches[0]?.clientY;
    if (typeof y !== "number") return;

    spotTouchCurrentYRef.current = y;
    const delta = y - spotTouchStartYRef.current;
    setSpotSheetDragY(dampedDrag(delta));
  }

  function resetSpotSheetDrag() {
    spotTouchStartYRef.current = null;
    spotTouchCurrentYRef.current = null;
    setSpotSheetDragY(0);
  }

  function onSpotSheetTouchEnd() {
    const startY = spotTouchStartYRef.current;
    const endY = spotTouchCurrentYRef.current;

    const delta =
      typeof startY === "number" && typeof endY === "number"
        ? endY - startY
        : 0;

    const currentIndex = selectedSnapOrder.indexOf(selectedSheetSnap);

    if (delta >= 160 && selectedSheetSnap === "peek") {
      setSelected(null);
      vibrateLight();
      resetSpotSheetDrag();
      return;
    }

    let nextIndex = currentIndex;
    if (delta <= -36) {
      nextIndex = clamp(currentIndex + (delta <= -140 ? 2 : 1), 0, selectedSnapOrder.length - 1);
    } else if (delta >= 36) {
      nextIndex = clamp(currentIndex - (delta >= 140 ? 2 : 1), 0, selectedSnapOrder.length - 1);
    }

    const nextSnap = selectedSnapOrder[nextIndex];
    if (nextSnap !== selectedSheetSnap) {
      setSelectedSheetSnap(nextSnap);
      vibrateLight();
    }

    resetSpotSheetDrag();
  }

  return (
    <AppShell
      subtitle={isPlacePackPreview ? `Place pack preview${placePackPreviewParams.slug ? ` • ${placePackPreviewParams.slug}` : ""}` : "Nearby stories on the map"}
      fullBleed
      right={
        isPlacePackPreview ? null :
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: 10,
            color: "#333",
          }}
        >
          <button
            type="button"
            className="ots-header-filter-trigger"
            onClick={() => setShowFilters(true)}
            title={filterSummary ?? "Filters"}
          >
            {filterSummaryShort ? `Filters • ${filterSummaryShort}` : "Filters"}
          </button>

          {/* Header actions */}
          <div className="ots-header-controls">

            {isAdmin && (
              <details className="ots-admin-menu">
                <summary className="ots-admin-summary">Admin</summary>
                <div className="ots-admin-dropdown">
                  <Link href="/admin/users" className="ots-admin-item">
                    Users
                  </Link>
                  <Link href="/admin/submissions" className="ots-admin-item">
                    Submissions
                  </Link>
                  <Link href="/admin/place-packs" className="ots-admin-item">
                    Place Packs
                  </Link>
                </div>
              </details>
            )}

            <Link href={addHref}>Add Spot</Link>
            <Link href="/account">Account</Link>

            <form action="/auth/logout" method="post">
              <button type="submit">Log out</button>
            </form>
          </div>
        </div>
      }
    >
      {!isPlacePackPreview && showOnboarding && !checkingOnboarding && (
        <div
          onClick={() => {
            // Clicking the overlay should NOT mark onboarding as complete.
            if (!savingOnboarding) hideOnboardingForNow();
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "grid",
            placeItems: "center",
            padding: 16,
            zIndex: 1200,
          }}
        >
          <div
            className="ots-surface ots-surface--shadow"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(760px, 100%)",
              maxHeight: "90vh",
              overflow: "auto",
              padding: 0,
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                padding: 14,
                borderBottom: "1px solid rgba(0,0,0,0.1)",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    aria-hidden="true"
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 14,
                      display: "grid",
                      placeItems: "center",
                      background: "rgba(0,255,251,0.12)",
                      border: "1px solid rgba(0,0,0,0.08)",
                      flex: "0 0 auto",
                    }}
                  >
                    <span style={{ fontSize: 18 }}>📌</span>
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <strong className="ots-brand-heading" style={{ fontSize: 18, color: "#111" }}>
                      Welcome to OnTheSpot
                    </strong>
                    <div style={{ marginTop: 2, fontSize: 13, color: "#555" }}>
                      A quick tour so the map doesn’t feel like a mysterious glowing rectangle.
                    </div>
                  </div>
                </div>

                {/* Progress */}
                <div style={{ marginTop: 10 }}>
                  <div
                    style={{
                      height: 8,
                      borderRadius: 999,
                      background: "rgba(0,0,0,0.06)",
                      overflow: "hidden",
                      border: "1px solid rgba(0,0,0,0.06)",
                    }}
                    aria-label="Onboarding progress"
                    role="progressbar"
                    aria-valuenow={onboardingStep + 1}
                    aria-valuemin={1}
                    aria-valuemax={ONBOARDING_STEPS.length}
                  >
                    <div
                      style={{
                        width: `${Math.round(((onboardingStep + 1) / ONBOARDING_STEPS.length) * 100)}%`,
                        height: "100%",
                        background:
                          "linear-gradient(90deg, rgba(0,255,251,0.55), rgba(255,183,0,0.55))",
                      }}
                    />
                  </div>
                  <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
                    Step {onboardingStep + 1} of {ONBOARDING_STEPS.length}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={hideOnboardingForNow}
                disabled={savingOnboarding}
                className="ots-btn"
                style={{
                  padding: "8px 12px",
                  borderRadius: 12,
                  background: "white",
                  flex: "0 0 auto",
                }}
                title="Close (show later)"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div style={{ display: "grid", gap: 12, padding: 16 }}>
              <div
                className="ots-surface ots-surface--border"
                style={{ padding: 14, display: "flex", gap: 12, alignItems: "flex-start" }}
              >
                <div
                  aria-hidden="true"
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 14,
                    display: "grid",
                    placeItems: "center",
                    background: "rgba(0,0,0,0.04)",
                    border: "1px solid rgba(0,0,0,0.06)",
                    flex: "0 0 auto",
                    fontSize: 20,
                  }}
                >
                  {ONBOARDING_STEPS[onboardingStep]?.icon}
                </div>

                <div style={{ minWidth: 0 }}>
                  <div className="ots-brand-heading ots-brand-heading--gold" style={{ fontWeight: 900, color: "#111", fontSize: 16 }}>
                    {ONBOARDING_STEPS[onboardingStep]?.title}
                  </div>
                  <div
                    className="ots-story-text"
                    style={{ marginTop: 6, color: "#333", lineHeight: 1.35, fontSize: 15 }}
                  >
                    {ONBOARDING_STEPS[onboardingStep]?.body}
                  </div>
                </div>
              </div>

              {/* Step dots */}
              <div style={{ display: "flex", gap: 8, justifyContent: "center", paddingTop: 2 }}>
                {ONBOARDING_STEPS.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setOnboardingStep(i)}
                    aria-label={`Go to step ${i + 1}`}
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 999,
                      border: "1px solid rgba(0,0,0,0.15)",
                      background: i === onboardingStep ? "#111" : "rgba(0,0,0,0.10)",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  />
                ))}
              </div>

              {/* Footer */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                  marginTop: 4,
                }}
              >
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button
                    type="button"
                    className="ots-btn"
                    disabled={savingOnboarding || onboardingStep === 0}
                    onClick={() => setOnboardingStep((s) => Math.max(0, s - 1))}
                  >
                    ← Back
                  </button>

                  {onboardingStep < ONBOARDING_STEPS.length - 1 ? (
                    <button
                      type="button"
                      className="ots-btn"
                      disabled={savingOnboarding}
                      onClick={() => setOnboardingStep((s) => Math.min(ONBOARDING_STEPS.length - 1, s + 1))}
                      style={{
                        borderColor: "rgba(0,0,0,0.18)",
                        background:
                          "linear-gradient(180deg, rgba(0,255,251,0.20), rgba(0,255,251,0.08))",
                        fontWeight: 800,
                      }}
                    >
                      Next →
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={dismissOnboarding}
                      disabled={savingOnboarding}
                      className="ots-btn"
                      style={{
                        border: "1px solid rgba(0,0,0,0.2)",
                        background: "#111",
                        color: "white",
                        cursor: "pointer",
                        fontWeight: 900,
                      }}
                    >
                      {savingOnboarding ? "Saving…" : "Finish"}
                    </button>
                  )}
                </div>

                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <button
                    type="button"
                    onClick={hideOnboardingForNow}
                    disabled={savingOnboarding}
                    className="ots-btn"
                    style={{
                      padding: "8px 12px",
                      borderRadius: 999,
                      background: "white",
                    }}
                    title="Close for now"
                  >
                    Show later
                  </button>

                  <div style={{ fontSize: 12, color: "#666" }}>
                    Saved to your profile when you finish.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {!isPlacePackPreview && <FiltersSheet
        showFilters={showFilters}
        isMobile={isMobile}
        filterSheetDragY={filterSheetDragY}
        searchText={searchText}
        setSearchText={setSearchText}
        categoryFilter={categoryFilter}
        setCategoryFilter={setCategoryFilter}
        visibilityFilter={visibilityFilter}
        setVisibilityFilter={setVisibilityFilter}
        eraFilter={eraFilter}
        setEraFilter={setEraFilter}
        tagFilter={tagFilter}
        setTagFilter={setTagFilter}
        radiusM={radiusM}
        setRadiusM={setRadiusM}
        importedOnly={importedOnly}
        setImportedOnly={setImportedOnly}
        availableTags={availableTags}
        categoriesLoaded={categoriesLoaded}
        categories={categories}
        isAdmin={isAdmin}
        addHref={addHref}
        onClose={() => setShowFilters(false)}
        onOverlayClose={() => setShowFilters(false)}
        onTouchStart={onFilterSheetTouchStart}
        onTouchMove={onFilterSheetTouchMove}
        onTouchEnd={onFilterSheetTouchEnd}
        onResetFilters={() => {
          setSearchText("");
          setCategoryFilter("all");
          setVisibilityFilter("all");
          setEraFilter("all");
          setTagFilter("all");
          setImportedOnly(false);
          setRadiusM(2500);
        }}
      />}

      {/* MAIN CONTENT */}
      <div style={{ height: "100%", display: "flex", minHeight: 0, flexDirection: "column" }}>
        {isMobile && !isPlacePackPreview && (
          <div
            style={{
              display: "grid",
              gap: 8,
              padding: "8px 12px 6px",
              background: "rgba(255,255,255,0.92)",
              backdropFilter: "blur(8px)",
              borderBottom: "1px solid rgba(0,0,0,0.06)",
            }}
          >
            <div
              style={{
                display: "flex",
                gap: 8,
                overflowX: "auto",
                WebkitOverflowScrolling: "touch",
              }}
            >
              {mobileQuickChips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={chip.onClick}
                  style={{
                    flex: "0 0 auto",
                    padding: "8px 12px",
                    borderRadius: 999,
                    border: chip.active
                      ? "1px solid rgba(0,0,0,0.22)"
                      : "1px solid rgba(0,0,0,0.12)",
                    background: chip.active ? "rgba(0,255,251,0.16)" : "white",
                    color: "#111",
                    fontWeight: chip.active ? 800 : 700,
                    cursor: "pointer",
                    boxShadow: chip.active ? "0 4px 12px rgba(0,0,0,0.08)" : "none",
                    whiteSpace: "nowrap",
                  }}
                >
                  {chip.label}
                </button>
              ))}
            </div>

            {availableTags.length > 0 && (
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  overflowX: "auto",
                  WebkitOverflowScrolling: "touch",
                }}
              >
                <button
                  type="button"
                  onClick={() => setTagFilter("all")}
                  style={{
                    flex: "0 0 auto",
                    padding: "6px 10px",
                    borderRadius: 999,
                    border: tagFilter === "all"
                      ? "1px solid rgba(0,0,0,0.22)"
                      : "1px solid rgba(0,0,0,0.12)",
                    background: tagFilter === "all" ? "rgba(0,255,251,0.16)" : "white",
                    color: "#111",
                    fontWeight: tagFilter === "all" ? 800 : 700,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  All tags
                </button>

                {availableTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setTagFilter(tag)}
                    style={{
                      flex: "0 0 auto",
                      padding: "6px 10px",
                      borderRadius: 999,
                      border: tagFilter === tag
                        ? "1px solid rgba(0,0,0,0.22)"
                        : "1px solid rgba(0,0,0,0.12)",
                      background: tagFilter === tag ? "rgba(0,255,251,0.16)" : "white",
                      color: "#111",
                      fontWeight: tagFilter === tag ? 800 : 700,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ height: "100%", display: "flex", minHeight: 0 }}>
        <div
          className="ots-layout"
          style={{
            height: "100%",
            width: "100%",
            minHeight: 0,
            position: "relative",
            display: isMobile || isPlacePackPreview ? "block" : undefined,
          }}
        >
          {/* Nearby list: desktop sidebar, mobile bottom sheet */}
            {!isPlacePackPreview && <NearbySheet
              isMobile={isMobile}
              mobileListSnap={mobileListSnap}
              mobileListExpanded={mobileListExpanded}
              mobileListDragY={mobileListDragY}

              onMobileListTouchStart={onMobileListTouchStart}
              onMobileListTouchMove={onMobileListTouchMove}
              onMobileListTouchEnd={onMobileListTouchEnd}
              onCycleMobileListSnap={cycleMobileListSnap}

              rankedFilteredSpots={rankedFilteredSpots}
              selectedSpotId={selected?.id ?? null}
              userId={userId}

              loadingSpots={loadingSpots}
              spotsError={spotsError}

              addHref={addHref}

              onSelectSpot={selectSpot}
              onDeleteSpot={deleteSpot}

              nearbySheetPeekMinHeight={NEARBY_SHEET_SNAP.peek}
              mobileListHeightForSnap={mobileListHeightForSnap}

              formatDistance={formatDistance}
              formatStoryDate={formatStoryDate}
              storyPeriodLabel={storyPeriodLabel}
              effectiveTimeScale={effectiveTimeScale}
              sourceBadgeLabel={sourceBadgeLabel}
              visibilityStoryLabel={visibilityStoryLabel}
              dedupeChronologyTags={dedupeChronologyTags}

              VisibilityBadge={VisibilityBadge}
              TagPills={TagPills}
            />}
          

          {/* Right panel: Map */}
          <MapView
            pos={pos}
            map={map}
            setMap={setMap}
            setMapCenter={setMapCenter}
            setViewportRadiusM={setViewportRadiusM}
            setViewportBounds={setViewportBounds}
            setCrosshairPulseKey={setCrosshairPulseKey}
            selected={selected}
            pulsingMarkerId={pulsingMarkerId}
            rankedFilteredSpots={rankedFilteredSpots}
            shouldClusterMarkers={shouldClusterMarkers}
            temporalClusterGroups={temporalClusterGroups}
            clusterStyles={clusterStyles}
            clusterCalculator={clusterCalculator}
            markerIconForUser={markerIconForUser}
            markerIconForVisibility={markerIconForVisibility}
            onMapClick={() => {
              if (!isPlacePackPreview) setSelected(null);
            }}
            onSelectSpot={selectSpot}
            crosshairPulseKey={crosshairPulseKey}
            addHref={addHref}
            isMobile={isPlacePackPreview ? true : isMobile}
            mobileListSnap={mobileListSnap}
            selectedSheetSnap={selectedSheetSnap}
            selectedSheetIsPeek={selectedSheetIsPeek}
            selectedSheetIsHalf={selectedSheetIsHalf}
            selectedSheetIsFull={selectedSheetIsFull}
            selectedSheetHeightForSnap={selectedSheetHeightForSnap}
            spotSheetDragY={spotSheetDragY}
            onSpotSheetTouchStart={onSpotSheetTouchStart}
            onSpotSheetTouchMove={onSpotSheetTouchMove}
            onSpotSheetTouchEnd={onSpotSheetTouchEnd}
            cycleSelectedSheetSnap={cycleSelectedSheetSnap}
            onCloseSelected={() => setSelected(null)}
            spotSheetPeekMinHeight={SPOT_SHEET_SNAP.peek}
            selectedStoryParts={selectedStoryParts}
            selectedStoryDate={selectedStoryDate}
            selectedSourceBadge={selectedSourceBadge}
            selectedStoryPeriod={selectedStoryPeriod}
            selectedVisibilityLabel={selectedVisibilityLabel}
            placeThroughTimeSpots={placeThroughTimeSpots}
            placeThroughTimeEraLabel={placeThroughTimeEraLabel}
            formatDistance={formatDistance}
            formatStoryDate={formatStoryDate}
            VisibilityBadge={VisibilityBadge}
            TagPills={TagPills}
          />
        </div>
      </div>
      </div>
    </AppShell>
  );
}
