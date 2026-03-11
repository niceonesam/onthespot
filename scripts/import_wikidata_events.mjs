import "dotenv/config";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SECRET_KEY");
  process.exit(1);
}

console.log("Key prefix:", SUPABASE_SECRET_KEY.slice(0, 6));

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

const WDQS = "https://query.wikidata.org/sparql";

// ---- Config ----
const LIMIT = Number(process.env.LIMIT ?? 200);
const START_OFFSET = Number(process.env.OFFSET ?? 0);
const BATCH_SIZE = Number(process.env.BATCH_SIZE ?? 200);
const IMPORT_SOURCE = "wikidata";
const DEFAULT_CONFIDENCE = 5;

const DRY_RUN = String(process.env.DRY_RUN ?? "false").toLowerCase() === "true";
const DRY_RUN_SAMPLES = Number(process.env.DRY_RUN_SAMPLES ?? 3);

const MAX_RETRIES = Number(process.env.MAX_RETRIES ?? 5);

const AUTO_PAGINATE = String(process.env.AUTO_PAGINATE ?? "false").toLowerCase() === "true";
const STATE_FILE = process.env.STATE_FILE ?? ".wikidata_import_state.json";
const MAX_PAGES = Number(process.env.MAX_PAGES ?? 0); // 0 = unlimited
const RESUME = String(process.env.RESUME ?? "true").toLowerCase() === "true";
const RESET_STATE = String(process.env.RESET_STATE ?? "false").toLowerCase() === "true";

const IMPORT_MODE = process.env.IMPORT_MODE ?? "event_only"; // event_only | historic_and_cultural | dated_places
const IMPORT_REGION = process.env.IMPORT_REGION ?? "world"; // world | uk | europe

const IMPORT_USER_ID = process.env.IMPORT_USER_ID;
if (!IMPORT_USER_ID) {
  console.error("Missing IMPORT_USER_ID in env.");
  process.exit(1);
}

// Adaptive pacing
const BASE_SLEEP_MS = Number(process.env.BASE_SLEEP_MS ?? 200);
const MAX_SLEEP_MS = Number(process.env.MAX_SLEEP_MS ?? 5000);
const SLOWDOWN_STEP_MS = Number(process.env.SLOWDOWN_STEP_MS ?? 250);
const SPEEDUP_STEP_MS = Number(process.env.SPEEDUP_STEP_MS ?? 50);

// Unknown P31 logging
const LOG_UNKNOWN_P31 = String(process.env.LOG_UNKNOWN_P31 ?? "true").toLowerCase() === "true";
const UNKNOWN_P31_CSV = process.env.UNKNOWN_P31_CSV ?? "unknown_p31.csv";
// ----------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, "utf8");
      return JSON.parse(raw);
    }
  } catch {}
  return null;
}

function writeState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.warn("Could not write state file:", e?.message ?? e);
  }
}

function maybeResetState() {
  if (!RESET_STATE) return;
  try {
    if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);
    console.log(`RESET_STATE=true — deleted state file ${STATE_FILE}`);
  } catch (e) {
    console.warn("RESET_STATE: could not delete state file:", e?.message ?? e);
  }
}

function csvEscape(v) {
  const s = String(v ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replaceAll('"', '""')}"`;
  }
  return s;
}

function appendUnknownP31CSV(rows) {
  if (!LOG_UNKNOWN_P31) return;
  const fileExists = fs.existsSync(UNKNOWN_P31_CSV);
  const header = "p31_qid,count,example_title\n";
  if (!fileExists) fs.writeFileSync(UNKNOWN_P31_CSV, header);

  // rows: [{ p31, count, example }]
  const lines = rows
    .map((r) => `${csvEscape(r.p31)},${r.count},${csvEscape(r.example)}`)
    .join("\n");
  if (lines.trim().length) fs.appendFileSync(UNKNOWN_P31_CSV, lines + "\n");
}

function qidFromUri(uri) {
  const m = uri.match(/\/(Q\d+)$/);
  return m ? m[1] : null;
}

function parsePoint(wkt) {
  const m = wkt.match(/Point\(([-\d.]+)\s+([-\d.]+)\)/);
  if (!m) return null;
  return { lng: Number(m[1]), lat: Number(m[2]) };
}

