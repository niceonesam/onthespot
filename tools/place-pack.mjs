import "dotenv/config";
import minimist from "minimist";
import { createClient } from "@supabase/supabase-js";
import { createPack } from "./lib/pack-create.mjs";
import { validatePack } from "./lib/pack-validate.mjs";
import { previewPack } from "./lib/pack-preview.mjs";
import { importPack } from "./lib/pack-import.mjs";
import { loadPack, savePack } from "./lib/pack-utils.mjs";

import crypto from "node:crypto";

function makeEntryId(prefix = "entry") {
  if (typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function slugify(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function makeEntryFingerprint({ title, date_start, lat, lng }) {
  return `${slugify(title)}|${date_start ?? "no-date"}|${Number(lat).toFixed(4)}|${Number(lng).toFixed(4)}`;
}

function isLikelyJunkPage({ title, extract = "", description = "" }) {
  const text = `${title} ${extract} ${description}`.toLowerCase();
  if (/^list of\b/.test(text)) return true;
  if (/^index of\b/.test(text)) return true;
  if (/\bdisambiguation\b/.test(text)) return true;
  if (/\bmay refer to\b/.test(text)) return true;
  if (/\bcategory:\b/.test(text)) return true;
  if (/\btemplate:\b/.test(text)) return true;
  if (/\b(wikipedia|wikimedia)\b/.test(text)) return true;
  if (/^\d{3,4}$/.test(String(title).trim())) return true;
  return false;
}

function getPackData(slug) {
  if (!slug) throw new Error("Missing --slug");
  return loadPack(slug);
}

async function purgePack({ slug }) {
  if (!slug) throw new Error("Missing --slug");

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase environment variables");
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  console.log(`Purging spots for pack: ${slug}`);

  const { error } = await supabase
    .from("spots")
    .delete()
    .like("canonical_key", `${slug}|%`);

  if (error) throw new Error(error.message);

  console.log(`✔ Purged spots for ${slug}`);
  return { slug, purged: true };
}

async function diffPack({ slug }) {
  if (!slug) throw new Error("Missing --slug");

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase environment variables");
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const pack = loadPack(slug);

  const keys = pack.entries.map((e) => {
    const date = e.date_start ?? "no-date";
    const title = e.title.toLowerCase().replace(/\s+/g, "-");
    return `${slug}|${date}|${title}`;
  });

  const { data, error } = await supabase
    .from("spots")
    .select("canonical_key")
    .like("canonical_key", `${slug}|%`);

  if (error) throw new Error(error.message);

  const existing = new Set((data ?? []).map((r) => r.canonical_key));

  let added = 0;
  let unchanged = 0;

  for (const keyVal of keys) {
    if (existing.has(keyVal)) unchanged++;
    else added++;
  }

  console.log(`+ ${added} new entries`);
  console.log(`= ${unchanged} unchanged`);
  return { slug, added, unchanged };
}

async function suggestEntries({ lat, lng, radius, place, query, slug }) {
  // If a slug is provided, attempt to load the pack and use its place/name
  let slugPlace = null;
  if (slug) {
    try {
      const pack = loadPack(slug);
      slugPlace = pack?.place?.name || pack?.name || slug;
    } catch (e) {
      console.warn(`Could not load pack for slug '${slug}', falling back to slug name.`);
      slugPlace = slug;
    }
  }

  const manualQuery = [place, query, slugPlace]
    .filter((v) => typeof v === "string" && v.trim())
    .join(" ")
    .trim();

  if ((!lat || !lng) && !manualQuery) {
    throw new Error("Missing --lat/--lng or --place/--query");
  }

  const latNum = lat != null ? Number(lat) : null;
  const lngNum = lng != null ? Number(lng) : null;
  const radiusNum = Number(radius ?? 3000);

  if ((lat != null && Number.isNaN(latNum)) || (lng != null && Number.isNaN(lngNum))) {
    throw new Error("Invalid --lat or --lng");
  }

  if (latNum != null && lngNum != null) {
    const wikiGeoUrl = new URL("https://en.wikipedia.org/w/api.php");
    wikiGeoUrl.searchParams.set("action", "query");
    wikiGeoUrl.searchParams.set("list", "geosearch");
    wikiGeoUrl.searchParams.set("gscoord", `${latNum}|${lngNum}`);
    wikiGeoUrl.searchParams.set("gsradius", String(Math.min(radiusNum, 10000)));
    wikiGeoUrl.searchParams.set("gslimit", "20");
    wikiGeoUrl.searchParams.set("format", "json");
    wikiGeoUrl.searchParams.set("origin", "*");

    const geoRes = await fetch(wikiGeoUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent": "OnTheSpot/0.1",
      },
    });

    if (!geoRes.ok) {
      const text = await geoRes.text();
      throw new Error(`Wikipedia geosearch failed: ${geoRes.status} ${text.slice(0, 300)}`);
    }

    const geoJson = await geoRes.json();
    const geoResults = geoJson?.query?.geosearch ?? [];

    const suggestions = geoResults.map((row) => ({
      title: row.title,
      distance_m: typeof row.dist === "number" ? Math.round(row.dist) : null,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(row.title.replace(/ /g, "_"))}`,
      source: "geosearch",
    }));

    if (geoResults.length > 0) {
      console.log("Suggested nearby historical places (Wikipedia geosearch):\n");
      for (const item of suggestions) {
        const dist = item.distance_m != null ? ` (${item.distance_m}m)` : "";
        console.log(`• ${item.title}${dist}  ${item.url}`);
      }
      return { source: "geosearch", suggestions };
    }
  }

  let reverseJson = null;
  let address = {};

  if (latNum != null && lngNum != null) {
    const reverseUrl = new URL("https://nominatim.openstreetmap.org/reverse");
    reverseUrl.searchParams.set("lat", String(latNum));
    reverseUrl.searchParams.set("lon", String(lngNum));
    reverseUrl.searchParams.set("format", "jsonv2");
    reverseUrl.searchParams.set("zoom", "18");
    reverseUrl.searchParams.set("addressdetails", "1");

    const reverseRes = await fetch(reverseUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent": "OnTheSpot/0.1 (contact: admin@onthespot.example)",
      },
    });

    if (reverseRes.ok) {
      reverseJson = await reverseRes.json();
      address = reverseJson?.address ?? {};
    }
  }

  const displayParts = String(reverseJson?.display_name ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

  const rawTerms = [
    manualQuery,
    reverseJson?.name,
    reverseJson?.display_name,
    address.attraction,
    address.tourism,
    address.historic,
    address.building,
    address.amenity,
    address.road,
    address.pedestrian,
    address.footway,
    address.suburb,
    address.neighbourhood,
    address.city_district,
    address.city,
    address.town,
    address.village,
    address.county,
    address.state,
    ...displayParts.slice(0, 6),
  ];

  const searchTerms = rawTerms
    .flatMap((v) => {
      if (typeof v !== "string") return [];
      return v
        .split(/[|;/]/)
        .map((s) => s.trim())
        .filter(Boolean);
    })
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .filter((v) => v.length >= 3)
    .slice(0, 10);

  if (searchTerms.length === 0) {
    console.log("Suggested nearby historical places:\n");
    if (reverseJson) {
      console.log("Reverse geocoder response:");
      console.log(JSON.stringify(reverseJson, null, 2));
      console.log("");
    }
    console.log("(no nearby items found, and no useful place names were available)");
    return { source: "none", searchTerms: [], suggestions: [] };
  }

  const wikiSearchUrl = new URL("https://en.wikipedia.org/w/api.php");
  wikiSearchUrl.searchParams.set("action", "query");
  wikiSearchUrl.searchParams.set("list", "search");
  wikiSearchUrl.searchParams.set("srsearch", searchTerms.map((t) => `intitle:${t}`).join(" OR "));
  wikiSearchUrl.searchParams.set("srlimit", "15");
  wikiSearchUrl.searchParams.set("format", "json");
  wikiSearchUrl.searchParams.set("origin", "*");

  const searchRes = await fetch(wikiSearchUrl, {
    headers: {
      Accept: "application/json",
      "User-Agent": "OnTheSpot/0.1",
    },
  });

  if (!searchRes.ok) {
    const text = await searchRes.text();
    throw new Error(`Wikipedia search failed: ${searchRes.status} ${text.slice(0, 300)}`);
  }

  const searchJson = await searchRes.json();
  const searchResults = searchJson?.query?.search ?? [];

  console.log("Suggested nearby historical places (Wikipedia search fallback):\n");
  console.log(`Search terms: ${searchTerms.join(", ")}\n`);

  if (searchResults.length === 0) {
    console.log("(no nearby items found)");
    return { source: "search-fallback", searchTerms, suggestions: [] };
  }

  const suggestions = searchResults.map((row) => ({
    title: row.title,
    distance_m: null,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(row.title.replace(/ /g, "_"))}`,
    source: "search-fallback",
  }));

  for (const item of suggestions) {
    console.log(`• ${item.title}  ${item.url}`);
  }

  return { source: "search-fallback", searchTerms, suggestions };
}


function yearToDate(year) {
  if (!Number.isInteger(year) || year < 1 || year > 9999) return null;
  return `${String(year).padStart(4, "0")}-01-01`;
}

function extractYearCandidates(...values) {
  const text = values.filter(Boolean).join(" \n ");
  const matches = [...text.matchAll(/\b(\d{3,4})\b/g)].map((m) => Number(m[1]));
  return matches.filter((y) => y >= 1 && y <= 9999);
}

function parseWikidataTimeValue(value) {
  const time = value?.mainsnak?.datavalue?.value?.time;
  if (typeof time !== "string") return null;
  const match = time.match(/^\+?(\d{1,4})-(\d{2})-(\d{2})T/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = match[2];
  const day = match[3];
  if (!Number.isInteger(year) || year < 1 || year > 9999) return null;
  return `${String(year).padStart(4, "0")}-${month}-${day}`;
}

function getFirstClaimDate(claims, propertyIds) {
  for (const propertyId of propertyIds) {
    const claimList = claims?.[propertyId] ?? [];
    for (const claim of claimList) {
      const parsed = parseWikidataTimeValue(claim);
      if (parsed) return parsed;
    }
  }
  return null;
}


function getEntityIdClaims(claims, propertyId) {
  const claimList = claims?.[propertyId] ?? [];
  const ids = [];
  for (const claim of claimList) {
    const id = claim?.mainsnak?.datavalue?.value?.id;
    if (typeof id === "string") ids.push(id);
  }
  return ids;
}

function inferGeologicalRangeFromText(text) {
  const ranges = [
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

function inferTemporalMetadataFromText({ title, extract, wikiDescription, wikidataDescription, tags }) {
  const text = [
    title,
    extract,
    wikiDescription,
    wikidataDescription,
    ...(tags ?? []),
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

function inferCategoryFromText({ title, extract, wikiDescription, wikidataDescription, p31Ids }) {
  const text = [title, extract, wikiDescription, wikidataDescription, ...(p31Ids ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/(battle|war|siege|raid|uprising|rebellion|massacre)/.test(text)) return "conflict";
  if (/(king|queen|coronation|wedding|funeral|jubilee|pageant|ceremony|procession)/.test(text)) return "ceremony";
  if (/(railway|station|train|tram|bridge|canal|dock|harbour|transport)/.test(text)) return "transport";
  if (/(festival|carnival|fair|show|expo|comic con|biennial|market)/.test(text)) return "festival";
  if (/(museum|gallery|exhibition|art|artist|arts centre)/.test(text)) return "art";
  if (/(church|minster|abbey|cathedral|chapel|quaker|religious|saint)/.test(text)) return "religion";
  if (/(stadium|olympic|championship|cup|grand prix|marathon|race|tournament|league|sport)/.test(text)) return "sport";
  if (/(excavation|archaeolog|hoard|discovered|discovery|found in)/.test(text)) return "discovery";
  if (/(riot|protest|election|parliament|summit|politic|campaign|treaty)/.test(text)) return "political";
  if (/(castle|fort|wall|monument|historic house|palace|tower|stone circle|heritage site|tourist attraction|landmark)/.test(text)) return "landmark";
  if (/(roman|viking|medieval|historic|history|cultural|city|settlement)/.test(text)) return "cultural";
  return "cultural";
}

function inferEraFromDateAndText(dateStart, { title, extract, wikiDescription }) {
  const text = [title, extract, wikiDescription].filter(Boolean).join(" ").toLowerCase();

  if (/geolog|cambrian|ordovician|silurian|devonian|carboniferous|permian|triassic|jurassic|cretaceous|paleogene|neogene|quaternary|pleistocene|holocene|glacial|ice age|devensian|alluvium|sandstone|sediment|floodplain|moraine/.test(text)) {
    return "Geological Time";
  }
  if (/bronze age|iron age|neolithic|prehistoric/.test(text)) return "Prehistory";
  if (/roman|eboracum/.test(text)) return "Roman Britain";
  if (/viking|jorvik|norse/.test(text)) return "Viking Age";
  if (/norman/.test(text)) return "Norman Britain";
  if (/medieval|minster|abbey|cathedral/.test(text)) return "Medieval Britain";
  if (/civil war|stuart|tudor|early modern/.test(text)) return "Early Modern Britain";
  if (/victorian|industrial|railway/.test(text)) return "Industrial Britain";
  if (/world war|wwii|ww2|wartime/.test(text)) return "20th Century";

  if (!dateStart) return "Unclassified";

  const year = Number(String(dateStart).slice(0, 4));
  if (year < 500) return "Roman Britain";
  if (year < 1066) return "Early Medieval Britain";
  if (year < 1485) return "Medieval Britain";
  if (year < 1714) return "Early Modern Britain";
  if (year < 1901) return "Industrial Britain";
  if (year < 2000) return "20th Century";
  return "Contemporary Britain";
}

async function fetchWikipediaPageMetadata(title) {
  const metaUrl = new URL("https://en.wikipedia.org/w/api.php");
  metaUrl.searchParams.set("action", "query");
  metaUrl.searchParams.set("prop", "pageprops");
  metaUrl.searchParams.set("titles", title);
  metaUrl.searchParams.set("format", "json");
  metaUrl.searchParams.set("origin", "*");

  const res = await fetch(metaUrl, {
    headers: {
      Accept: "application/json",
      "User-Agent": "OnTheSpot/0.1",
    },
  });

  if (!res.ok) return null;
  const json = await res.json();
  const pages = json?.query?.pages ?? {};
  const page = Object.values(pages)[0];
  const wikibaseItem = page?.pageprops?.wikibase_item ?? null;
  return { wikibaseItem };
}

async function fetchWikidataEntityMetadata(entityId) {
  if (!entityId) return null;

  const entityUrl = new URL("https://www.wikidata.org/w/api.php");
  entityUrl.searchParams.set("action", "wbgetentities");
  entityUrl.searchParams.set("ids", entityId);
  entityUrl.searchParams.set("props", "claims|descriptions");
  entityUrl.searchParams.set("languages", "en");
  entityUrl.searchParams.set("format", "json");
  entityUrl.searchParams.set("origin", "*");

  const res = await fetch(entityUrl, {
    headers: {
      Accept: "application/json",
      "User-Agent": "OnTheSpot/0.1",
    },
  });

  if (!res.ok) return null;
  const json = await res.json();
  return json?.entities?.[entityId] ?? null;
}

async function fetchWikipediaRelatedTitles(title, limit = 5) {
  const linksUrl = new URL("https://en.wikipedia.org/w/api.php");
  linksUrl.searchParams.set("action", "query");
  linksUrl.searchParams.set("prop", "links");
  linksUrl.searchParams.set("titles", title);
  linksUrl.searchParams.set("pllimit", String(Math.max(1, Math.min(limit, 10))));
  linksUrl.searchParams.set("format", "json");
  linksUrl.searchParams.set("origin", "*");

  const res = await fetch(linksUrl, {
    headers: {
      Accept: "application/json",
      "User-Agent": "OnTheSpot/0.1",
    },
  });

  if (!res.ok) return [];
  const json = await res.json();
  const pages = json?.query?.pages ?? {};
  const page = Object.values(pages)[0];
  const links = page?.links ?? [];
  return links
    .map((item) => item?.title)
    .filter((v) => typeof v === "string" && v.trim())
    .slice(0, limit);
}

function pickBetterDescription(summaryJson, wikidataDescription, searchQuery) {
  const extract = typeof summaryJson?.extract === "string" ? summaryJson.extract.trim() : "";
  const wikiDescription = typeof summaryJson?.description === "string" ? summaryJson.description.trim() : "";

  if (extract.length >= 120) return extract;
  if (extract.length > 0 && wikidataDescription) return `${extract} ${wikidataDescription}.`.trim();
  if (extract.length > 0) return extract;
  if (wikidataDescription) return `${wikidataDescription}.`;
  return `Candidate historical entry related to ${searchQuery}.`;
}

async function buildGeneratedEntryMetadata({ title, extract, wikiDescription }) {
  const pageMeta = await fetchWikipediaPageMetadata(title);
  const wikidataEntity = await fetchWikidataEntityMetadata(pageMeta?.wikibaseItem ?? null);

  const claims = wikidataEntity?.claims ?? {};
  const wikidataDescription = wikidataEntity?.descriptions?.en?.value ?? null;
  const p31Ids = getEntityIdClaims(claims, "P31");

  let dateStart = getFirstClaimDate(claims, ["P585", "P571", "P580", "P577", "P569", "P1619"]);
  let dateEnd = getFirstClaimDate(claims, ["P582", "P570"]);

  if (!dateStart) {
    const fallbackYears = extractYearCandidates(title, extract, wikiDescription, wikidataDescription);
    const uniqueYears = [...new Set(fallbackYears)].sort((a, b) => a - b);
    if (uniqueYears.length > 0) {
      dateStart = yearToDate(uniqueYears[0]);
      if (!dateEnd && uniqueYears.length > 1 && uniqueYears[1] >= uniqueYears[0]) {
        dateEnd = yearToDate(uniqueYears[1]);
      }
    }
  }

  const category = inferCategoryFromText({
    title,
    extract,
    wikiDescription,
    wikidataDescription,
    p31Ids,
  });

  const temporal = inferTemporalMetadataFromText({
    title,
    extract,
    wikiDescription,
    wikidataDescription,
    tags: p31Ids,
  });

  const era = inferEraFromDateAndText(dateStart, {
    title,
    extract,
    wikiDescription: wikiDescription ?? wikidataDescription,
  });

  return {
    date_start: dateStart,
    date_end: dateEnd,
    category,
    era,
    time_scale: temporal.time_scale,
    years_ago_start: temporal.years_ago_start,
    years_ago_end: temporal.years_ago_end,
    wikibaseItem: pageMeta?.wikibaseItem ?? null,
    wikidataDescription,
    p31Ids,
  };
}

async function generateEntries({ slug, place, query, limit }) {
  const manualQuery = [place, query].filter((v) => typeof v === "string" && v.trim()).join(" ").trim();

  if (!slug && !manualQuery) {
    throw new Error("Missing --slug or --place/--query");
  }

  let pack = null;
  let packSlug = slug ?? null;
  let packPlaceName = null;

  if (slug) {
    pack = loadPack(slug);
    packSlug = pack.place.slug;
    packPlaceName = pack?.place?.name ?? slug;
  }

  const searchQuery = [manualQuery, packPlaceName].filter((v) => typeof v === "string" && v.trim()).join(" ").trim();
  const resultLimit = Math.max(1, Math.min(Number(limit ?? 8), 20));

  const wikiSearchUrl = new URL("https://en.wikipedia.org/w/api.php");
  wikiSearchUrl.searchParams.set("action", "query");
  wikiSearchUrl.searchParams.set("list", "search");
  wikiSearchUrl.searchParams.set("srsearch", searchQuery);
  wikiSearchUrl.searchParams.set("srlimit", String(resultLimit));
  wikiSearchUrl.searchParams.set("format", "json");
  wikiSearchUrl.searchParams.set("origin", "*");

  const searchRes = await fetch(wikiSearchUrl, {
    headers: {
      Accept: "application/json",
      "User-Agent": "OnTheSpot/0.1",
    },
  });

  if (!searchRes.ok) {
    const text = await searchRes.text();
    throw new Error(`Wikipedia search failed: ${searchRes.status} ${text.slice(0, 300)}`);
  }

  const searchJson = await searchRes.json();
  const searchResults = searchJson?.query?.search ?? [];

  if (searchResults.length === 0) {
    console.log("No candidate pages found.");
    return { slug: packSlug, generatedEntries: [], searchQuery };
  }

  const existingTitles = new Set(
    (pack?.entries ?? []).map((entry) => String(entry.title).trim().toLowerCase())
  );
  const existingFingerprints = new Set(
    [...(pack?.entries ?? []), ...(pack?.candidates ?? [])].map((entry) =>
      makeEntryFingerprint({
        title: entry.title,
        date_start: entry.date_start,
        lat: entry.lat,
        lng: entry.lng,
      })
    )
  );

  const generatedEntries = [];

  for (const row of searchResults) {
    const title = row.title;

    if (isLikelyJunkPage({ title, extract: row?.snippet ?? "", description: "" })) {
      continue;
    }

    if (existingTitles.has(title.trim().toLowerCase())) {
      continue;
    }

    const summaryUrl = new URL(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`
    );

    const summaryRes = await fetch(summaryUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent": "OnTheSpot/0.1",
      },
    });

    if (!summaryRes.ok) {
      continue;
    }

    const summaryJson = await summaryRes.json();
    const extract = pickBetterDescription(summaryJson, null, searchQuery);

    const sourceUrl = summaryJson?.content_urls?.desktop?.page
      ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;

    const inferred = await buildGeneratedEntryMetadata({
      title,
      extract,
      wikiDescription: summaryJson?.description ?? null,
    });

    const relatedTitles = await fetchWikipediaRelatedTitles(title, 5);

    const media = [];
    if (summaryJson?.thumbnail?.source) {
      media.push({
        type: "image",
        url: summaryJson.thumbnail.source,
        caption: title,
      });
    }

    const tags = [];
    if (packSlug) tags.push(packSlug);
    if (packPlaceName) tags.push(packPlaceName.toLowerCase());
    if (summaryJson?.description) tags.push(String(summaryJson.description).toLowerCase());

    const fingerprint = makeEntryFingerprint({
      title,
      date_start: inferred.date_start,
      lat: pack?.place?.lat ?? 0,
      lng: pack?.place?.lng ?? 0,
    });

    if (existingFingerprints.has(fingerprint)) {
      continue;
    }
    existingFingerprints.add(fingerprint);

    generatedEntries.push({
      id: makeEntryId("candidate"),
      title,
      date_start: inferred.date_start,
      date_end: inferred.date_end,
      category: inferred.category,
      description: extract,
      significance: `Candidate generated from Wikipedia/Wikidata for ${searchQuery}. Review dates, relevance, and classification before import.`,
      source_url: sourceUrl,
      confidence: inferred.date_start ? 3 : 2,
      lat: pack?.place?.lat ?? 0,
      lng: pack?.place?.lng ?? 0,
      area_note: packPlaceName ? `Generated near ${packPlaceName}. Review exact relevance to place.` : null,
      era: inferred.era,
      time_scale: inferred.time_scale,
      years_ago_start: inferred.years_ago_start,
      years_ago_end: inferred.years_ago_end,
      tags: [...new Set([...tags, ...relatedTitles, ...(inferred.p31Ids ?? []), inferred.wikibaseItem, inferred.wikidataDescription])].filter(Boolean),
      media,
      review_status: "draft",
      origin: "generated",
      visibility: "public",
      status: "active",
    });
  }

  if (generatedEntries.length === 0) {
    console.log("No new candidate entries generated.");
    return { slug: packSlug, generatedEntries: [], searchQuery };
  }

  if (pack) {
    pack.candidates = pack.candidates ?? [];
    pack.candidates.push(...generatedEntries);
    savePack(packSlug, pack);
    console.log(`✔ Generated ${generatedEntries.length} candidate entries into data/place-packs/${packSlug}.json (stored in candidates)`);
    console.log("");
    console.log("Generated entry summary:");
    for (const entry of generatedEntries) {
      console.log(`• ${entry.title} | ${entry.date_start ?? "no-date"} | ${entry.category} | ${entry.era} | ${entry.review_status}`);
    }
    console.log("");
    console.log("Review dates, categories, relevance, and significance before importing.");
    return { slug: packSlug, generatedEntries, searchQuery, savedToPack: true };
  }

  console.log("Generated candidate entries:\n");
  for (const entry of generatedEntries) {
    console.log(`• ${entry.title} | ${entry.date_start ?? "no-date"} | ${entry.category} | ${entry.era}`);
    console.log(`  ${entry.source_url}`);
  }
  return { slug: packSlug, generatedEntries, searchQuery, savedToPack: false };
}

function approveCandidate({ slug, id, title, date_start, date_end, category, era, significance, area_note, confidence }) {
  if (!slug) throw new Error("Missing --slug");
  if (!id) throw new Error("Missing --id");

  const pack = loadPack(slug);
  pack.entries = pack.entries ?? [];
  pack.candidates = pack.candidates ?? [];

  const index = pack.candidates.findIndex((entry) => entry.id === id);
  if (index === -1) {
    throw new Error(`Candidate not found: ${id}`);
  }

  const candidate = pack.candidates[index];
  const promoted = {
    ...candidate,
    title: title ?? candidate.title,
    date_start: date_start ?? candidate.date_start,
    date_end: date_end ?? candidate.date_end,
    category: category ?? candidate.category,
    era: era ?? candidate.era,
    significance: significance ?? candidate.significance,
    area_note: area_note ?? candidate.area_note,
    confidence: confidence != null ? Number(confidence) : candidate.confidence,
    review_status: "approved",
  };

  pack.candidates.splice(index, 1);
  pack.entries.push(promoted);

  savePack(slug, pack);

  console.log(`✔ Approved candidate ${id}`);
  console.log(`Moved '${candidate.title}' from candidates to entries as '${promoted.title}'.`);
  console.log(`Final metadata: ${promoted.date_start ?? "no-date"} | ${promoted.category} | ${promoted.era}`);
  return { slug, id, entry: promoted };
}

function rejectCandidate({ slug, id }) {
  if (!slug) throw new Error("Missing --slug");
  if (!id) throw new Error("Missing --id");

  const pack = loadPack(slug);
  pack.candidates = pack.candidates ?? [];

  const index = pack.candidates.findIndex((entry) => entry.id === id);
  if (index === -1) {
    throw new Error(`Candidate not found: ${id}`);
  }

  const [removed] = pack.candidates.splice(index, 1);
  savePack(slug, pack);

  console.log(`✔ Rejected candidate ${id}`);
  console.log(`Removed '${removed.title}' from candidates.`);
  return { slug, id, removed };
}

function listCandidates({ slug }) {
  if (!slug) throw new Error("Missing --slug");

  const pack = loadPack(slug);
  const candidates = pack.candidates ?? [];

  console.log(`Candidates for ${slug}:`);
  console.log("");

  if (candidates.length === 0) {
    console.log("(no candidates)");
    return { slug, candidates };
  }

  for (const entry of candidates) {
    console.log(
      `${entry.id} | ${entry.title} | ${entry.date_start ?? "no-date"} | ${entry.category} | ${entry.era} | ${entry.review_status}`
    );
  }

  return { slug, candidates };
}

async function runCommand(argv) {
  const parsedArgv = Array.isArray(argv) ? minimist(argv) : argv;
  const command = parsedArgv._[0];

  if (!command) {
    console.log("Usage: node tools/place-pack.mjs <command> [options]");
    console.log("");
    console.log("Commands:");
    console.log("  create   Create a new empty place pack");
    console.log("  validate Validate a place pack");
    console.log("  preview  Preview a place pack");
    console.log("  import   Import a place pack into Supabase");
    console.log("  purge    Delete spots previously imported from a place pack");
    console.log("  diff     Show changes between pack and database");
    console.log("  suggest  Suggest nearby historical places (--lat/--lng, --place, or --slug)");
    console.log("  generate Generate candidate pack entries with inferred dates/categories (--slug or --place)");
    console.log("  approve  Approve a candidate and optionally override fields (--slug --id [--category --era --date_start ...])");
    console.log("  reject   Remove a candidate from the pack (--slug --id)");
    console.log("  list-candidates List candidate entries for a pack (--slug)");
    process.exit(1);
  }

  try {
    switch (command) {
      case "create":
        return createPack(parsedArgv);
      case "validate":
        return validatePack(parsedArgv);
      case "preview":
        return previewPack(parsedArgv);
      case "import":
        return await importPack(parsedArgv);
      case "purge":
        return await purgePack(parsedArgv);
      case "diff":
        return await diffPack(parsedArgv);
      case "suggest":
        return await suggestEntries(parsedArgv);
      case "generate":
        return await generateEntries(parsedArgv);
      case "approve":
        return approveCandidate(parsedArgv);
      case "reject":
        return rejectCandidate(parsedArgv);
      case "list-candidates":
        return listCandidates(parsedArgv);
      default:
        throw new Error(`Unknown command: ${command}`);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

async function main() {
  await runCommand(process.argv.slice(2));
}

const isDirectRun = process.argv[1]
  && new URL(`file://${process.argv[1]}`).href === import.meta.url;

if (isDirectRun) {
  main();
}

export {
  approveCandidate,
  diffPack,
  generateEntries,
  listCandidates,
  purgePack,
  rejectCandidate,
  runCommand,
  suggestEntries,
  getPackData,
};