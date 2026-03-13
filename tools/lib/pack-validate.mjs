import { loadPack } from "./pack-utils.mjs";
import { packSchema } from "./pack-schema.mjs";

export function validatePack({ slug }) {
  if (!slug) {
    throw new Error("Missing --slug");
  }

  const pack = loadPack(slug);

  console.log(`Validating pack: ${slug}`);

  // Schema validation
  const result = packSchema.safeParse(pack);

  if (!result.success) {
    console.error("❌ Schema validation failed\n");

    result.error.issues.forEach((issue) => {
      console.error(
        `• ${issue.path.join(".")} → ${issue.message}`
      );
    });

    process.exit(1);
  }

  console.log("✔ Schema valid");

  const entries = pack.entries ?? [];
  const candidates = pack.candidates ?? [];
  const allEntries = [...entries, ...candidates];

  if (!entries.length) {
    console.log("⚠ Pack contains no approved entries yet");
  }
  if (!candidates.length) {
    console.log("⚠ Pack contains no candidate entries yet");
  }

  // Duplicate title detection
  const titles = new Map();
  const ids = new Set();
  const fingerprints = new Set();

  for (const entry of allEntries) {
    if (!entry.id) {
      console.log(`⚠ Missing entry id: ${entry.title}`);
    } else if (ids.has(entry.id)) {
      console.log(`⚠ Duplicate entry id detected: ${entry.id}`);
    } else {
      ids.add(entry.id);
    }

    const titleKey = entry.title.toLowerCase();

    if (titles.has(titleKey)) {
      console.log(`⚠ Duplicate title detected: ${entry.title}`);
    }

    titles.set(titleKey, true);

    const fingerprint = `${entry.title.toLowerCase()}|${entry.date_start ?? "no-date"}|${entry.lat}|${entry.lng}`;
    if (fingerprints.has(fingerprint)) {
      console.log(`⚠ Duplicate-like entry detected: ${entry.title}`);
    }
    fingerprints.add(fingerprint);
  }

  // Date order check
  for (const entry of allEntries) {
    if (entry.date_start && entry.date_end) {
      if (entry.date_end < entry.date_start) {
        console.log(
          `⚠ Date order issue: ${entry.title}`
        );
      }
    }
  }

  console.log("✔ Validation complete");
}