function pickDate(row) {
  const iso = row.time?.value ?? row.start?.value ?? null;
  return iso ? iso.slice(0, 10) : null;
}

function normalizeTitle(t) {
  return t
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

function makeCanonicalKey({ lat, lng, date_start, title }) {
  const rlat = lat.toFixed(5);
  const rlng = lng.toFixed(5);
  const d = date_start ?? "no-date";
  const nt = normalizeTitle(title).slice(0, 80);
  return `${rlat},${rlng}|${d}|${nt}`;
}

function printSamples(spots, n) {
  const sample = spots.slice(0, Math.max(0, n));
  for (const s of sample) {
    console.log(
      JSON.stringify(
        {
          wikidata_id: s.wikidata_id,
          title: s.title,
          category: s.category,
          date_start: s.date_start,
          source_url: s.source_url,
          canonical_key: s.canonical_key,
          instance_of: s.instance_of,
        },
        null,
        2
      )
    );
  }
}

function buildLeanSparql(limit, offset) {
  const locationClause = `
  ?item wdt:P625 ?coords .
`;

  const ukRegionClause = `
  ?item wdt:P17 wd:Q145 .
`;

  const europeRegionClause = `
  ?item wdt:P17 ?country .
  VALUES ?country {
    wd:Q40 wd:Q31 wd:Q250 wd:Q112 wd:Q203 wd:Q208 wd:Q191 wd:Q822 wd:Q55 wd:Q213
    wd:Q35 wd:Q39 wd:Q58 wd:Q183 wd:Q142 wd:Q224 wd:Q228 wd:Q29 wd:Q45 wd:Q155
    wd:Q38 wd:Q37 wd:Q32 wd:Q219 wd:Q211 wd:Q218 wd:Q217 wd:Q20 wd:Q36 wd:Q159
    wd:Q41 wd:Q28 wd:Q43 wd:Q214 wd:Q215 wd:Q216 wd:Q221 wd:Q222 wd:Q223 wd:Q225
    wd:Q227 wd:Q229 wd:Q230 wd:Q232 wd:Q233 wd:Q235 wd:Q236 wd:Q237 wd:Q238 wd:Q241
    wd:Q242 wd:Q244 wd:Q145
  }
`;

  let regionClause = "";
  if (IMPORT_REGION === "uk") regionClause = ukRegionClause;
  if (IMPORT_REGION === "europe") regionClause = europeRegionClause;

  const baseSelect = `
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX schema: <http://schema.org/>

SELECT ?item ?coords ?p31 ?time ?start ?end WHERE {
${locationClause}
${regionClause}
  OPTIONAL { ?item wdt:P31 ?p31 . }
  OPTIONAL { ?item wdt:P585 ?time . }
  OPTIONAL { ?item wdt:P580 ?start . }
  OPTIONAL { ?item wdt:P582 ?end . }
`;

  const eventOnlyWhere = `
  {
    ?item wdt:P31/wdt:P279* wd:Q1656682 .  # event
  }
  UNION
  {
    VALUES ?inst { wd:Q178561 wd:Q3839081 wd:Q40231 wd:Q1190554 wd:Q618123 }
    ?item wdt:P31/wdt:P279* ?inst .
  }
`;

  const historicAndCulturalWhere = `
  {
    ?item wdt:P31/wdt:P279* wd:Q1656682 .  # event
  }
  UNION
  {
    VALUES ?inst {
      wd:Q178561    # battle
      wd:Q3839081   # festival
      wd:Q40231     # election
      wd:Q1190554   # occurrence
      wd:Q618123    # geological event
      wd:Q839954    # archaeological site
      wd:Q9259      # world heritage site
      wd:Q4989906   # monument
      wd:Q207694    # museum
      wd:Q23413     # castle
      wd:Q33506     # museum / gallery-style cultural venue fallback family branch via p31 tree
      wd:Q16970     # church building
    }
    ?item wdt:P31/wdt:P279* ?inst .
    FILTER (BOUND(?time) || BOUND(?start) || BOUND(?end) || ?inst IN (
      wd:Q839954,
      wd:Q9259,
      wd:Q4989906,
      wd:Q207694,
      wd:Q23413,
      wd:Q33506,
      wd:Q16970
    ))
  }
`;

  const datedPlacesWhere = `
  FILTER (BOUND(?time) || BOUND(?start) || BOUND(?end))
`;

  let modeWhere = eventOnlyWhere;
  if (IMPORT_MODE === "historic_and_cultural") modeWhere = historicAndCulturalWhere;
  if (IMPORT_MODE === "dated_places") modeWhere = datedPlacesWhere;

  return `
${baseSelect}
${modeWhere}
}
LIMIT ${limit}
OFFSET ${offset}
`;
}

function validateImportMode() {
  const allowed = new Set(["event_only", "historic_and_cultural", "dated_places"]);
  if (!allowed.has(IMPORT_MODE)) {
    console.error(
      `Invalid IMPORT_MODE='${IMPORT_MODE}'. Use one of: event_only, historic_and_cultural, dated_places`
    );
    process.exit(1);
  }
}

function validateImportRegion() {
  const allowed = new Set(["world", "uk", "europe"]);
  if (!allowed.has(IMPORT_REGION)) {
    console.error(`Invalid IMPORT_REGION='${IMPORT_REGION}'. Use one of: world, uk, europe`);
    process.exit(1);
  }
}

/**
 * Adaptive pacing controller:
 * - increases delay after 429/5xx
 * - slowly decreases delay after success
 */
const pace = {
  ms: BASE_SLEEP_MS,
  slowDown() {
    this.ms = Math.min(MAX_SLEEP_MS, this.ms + SLOWDOWN_STEP_MS);
  },
  speedUp() {
    this.ms = Math.max(BASE_SLEEP_MS, this.ms - SPEEDUP_STEP_MS);
  },
};

async function sparqlQuery(query, attempt = 0) {
  const url = new URL(WDQS);
  url.searchParams.set("format", "json");
  url.searchParams.set("query", query);

  const res = await fetch(url, {
    headers: {
      Accept: "application/sparql-results+json",
      "User-Agent": "OnTheSpot/0.1 (contact: admin@onthespot.example)",
    },
  });

  if (res.status === 429) {
    pace.slowDown();
    const retry = Number(res.headers.get("Retry-After") ?? "5");
    console.warn(`429 from WDQS. Sleeping ${retry}s… (pace=${pace.ms}ms)`);
    await sleep(retry * 1000);
    return sparqlQuery(query, attempt);
  }

  if ([502, 503, 504].includes(res.status) && attempt < MAX_RETRIES) {
    pace.slowDown();
    const backoff = Math.min(2000 * (attempt + 1), 15000);
    console.warn(
      `${res.status} from WDQS. Retrying in ${backoff}ms (attempt ${attempt + 1}/${MAX_RETRIES}) (pace=${pace.ms}ms)…`
    );
    await sleep(backoff);
    return sparqlQuery(query, attempt + 1);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SPARQL error ${res.status}: ${text.slice(0, 400)}`);
  }

  // Success => gently speed up
  pace.speedUp();
  return res.json();
}

async function fetchLabels(qids) {
  if (qids.length === 0) return new Map();
  const values = qids.map((q) => `wd:${q}`).join(" ");
  const q = `
SELECT ?item ?itemLabel WHERE {
  VALUES ?item { ${values} }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
`;
  const json = await sparqlQuery(q);
  const map = new Map();
  for (const r of json.results.bindings) {
    const qid = qidFromUri(r.item.value);
    if (qid && r.itemLabel?.value) map.set(qid, r.itemLabel.value);
  }
  return map;
}

async function loadP31CategoryMap() {
  const { data, error } = await supabase
    .from("category_map_wikidata_p31")
    .select("p31_qid, category_id");

  if (error) throw new Error(error.message);

  const map = new Map();
  for (const row of data) map.set(row.p31_qid, row.category_id);
  return map;
}

function pickCategory(p31Qids, map) {
  for (const qid of p31Qids) {
    const c = map.get(qid);
    if (c) return c;
  }
  return null; // explicitly unknown
}

async function upsertBatch(batch) {
  const wikidataIds = batch
    .map((row) => row.wikidata_id)
    .filter((v) => typeof v === "string" && v.length > 0);

  let existingByWikidataId = new Map();

  if (wikidataIds.length > 0) {
    const { data, error } = await supabase
      .from("spots")
      .select("id, wikidata_id")
      .in("wikidata_id", wikidataIds);

    if (error) throw new Error(error.message);
    existingByWikidataId = new Map((data ?? []).map((row) => [row.wikidata_id, row.id]));
  }

  const inserts = [];
  const updates = [];

  for (const row of batch) {
    const existingId = row.wikidata_id ? existingByWikidataId.get(row.wikidata_id) : null;
    if (existingId) {
      updates.push({ ...row, id: existingId });
    } else {
      inserts.push(row);
    }
  }

  if (inserts.length > 0) {
    const { error } = await supabase
      .from("spots")
      .upsert(inserts, { onConflict: "canonical_key" });
    if (error) throw new Error(error.message);
  }

  for (const row of updates) {
    const { id, ...payload } = row;
    const { error } = await supabase
      .from("spots")
      .update(payload)
      .eq("id", id);
    if (error) throw new Error(error.message);
  }
}

async function fetchPage(offset) {
  console.log(`\n=== Page OFFSET=${offset} LIMIT=${LIMIT} pace=${pace.ms}ms mode=${IMPORT_MODE} region=${IMPORT_REGION} ===`);
  const json = await sparqlQuery(buildLeanSparql(LIMIT, offset));
  return json.results.bindings;
}

function toDateOrNull(v) {
  if (!v) return null;
  const s = String(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

async function createPage(runId, offset, limit, paceMs) {
  const { data, error } = await supabase
    .from("import_run_pages")
    .insert({
      run_id: runId,
      page_offset: offset,
      page_limit: limit,
      pace_ms: paceMs,
      status: "running",
    })
    .select("id")
    .single();

  if (error) throw new Error(`createPage: ${error.message}`);
  return data.id;
}

async function main() {
  validateImportMode();
  validateImportRegion();
  maybeResetState();

  const categoryMap = await loadP31CategoryMap();

  let offset = START_OFFSET;

  // Resume logic
  if (AUTO_PAGINATE && RESUME && !RESET_STATE) {
    const state = readState();
    if (state?.next_offset != null && state?.limit === LIMIT) {
      offset = state.next_offset;
      console.log(`Resuming from state file: next_offset=${offset} (LIMIT=${LIMIT})`);
    }
  }

  let page = 0;
  let totalPrepared = 0;
  let totalWritten = 0;

  while (true) {
    if (MAX_PAGES > 0 && page >= MAX_PAGES) {
      console.log(`Reached MAX_PAGES=${MAX_PAGES}. Stopping.`);
      break;
    }

    const rows = await fetchPage(offset);
    if (!rows.length) {
      console.log("No rows returned. Stopping.");
      break;
    }

    // Fold into unique QIDs; multiple rows per item (per p31)
    const byQid = new Map();
    for (const r of rows) {
      const qid = qidFromUri(r.item.value);
      if (!qid) continue;

      const p = parsePoint(r.coords.value);
      if (!p) continue;

      const date_start = pickDate(r);
      const date_end = r.end?.value ? r.end.value.slice(0, 10) : null;
      const p31qid = r.p31?.value ? qidFromUri(r.p31.value) : null;

      const existing = byQid.get(qid) ?? {
        wikidata_id: qid,
        lat: p.lat,
        lng: p.lng,
        p31: [],
        date_start,
        date_end,
        wikidata_description: null,
        source_url: `https://www.wikidata.org/wiki/${qid}`,
      };

      if (p31qid && !existing.p31.includes(p31qid)) existing.p31.push(p31qid);

      byQid.set(qid, existing);
    }

    const qids = [...byQid.keys()];
    if (!qids.length) {
      console.log("No unique QIDs after folding. Stopping.");
      break;
    }

    console.log(`Unique QIDs: ${qids.length}. Fetching labels…`);
    const labelMap = await fetchLabels(qids);

    // Track unknown P31 QIDs for this page
    const unknownCounts = new Map(); // p31 -> {count, example}
    const spots = [];

    for (const e of byQid.values()) {
      const title = labelMap.get(e.wikidata_id) ?? e.wikidata_id;

      const cat = pickCategory(e.p31, categoryMap);
      let category = cat;
      if (!category) {
        category = "cultural"; // fallback for storage, but log unknown types
        for (const p31 of e.p31) {
          const cur = unknownCounts.get(p31) ?? { count: 0, example: title };
          cur.count += 1;
          if (!cur.example) cur.example = title;
          unknownCounts.set(p31, cur);
        }
      }

      const canonical_key = makeCanonicalKey({
        lat: e.lat,
        lng: e.lng,
        date_start: e.date_start,
        title,
      });

      const description = "Imported from Wikidata. See source for details.";

      const ds = toDateOrNull(e.date_start);
      const de = toDateOrNull(e.date_end);

      if (e.date_start && !toDateOrNull(e.date_start)) {
        console.log("BAD date_start", { qid: e.wikidata_id, date_start: e.date_start, source_url: e.source_url });
        process.exit(1);
      }
      if (e.date_end && !toDateOrNull(e.date_end)) {
        console.log("BAD date_end", { qid: e.wikidata_id, date_end: e.date_end, source_url: e.source_url });
        process.exit(1);
      }

      if (ds && !/^\d{4}-\d{2}-\d{2}$/.test(ds)) {
        console.log("BAD ds", { qid: e.wikidata_id, ds, source_url: e.source_url, raw_start: e.date_start });
        process.exit(1);
      }
      if (de && !/^\d{4}-\d{2}-\d{2}$/.test(de)) {
        console.log("BAD de", { qid: e.wikidata_id, de, source_url: e.source_url, raw_end: e.date_end });
        process.exit(1);
      }

      spots.push({
        user_id: IMPORT_USER_ID,
        title,
        description,
        category,
        location: `POINT(${e.lng} ${e.lat})`,
        visibility: "public",
        status: "active",
        date_start: ds,
        date_end: de,
        source_url: e.source_url,
        confidence: DEFAULT_CONFIDENCE,
        import_source: IMPORT_SOURCE,
        is_imported: true,
        wikidata_id: e.wikidata_id,
        instance_of: e.p31,
        wikidata_description: e.wikidata_description,
        canonical_key,
      });
    }

    // Write unknown P31s for this page
    if (LOG_UNKNOWN_P31 && unknownCounts.size) {
      const rowsOut = [...unknownCounts.entries()]
        .sort((a, b) => b[1].count - a[1].count)
        .map(([p31, v]) => ({ p31, count: v.count, example: v.example }));
      appendUnknownP31CSV(rowsOut);
      console.log(`Logged ${rowsOut.length} unknown P31 types to ${UNKNOWN_P31_CSV}`);
    }

    totalPrepared += spots.length;
    console.log(`Prepared ${spots.length} spots for this page.`);

    if (DRY_RUN) {
      console.log("DRY_RUN=true — not writing to Supabase.");
      if (DRY_RUN_SAMPLES > 0) {
        console.log(`Showing ${Math.min(DRY_RUN_SAMPLES, spots.length)} sample rows:`);
        printSamples(spots, DRY_RUN_SAMPLES);
      }
    } else {
      console.log(`Upserting in batches of ${BATCH_SIZE}…`);
      for (let i = 0; i < spots.length; i += BATCH_SIZE) {
        const batch = spots.slice(i, i + BATCH_SIZE);
        await upsertBatch(batch);
        totalWritten += batch.length;
        console.log(`Upserted ${totalWritten} total rows so far…`);
        await sleep(pace.ms);
      }
    }

    // Save resume state after each page
    const next_offset = offset + LIMIT;
    writeState({
      updated_at: new Date().toISOString(),
      limit: LIMIT,
      last_offset: offset,
      next_offset,
      total_prepared: totalPrepared,
      total_written: totalWritten,
      dry_run: DRY_RUN,
      pace_ms: pace.ms,
    });

    page += 1;

    if (!AUTO_PAGINATE) {
      console.log("AUTO_PAGINATE=false — processed one page only.");
      break;
    }

    offset = next_offset;
    await sleep(pace.ms);
  }

  console.log("\n=== Summary ===");
  console.log(`Import mode: ${IMPORT_MODE}`);
  console.log(`Import region: ${IMPORT_REGION}`);
  console.log(`Prepared: ${totalPrepared}`);
  console.log(`Written:  ${DRY_RUN ? 0 : totalWritten}`);
  console.log(`State file: ${STATE_FILE}`);
  if (LOG_UNKNOWN_P31) console.log(`Unknown P31 CSV: ${UNKNOWN_P31_CSV}`);
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});