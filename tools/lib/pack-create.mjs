import { ensurePackDir, savePack, packExists } from "./pack-utils.mjs";

export function makeEmptyPack({
  slug,
  name,
  lat,
  lng,
  radius_m,
  country,
  region,
  summary,
}) {
  return {
    place: {
      slug,
      name,
      lat,
      lng,
      radius_m,
      summary,
      country,
      region,
      hero_image_url: null,
    },
    entries: [],
    candidates: [],
    metadata: {
      created_by: "sam",
      review_status: "draft",
      source_mix: ["manual"],
      notes: "",
    },
  };
}

export function createPack(args) {
  const {
    slug,
    name,
    lat,
    lng,
    radius,
    country,
    region,
    summary,
  } = args;

  if (!slug) throw new Error("Missing --slug");
  if (!name) throw new Error("Missing --name");
  if (!lat) throw new Error("Missing --lat");
  if (!lng) throw new Error("Missing --lng");

  ensurePackDir();

  if (packExists(slug)) {
    throw new Error(`Pack already exists: ${slug}`);
  }

  const pack = makeEmptyPack({
    slug,
    name,
    lat: Number(lat),
    lng: Number(lng),
    radius_m: Number(radius ?? 500),
    country: country ?? "United Kingdom",
    region: region ?? "Unknown",
    summary: summary ?? "",
  });

  savePack(slug, pack);

  console.log(`✔ Created pack: data/place-packs/${slug}.json`);
}