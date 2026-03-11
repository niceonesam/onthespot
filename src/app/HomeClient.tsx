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
  time_scale_out?: "human" | "ancient" | "geological" | string | null;
  period_label_out?: string | null;
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

  const km = meters / 1000;

  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

function splitStory(description: string) {
  const parts = description.trim().split(/(?<=[.!?])\s+/);
  const intro = parts.slice(0, 2).join(" ").trim();
  const rest = parts.slice(2).join(" ").trim();
  return { intro, rest };
}

function formatStoryDate(date?: string | null) {
  if (!date) return null;

  const d = date.trim();

  // ---- BP / cal BP formats (e.g. "12900 BP", "11700 cal BP")
  const bpMatch = d.match(/^([\d,]+(?:\.\d+)?)\s*(cal\s*)?bp$/i);
  if (bpMatch) {
    const raw = Number(bpMatch[1].replace(/,/g, ""));
    const isCal = Boolean(bpMatch[2]);

    if (Number.isFinite(raw)) {
      const rounded = raw >= 1000 ? Math.round(raw) : Number(raw.toFixed(1));
      return isCal
        ? `${rounded.toLocaleString()} cal BP`
        : `${rounded.toLocaleString()} BP`;
    }
  }

  // ---- Named Late Glacial / palaeoenvironmental events
  if (/younger\s+dryas/i.test(d)) return "Younger Dryas";
  if (/late\s+glacial/i.test(d)) return "Late Glacial";
  if (/b[øo]lling[-–\s]*aller[øo]d/i.test(d)) return "Bølling–Allerød";
  if (/older\s+dryas/i.test(d)) return "Older Dryas";

  // ---- Pure year (e.g. "1874")
  const yearOnly = /^-?\d{1,6}$/.test(d) ? Number(d) : null;
  if (yearOnly !== null) {
    if (yearOnly >= 1800 && yearOnly <= 1899) return `${yearOnly}s`;
    if (yearOnly >= 1900 && yearOnly <= 1999) return `${yearOnly}s`;
    if (yearOnly >= 2000 && yearOnly <= 2099) return `${yearOnly}s`;

    if (yearOnly < 0) {
      const abs = Math.abs(yearOnly);
      return `${abs.toLocaleString()} BC`;
    }

    if (yearOnly >= 1 && yearOnly < 500) return `${yearOnly} AD`;
    if (yearOnly >= 500 && yearOnly < 1500) return `${yearOnly} AD`;
    if (yearOnly >= 1500 && yearOnly < 1800) return `${yearOnly} AD`;

    return String(yearOnly);
  }

  // ---- Geological shorthand (e.g. "150Ma", "2.4Ga")
  const geoMatch = d.match(/^([\d.]+)\s*(ka|ma|ga)$/i);
  if (geoMatch) {
    const value = Number(geoMatch[1]);
    const unit = geoMatch[2].toLowerCase();

    if (unit === "ka") return `${value} thousand years ago`;
    if (unit === "ma") return `${value} million years ago`;
    if (unit === "ga") return `${value} billion years ago`;
  }

  // ---- Already geological phrases
  if (/million years/i.test(d)) return d;
  if (/billion years/i.test(d)) return d;
  if (/thousand years/i.test(d)) return d;

  // ---- Named geological periods
  const periods = [
    "Cambrian",
    "Ordovician",
    "Silurian",
    "Devonian",
    "Carboniferous",
    "Permian",
    "Triassic",
    "Jurassic",
    "Cretaceous",
    "Paleogene",
    "Neogene",
    "Quaternary",
    "Holocene",
    "Pleistocene",
  ];

  for (const p of periods) {
    if (d.toLowerCase().includes(p.toLowerCase())) {
      return p;
    }
  }

  try {
    return new Date(d).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return d;
  }
}

