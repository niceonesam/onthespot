"use client";

import { useEffect, useRef, useState } from "react";
import { GoogleMap, MarkerF, MarkerClustererF, useLoadScript } from "@react-google-maps/api";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import Link from "next/link";
import AppShell from "@/components/AppShell";

type Spot = {
  id: string;
  user_id: string;
  title: string;
  description: string;
  category: string;
  tags?: string[] | null;
  photo_url: string | null;
  photo_path: string | null;
  what3words: string | null;
  date_start: string | null;
  source_url: string | null;
  created_at: string;
  visibility: "public" | "friends" | "private" | "group";
  group_id: string | null;
  distance_m: number;
  lat_out: number;
  lng_out: number;
  is_imported: boolean;
};

type SpotCategory = { id: string; label: string };

const CURRENT_ONBOARDING_VERSION = 1;

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

function formatDistance(meters: number) {
  if (!Number.isFinite(meters)) return "";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
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

function clusterBubbleDataUrl(fill: string, stroke: string) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <defs>
        <radialGradient id="clusterGlow" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.95" />
          <stop offset="18%" stop-color="#7ff7eb" />
          <stop offset="68%" stop-color="${fill}" />
          <stop offset="100%" stop-color="${stroke}" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="26" fill="url(#clusterGlow)" stroke="rgba(0,0,0,0.22)" stroke-width="2" />
      <circle cx="32" cy="32" r="18" fill="rgba(255,255,255,0.16)" />
    </svg>
  `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export default function HomePage() {
  const supabase = getSupabaseBrowser();

  const { isLoaded } = useLoadScript({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!,
  });

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
  const [crosshairPulseKey, setCrosshairPulseKey] = useState(0);
  const markerPulseTimeoutRef = useRef<number | null>(null);
  const mapPanTimeoutRef = useRef<number | null>(null);

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
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [visibilityFilter, setVisibilityFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("all");
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

  const filteredSpots = spots.filter((s) => {
    const catOk = categoryFilter === "all" || s.category === categoryFilter;
    const vis = (s as any).visibility ?? "public";
    const visOk = visibilityFilter === "all" || vis === visibilityFilter;
    return catOk && visOk;
  });

  const availableTags = Array.from(
    new Set(
      spots.flatMap((s) => (s.tags ?? []).map((t) => String(t).trim()).filter(Boolean))
    )
  )
    .sort((a, b) => a.localeCompare(b))
    .slice(0, 16);

  const selectedCategoryLabel =
    categoryFilter === "all"
      ? null
      : categories.find((c) => c.id === categoryFilter)?.label ?? "Category";

  const activeFilterParts = [
    radiusM !== 2500 ? formatDistance(radiusM) : null,
    selectedCategoryLabel,
    visibilityFilter !== "all"
      ? visibilityFilter.charAt(0).toUpperCase() + visibilityFilter.slice(1)
      : null,
    tagFilter !== "all" ? `#${tagFilter}` : null,
    importedOnly ? "Imported" : null,
    searchText.trim() ? `“${searchText.trim()}”` : null,
  ].filter(Boolean) as string[];

  const filterSummary = activeFilterParts.length
    ? activeFilterParts.join(" • ")
    : null;

  const mobileListExpanded = mobileListSnap !== "peek";
  const mobileSnapOrder: Array<"peek" | "half" | "full"> = ["peek", "half", "full"];
  const shouldClusterMarkers = filteredSpots.length >= (isMobile ? 12 : 20);
  const clusterAnchorText: [number, number] = [0, 0];
  const clusterStyles = [
    {
      url: clusterBubbleDataUrl("#00dbc1", "#00bfa9"),
      height: 52,
      width: 52,
      textColor: "#111111",
      textSize: 17,
      fontWeight: "800",
      anchorText: clusterAnchorText,
    },
    {
      url: clusterBubbleDataUrl("#00dbc1", "#00bfa9"),
      height: 58,
      width: 58,
      textColor: "#111111",
      textSize: 17,
      fontWeight: "800",
      anchorText: clusterAnchorText,
    },
    {
      url: clusterBubbleDataUrl("#00dbc1", "#00bfa9"),
      height: 64,
      width: 64,
      textColor: "#111111",
      textSize: 16,
      fontWeight: "800",
      anchorText: clusterAnchorText,
    },
  ];

  function cycleMobileListSnap() {
    setMobileListSnap((prev) =>
      prev === "peek" ? "half" : prev === "half" ? "full" : "peek"
    );
    vibrateLight();
  }

  function mobileListHeightForSnap() {
    return mobileListSnap === "peek"
      ? 92
      : mobileListSnap === "half"
        ? 320
        : 640;
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
      active: visibilityFilter === "all" && !importedOnly,
      onClick: () => {
        setVisibilityFilter("all");
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
    navigator.geolocation.getCurrentPosition(
      (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setPos({ lat: 51.5074, lng: -0.1278 }), // fallback: London
    );
  }, []);

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
    return () => {
      if (markerPulseTimeoutRef.current != null) {
        window.clearTimeout(markerPulseTimeoutRef.current);
      }
      if (mapPanTimeoutRef.current != null) {
        window.clearTimeout(mapPanTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!pos) return;
    (async () => {
      const { data, error } = await supabase.rpc("spots_nearby", {
        lat: pos.lat,
        lng: pos.lng,
        radius_m: radiusM,
        category: categoryFilter === "all" ? null : categoryFilter,
        visibility: visibilityFilter === "all" ? null : visibilityFilter,
        tag_filter: tagFilter === "all" ? null : tagFilter,
        q: searchText.trim() ? searchText.trim() : null,
        imported_only: importedOnly,
      });
      if (!error && data) setSpots(data as Spot[]);
    })();
  }, [pos, radiusM, categoryFilter, searchText, importedOnly, supabase, visibilityFilter, tagFilter]);

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
        JSON.stringify({ radiusM, searchText, categoryFilter, visibilityFilter, tagFilter, importedOnly })
      );
    } catch {
      // ignore storage errors
    }
  }, [radiusM, searchText, categoryFilter, visibilityFilter, tagFilter, importedOnly]);

  if (!isLoaded || !pos) return <div style={{ padding: 16 }}>Loading…</div>;

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
    }, 260);

    if (mapPanTimeoutRef.current != null) {
      window.clearTimeout(mapPanTimeoutRef.current);
      mapPanTimeoutRef.current = null;
    }

    if (map) {
      map.panTo({ lat: s.lat_out, lng: s.lng_out });

      const z = map.getZoom();
      if (typeof z === "number" && z < 13) map.setZoom(13);

      if (isMobile) {
        mapPanTimeoutRef.current = window.setTimeout(() => {
          map.panBy(0, 136);
          mapPanTimeoutRef.current = null;
        }, 110);
      }
    }
  }

  function markerIconForVisibility(
    v?: string | null,
    isSelected = false,
    isPulsing = false
  ): google.maps.Icon {
    const color =
      v === "friends" ? "#2563eb" :
      v === "group" ? "#7c3aed" :
      v === "private" ? "#6b7280" :
      "#00dbc1"; // public

    const size = isPulsing ? 44 : isSelected ? 36 : 28;
    const anchorX = size / 2;
    const anchorY = size;
    const innerR = isPulsing ? 3.8 : isSelected ? 3.2 : 2.6;
    const stroke = isPulsing
      ? "rgba(0,0,0,0.70)"
      : isSelected
        ? "rgba(0,0,0,0.55)"
        : "rgba(0,0,0,0.35)";

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">
    <path d="M12 22s7-4.35 7-11a7 7 0 1 0-14 0c0 6.65 7 11 7 11z" fill="${color}" stroke="${stroke}" stroke-width="1.2"/>
    <circle cx="12" cy="11" r="${innerR}" fill="white" fill-opacity="0.95"/>
  </svg>`;

    return {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
      scaledSize: new google.maps.Size(size, size),
      anchor: new google.maps.Point(anchorX, anchorY),
    };
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
    return selectedSheetSnap === "peek"
      ? 148
      : selectedSheetSnap === "half"
        ? 360
        : 620;
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
      subtitle="Nearby stories on the map"
      fullBleed
      right={
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: 10,
            color: "#333",
          }}
        >
          {/* Desktop controls */}
          <div className="ots-header-controls">
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
              Radius:
              <select
                value={radiusM}
                onChange={(e) => setRadiusM(Number(e.target.value))}
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

            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
              Visibility:
              <select value={visibilityFilter} onChange={(e) => setVisibilityFilter(e.target.value)}>
                <option value="all">All</option>
                <option value="public">Public</option>
                <option value="friends">Friends</option>
                <option value="group">Group</option>
                <option value="private">Private</option>
              </select>
            </label>

            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
              Category:
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="all">All</option>
                {(categoriesLoaded ? categories : []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>

            <input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search…"
              style={{
                padding: "6px 10px",
                borderRadius: 12,
                border: "1px solid rgba(0,0,0,0.2)",
                width: 180,
              }}
            />

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
                </div>
              </details>
            )}

            <Link href={addHref}>Add Spot</Link>
            <Link href="/account">Account</Link>

            <form action="/auth/logout" method="post">
              <button type="submit">Log out</button>
            </form>
          </div>

          {/* Mobile button */}
          <button
            className="ots-filters-btn"
            type="button"
            onClick={() => setShowFilters(true)}
            title={filterSummary ?? "Filters"}
          >
            {filterSummary ? `Filters • ${filterSummary}` : "Filters"}
          </button>
        </div>
      }
    >
      {showOnboarding && !checkingOnboarding && (
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
                    <strong style={{ fontSize: 18, color: "#111" }}>Welcome to OnTheSpot</strong>
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
                  <div style={{ fontWeight: 900, color: "#111", fontSize: 16 }}>
                    {ONBOARDING_STEPS[onboardingStep]?.title}
                  </div>
                  <div style={{ marginTop: 6, color: "#333", lineHeight: 1.35 }}>
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

      {showFilters && (
        <div
          className="ots-sheet-overlay"
          onClick={() => setShowFilters(false)} // tap outside closes
        >
          <div
            className="ots-sheet"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={onFilterSheetTouchStart}
            onTouchMove={onFilterSheetTouchMove}
            onTouchEnd={onFilterSheetTouchEnd}
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
                      onClick={() => setShowFilters(false)}
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
                      onClick={() => setShowFilters(false)}
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
                  onClick={() => setShowFilters(false)}
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
                  onClick={() => setShowFilters(false)}
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
                  onClick={() => {
                    setSearchText("");
                    setCategoryFilter("all");
                    setVisibilityFilter("all");
                    setTagFilter("all");
                    setImportedOnly(false);
                    setRadiusM(2500);
                  }}
                  style={{ flex: 1, fontWeight: 700 }}
                >
                  Reset filters
                </button>

                <button
                  type="button"
                  className="ots-btn"
                  onClick={() => setShowFilters(false)}
                  style={{ flex: 1, fontWeight: 800 }}
                >
                  Show results
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MAIN CONTENT */}
      <div style={{ height: "100%", display: "flex", minHeight: 0, flexDirection: "column" }}>
        {isMobile && (
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
            display: isMobile ? "block" : undefined,
          }}
        >
          {/* Nearby list: desktop sidebar, mobile bottom sheet */}
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
                      height: isMobile
                        ? `min(calc(100vh - 24px), ${Math.max(92, mobileListHeightForSnap() - mobileListDragY)}px)`
                        : undefined,
                      borderRadius: 16,
                      boxShadow: "0 16px 40px rgba(0,0,0,0.22)",
                      overflow: "hidden",
                      background: "white",
                      transition: mobileListDragY ? "none" : "height 320ms cubic-bezier(0.16, 1, 0.3, 1)",
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
                onClick={isMobile ? cycleMobileListSnap : undefined}
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
                        {filteredSpots.length} found nearby {mobileListSnap === "peek" ? "• tap to expand" : mobileListSnap === "half" ? "• tap for full list" : ""}
                      </div>
                    )}
                  </div>

                  {isMobile && (
                    <button
                      type="button"
                      className="ots-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        cycleMobileListSnap();
                      }}
                      style={{ padding: "8px 10px", borderRadius: 999 }}
                    >
                      {mobileListSnap === "peek" ? "Show" : mobileListSnap === "half" ? "Full" : "Hide"}
                    </button>
                  )}
                </div>

                {isMobile && mobileListSnap === "peek" && filteredSpots.length > 0 && (
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
                        <div style={{ fontWeight: 900, color: "#111", lineHeight: 1.15, fontSize: 16 }}>
                          {filteredSpots[0].title}
                        </div>
                        <TagPills tags={filteredSpots[0].tags} max={2} />
                        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                          {filteredSpots[0].what3words ? `///${filteredSpots[0].what3words}` : "Tap to browse nearby stories"}
                        </div>
                      </div>

                      <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.8, whiteSpace: "nowrap" }}>
                        {formatDistance(filteredSpots[0].distance_m)}
                      </div>
                    </div>

                    <div
                      style={{
                        fontSize: 13,
                        opacity: 0.8,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                        lineHeight: 1.35,
                      }}
                    >
                      {filteredSpots[0].description}
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
                  {filteredSpots.length === 0 ? (
                    <p style={{ opacity: 0.7 }}>No Spots found with these filters.</p>
                  ) : (
                    <div style={{ display: "grid", gap: 10 }}>
                      {filteredSpots.map((s) => (
                        <div
                          key={s.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => selectSpot(s)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              selectSpot(s);
                            }
                          }}
                          style={{
                            textAlign: "left",
                            padding: 12,
                            borderRadius: 14,
                            border:
                              selected?.id === s.id
                                ? "2px solid black"
                                : "1px solid rgba(0,0,0,0.10)",
                            background:
                              selected?.id === s.id ? "rgba(0,0,0,0.05)" : "white",
                            cursor: "pointer",
                            boxShadow:
                              selected?.id === s.id
                                ? "0 8px 24px rgba(0,0,0,0.10)"
                                : "0 2px 10px rgba(0,0,0,0.04)",
                            transition:
                              "transform 140ms ease, box-shadow 180ms ease, background 180ms ease, border-color 180ms ease",
                            WebkitTapHighlightColor: "transparent",
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
                              <div style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 0 }}>
                                <strong style={{ lineHeight: 1.15, fontSize: 16, color: "#111" }}>{s.title}</strong>
                                <VisibilityBadge visibility={s.visibility} />
                              </div>
                              <TagPills tags={s.tags} max={3} />
                            </div>

                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                              <span style={{ opacity: 0.75, whiteSpace: "nowrap" }}>
                                {formatDistance(s.distance_m)}
                              </span>

                              {userId && s.user_id === userId && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteSpot(s);
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

                          <div style={{ opacity: 0.68, fontSize: 12, marginTop: 6, lineHeight: 1.3 }}>
                            {s.what3words ? `///${s.what3words}` : ""}
                          </div>

                          <div
                            style={{
                              marginTop: 6,
                              opacity: 0.85,
                              lineHeight: 1.4,
                              display: "-webkit-box",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical",
                              overflow: "hidden",
                            }}
                          >
                            {s.description}
                          </div>

                          <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <a
                              href={`https://www.google.com/maps/dir/?api=1&destination=${s.lat_out},${s.lng_out}`}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                padding: "7px 10px",
                                borderRadius: 999,
                                border: "1px solid rgba(0,0,0,0.14)",
                                textDecoration: "none",
                                color: "#111",
                                fontWeight: 700,
                                background: "rgba(0,255,251,0.10)",
                              }}
                            >
                              📍 Navigate
                            </a>
                          </div>
                        </div>
                      ))}
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
          

          {/* Right panel: Map */}
          <div className="ots-map">
            <GoogleMap
              mapContainerStyle={{ width: "100%", height: "100%" }}
              center={pos}
              zoom={14}
              options={{ streetViewControl: false, mapTypeControl: false }}
              onLoad={(m) => {
                setMap(m);
                const c = m.getCenter();
                if (c) setMapCenter({ lat: c.lat(), lng: c.lng() });
              }}
              onIdle={() => {
                if (!map) return;
                const c = map.getCenter();
                if (c) setMapCenter({ lat: c.lat(), lng: c.lng() });
                setCrosshairPulseKey((k) => k + 1);
              }}
              onClick={() => setSelected(null)}
            >
              <MarkerF position={pos} title="You" />

              {shouldClusterMarkers ? (
                <MarkerClustererF
                  options={{
                    minimumClusterSize: 2,
                    gridSize: isMobile ? 44 : 56,
                    maxZoom: 16,
                    styles: clusterStyles,
                    clusterClass: "ots-map-cluster",
                  }}
                >
                  {(clusterer) => (
                    <>
                      {filteredSpots.map((s) => (
                        <MarkerF
                          key={s.id}
                          clusterer={selected?.id === s.id ? undefined : clusterer}
                          position={{ lat: s.lat_out, lng: s.lng_out }}
                          title={s.title}
                          icon={markerIconForVisibility(
                            (s as any).visibility,
                            selected?.id === s.id,
                            pulsingMarkerId === s.id
                          )}
                          zIndex={selected?.id === s.id ? 1000 : undefined}
                          onClick={() => {
                            selectSpot(s);
                          }}
                        />
                      ))}
                    </>
                  )}
                </MarkerClustererF>
              ) : (
                filteredSpots.map((s) => (
                  <MarkerF
                    key={s.id}
                    position={{ lat: s.lat_out, lng: s.lng_out }}
                    title={s.title}
                    icon={markerIconForVisibility(
                      (s as any).visibility,
                      selected?.id === s.id,
                      pulsingMarkerId === s.id
                    )}
                    zIndex={selected?.id === s.id ? 1000 : undefined}
                    onClick={() => {
                      selectSpot(s);
                    }}
                  />
                ))
              )}
            </GoogleMap>

            {!selected && (
              <div
                key={crosshairPulseKey}
                className="ots-crosshair ots-crosshair--pulse"
              />
            )}

            {selected && (
              <div
                className="ots-surface ots-surface--shadow"
                onTouchStart={onSpotSheetTouchStart}
                onTouchMove={onSpotSheetTouchMove}
                onTouchEnd={onSpotSheetTouchEnd}
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backdropFilter: "blur(10px)",
                  borderTopLeftRadius: 18,
                  borderTopRightRadius: 18,
                  padding: 16,
                  height: `min(calc(100vh - 24px), ${Math.max(148, selectedSheetHeightForSnap() - spotSheetDragY)}px)`,
                  overflowY: "auto",
                  boxShadow: "0 -10px 40px rgba(0,0,0,0.25)",
                  transform: undefined,
                  transition: spotSheetDragY ? "none" : "height 320ms cubic-bezier(0.16, 1, 0.3, 1)",
                  willChange: "height",
                }}
              >
                <button
                  type="button"
                  onClick={cycleSelectedSheetSnap}
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
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 0, flexWrap: "wrap" }}>
                      <h3
                        style={{
                          margin: 0,
                          fontSize: selectedSheetIsPeek ? 18 : 22,
                          lineHeight: 1.15,
                        }}
                      >
                        {selected.title}
                      </h3>
                      <VisibilityBadge visibility={selected.visibility} />
                    </div>
                    <TagPills tags={selected.tags} max={selectedSheetIsPeek ? 3 : 6} />
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelected(null)}
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

                <div style={{ opacity: 0.75, marginTop: 8, fontSize: 14 }}>
                  {selected.what3words ? `///${selected.what3words}` : null}
                  {selected.distance_m ? `${selected.what3words ? " • " : ""}${formatDistance(selected.distance_m)} away` : null}
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
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

                  {!selectedSheetIsPeek && selected.source_url && (
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

                {!selectedSheetIsPeek && selected.photo_url && (
                  <img
                    src={selected.photo_url}
                    alt={selected.title}
                    style={{
                      width: "100%",
                      borderRadius: 12,
                      marginTop: 12,
                      maxHeight: selectedSheetIsHalf ? 180 : 240,
                      objectFit: "cover",
                    }}
                  />
                )}

                {!selectedSheetIsPeek && selected.date_start && (
                  <p style={{ opacity: 0.7, marginTop: 8 }}>{selected.date_start}</p>
                )}

                {!selectedSheetIsPeek && (
                  <p style={{ marginTop: 10 }}>
                    {selectedSheetIsHalf && selected.description.length > 180
                      ? selected.description.slice(0, 180) + "…"
                      : selected.description}
                  </p>
                )}

                {selectedSheetIsFull && (
                  <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                    {selected.source_url && (
                      <div style={{ fontSize: 14, color: "#444" }}>
                        Source available for this spot.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <Link
              href={addHref}
              style={{
                position: "absolute",
                right: 16,
                bottom: selected
                  ? selectedSheetSnap === "peek"
                    ? 164
                    : selectedSheetSnap === "half"
                      ? "44vh"
                      : "74vh"
                  : isMobile
                    ? mobileListSnap === "peek"
                      ? 108
                      : mobileListSnap === "half"
                        ? "42vh"
                        : "66vh"
                    : 16,
                width: 56,
                height: 56,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#00dbc1",
                color: "#111",
                fontSize: 28,
                fontWeight: 900,
                textDecoration: "none",
                boxShadow: "0 10px 28px rgba(0,0,0,0.25)",
                zIndex: 50,
              }}
              title="Add Spot"
            >
              +
            </Link>
          </div>
        </div>
      </div>
      </div>
    </AppShell>
  );
}
