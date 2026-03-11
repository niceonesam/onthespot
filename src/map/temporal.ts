export type TemporalSpotLike = {
  date_start?: string | null;
  time_scale_out?: "human" | "ancient" | "geological" | string | null;
  period_label_out?: string | null;
};

export type TemporalScale = "human" | "ancient" | "geological";

export type TemporalScaleResult = {
  scale: TemporalScale;
  color: string;
};

function getDateString(input: string | null | undefined | TemporalSpotLike) {
  if (typeof input === "string") return input;
  return input?.date_start ?? null;
}

export function formatStoryDate(date?: string | null) {
  if (!date) return null;

  const d = date.trim();

  // ---- BP / cal BP formats (e.g. "12900 BP", "11700 cal BP")
  const bpMatch = d.match(/^([\d,]+(?:\.\d+)?)\s*(cal\s*)?bp$/i);
  if (bpMatch) {
    const raw = Number(bpMatch[1].replace(/,/g, ""));
    const isCal = Boolean(bpMatch[2]);

    if (Number.isFinite(raw)) {
      const rounded = raw >= 1000 ? Math.round(raw) : Number(raw.toFixed(1));
      return isCal
        ? `${rounded.toLocaleString()} cal BP`
        : `${rounded.toLocaleString()} BP`;
    }
  }

  // ---- Named Late Glacial / palaeoenvironmental events
  if (/younger\s+dryas/i.test(d)) return "Younger Dryas";
  if (/late\s+glacial/i.test(d)) return "Late Glacial";
  if (/b[øo]lling[-–\s]*aller[øo]d/i.test(d)) return "Bølling–Allerød";
  if (/older\s+dryas/i.test(d)) return "Older Dryas";

  // ---- Pure year (e.g. "1874")
  const yearOnly = /^-?\d{1,6}$/.test(d) ? Number(d) : null;
  if (yearOnly !== null) {
    if (yearOnly >= 1800 && yearOnly <= 1899) return `${yearOnly}s`;
    if (yearOnly >= 1900 && yearOnly <= 1999) return `${yearOnly}s`;
    if (yearOnly >= 2000 && yearOnly <= 2099) return `${yearOnly}s`;

    if (yearOnly < 0) {
      const abs = Math.abs(yearOnly);
      return `${abs.toLocaleString()} BC`;
    }

    if (yearOnly >= 1 && yearOnly < 500) return `${yearOnly} AD`;
    if (yearOnly >= 500 && yearOnly < 1500) return `${yearOnly} AD`;
    if (yearOnly >= 1500 && yearOnly < 1800) return `${yearOnly} AD`;

    return String(yearOnly);
  }

  // ---- Geological shorthand (e.g. "150Ma", "2.4Ga")
  const geoMatch = d.match(/^([\d.]+)\s*(ka|ma|ga)$/i);
  if (geoMatch) {
    const value = Number(geoMatch[1]);
    const unit = geoMatch[2].toLowerCase();

    if (unit === "ka") return `${value} thousand years ago`;
    if (unit === "ma") return `${value} million years ago`;
    if (unit === "ga") return `${value} billion years ago`;
  }

  // ---- Already geological phrases
  if (/million years/i.test(d)) return d;
  if (/billion years/i.test(d)) return d;
  if (/thousand years/i.test(d)) return d;

  // ---- Named geological periods
  const periods = [
    "Cambrian",
    "Ordovician",
    "Silurian",
    "Devonian",
    "Carboniferous",
    "Permian",
    "Triassic",
    "Jurassic",
    "Cretaceous",
    "Paleogene",
    "Neogene",
    "Quaternary",
    "Holocene",
    "Pleistocene",
  ];

  for (const p of periods) {
    if (d.toLowerCase().includes(p.toLowerCase())) {
      return p;
    }
  }

  try {
    return new Date(d).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return d;
  }
}