function classifyTimeScale(date?: string | null) {
  if (!date) return { scale: "human", color: "#1FB6A6" };

  const d = date.trim().toLowerCase();

  // BP / cal BP formats
  const bpMatch = d.match(/^([\d,]+(?:\.\d+)?)\s*(cal\s*)?bp$/i);
  if (bpMatch) {
    const raw = Number(bpMatch[1].replace(/,/g, ""));
    if (Number.isFinite(raw)) {
      if (raw >= 11700) {
        return { scale: "geological", color: "#6b21a8" };
      }
      return { scale: "ancient", color: "#E6B325" };
    }
  }

  // Named Late Glacial / palaeoenvironmental phases
  if (
    d.includes("younger dryas") ||
    d.includes("late glacial") ||
    d.includes("older dryas") ||
    d.includes("bølling") ||
    d.includes("bolling") ||
    d.includes("allerød") ||
    d.includes("allerod")
  ) {
    return { scale: "geological", color: "#6b21a8" };
  }

  // Geological shorthand like 150Ma, 2.4Ga, 12ka
  const geo = d.match(/^([\d.]+)\s*(ka|ma|ga)$/i);
  if (geo) {
    const unit = geo[2].toLowerCase();
    if (unit === "ma" || unit === "ga") {
      return { scale: "geological", color: "#6b21a8" };
    }
    if (unit === "ka") {
      return { scale: "ancient", color: "#E6B325" };
    }
  }

  // Geological period names
  const geoPeriods = [
    "cambrian",
    "ordovician",
    "silurian",
    "devonian",
    "carboniferous",
    "permian",
    "triassic",
    "jurassic",
    "cretaceous",
    "paleogene",
    "neogene",
    "quaternary",
    "holocene",
    "pleistocene",
  ];

  if (geoPeriods.some((p) => d.includes(p))) {
    return { scale: "geological", color: "#6b21a8" };
  }

  // BCE / BC and deep prehistory
  if (d.includes("bc") || d.includes("bce") || /^-\d+/.test(d)) {
    const numeric = /^-\d{1,6}$/.test(d) ? Math.abs(Number(d)) : null;
    if (numeric != null && numeric >= 11700) {
      return { scale: "geological", color: "#6b21a8" };
    }
    return { scale: "ancient", color: "#E6B325" };
  }

  return { scale: "human", color: "#1FB6A6" };
}

function effectiveTimeScale(
  spot: Pick<Spot, "date_start" | "time_scale_out"> | null | undefined
) {
  if (
    spot?.time_scale_out === "human" ||
    spot?.time_scale_out === "ancient" ||
    spot?.time_scale_out === "geological"
  ) {
    return {
      scale: spot.time_scale_out,
      color:
        spot.time_scale_out === "geological"
          ? "#6b21a8"
          : spot.time_scale_out === "ancient"
            ? "#E6B325"
            : "#1FB6A6",
    };
  }

  return classifyTimeScale(spot?.date_start);
}

function timeScaleKey(
  input: string | null | undefined | Pick<Spot, "date_start" | "time_scale_out">
): "human" | "ancient" | "geological" {
  if (input && typeof input === "object") {
    const result = effectiveTimeScale(input);
    if (result.scale === "ancient" || result.scale === "geological") {
      return result.scale;
    }
    return "human";
  }

  const result = classifyTimeScale(input ?? null);
  if (result.scale === "ancient" || result.scale === "geological") {
    return result.scale;
  }
  return "human";
}

function markerCoreColorForDate(
  input: string | null | undefined | Pick<Spot, "date_start" | "time_scale_out">
) {
  const scale = timeScaleKey(input);
  if (scale === "geological") return "#6b21a8";
  if (scale === "ancient") return "#E6B325";
  return "#1FB6A6";
}

function clusterPaletteForScale(scale: "human" | "ancient" | "geological") {
  if (scale === "geological") {
    return { ring: "#6b21a8", core: "#8b5cf6" };
  }
  if (scale === "ancient") {
    return { ring: "#E6B325", core: "#F2C94C" };
  }
  return { ring: "#1FB6A6", core: "#54d9cb" };
}

function markerTimeScaleFromIcon(icon: google.maps.Icon | google.maps.Symbol | string | null | undefined): "human" | "ancient" | "geological" {
  const raw = typeof icon === "string"
    ? icon
    : icon && typeof icon === "object" && "url" in icon
      ? String(icon.url ?? "")
      : "";

  if (raw.includes("ots-scale-geological")) return "geological";
  if (raw.includes("ots-scale-ancient")) return "ancient";
  return "human";
}

