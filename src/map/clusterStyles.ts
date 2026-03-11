
export function clusterBubbleDataUrl(outer: string, ring: string, core: string) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <desc>ots-cluster</desc>
      <defs>
        <radialGradient id="clusterGlow" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.95" />
          <stop offset="20%" stop-color="${core}" stop-opacity="0.98" />
          <stop offset="42%" stop-color="${ring}" stop-opacity="0.96" />
          <stop offset="100%" stop-color="${outer}" stop-opacity="1" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="26" fill="url(#clusterGlow)" stroke="rgba(0,0,0,0.18)" stroke-width="2" />
      <circle cx="32" cy="32" r="18" fill="rgba(255,255,255,0.10)" />
    </svg>
  `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export function clusterPaletteForScale(scale: "human" | "ancient" | "geological") {
  if (scale === "geological") {
    return { ring: "#6b21a8", core: "#8b5cf6" };
  }
  if (scale === "ancient") {
    return { ring: "#E6B325", core: "#F2C94C" };
  }
  return { ring: "#1FB6A6", core: "#54d9cb" };
}

export function markerTimeScaleFromIcon(icon: google.maps.Icon | google.maps.Symbol | string | null | undefined): "human" | "ancient" | "geological" {
  const raw = typeof icon === "string"
    ? icon
    : icon && typeof icon === "object" && "url" in icon
      ? String(icon.url ?? "")
      : "";

  if (raw.includes("ots-scale-geological")) return "geological";
  if (raw.includes("ots-scale-ancient")) return "ancient";
  return "human";
}

export function buildClusterCalculator() {
  return (markers: unknown[], numStyles: number) => {
    const count = markers.length;
    let sizeIndex = 1;

    if (count >= 100) sizeIndex = 3;
    else if (count >= 20) sizeIndex = 2;

    const scaleCounts: Record<"human" | "ancient" | "geological", number> = {
      human: 0,
      ancient: 0,
      geological: 0,
    };

    for (const marker of markers as Array<{ getIcon?: () => google.maps.Icon | google.maps.Symbol | string | null | undefined }>) {
      const scale = markerTimeScaleFromIcon(marker.getIcon?.());
      scaleCounts[scale] += 1;
    }

    const dominantScale =
      scaleCounts.geological >= scaleCounts.ancient && scaleCounts.geological >= scaleCounts.human
        ? "geological"
        : scaleCounts.ancient >= scaleCounts.human
          ? "ancient"
          : "human";

    const baseOffset = dominantScale === "human" ? 0 : dominantScale === "ancient" ? 3 : 6;
    const index = Math.min(baseOffset + sizeIndex, numStyles);

    const sortedScales: Array<["geological" | "ancient" | "human", number]> = [
      ["geological", scaleCounts.geological],
      ["ancient", scaleCounts.ancient],
      ["human", scaleCounts.human],
    ];
    sortedScales.sort((a: ["geological" | "ancient" | "human", number], b: ["geological" | "ancient" | "human", number]) => b[1] - a[1]);

    const second = sortedScales[1];

    const dominantLabel =
      dominantScale === "geological"
        ? "mostly geological"
        : dominantScale === "ancient"
          ? "mostly prehistoric"
          : "mostly human history";

    const secondaryLabel =
      second && second[1] > 0
        ? second[0] === "geological"
          ? " · some geological"
          : second[0] === "ancient"
            ? " · some prehistoric"
            : " · some human history"
        : "";

    return {
      text: String(count),
      index,
      title: `${count} spots · ${dominantLabel}${secondaryLabel}`,
    };
  };
}