export function classifyTimeScale(
  input?: string | null | TemporalSpotLike
): TemporalScaleResult {
  const explicitScale =
    input && typeof input === "object" ? input.time_scale_out ?? null : null;

  if (
    explicitScale === "human" ||
    explicitScale === "ancient" ||
    explicitScale === "geological"
  ) {
    return {
      scale: explicitScale,
      color:
        explicitScale === "geological"
          ? "#6b21a8"
          : explicitScale === "ancient"
            ? "#E6B325"
            : "#1FB6A6",
    };
  }

  const date = getDateString(input);
  if (!date) return { scale: "human", color: "#1FB6A6" };

  const d = date.trim().toLowerCase();

  // BP / cal BP formats
  const bpMatch = d.match(/^([\d,]+(?:\.\d+)?)\s*(cal\s*)?bp$/i);
  if (bpMatch) {
    const raw = Number(bpMatch[1].replace(/,/g, ""));
    if (Number.isFinite(raw)) {
      if (raw >= 11700) {
        return { scale: "geological", color: "#6b21a8" };
      }
      return { scale: "ancient", color: "#E6B325" };
    }
  }

  // Named Late Glacial / palaeoenvironmental phases
  if (
    d.includes("younger dryas") ||
    d.includes("late glacial") ||
    d.includes("older dryas") ||
    d.includes("bølling") ||
    d.includes("bolling") ||
    d.includes("allerød") ||
    d.includes("allerod")
  ) {
    return { scale: "geological", color: "#6b21a8" };
  }

  // Geological shorthand like 150Ma, 2.4Ga, 12ka
  const geo = d.match(/^([\d.]+)\s*(ka|ma|ga)$/i);
  if (geo) {
    const unit = geo[2].toLowerCase();
    if (unit === "ma" || unit === "ga") {
      return { scale: "geological", color: "#6b21a8" };
    }
    if (unit === "ka") {
      return { scale: "ancient", color: "#E6B325" };
    }
  }

  // Geological period names
  const geoPeriods = [
    "cambrian",
    "ordovician",
    "silurian",
    "devonian",
    "carboniferous",
    "permian",
    "triassic",
    "jurassic",
    "cretaceous",
    "paleogene",
    "neogene",
    "quaternary",
    "holocene",
    "pleistocene",
  ];

  if (geoPeriods.some((p) => d.includes(p))) {
    return { scale: "geological", color: "#6b21a8" };
  }

  // BCE / BC and deep prehistory
  if (d.includes("bc") || d.includes("bce") || /^-\d+/.test(d)) {
    const numeric = /^-\d{1,6}$/.test(d) ? Math.abs(Number(d)) : null;
    if (numeric != null && numeric >= 11700) {
      return { scale: "geological", color: "#6b21a8" };
    }
    return { scale: "ancient", color: "#E6B325" };
  }

  return { scale: "human", color: "#1FB6A6" };
}

export function effectiveTimeScale(
  spot: TemporalSpotLike | null | undefined
): TemporalScaleResult {
  if (
    spot?.time_scale_out === "human" ||
    spot?.time_scale_out === "ancient" ||
    spot?.time_scale_out === "geological"
  ) {
    return {
      scale: spot.time_scale_out,
      color:
        spot.time_scale_out === "geological"
          ? "#6b21a8"
          : spot.time_scale_out === "ancient"
            ? "#E6B325"
            : "#1FB6A6",
    };
  }

  return classifyTimeScale(spot);
}

export function timeScaleKey(
  input: string | null | undefined | TemporalSpotLike
): TemporalScale {
  const result = classifyTimeScale(input);
  if (result.scale === "ancient" || result.scale === "geological") {
    return result.scale;
  }
  return "human";
}

export function geologicalPeriodFromMa(ma?: number | null) {
  if (!ma || !Number.isFinite(ma)) return null;

  if (ma < 0.012) return "Holocene";
  if (ma < 2.6) return "Pleistocene";
  if (ma < 23) return "Neogene";
  if (ma < 66) return "Paleogene";
  if (ma < 145) return "Cretaceous";
  if (ma < 201) return "Jurassic";
  if (ma < 252) return "Triassic";
  if (ma < 299) return "Permian";
  if (ma < 359) return "Carboniferous";
  if (ma < 419) return "Devonian";
  if (ma < 444) return "Silurian";
  if (ma < 485) return "Ordovician";
  return "Cambrian";
}

