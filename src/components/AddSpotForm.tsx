"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GoogleMap, MarkerF, useLoadScript } from "@react-google-maps/api";
import { useSearchParams } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

export default function AddSpotForm() {
  const supabase = getSupabaseBrowser();
  const router = useRouter();

  const { isLoaded } = useLoadScript({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!,
  });

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("");

  // Categories are driven by DB (public.spot_categories)
  const [categories, setCategories] = useState<Array<{ id: string; label: string }>>(
    []
  );
const [loadingCategories, setLoadingCategories] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);

  const [w3w, setW3w] = useState<string | null>(null);
  const w3wCacheRef = useRef(new Map<string, string | null>());
  const w3wToCoordsCacheRef = useRef(
    new Map<string, { lat: number; lng: number }>()
  );
  const [msg, setMsg] = useState<string | null>(null);
  const [loadingW3w, setLoadingW3w] = useState(false);

  const [w3wInput, setW3wInput] = useState("");
  const [jumping, setJumping] = useState(false);
  const [w3wAvailable, setW3wAvailable] = useState(true);

  const [map, setMap] = useState<google.maps.Map | null>(null);
  const searchParams = useSearchParams();

  const [dateStart, setDateStart] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [confidence, setConfidence] = useState(3);

  const [visibility, setVisibility] = useState<"public" | "friends" | "private" | "group">(
    "public"
  );

  // Group visibility support
  const [groups, setGroups] = useState<Array<{ id: string; name: string }>>([]);
  const [groupId, setGroupId] = useState<string>("");
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
  const latParam = searchParams.get("lat");
  const lngParam = searchParams.get("lng");

  if (latParam && lngParam) {
    const lat = Number(latParam);
    const lng = Number(lngParam);

    if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
      setPos({ lat, lng });
      return;
    }
  }

  // fallback to device location
  navigator.geolocation.getCurrentPosition(
    (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
    () => setPos({ lat: 51.5074, lng: -0.1278 })
  );
}, [searchParams]);

  useEffect(() => {
    if (map && pos) map.panTo(pos);
  }, [map, pos]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoadingGroups(true);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const user = sessionData.session?.user;

        if (!user) {
          if (!cancelled) setGroups([]);
          return;
        }

        // Load groups via the membership join table. This is more reliable than
        // relying on a nested join from `groups` (which requires FK relationship naming to match).
        // Requires FK: group_members.group_id -> groups.id
        const { data, error } = await supabase
          .from("group_members")
          .select("group_id, groups(id,name)")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (error) {
          console.warn("Failed to load groups:", error.message);
          if (!cancelled) setGroups([]);
          return;
        }

        const mapped = (data ?? [])
          .map((row: any) => {
            const g = row?.groups;
            if (!g) return null;
            return { id: String(g.id), name: String(g.name ?? "Untitled group") };
          })
          .filter(Boolean) as Array<{ id: string; name: string }>;

        // De-dupe by id (in case of odd joins/duplicates)
        const unique = Array.from(new Map(mapped.map((g) => [g.id, g])).values()).sort((a, b) =>
          a.name.localeCompare(b.name)
        );

        if (!cancelled) setGroups(unique);
      } finally {
        if (!cancelled) setLoadingGroups(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoadingCategories(true);
      try {
        // `spot_categories` table: id (text), label (text)
        const { data, error } = await supabase
          .from("spot_categories")
          .select("id,label")
          .order("label", { ascending: true });

        if (error) {
          console.warn("Failed to load categories:", error.message);
          if (!cancelled) setCategories([]);
          return;
        }

        const mapped = (data ?? [])
          .map((r: any) => ({ id: String(r.id), label: String(r.label ?? r.id) }))
          .filter((r) => r.id);

        if (!cancelled) {
          setCategories(mapped);

          // Default category to first available if none selected
          if (!category && mapped.length) {
            setCategory(mapped[0].id);
          }

          // If selected category no longer exists, fall back to first
          if (category && mapped.length && !mapped.some((c) => c.id === category)) {
            setCategory(mapped[0].id);
          }
        }
      } finally {
        if (!cancelled) setLoadingCategories(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  // If user switches away from group visibility, clear any selected group
  useEffect(() => {
    if (visibility !== "group") {
      setGroupId("");
    }
  }, [visibility]);

  useEffect(() => {
    if (!pos) return;

    // Round coords so tiny jitter doesn't spam lookups; ~0.11m at 6dp latitude
    const cacheKey = `${pos.lat.toFixed(6)},${pos.lng.toFixed(6)}`;

    // If we already looked this up, use cached value immediately
    if (w3wCacheRef.current.has(cacheKey)) {
      const cached = w3wCacheRef.current.get(cacheKey) ?? null;
      setW3w(cached);
      if (cached) setW3wInput(cached);
      return;
    }

    const t = setTimeout(async () => {
      setLoadingW3w(true);
      setMsg(null);

      try {
        const res = await fetch(`/what3words?lat=${pos.lat}&lng=${pos.lng}`, {
          cache: "no-store",
        });

        // Our route now returns a consistent JSON shape, but still guard against HTML (404/500/etc)
        const text = await res.text().catch(() => "");
        let data: any = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          data = null;
        }

        if (!res.ok) {
          console.warn("/what3words lookup failed:", res.status, text.slice(0, 120));
          setW3w(null);
          w3wCacheRef.current.set(cacheKey, null);

          setMsg(
            res.status === 404
              ? "what3words route not found (/what3words)."
              : `what3words lookup failed (${res.status}).`
          );
          return;
        }

        // Expected: { words, cached, w3w_available, reason?, message? }
        const words: string | null = data?.words ?? null;
        const available: boolean = data?.w3w_available !== false;
        const reason: string | null = data?.reason ?? null;
        const message: string | null = data?.message ?? null;

        setW3wAvailable(available);

        if (!available) {
          // Quota/rate-limit: disable W3W UI and avoid spamming lookups
          setW3w(null);
          w3wCacheRef.current.set(cacheKey, null);
          setMsg(
            reason === "QuotaExceeded" || reason === "RateLimited"
              ? "what3words is unavailable (quota/rate limit). You can still drag or click the map pin to set the Spot."
              : message || "what3words is currently unavailable."
          );
          return;
        }

        setW3w(words);
        if (words) {
          setW3wInput(words);
          w3wCacheRef.current.set(cacheKey, words);
        } else {
          w3wCacheRef.current.set(cacheKey, null);
          setMsg(message || "Could not resolve what3words for this location.");
        }
      } catch (e: any) {
        console.warn("what3words lookup error:", e);
        setW3w(null);
        w3wCacheRef.current.set(cacheKey, null);
        setMsg(`what3words lookup error: ${e?.message ?? String(e)}`);
      } finally {
        setLoadingW3w(false);
      }
    }, 350);

    return () => clearTimeout(t);
  }, [pos?.lat, pos?.lng]);

  async function jumpToWhat3Words() {
    setMsg(null);

    const raw = w3wInput.trim();
    if (!raw) {
      setMsg("Enter a what3words address like ///filled.count.soap");
      return;
    }

    // Normalize for caching (accept ///a.b.c or a.b.c)
    const normalized = raw.startsWith("///") ? raw.slice(3) : raw;

    // Cache hit: jump instantly without an API call
    const cachedCoords = w3wToCoordsCacheRef.current.get(normalized);
    if (cachedCoords) {
      setPos({ lat: cachedCoords.lat, lng: cachedCoords.lng });
      setJumping(false);
      return;
    }

    setJumping(true);
    try {
      const res = await fetch(
        `/api/what3words-to-coordinates?words=${encodeURIComponent(raw)}`,
        { cache: "no-store" }
      );

      // Parse defensively (route may return HTML on 404/500)
      const text = await res.text().catch(() => "");
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }

      if (!res.ok) {
        const message =
          data?.message ||
          (res.status === 404
            ? "what3words route not found (/api/what3words-to-coordinates)."
            : `what3words lookup failed (${res.status}).`);

        setMsg(message);
        console.warn(
          "/api/what3words-to-coordinates non-OK:",
          res.status,
          text.slice(0, 120)
        );
        return;
      }

      // Expected: { words, coordinates, cached, w3w_available, reason?, message? }
      const available: boolean = data?.w3w_available !== false;
      const reason: string | null = data?.reason ?? null;
      const message: string | null = data?.message ?? null;

      if (!available) {
        setW3wAvailable(false);
        setMsg(
          reason === "QuotaExceeded" || reason === "RateLimited"
            ? "what3words search is unavailable (quota/rate limit). You can still drag or click the map pin to set the Spot."
            : message || "what3words search is currently unavailable."
        );
        return;
      }

      setW3wAvailable(true);

      const lat = data?.coordinates?.lat;
      const lng = data?.coordinates?.lng;

      if (typeof lat !== "number" || typeof lng !== "number") {
        setMsg(message || "what3words returned no coordinates.");
        return;
      }

      // Save to cache so repeat lookups are instant
      w3wToCoordsCacheRef.current.set(normalized, { lat, lng });
      setPos({ lat, lng });
    } finally {
      setJumping(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (submitting) return;
    setSubmitting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;

      if (!user) {
        setMsg("Please log in first.");
        router.push("/login");
        return;
      }
      if (!pos) {
        setMsg("Missing location.");
        return;
      }

      if (!category) {
        setMsg("Please choose a category.");
        return;
      }

      if (visibility === "group") {
        if (!groupId) {
          setMsg("Please choose a group for Group visibility.");
          return;
        }
      }

      let photoUrl: string | null = null;
      let photoPath: string | null = null;

      if (file) {
        const path = `${user.id}/${crypto.randomUUID()}-${file.name}`;

        const up = await supabase.storage.from("spot-photos").upload(path, file, {
          cacheControl: "3600",
          upsert: false,
        });

        if (up.error) {
          setMsg(up.error.message);
          return;
        }

        photoPath = path;
        const pub = supabase.storage.from("spot-photos").getPublicUrl(path);
        photoUrl = pub.data.publicUrl;
      }

      try {
        const { error } = await supabase.rpc("submit_spot_with_credit", {
          p_title: title,
          p_description: description,
          p_category: category,
          p_location: `POINT(${pos.lng} ${pos.lat})`,
          p_photo_path: photoPath ?? null,
          p_photo_url: photoUrl ?? null,
          p_what3words: w3w ?? null,
          p_source_url: sourceUrl || null,
          p_date_start: dateStart || null,
          p_date_end: null,
          p_confidence: confidence ?? 3,
          p_visibility: visibility,
          p_group_id: visibility === "group" ? groupId : null,
        });

        if (error) {
          setMsg(error.message);
          return;
        }

        // Close the Add Spot screen.
        // If this page is shown as a modal (parallel route), `back()` closes it.
        // Otherwise we fall back to a normal redirect home.
        if (typeof window !== "undefined" && window.history.length > 1) {
          router.back();
        } else {
          router.replace("/");
        }
        router.refresh();
      } finally {
        setSubmitting(false);
      }
    } finally {
      // If an early return is hit, also reset submitting.
      setSubmitting(false);
    }
  }

  if (!isLoaded || !pos) return <div style={{ padding: 16 }}>Loading…</div>;

  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ marginTop: 0 }}>Add a Spot</h1>

      <p style={{ opacity: 0.75, marginTop: 8 }}>
        Chosen location: {pos.lat.toFixed(6)}, {pos.lng.toFixed(6)}
        {" • "}
        {loadingW3w ? "what3words…" : w3w ? `///${w3w}` : "no what3words"}
      </p>

      {w3wAvailable && (
        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={w3wInput}
            onChange={(e) => setW3wInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                jumpToWhat3Words();
              }
            }}
            placeholder="what3words e.g. ///filled.count.soap"
            style={{ flex: "1 1 320px" }}
          />
          <button type="button" onClick={jumpToWhat3Words} disabled={jumping}>
            {jumping ? "Going…" : "Go"}
          </button>
        </div>
      )}

      {!w3wAvailable && (
        <p style={{ opacity: 0.6, marginTop: 12 }}>
          what3words search unavailable — use the map to set the exact spot.
        </p>
      )}

      <div style={{ height: 360, borderRadius: 12, overflow: "hidden", marginTop: 12 }}>
        <GoogleMap
          mapContainerStyle={{ width: "100%", height: "100%" }}
          center={pos}
          zoom={16}
          options={{ streetViewControl: false, mapTypeControl: false }}
          onLoad={(m) => setMap(m)}
          onClick={(e) => {
            const lat = e.latLng?.lat();
            const lng = e.latLng?.lng();
            if (lat != null && lng != null) setPos({ lat, lng });
          }}
        >
          <MarkerF
            position={pos}
            draggable
            onDragEnd={(e) => {
              const lat = e.latLng?.lat();
              const lng = e.latLng?.lng();
              if (lat != null && lng != null) setPos({ lat, lng });
            }}
          />
        </GoogleMap>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => {
            navigator.geolocation.getCurrentPosition(
              (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
              () => setMsg("Could not read your GPS location.")
            );
          }}
        >
          Use my current location
        </button>

        <button type="button" onClick={() => setPos({ lat: 51.5074, lng: -0.1278 })}>
          Reset to London (demo)
        </button>
      </div>

      <form onSubmit={submit} style={{ display: "grid", gap: 12, marginTop: 18 }}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" required />

        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What happened on this exact spot?"
          rows={5}
          required
        />

        <label>
          Date (optional)
          <input
            type="date"
            value={dateStart}
            onChange={(e) => setDateStart(e.target.value)}
          />
        </label>

        <label>
          Source URL (optional)
          <input
            type="url"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://..."
          />
        </label>

        <label>
          Confidence
          <select value={confidence} onChange={(e)=>setConfidence(Number(e.target.value))}>
            <option value={1}>1 — uncertain</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={4}>4</option>
            <option value={5}>5 — verified</option>
          </select>
        </label>

        <label>
          Visibility{" "}
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as any)}
          >
            <option value="public">Public</option>
            <option value="friends">Friends</option>
            <option value="private">Private</option>
            <option value="group">Group</option>
          </select>
        </label>

        {visibility === "group" && (
          <label>
            Group{" "}
            <select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              disabled={loadingGroups}
            >
              <option value="">
                {loadingGroups
                  ? "Loading groups…"
                  : groups.length
                    ? "Select a group"
                    : "No groups found (join/permissions?)"}
              </option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            {groups.length === 0 && !loadingGroups ? (
              <div style={{ marginTop: 6, opacity: 0.75, fontSize: 13 }}>
                Create a group from your Account page first, then come back here.
              </div>
            ) : null}
          </label>
        )}

        <label>
          Category{" "}
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            disabled={loadingCategories || categories.length === 0}
          >
            {!category ? (
              <option value="">
                {loadingCategories
                  ? "Loading categories…"
                  : categories.length
                    ? "Select a category"
                    : "No categories available"}
              </option>
            ) : null}

            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>

          {categories.length === 0 && !loadingCategories ? (
            <div style={{ marginTop: 6, opacity: 0.75, fontSize: 13 }}>
              No categories found. Check RLS/policies on <code>spot_categories</code>.
            </div>
          ) : null}
        </label>

        <label>
          Photo{" "}
          <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>

        <button type="submit" disabled={submitting}>
          {submitting ? "Publishing…" : "Publish Spot"}
        </button>
      </form>

      {msg && <p style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>{msg}</p>}
    </div>
  );
}