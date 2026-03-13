import { createClient } from "@supabase/supabase-js";
import { loadPack } from "./pack-utils.mjs";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error("Missing Supabase environment variables");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

function makeCanonicalKey(placeSlug, entry) {
  const date = entry.date_start ?? "no-date";
  const title = entry.title.toLowerCase().replace(/\s+/g, "-");
  return `${placeSlug}|${date}|${title}`;
}

export async function importPack({ slug }) {
  if (!slug) {
    throw new Error("Missing --slug");
  }

  const pack = loadPack(slug);

  console.log(`Importing pack: ${slug}`);

  const approvedEntries = (pack.entries ?? []).filter(
    (entry) => (entry.review_status ?? "approved") === "approved"
  );

  const rows = approvedEntries.map((entry) => ({
    user_id: process.env.IMPORT_USER_ID,

    title: entry.title,
    description: entry.description,

    category: entry.category,

    location: `POINT(${entry.lng} ${entry.lat})`,

    visibility: entry.visibility,
    status: entry.status,

    date_start: entry.date_start,
    date_end: entry.date_end,

    source_url: entry.source_url,
    confidence: entry.confidence,

    import_source: "place-pack",
    is_imported: true,

    canonical_key: makeCanonicalKey(pack.place.slug, entry),
  }));

  console.log(`Preparing ${rows.length} approved spots`);

  const { error } = await supabase
    .from("spots")
    .upsert(rows, { onConflict: "canonical_key" });

  if (error) {
    throw new Error(error.message);
  }

  console.log(`✔ Imported ${rows.length} spots`);
}