function geologicalPeriodFromMa(ma?: number | null) {
  if (!ma || !Number.isFinite(ma)) return null;

  if (ma < 0.012) return "Holocene";
  if (ma < 2.6) return "Pleistocene";
  if (ma < 23) return "Neogene";
  if (ma < 66) return "Paleogene";
  if (ma < 145) return "Cretaceous";
  if (ma < 201) return "Jurassic";
  if (ma < 252) return "Triassic";
  if (ma < 299) return "Permian";
  if (ma < 359) return "Carboniferous";
  if (ma < 419) return "Devonian";
  if (ma < 444) return "Silurian";
  if (ma < 485) return "Ordovician";
  return "Cambrian";
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

function dedupeChronologyTags(
  tags: string[] | null | undefined,
  date?: string | null,
  periodLabelOut?: string | null
) {
  const safeTags = Array.isArray(tags) ? tags : [];
  const dateLabel = formatStoryDate(date)?.trim().toLowerCase() ?? null;
  const periodLabel = (periodLabelOut ?? storyPeriodLabel(date))?.trim().toLowerCase() ?? null;

  return safeTags.filter((tag) => {
    const t = String(tag).trim().toLowerCase();
    if (!t) return false;
    if (dateLabel && t === dateLabel) return false;
    if (periodLabel && t === periodLabel) return false;
    return true;
  });
}

function storyPeriodLabel(date?: string | null) {
  if (!date) return null;

  const d = date.trim();

  // BP / cal BP formats
  const bpMatch = d.match(/^([\d,]+(?:\.\d+)?)\s*(cal\s*)?bp$/i);
  if (bpMatch) {
    const raw = Number(bpMatch[1].replace(/,/g, ""));
    if (Number.isFinite(raw)) {
      if (raw >= 11700 && raw <= 12900) return "Younger Dryas";
      if (raw > 12900 && raw <= 14600) return "Late Glacial";
      if (raw > 14600 && raw <= 29000) return "Upper Paleolithic";
      if (raw > 29000) return "Deep prehistory";
      if (raw >= 7000 && raw < 11700) return "Mesolithic";
      if (raw >= 4500 && raw < 7000) return "Neolithic";
      if (raw >= 2500 && raw < 4500) return "Bronze Age";
      if (raw >= 800 && raw < 2500) return "Iron Age";
      return null;
    }
  }

  // Named palaeo events
  if (/younger\s+dryas/i.test(d)) return "Younger Dryas";
  if (/late\s+glacial/i.test(d)) return "Late Glacial";
  if (/b[øo]lling[-–\s]*aller[øo]d/i.test(d)) return "Bølling–Allerød";
  if (/older\s+dryas/i.test(d)) return "Older Dryas";

  // Pure year
  const yearOnly = /^-?\d{1,6}$/.test(d) ? Number(d) : null;
  if (yearOnly !== null) {
    if (yearOnly >= 1800 && yearOnly <= 1899) return "19th century";
    if (yearOnly >= 1900 && yearOnly <= 1999) return "20th century";
    if (yearOnly >= 2000 && yearOnly <= 2099) return "21st century";

    if (yearOnly < 0) {
      const abs = Math.abs(yearOnly);
      if (abs >= 11700 && abs <= 50000) return "Upper Paleolithic";
      if (abs >= 9700 && abs < 11700) return "Younger Dryas / Late Upper Paleolithic";
      if (abs >= 7000 && abs < 9700) return "Mesolithic";
      if (abs >= 4500 && abs < 7000) return "Neolithic";
      if (abs >= 2500 && abs < 4500) return "Bronze Age";
      if (abs >= 800 && abs < 2500) return "Iron Age";
      return null;
    }

    if (yearOnly >= 1 && yearOnly < 500) return "Late Antiquity";
    if (yearOnly >= 500 && yearOnly < 1500) return "Medieval";
    if (yearOnly >= 1500 && yearOnly < 1800) return "Early Modern";

    return null;
  }

  // Geological shorthand
  const geoMatch = d.match(/^([\d.]+)\s*(ka|ma|ga)$/i);
  if (geoMatch) {
    const value = Number(geoMatch[1]);
    const unit = geoMatch[2].toLowerCase();

    if (unit === "ma") return geologicalPeriodFromMa(value);
    if (unit === "ga") return "Deep time";
    if (unit === "ka") {
      if (value >= 11.7 && value <= 12.9) return "Younger Dryas";
      if (value > 12.9 && value <= 14.6) return "Late Glacial";
      if (value >= 7 && value < 11.7) return "Mesolithic";
      if (value >= 4.5 && value < 7) return "Neolithic";
    }
  }

  // Named geological periods
  const periods = [
    "Cambrian",
    "Ordovician",
    "Silurian",
    "Devonian",
    "Carboniferous",
    "Permian",
    "Triassic",
    "Jurassic",
    "Cretaceous",
    "Paleogene",
    "Neogene",
    "Quaternary",
    "Holocene",
    "Pleistocene",
  ];

  for (const p of periods) {
    if (d.toLowerCase().includes(p.toLowerCase())) return p;
  }

  return null;
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

function clusterBubbleDataUrl(outer: string, ring: string, core: string) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <desc>ots-cluster</desc>
      <defs>
        <radialGradient id="clusterGlow" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.95" />
          <stop offset="20%" stop-color="${core}" stop-opacity="0.98" />
          <stop offset="42%" stop-color="${ring}" stop-opacity="0.96" />
          <stop offset="100%" stop-color="${outer}" stop-opacity="1" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="26" fill="url(#clusterGlow)" stroke="rgba(0,0,0,0.18)" stroke-width="2" />
      <circle cx="32" cy="32" r="18" fill="rgba(255,255,255,0.10)" />
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
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [visibilityFilter, setVisibilityFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [timeFilter, setTimeFilter] = useState<"all" | "human" | "ancient" | "geological">("all");
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

  function discoveryScore(s: Spot) {
    const distance = Number(s.distance_m ?? 999999);
    const descriptionLength = s.description?.trim().length ?? 0;
    const confidence = 3;

    const distanceScore =
      distance < 150 ? 40 :
      distance < 400 ? 28 :
      distance < 1000 ? 18 :
      distance < 2500 ? 8 : 0;

    const confidenceScore = confidence * 8;
    const sourceScore = s.source_url ? 10 : 0;
    const photoScore = s.photo_url ? 8 : 0;
    const tagScore = Array.isArray(s.tags) ? Math.min(s.tags.length, 5) * 2 : 0;
    const descriptionScore =
      descriptionLength > 180 ? 8 :
      descriptionLength > 80 ? 4 : 0;
    const importedPenalty = s.is_imported ? 0 : 2;

    return (
      distanceScore +
      confidenceScore +
      sourceScore +
      photoScore +
      tagScore +
      descriptionScore +
      importedPenalty
    );
  }

  const filteredSpots = spots.filter((s) => {
    const catOk = categoryFilter === "all" || s.category === categoryFilter;
    const vis = (s as any).visibility ?? "public";
    const visOk = visibilityFilter === "all" || vis === visibilityFilter;
    const timeOk = timeFilter === "all" || timeScaleKey(s) === timeFilter;
    return catOk && visOk && timeOk;
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
    timeFilter !== "all"
      ? timeFilter === "human"
        ? "Human history"
        : timeFilter === "ancient"
          ? "Ancient history"
          : "Geological"
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
  const clusterCalculator = (markers: unknown[], numStyles: number) => {
    const count = markers.length;
    let sizeIndex = 1;

    if (count >= 100) sizeIndex = 3;
    else if (count >= 20) sizeIndex = 2;

    const scaleCounts: Record<"human" | "ancient" | "geological", number> = {
      human: 0,
      ancient: 0,
      geological: 0,
    };

    for (const marker of markers as Array<{ getIcon?: () => google.maps.Icon | google.maps.Symbol | string | null | undefined }>) {
      const scale = markerTimeScaleFromIcon(marker.getIcon?.());
      scaleCounts[scale] += 1;
    }

    const dominantScale =
      scaleCounts.geological >= scaleCounts.ancient && scaleCounts.geological >= scaleCounts.human
        ? "geological"
        : scaleCounts.ancient >= scaleCounts.human
          ? "ancient"
          : "human";

    const baseOffset = dominantScale === "human" ? 0 : dominantScale === "ancient" ? 3 : 6;
    const index = Math.min(baseOffset + sizeIndex, numStyles);

    const dominantLabel =
      dominantScale === "geological"
        ? "mostly geological"
        : dominantScale === "ancient"
          ? "mostly ancient"
          : "mostly human history";

    return {
      text: String(count),
      index,
      title: `${count} spots · ${dominantLabel}`,
    };
  };
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
      active: visibilityFilter === "all" && timeFilter === "all" && !importedOnly,
      onClick: () => {
        setVisibilityFilter("all");
        setTimeFilter("all");
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
      key: "ancient",
      label: "Ancient",
      active: timeFilter === "ancient",
      onClick: () => setTimeFilter(timeFilter === "ancient" ? "all" : "ancient"),
    },
    {
      key: "geological",
      label: "Geological",
      active: timeFilter === "geological",
      onClick: () => setTimeFilter(timeFilter === "geological" ? "all" : "geological"),
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
        time_filter: timeFilter === "all" ? null : timeFilter,
        tag_filter: tagFilter === "all" ? null : tagFilter,
        q: searchText.trim() ? searchText.trim() : null,
        imported_only: importedOnly,
      });
      if (!error && data) setSpots(data as Spot[]);
    })();
  }, [pos, radiusM, categoryFilter, searchText, importedOnly, supabase, visibilityFilter, tagFilter, timeFilter]);

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
      if (typeof v.timeFilter === "string") setTimeFilter(v.timeFilter);
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
        JSON.stringify({ radiusM, searchText, categoryFilter, visibilityFilter, tagFilter, timeFilter, importedOnly })
      );
    } catch {
      // ignore storage errors
    }
  }, [radiusM, searchText, categoryFilter, visibilityFilter, tagFilter, timeFilter, importedOnly]);

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

  function markerIconForVisibility(
    v?: string | null,
    spot?: Pick<Spot, "date_start" | "time_scale_out"> | null,
    isSelected = false,
    isPulsing = false
  ): google.maps.Icon {
    const size = isSelected || isPulsing ? 42 : 28;
    const anchorX = size / 2;
    const anchorY = size;

    const stroke = isPulsing
      ? "rgba(0,0,0,0.72)"
      : isSelected
        ? "rgba(0,0,0,0.58)"
        : "rgba(0,0,0,0.35)";

    const coreBase = markerCoreColorForDate(spot ?? { date_start: null, time_scale_out: null });
    const scale = timeScaleKey(spot ?? { date_start: null, time_scale_out: null });
    const core = isSelected || isPulsing
      ? coreBase === "#1FB6A6"
        ? "#54d9cb"
        : coreBase === "#E6B325"
          ? "#F2C94C"
          : "#8b5cf6"
      : coreBase;

    const ring =
      v === "friends" ? "#2563eb" :
      v === "group" ? "#a855f7" :
      v === "private" ? "#6b7280" :
      "#0F2A44";

    const outer = "#0F2A44";
    const ringRadius = isSelected || isPulsing ? 10.7 : 10;
    const goldRadius = isSelected || isPulsing ? 7.2 : 6;

    const pulseTicks = isPulsing
      ? `
        <g opacity="0.95">
          <animate attributeName="opacity" values="0.95;0.45;0.95" dur="1.05s" repeatCount="indefinite" />
          <line x1="24" y1="4" x2="24" y2="0.8" stroke="${core}" stroke-width="2" stroke-linecap="round" />
          <line x1="36.7" y1="9.3" x2="39" y2="7" stroke="${core}" stroke-width="2" stroke-linecap="round" />
          <line x1="43" y1="18" x2="46.2" y2="18" stroke="${core}" stroke-width="2" stroke-linecap="round" />
          <line x1="36.7" y1="26.7" x2="39" y2="29" stroke="${core}" stroke-width="2" stroke-linecap="round" />
          <line x1="11.3" y1="9.3" x2="9" y2="7" stroke="${core}" stroke-width="2" stroke-linecap="round" />
          <line x1="5" y1="18" x2="1.8" y2="18" stroke="${core}" stroke-width="2" stroke-linecap="round" />
          <line x1="11.3" y1="26.7" x2="9" y2="29" stroke="${core}" stroke-width="2" stroke-linecap="round" />
        </g>
      `
      : "";

    const halo = isPulsing
      ? `
        <circle cx="24" cy="18" r="12.5" fill="${core}" opacity="0.18">
          <animate attributeName="r" values="12.5;16.8;12.5" dur="1.05s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.22;0.06;0.22" dur="1.05s" repeatCount="indefinite" />
        </circle>
        <circle cx="24" cy="18" r="10.8" fill="none" stroke="${core}" stroke-width="2.6" opacity="0.82">
          <animate attributeName="r" values="10.8;14.4;10.8" dur="1.05s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.9;0.24;0.9" dur="1.05s" repeatCount="indefinite" />
        </circle>
      `
      : isSelected
        ? `
          <circle cx="24" cy="18" r="14" fill="${core}" opacity="0.18" />
          <circle cx="24" cy="18" r="11.5" fill="none" stroke="${core}" stroke-width="2" opacity="0.75" />
        `
        : "";

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 48 48">
      <desc>ots-scale-${scale}</desc>
      ${pulseTicks}
      ${halo}
      <path d="M24 46C24 46 6 28 6 18C6 8 14 2 24 2C34 2 42 8 42 18C42 28 24 46 24 46Z"
            fill="${outer}"
            stroke="${stroke}"
            stroke-width="1.2"/>
      <circle cx="24" cy="18" r="${ringRadius}" fill="${ring}" />
      ${isPulsing ? `<circle cx="24" cy="18" r="9.6" fill="none" stroke="${core}" stroke-width="1.6" opacity="0.7"><animate attributeName="r" values="9.6;12.6;9.6" dur="1.05s" repeatCount="indefinite" /><animate attributeName="opacity" values="0.75;0.18;0.75" dur="1.05s" repeatCount="indefinite" /></circle>` : ""}
      <circle cx="24" cy="18" r="${goldRadius}" fill="${core}" />
    </svg>`;

    return {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
      scaledSize: new google.maps.Size(size, size),
      anchor: new google.maps.Point(anchorX, anchorY),
    };
  }

  function markerIconForUser(): google.maps.Icon {
    const size = 30;
    const anchorX = size / 2;
    const anchorY = size / 2;

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 48 48">
      <circle cx="24" cy="24" r="18" fill="#ffffff" stroke="#0F2A44" stroke-width="2.4" />
      <circle cx="24" cy="24" r="10" fill="#1FB6A6" />
      <circle cx="24" cy="24" r="6" fill="#E6B325" />
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
              Time:
              <select value={timeFilter} onChange={(e) => setTimeFilter(e.target.value as any)}>
                <option value="all">All time</option>
                <option value="human">Human history</option>
                <option value="ancient">Ancient history</option>
                <option value="geological">Geological</option>
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

                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 13, color: "#333", fontWeight: 700 }}>Time layer</span>
                  <select
                    value={timeFilter}
                    onChange={(e) => setTimeFilter(e.target.value as any)}
                    style={{
                      padding: 10,
                      borderRadius: 12,
                      border: "1px solid rgba(0,0,0,0.2)",
                      background: "white",
                    }}
                  >
                    <option value="all">All time</option>
                    <option value="human">Human history</option>
                    <option value="ancient">Ancient history</option>
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
                    setTimeFilter("all");
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
                    <h3 className="ots-brand-heading">
                      Nearby Spots
                    </h3>
                    {isMobile && (
                      <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                        {rankedFilteredSpots.length} found nearby {mobileListSnap === "peek" ? "• tap to expand" : mobileListSnap === "half" ? "• tap for full list" : ""}
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

                {isMobile && mobileListSnap === "peek" && rankedFilteredSpots.length > 0 && (
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
                      <div style={{ minWidth: 0, display: "grid", gap: 6 }}>
                        <div
                          className="ots-brand-heading"
                          style={{ fontWeight: 900, color: "#111", lineHeight: 1.15, fontSize: 16 }}
                        >
                          {rankedFilteredSpots[0].title}
                        </div>

                        <div
                          style={{
                            display: "flex",
                            gap: 6,
                            flexWrap: "wrap",
                            alignItems: "center",
                          }}
                        >
                          {formatStoryDate(rankedFilteredSpots[0].date_start) && (() => {
                            const timeScale = effectiveTimeScale(rankedFilteredSpots[0]);
                            const color = timeScale.color;

                            return (
                              <span
                                style={{
                                  padding: "3px 8px",
                                  borderRadius: 999,
                                  fontSize: 11,
                                  fontWeight: 700,
                                  color: "#0F2A44",
                                  background: `${color}20`,
                                  border: `1px solid ${color}55`,
                                }}
                                title={`${timeScale.scale} timescale`}
                              >
                                {formatStoryDate(rankedFilteredSpots[0].date_start)}
                              </span>
                            );
                          })()}

                          {(rankedFilteredSpots[0].period_label_out ?? storyPeriodLabel(rankedFilteredSpots[0].date_start)) &&
                            (rankedFilteredSpots[0].period_label_out ?? storyPeriodLabel(rankedFilteredSpots[0].date_start)) !== formatStoryDate(rankedFilteredSpots[0].date_start) && (
                              <span
                                style={{
                                  padding: "3px 8px",
                                  borderRadius: 999,
                                  fontSize: 11,
                                  fontWeight: 700,
                                  color: "#0F2A44",
                                  background: "rgba(107,33,168,0.10)",
                                  border: "1px solid rgba(107,33,168,0.24)",
                                }}
                              >
                                {rankedFilteredSpots[0].period_label_out ?? storyPeriodLabel(rankedFilteredSpots[0].date_start)}
                              </span>
                            )}

                          {sourceBadgeLabel(rankedFilteredSpots[0].source_url) && (
                            <span
                              style={{
                                padding: "3px 8px",
                                borderRadius: 999,
                                fontSize: 11,
                                fontWeight: 700,
                                color: "#0F2A44",
                                background: "rgba(31,182,166,0.10)",
                                border: "1px solid rgba(31,182,166,0.24)",
                              }}
                            >
                              {sourceBadgeLabel(rankedFilteredSpots[0].source_url)}
                            </span>
                          )}
                        </div>

                        <TagPills
                          tags={dedupeChronologyTags(
                            rankedFilteredSpots[0].tags,
                            rankedFilteredSpots[0].date_start,
                            rankedFilteredSpots[0].period_label_out
                          )}
                          max={2}
                        />

                        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>
                          {rankedFilteredSpots[0].what3words
                            ? `///${rankedFilteredSpots[0].what3words}`
                            : "Tap to browse nearby stories"}
                        </div>
                      </div>

                      <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.8, whiteSpace: "nowrap" }}>
                        {formatDistance(rankedFilteredSpots[0].distance_m)}
                      </div>
                    </div>

                    <div
                      className="ots-story-text"
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
                      {rankedFilteredSpots[0].description}
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
                      {rankedFilteredSpots.map((s) => (
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
                              gap: 10,
                              alignItems: "start",
                            }}
                          >
                            <div style={{ minWidth: 0, flex: 1, display: "grid", gap: 8 }}>
                              <div style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 0, flexWrap: "wrap" }}>
                                <strong
                                  className="ots-brand-heading"
                                  style={{ lineHeight: 1.15, fontSize: 16, color: "#111" }}
                                >
                                  {s.title}
                                </strong>
                                <VisibilityBadge visibility={s.visibility} />
                              </div>

                              <div
                                style={{
                                  display: "flex",
                                  gap: 8,
                                  flexWrap: "wrap",
                                  alignItems: "center",
                                }}
                              >
                                {visibilityStoryLabel(s.visibility) && s.visibility !== "public" && (
                                  <span
                                    style={{
                                      padding: "4px 8px",
                                      borderRadius: 999,
                                      fontSize: 12,
                                      fontWeight: 700,
                                      color: "#0F2A44",
                                      background: "rgba(15,42,68,0.05)",
                                      border: "1px solid rgba(15,42,68,0.08)",
                                    }}
                                  >
                                    {visibilityStoryLabel(s.visibility)}
                                  </span>
                                )}

                                {formatStoryDate(s.date_start) && (() => {
                                  const timeScale = effectiveTimeScale(s);
                                  const color = timeScale.color;

                                  return (
                                    <span
                                      style={{
                                        padding: "4px 8px",
                                        borderRadius: 999,
                                        fontSize: 12,
                                        fontWeight: 700,
                                        color: "#0F2A44",
                                        background: `${color}20`,
                                        border: `1px solid ${color}55`,
                                      }}
                                      title={`${timeScale.scale} timescale`}
                                    >
                                      {formatStoryDate(s.date_start)}
                                    </span>
                                  );
                                })()}

                                {(s.period_label_out ?? storyPeriodLabel(s.date_start)) &&
                                  (s.period_label_out ?? storyPeriodLabel(s.date_start)) !== formatStoryDate(s.date_start) && (
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
                                    {s.period_label_out ?? storyPeriodLabel(s.date_start)}
                                  </span>
                                )}

                                {sourceBadgeLabel(s.source_url) && (
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
                                    {sourceBadgeLabel(s.source_url)}
                                  </span>
                                )}
                              </div>

                              <div className="ots-story-text" style={{ opacity: 0.78, fontSize: 13, lineHeight: 1.45 }}>
                                {s.distance_m ? `${formatDistance(s.distance_m)} away` : null}
                                {s.what3words ? `${s.distance_m ? " · " : ""}///${s.what3words}` : null}
                              </div>

                              <TagPills tags={dedupeChronologyTags(s.tags, s.date_start, s.period_label_out)} max={3} />
                            </div>

                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
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

                          <div
                            className="ots-story-text"
                            style={{
                              marginTop: 10,
                              color: "#1f2937",
                              lineHeight: 1.5,
                              display: "-webkit-box",
                              WebkitLineClamp: 3,
                              WebkitBoxOrient: "vertical",
                              overflow: "hidden",
                              fontSize: 14,
                            }}
                          >
                            {splitStory(s.description).intro || s.description}
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

                            {s.source_url && (
                              <a
                                href={s.source_url}
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
                                  background: "white",
                                }}
                              >
                                Source
                              </a>
                            )}
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
              <MarkerF position={pos} title="You" icon={markerIconForUser()} zIndex={1100} />

              {shouldClusterMarkers ? (
                <MarkerClustererF
                  options={{
                  minimumClusterSize: 2,
                  gridSize: isMobile ? 44 : 56,
                  maxZoom: 16,
                  styles: clusterStyles,
                  clusterClass: "ots-map-cluster",
                  calculator: clusterCalculator,
                }}
                >
                  {(clusterer) => (
                    <>
                      {rankedFilteredSpots.map((s) => (
                        <MarkerF
                          key={s.id}
                          clusterer={selected?.id === s.id ? undefined : clusterer}
                          position={{ lat: s.lat_out, lng: s.lng_out }}
                          title={s.title}
                          icon={markerIconForVisibility(
                            (s as any).visibility,
                            s,
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
                rankedFilteredSpots.map((s) => (
                  <MarkerF
                    key={s.id}
                    position={{ lat: s.lat_out, lng: s.lng_out }}
                    title={s.title}
                    icon={markerIconForVisibility(
                      (s as any).visibility,
                      s,
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
                    gap: 12,
                    alignItems: "start",
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1, display: "grid", gap: 10 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 0, flexWrap: "wrap" }}>
                      <h3
                        className="ots-brand-heading"
                        style={{
                          margin: 0,
                          fontSize: selectedSheetIsPeek ? 18 : 26,
                          lineHeight: 1.12,
                        }}
                      >
                        {selected.title}
                      </h3>
                      <VisibilityBadge visibility={selected.visibility} />
                    </div>

                    {!selectedSheetIsPeek && (
                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          flexWrap: "wrap",
                          alignItems: "center",
                        }}
                      >
                        {selectedStoryDate && (
                          <span
                            style={{
                              padding: "4px 8px",
                              borderRadius: 999,
                              fontSize: 12,
                              fontWeight: 700,
                              color: "#0F2A44",
                              background: "rgba(230,179,37,0.10)",
                              border: "1px solid rgba(230,179,37,0.22)",
                            }}
                          >
                            {selectedStoryDate}
                          </span>
                        )}

                        {selectedStoryPeriod && selectedStoryPeriod !== selectedStoryDate && (
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
                            {selectedStoryPeriod}
                          </span>
                        )}

                        {selectedVisibilityLabel && (
                          <span
                            style={{
                              padding: "4px 8px",
                              borderRadius: 999,
                              fontSize: 12,
                              fontWeight: 700,
                              color: "#0F2A44",
                              background: "rgba(15,42,68,0.05)",
                              border: "1px solid rgba(15,42,68,0.08)",
                            }}
                          >
                            {selectedVisibilityLabel}
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
                      </div>
                    )}

                    <div className="ots-story-text" style={{ opacity: 0.82, fontSize: 14, lineHeight: 1.5 }}>
                      {selected.distance_m ? `${formatDistance(selected.distance_m)} away` : null}
                      {selected.what3words ? `${selected.distance_m ? " · " : ""}///${selected.what3words}` : null}
                    </div>

                    <TagPills
                      tags={dedupeChronologyTags(selected.tags, selected.date_start, selected.period_label_out)}
                      max={selectedSheetIsPeek ? 3 : 6}
                    />
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

                <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
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
                      View source
                    </a>
                  )}
                </div>

                {!selectedSheetIsPeek && selected.photo_url && (
                  <img
                    src={selected.photo_url}
                    alt={selected.title}
                    style={{
                      width: "100%",
                      borderRadius: 14,
                      marginTop: 14,
                      maxHeight: selectedSheetIsHalf ? 200 : 280,
                      objectFit: "cover",
                    }}
                  />
                )}

                {!selectedSheetIsPeek && (
                  <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
                    <div
                      className="ots-brand-heading"
                      style={{ fontSize: 12, opacity: 0.68, letterSpacing: "0.02em" }}
                    >
                      Story
                    </div>

                    <p
                      className="ots-story-text"
                      style={{
                        marginTop: 0,
                        marginBottom: 0,
                        fontSize: selectedSheetIsHalf ? 17 : 18,
                        lineHeight: 1.68,
                        color: "#1f2937",
                      }}
                    >
                      {selectedSheetIsHalf && selectedStoryParts?.intro && selectedStoryParts.intro.length > 260
                        ? selectedStoryParts.intro.slice(0, 260) + "…"
                        : selectedStoryParts?.intro ?? ""}
                    </p>

                    {selectedSheetIsFull && selectedStoryParts?.rest && (
                      <p
                        className="ots-story-text"
                        style={{
                          marginTop: 0,
                          marginBottom: 0,
                          opacity: 0.94,
                          lineHeight: 1.78,
                          color: "#374151",
                        }}
                      >
                        {selectedStoryParts.rest}
                      </p>
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