export function storyPeriodLabel(date?: string | null) {
  if (!date) return null;

  const d = date.trim();

  // BP / cal BP formats
  const bpMatch = d.match(/^([\d,]+(?:\.\d+)?)\s*(cal\s*)?bp$/i);
  if (bpMatch) {
    const raw = Number(bpMatch[1].replace(/,/g, ""));
    if (Number.isFinite(raw)) {
      if (raw >= 11700 && raw <= 12900) return "Younger Dryas";
      if (raw > 12900 && raw <= 14600) return "Late Glacial";
      if (raw > 14600 && raw <= 29000) return "Upper Paleolithic";
      if (raw > 29000) return "Deep prehistory";
      if (raw >= 7000 && raw < 11700) return "Mesolithic";
      if (raw >= 4500 && raw < 7000) return "Neolithic";
      if (raw >= 2500 && raw < 4500) return "Bronze Age";
      if (raw >= 800 && raw < 2500) return "Iron Age";
      return null;
    }
  }

  // Named palaeo events
  if (/younger\s+dryas/i.test(d)) return "Younger Dryas";
  if (/late\s+glacial/i.test(d)) return "Late Glacial";
  if (/b[øo]lling[-–\s]*aller[øo]d/i.test(d)) return "Bølling–Allerød";
  if (/older\s+dryas/i.test(d)) return "Older Dryas";

  // Pure year
  const yearOnly = /^-?\d{1,6}$/.test(d) ? Number(d) : null;
  if (yearOnly !== null) {
    if (yearOnly >= 1800 && yearOnly <= 1899) return "19th century";
    if (yearOnly >= 1900 && yearOnly <= 1999) return "20th century";
    if (yearOnly >= 2000 && yearOnly <= 2099) return "21st century";

    if (yearOnly < 0) {
      const abs = Math.abs(yearOnly);
      if (abs >= 11700 && abs <= 50000) return "Upper Paleolithic";
      if (abs >= 9700 && abs < 11700) return "Younger Dryas / Late Upper Paleolithic";
      if (abs >= 7000 && abs < 9700) return "Mesolithic";
      if (abs >= 4500 && abs < 7000) return "Neolithic";
      if (abs >= 2500 && abs < 4500) return "Bronze Age";
      if (abs >= 800 && abs < 2500) return "Iron Age";
      return null;
    }

    if (yearOnly >= 1 && yearOnly < 500) return "Late Antiquity";
    if (yearOnly >= 500 && yearOnly < 1500) return "Medieval";
    if (yearOnly >= 1500 && yearOnly < 1800) return "Early Modern";

    return null;
  }

  // Geological shorthand
  const geoMatch = d.match(/^([\d.]+)\s*(ka|ma|ga)$/i);
  if (geoMatch) {
    const value = Number(geoMatch[1]);
    const unit = geoMatch[2].toLowerCase();

    if (unit === "ma") return geologicalPeriodFromMa(value);
    if (unit === "ga") return "Deep time";
    if (unit === "ka") {
      if (value >= 11.7 && value <= 12.9) return "Younger Dryas";
      if (value > 12.9 && value <= 14.6) return "Late Glacial";
      if (value >= 7 && value < 11.7) return "Mesolithic";
      if (value >= 4.5 && value < 7) return "Neolithic";
    }
  }

  // Named geological periods
  const periods = [
    "Cambrian",
    "Ordovician",
    "Silurian",
    "Devonian",
    "Carboniferous",
    "Permian",
    "Triassic",
    "Jurassic",
    "Cretaceous",
    "Paleogene",
    "Neogene",
    "Quaternary",
    "Holocene",
    "Pleistocene",
  ];

  for (const p of periods) {
    if (d.toLowerCase().includes(p.toLowerCase())) return p;
  }

  return null;
}

export function isModernHumanDate(date?: string | null) {
  if (!date) return false;
  const d = date.trim();

  if (/^\d{4}$/.test(d)) {
    const year = Number(d);
    return Number.isFinite(year) && year >= 1800;
  }

  const parsed = new Date(d);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.getFullYear() >= 1800;
  }

  return false;
}

export function eraKeyForSpot(spot: TemporalSpotLike | null | undefined) {
  const scale = timeScaleKey(spot);
  if (scale === "geological") return "geological" as const;
  if (scale === "ancient") return "prehistoric" as const;
  if (isModernHumanDate(spot?.date_start)) return "modern" as const;
  return "human" as const;
}

export function backendTimeFilterForEra(era: "all" | "modern" | "human" | "prehistoric" | "geological") {
  if (era === "modern" || era === "human") return "human";
  if (era === "prehistoric") return "ancient";
  if (era === "geological") return "geological";
  return null;
}

export function dedupeChronologyTags(
  tags: string[] | null | undefined,
  date?: string | null,
  periodLabelOut?: string | null
) {
  const safeTags = Array.isArray(tags) ? tags : [];
  const dateLabel = formatStoryDate(date)?.trim().toLowerCase() ?? null;
  const periodLabel = (periodLabelOut ?? storyPeriodLabel(date))?.trim().toLowerCase() ?? null;

  return safeTags.filter((tag) => {
    const t = String(tag).trim().toLowerCase();
    if (!t) return false;
    if (dateLabel && t === dateLabel) return false;
    if (periodLabel && t === periodLabel) return false;
    return true;
  });
}