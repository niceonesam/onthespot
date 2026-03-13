import { loadPack } from "./pack-utils.mjs";

function sortEntriesChronologically(entries) {
  return [...entries].sort((a, b) => {
    const da = a.date_start ?? "9999-12-31";
    const db = b.date_start ?? "9999-12-31";
    return da.localeCompare(db);
  });
}

function countBy(items, getKey) {
  const map = new Map();

  for (const item of items) {
    const key = getKey(item);
    map.set(key, (map.get(key) ?? 0) + 1);
  }

  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

export function previewPack({ slug }) {
  if (!slug) {
    throw new Error("Missing --slug");
  }

  const pack = loadPack(slug);
  const entries = sortEntriesChronologically(pack.entries ?? []);
  const candidates = sortEntriesChronologically(pack.candidates ?? []);

  console.log("");
  console.log(`Place: ${pack.place.name}`);
  console.log(`Slug: ${pack.place.slug}`);
  console.log(`Location: ${pack.place.lat}, ${pack.place.lng}`);
  console.log(`Radius: ${pack.place.radius_m}m`);
  console.log(`Region: ${pack.place.region}, ${pack.place.country}`);
  console.log("");
  console.log(pack.place.summary);
  console.log("");

  console.log(`Entries: ${entries.length}`);
  console.log(`Candidates: ${candidates.length}`);
  console.log("");

  const categoryCounts = countBy(entries, (e) => e.category);
  const eraCounts = countBy(entries, (e) => e.era);

  console.log("Categories:");
  if (categoryCounts.length === 0) {
    console.log("  (none)");
  } else {
    for (const [category, count] of categoryCounts) {
      console.log(`  - ${category}: ${count}`);
    }
  }

  console.log("");
  console.log("Eras:");
  if (eraCounts.length === 0) {
    console.log("  (none)");
  } else {
    for (const [era, count] of eraCounts) {
      console.log(`  - ${era}: ${count}`);
    }
  }

  console.log("");
  console.log("Timeline:");
  if (entries.length === 0) {
    console.log("  (no entries yet)");
  } else {
    for (const entry of entries) {
      const start = entry.date_start ?? "no-date";
      const end = entry.date_end ? ` → ${entry.date_end}` : "";
      console.log(`  - ${start}${end} | ${entry.title} [${entry.category}]`);
    }
  }

  console.log("");
  console.log("Candidates:");
  if (candidates.length === 0) {
    console.log("  (no candidates)");
  } else {
    for (const entry of candidates) {
      const start = entry.date_start ?? "no-date";
      console.log(`  - ${start} | ${entry.title} [${entry.category}] [${entry.review_status}]`);
    }
  }
  console.log("");
  console.log("✔ Preview complete");
}