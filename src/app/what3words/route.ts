import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Simple in-memory cache to reduce what3words API calls
const cache = new Map<string, { words: string; expires: number }>();
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours

// DB cache TTL (survives server restarts)
const DB_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

// Minimal row type for public.w3w_cache
type W3wCacheRow = {
  cache_key: string;
  lat: string;
  lng: string;
  words: string;
  expires_at: string; // timestamptz ISO string
};

type W3wResponse = {
  words: string | null;
  cached: "memory" | "db" | "api";
  w3w_available: boolean;
  reason?: string | null;
  message?: string | null;
};

let sb: SupabaseClient | null = null;
function supabaseAdmin(): SupabaseClient | null {
  if (sb) return sb;

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";

  // If not configured, just skip DB caching (memory-only still works)
  if (!url || !serviceKey) return null;

  sb = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return sb;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");

  if (!lat || !lng) {
    return NextResponse.json({ error: "lat and lng required" }, { status: 400 });
  }

  // Normalize coordinates so tiny GPS/map jitter doesn't break the cache
  const latNorm = Number.parseFloat(lat).toFixed(6);
  const lngNorm = Number.parseFloat(lng).toFixed(6);

  const cacheKey = `${latNorm},${lngNorm}`;

  // 1) Memory cache
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    const body: W3wResponse = {
      words: cached.words,
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
      .from("w3w_cache")
      .select("words, expires_at")
      .eq("cache_key", cacheKey)
      .maybeSingle();

    const row = data as { words: string; expires_at: string } | null;

    if (!error && row?.words) {
      const exp = row.expires_at ? new Date(row.expires_at).getTime() : 0;
      if (exp > Date.now()) {
        cache.set(cacheKey, { words: row.words, expires: exp });
        const body: W3wResponse = {
          words: row.words,
          cached: "db",
          w3w_available: true,
          reason: null,
          message: null,
        };
        return NextResponse.json(body);
      }
    }
  }

  // 3) Call what3words API
  const key = process.env.WHAT3WORDS_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "Missing WHAT3WORDS_API_KEY" }, { status: 500 });
  }

  const url = `https://api.what3words.com/v3/convert-to-3wa?coordinates=${latNorm},${lngNorm}&key=${key}`;

  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json();

  if (!res.ok) {
    // what3words commonly returns: { error: { code, message } }
    // But we also tolerate nested shapes.
    const err = (data as any)?.error?.error ?? (data as any)?.error ?? data;
    const code = err?.code ?? null;
    const message = err?.message ?? null;

    const quotaLike =
      code === "QuotaExceeded" || res.status === 402 || res.status === 429;

    const body: W3wResponse = {
      words: null,
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

  const words: string | null = data?.words ?? null;

  if (words) {
    // set memory cache
    cache.set(cacheKey, { words, expires: Date.now() + CACHE_TTL_MS });

    // best-effort upsert into DB cache
    if (supabase) {
      const expiresAt = new Date(Date.now() + DB_CACHE_TTL_MS).toISOString();

      // Supabase upsert expects full row type; we provide exactly required columns
      const upsertRow: W3wCacheRow = {
        cache_key: cacheKey,
        lat: latNorm,
        lng: lngNorm,
        words,
        expires_at: expiresAt,
      };

      // Don't crash the request if DB write fails
      await supabase
        .from("w3w_cache")
        .upsert(upsertRow, { onConflict: "cache_key" });
    }
  }

  const okBody: W3wResponse = {
    words,
    cached: "api",
    w3w_available: true,
    reason: null,
    message: null,
  };
  return NextResponse.json(okBody);
}