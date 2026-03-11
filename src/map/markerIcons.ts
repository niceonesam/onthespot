import { timeScaleKey } from "@/map/temporal";

type MarkerTemporalLike = {
  date_start?: string | null;
  time_scale_out?: "human" | "ancient" | "geological" | string | null;
};

export function markerCoreColorForDate(
  input: string | null | undefined | MarkerTemporalLike
) {
  const scale = timeScaleKey(input);
  if (scale === "geological") return "#6b21a8";
  if (scale === "ancient") return "#E6B325";
  return "#1FB6A6";
}

export function markerIconForVisibility(
    v?: string | null,
    spot?: MarkerTemporalLike | null,
    isSelected = false,
    isPulsing = false
  ): google.maps.Icon {
    const size = isSelected || isPulsing ? 42 : 28;
    const anchorX = size / 2;
    const anchorY = size;

    const stroke = isPulsing
      ? "rgba(0,0,0,0.72)"
      : isSelected
        ? "rgba(0,0,0,0.58)"
        : "rgba(0,0,0,0.35)";

    const coreBase = markerCoreColorForDate(spot ?? { date_start: null, time_scale_out: null });
    const scale = timeScaleKey(spot ?? { date_start: null, time_scale_out: null });
    const core = isSelected || isPulsing
      ? coreBase === "#1FB6A6"
        ? "#54d9cb"
        : coreBase === "#E6B325"
          ? "#F2C94C"
          : "#8b5cf6"
      : coreBase;

    const ring =
      v === "friends" ? "#2563eb" :
      v === "group" ? "#a855f7" :
      v === "private" ? "#6b7280" :
      "#0F2A44";

    const outer = "#0F2A44";
    const ringRadius = isSelected || isPulsing ? 10.7 : 10;
    const goldRadius = isSelected || isPulsing ? 7.2 : 6;

    const pulseTicks = isPulsing
      ? `
        <g opacity="0.95">
          <animate attributeName="opacity" values="0.95;0.45;0.95" dur="1.05s" repeatCount="indefinite" />
          <line x1="24" y1="4" x2="24" y2="0.8" stroke="${core}" stroke-width="2" stroke-linecap="round" />
          <line x1="36.7" y1="9.3" x2="39" y2="7" stroke="${core}" stroke-width="2" stroke-linecap="round" />
          <line x1="43" y1="18" x2="46.2" y2="18" stroke="${core}" stroke-width="2" stroke-linecap="round" />
          <line x1="36.7" y1="26.7" x2="39" y2="29" stroke="${core}" stroke-width="2" stroke-linecap="round" />
          <line x1="11.3" y1="9.3" x2="9" y2="7" stroke="${core}" stroke-width="2" stroke-linecap="round" />
          <line x1="5" y1="18" x2="1.8" y2="18" stroke="${core}" stroke-width="2" stroke-linecap="round" />
          <line x1="11.3" y1="26.7" x2="9" y2="29" stroke="${core}" stroke-width="2" stroke-linecap="round" />
        </g>
      `
      : "";

    const halo = isPulsing
      ? `
        <circle cx="24" cy="18" r="12.5" fill="${core}" opacity="0.18">
          <animate attributeName="r" values="12.5;16.8;12.5" dur="1.05s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.22;0.06;0.22" dur="1.05s" repeatCount="indefinite" />
        </circle>
        <circle cx="24" cy="18" r="10.8" fill="none" stroke="${core}" stroke-width="2.6" opacity="0.82">
          <animate attributeName="r" values="10.8;14.4;10.8" dur="1.05s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.9;0.24;0.9" dur="1.05s" repeatCount="indefinite" />
        </circle>
      `
      : isSelected
        ? `
          <circle cx="24" cy="18" r="14" fill="${core}" opacity="0.18" />
          <circle cx="24" cy="18" r="11.5" fill="none" stroke="${core}" stroke-width="2" opacity="0.75" />
        `
        : "";

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 48 48">
      <desc>ots-scale-${scale}</desc>
      ${pulseTicks}
      ${halo}
      <path d="M24 46C24 46 6 28 6 18C6 8 14 2 24 2C34 2 42 8 42 18C42 28 24 46 24 46Z"
            fill="${outer}"
            stroke="${stroke}"
            stroke-width="1.2"/>
      <circle cx="24" cy="18" r="${ringRadius}" fill="${ring}" />
      ${isPulsing ? `<circle cx="24" cy="18" r="9.6" fill="none" stroke="${core}" stroke-width="1.6" opacity="0.7"><animate attributeName="r" values="9.6;12.6;9.6" dur="1.05s" repeatCount="indefinite" /><animate attributeName="opacity" values="0.75;0.18;0.75" dur="1.05s" repeatCount="indefinite" /></circle>` : ""}
      <circle cx="24" cy="18" r="${goldRadius}" fill="${core}" />
    </svg>`;

    return {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
      scaledSize: new google.maps.Size(size, size),
      anchor: new google.maps.Point(anchorX, anchorY),
    };
  }

export function markerIconForUser(): google.maps.Icon {
    const size = 30;
    const anchorX = size / 2;
    const anchorY = size / 2;

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 48 48">
      <circle cx="24" cy="24" r="18" fill="#ffffff" stroke="#0F2A44" stroke-width="2.4" />
      <circle cx="24" cy="24" r="10" fill="#1FB6A6" />
      <circle cx="24" cy="24" r="6" fill="#E6B325" />
    </svg>`;

    return {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
      scaledSize: new google.maps.Size(size, size),
      anchor: new google.maps.Point(anchorX, anchorY),
    };
  }