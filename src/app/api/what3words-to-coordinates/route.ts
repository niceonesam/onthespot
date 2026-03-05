import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function normalize3wa(input: string) {
  // Accept: "///word.word.word" OR "word.word.word"
  const trimmed = input.trim();
  return trimmed.startsWith("///") ? trimmed.slice(3) : trimmed;
}

// In-memory cache (fast, but resets on server restart)
const mem = new Map<string, { lat: number; lng: number; expires: number }>();
const MEM_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours
const DB_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

// Supabase admin client (server-only)
let sb: SupabaseClient | null = null;
function supabaseAdmin(): SupabaseClient | null {
  if (sb) return sb;

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    "";

  // If not configured, operate in memory-only mode
  if (!url || !serviceKey) return null;

  sb = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return sb;
}

type W3wToCoordsResponse = {
  words: string | null;
  coordinates: { lat: number; lng: number } | null;
  cached: "memory" | "db" | "api";
  w3w_available: boolean;
  reason?: string | null;
  message?: string | null;
};

type DbRow = {
  words: string;
  lat: string;
  lng: string;
  expires_at: string;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const wordsRaw = searchParams.get("words");

  if (!wordsRaw) {
    const body: W3wToCoordsResponse = {
      words: null,
      coordinates: null,
      cached: "api",
      w3w_available: true,
      reason: "BadRequest",
      message: "words required",
    };
    return NextResponse.json(body, { status: 400 });
  }

  const normalized = normalize3wa(wordsRaw);

  // Basic sanity check: must look like "a.b.c"
  if (!/^[a-zA-Z]+\.[a-zA-Z]+\.[a-zA-Z]+$/.test(normalized)) {
    const body: W3wToCoordsResponse = {
      words: normalized,
      coordinates: null,
      cached: "api",
      w3w_available: true,
      reason: "InvalidFormat",
      message: "Invalid what3words format. Use word.word.word",
    };
    return NextResponse.json(body, { status: 400 });
  }

  const cacheKey = normalized.toLowerCase();

  // 1) Memory cache
  const m = mem.get(cacheKey);
  if (m && m.expires > Date.now()) {
    const body: W3wToCoordsResponse = {
      words: normalized,
      coordinates: { lat: m.lat, lng: m.lng },
      cached: "memory",
      w3w_available: true,
      reason: null,
      message: null,
    };
    return NextResponse.json(body);
  }

  // 2) DB cache (best-effort)
  const supabase = supabaseAdmin();
  if (supabase) {
    const { data, error } = await supabase
      .from("w3w_words_cache")
      .select("lat, lng, expires_at")
      .eq("words", cacheKey)
      .maybeSingle();

    const row = data as Pick<DbRow, "lat" | "lng" | "expires_at"> | null;

    if (!error && row?.lat && row?.lng && row?.expires_at) {
      const exp = new Date(row.expires_at).getTime();
      if (exp > Date.now()) {
        const latNum = Number.parseFloat(row.lat);
        const lngNum = Number.parseFloat(row.lng);
        if (Number.isFinite(latNum) && Number.isFinite(lngNum)) {
          mem.set(cacheKey, { lat: latNum, lng: lngNum, expires: exp });
          const body: W3wToCoordsResponse = {
            words: normalized,
            coordinates: { lat: latNum, lng: lngNum },
            cached: "db",
            w3w_available: true,
            reason: null,
            message: null,
          };
          return NextResponse.json(body);
        }
      }
    }
  }

  // 3) Call what3words API
  const key = process.env.WHAT3WORDS_API_KEY;
  if (!key) {
    const body: W3wToCoordsResponse = {
      words: normalized,
      coordinates: null,
      cached: "api",
      w3w_available: false,
      reason: "MissingApiKey",
      message: "Missing WHAT3WORDS_API_KEY",
    };
    return NextResponse.json(body, { status: 500 });
  }

  const url = `https://api.what3words.com/v3/convert-to-coordinates?words=${encodeURIComponent(
    normalized
  )}&key=${key}`;

  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json().catch(() => null);

  if (!res.ok) {
    // what3words commonly returns: { error: { code, message } }
    const err = (data as any)?.error?.error ?? (data as any)?.error ?? data;
    const code = err?.code ?? null;
    const message = err?.message ?? null;

    const quotaLike =
      code === "QuotaExceeded" ||
      code === "RateLimited" ||
      res.status === 402 ||
      res.status === 429;

    const body: W3wToCoordsResponse = {
      words: normalized,
      coordinates: null,
      cached: "api",
      w3w_available: !quotaLike,
      reason: code,
      message,
    };

    // For quota/rate-limit, return 200 so the UI can degrade gracefully
    if (quotaLike) {
      return NextResponse.json(body);
    }

    return NextResponse.json(body, { status: res.status });
  }

  const lat = (data as any)?.coordinates?.lat;
  const lng = (data as any)?.coordinates?.lng;

  if (typeof lat !== "number" || typeof lng !== "number") {
    const body: W3wToCoordsResponse = {
      words: normalized,
      coordinates: null,
      cached: "api",
      w3w_available: true,
      reason: "NoCoordinates",
      message: "what3words returned no coordinates.",
    };
    return NextResponse.json(body, { status: 502 });
  }

  // Cache success
  mem.set(cacheKey, { lat, lng, expires: Date.now() + MEM_TTL_MS });

  if (supabase) {
    const upsertRow = {
      words: cacheKey,
      lat: String(lat),
      lng: String(lng),
      expires_at: new Date(Date.now() + DB_TTL_MS).toISOString(),
    };

    // Best-effort write; do not fail request if cache write fails
    await supabase
      .from("w3w_words_cache")
      .upsert(upsertRow, { onConflict: "words" });
  }

  const body: W3wToCoordsResponse = {
    words: normalized,
    coordinates: { lat, lng },
    cached: "api",
    w3w_available: true,
    reason: null,
    message: null,
  };

  return NextResponse.json(body);
}