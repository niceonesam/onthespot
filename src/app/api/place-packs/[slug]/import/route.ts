

import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
   const { slug } = await params;

    const packPath = path.resolve(
      process.cwd(),
      `data/place-packs/${slug}.json`
    );

    if (!fs.existsSync(packPath)) {
      return NextResponse.json(
        { error: "Pack not found" },
        { status: 404 }
      );
    }

    const raw = fs.readFileSync(packPath, "utf8");
    const pack = JSON.parse(raw);

    const entries = Array.isArray(pack?.entries)
  ? pack.entries.filter(
      (entry: any) => (entry?.review_status ?? "approved") === "approved"
    )
  : [];

    const url = process.env.SUPABASE_URL;
    const key =
      process.env.SUPABASE_SECRET_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      return NextResponse.json(
        { error: "Supabase environment variables missing" },
        { status: 500 }
      );
    }

    const supabase = createClient(url, key, {
      auth: { persistSession: false },
    });

    let inserted = 0;

    for (const entry of entries) {
      const canonicalKey = `${slug}|${entry.date_start ?? "no-date"}|${slugify(
        entry.title
      )}`;

      const payload = {
        title: entry.title,
        description: entry.description,
        category: entry.category,
        significance: entry.significance,
        source_url: entry.source_url ?? null,
        lat: entry.lat,
        lng: entry.lng,
        era: entry.era ?? null,
        tags: entry.tags ?? [],
        canonical_key: canonicalKey,
      };

      const { error } = await supabase.from("spots").upsert(payload, {
        onConflict: "canonical_key",
      });

      if (!error) inserted++;
    }

    return NextResponse.json({
        ok: true,
        inserted,
        total: entries.length,
        importedReviewStatus: "approved",
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}