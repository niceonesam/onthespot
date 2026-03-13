import fs from "node:fs";
import path from "node:path";

const PACK_DIR = path.resolve("data/place-packs");

/**
 * Resolve path to a pack file from a slug
 */
export function getPackPath(slug) {
  return path.join(PACK_DIR, `${slug}.json`);
}

/**
 * Check if pack exists
 */
export function packExists(slug) {
  return fs.existsSync(getPackPath(slug));
}

/**
 * Load pack JSON
 */
export function loadPack(slug) {
  const file = getPackPath(slug);

  if (!fs.existsSync(file)) {
    throw new Error(`Pack not found: ${file}`);
  }

  const raw = fs.readFileSync(file, "utf8");
  return JSON.parse(raw);
}

/**
 * Save pack JSON
 */
export function savePack(slug, pack) {
  const file = getPackPath(slug);

  fs.writeFileSync(
    file,
    JSON.stringify(pack, null, 2) + "\n",
    "utf8"
  );
}

/**
 * Ensure pack directory exists
 */
export function ensurePackDir() {
  if (!fs.existsSync(PACK_DIR)) {
    fs.mkdirSync(PACK_DIR, { recursive: true });
  }
}

/**
 * List all packs
 */
export function listPacks() {
  if (!fs.existsSync(PACK_DIR)) return [];

  return fs
    .readdirSync(PACK_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(".json", ""));
}