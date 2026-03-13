

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

function geologicalPeriodLabel(entry: {
  time_scale?: string | null;
  years_ago_start?: number | null;
  years_ago_end?: number | null;
}) {
  if (entry.time_scale !== "geological") return null;

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

  const start = entry.years_ago_start;
  const end = entry.years_ago_end;

  if (typeof start === "number" && typeof end === "number") {
    return `${fmt(start)} → ${fmt(end)}`;
  }
  if (typeof start === "number") return fmt(start);
  if (typeof end === "number") return fmt(end);
  return "Deep time";
}

function inferGeologicalRangeFromText(text: string) {
  const ranges: Array<{
    pattern: RegExp;
    years_ago_start: number;
    years_ago_end: number;
  }> = [
    { pattern: /cambrian/, years_ago_start: 541000000, years_ago_end: 485000000 },
    { pattern: /ordovician/, years_ago_start: 485000000, years_ago_end: 444000000 },
    { pattern: /silurian/, years_ago_start: 444000000, years_ago_end: 419000000 },
    { pattern: /devonian/, years_ago_start: 419000000, years_ago_end: 359000000 },
    { pattern: /carboniferous/, years_ago_start: 359000000, years_ago_end: 299000000 },
    { pattern: /permian/, years_ago_start: 299000000, years_ago_end: 252000000 },
    { pattern: /triassic/, years_ago_start: 252000000, years_ago_end: 201000000 },
    { pattern: /jurassic/, years_ago_start: 201000000, years_ago_end: 145000000 },
    { pattern: /cretaceous/, years_ago_start: 145000000, years_ago_end: 66000000 },
    { pattern: /paleogene/, years_ago_start: 66000000, years_ago_end: 23000000 },
    { pattern: /neogene/, years_ago_start: 23000000, years_ago_end: 2600000 },
    { pattern: /quaternary/, years_ago_start: 2600000, years_ago_end: 0 },
    { pattern: /pleistocene/, years_ago_start: 2580000, years_ago_end: 11700 },
    { pattern: /holocene/, years_ago_start: 11700, years_ago_end: 0 },
    { pattern: /younger\s+dryas/, years_ago_start: 12900, years_ago_end: 11700 },
    { pattern: /late\s+glacial/, years_ago_start: 14600, years_ago_end: 11700 },
    { pattern: /b[øo]lling[-–\s]*aller[øo]d/, years_ago_start: 14700, years_ago_end: 12900 },
    { pattern: /older\s+dryas/, years_ago_start: 18000, years_ago_end: 14700 },
    { pattern: /devensian|ice age|glacial/, years_ago_start: 26000, years_ago_end: 11700 },
  ];

  for (const range of ranges) {
    if (range.pattern.test(text)) {
      return {
        years_ago_start: range.years_ago_start,
        years_ago_end: range.years_ago_end,
      };
    }
  }

  return null;
}

function inferTemporalMetadata(entry: {
  title?: string | null;
  description?: string | null;
  category?: string | null;
  era?: string | null;
  tags?: string[] | null;
  time_scale?: string | null;
  years_ago_start?: number | null;
  years_ago_end?: number | null;
}) {
  const explicitTimeScale = entry.time_scale ?? null;
  const explicitYearsAgoStart = entry.years_ago_start ?? null;
  const explicitYearsAgoEnd = entry.years_ago_end ?? null;

  if (
    explicitTimeScale ||
    explicitYearsAgoStart != null ||
    explicitYearsAgoEnd != null
  ) {
    return {
      time_scale: explicitTimeScale,
      years_ago_start: explicitYearsAgoStart,
      years_ago_end: explicitYearsAgoEnd,
    };
  }

  const text = [
    entry.title,
    entry.description,
    entry.category,
    entry.era,
    ...(entry.tags ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const looksGeological = /(geolog|bedrock|alluvium|glacial|ice age|devensian|triassic|jurassic|cretaceous|pleistocene|holocene|quaternary|paleogene|neogene|permian|carboniferous|devonian|silurian|ordovician|cambrian|floodplain|sediment|sandstone|moraine|younger dryas|late glacial|older dryas|bølling|bolling|allerød|allerod)/.test(
    text
  );
  if (!looksGeological) {
    return {
      time_scale: null,
      years_ago_start: null,
      years_ago_end: null,
    };
  }

  const inferredRange = inferGeologicalRangeFromText(text);

  return {
    time_scale: "geological",
    years_ago_start: inferredRange?.years_ago_start ?? null,
    years_ago_end: inferredRange?.years_ago_end ?? null,
  };
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
      const temporal = inferTemporalMetadata(entry);
      const timeKey =
        entry.date_start ??
        (temporal.time_scale === "geological"
          ? `geo-${temporal.years_ago_start ?? "unknown"}-${temporal.years_ago_end ?? "unknown"}`
          : "no-date");

      const canonicalKey = `${slug}|${timeKey}|${slugify(entry.title)}`;

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
        time_scale: temporal.time_scale,
        years_ago_start: temporal.years_ago_start,
        years_ago_end: temporal.years_ago_end,
        period_label: geologicalPeriodLabel({
          ...entry,
          time_scale: temporal.time_scale,
          years_ago_start: temporal.years_ago_start,
          years_ago_end: temporal.years_ago_end,
        }),
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