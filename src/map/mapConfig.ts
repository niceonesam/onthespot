export const NEARBY_SHEET_SNAP = {
  peek: 92,
  half: 320,
  full: 640,
} as const;

export const SPOT_SHEET_SNAP = {
  peek: 148,
  half: 360,
  full: 620,
} as const;

export const CLUSTERING_THRESHOLD = {
  mobile: 12,
  desktop: 20,
} as const;

export function nearbySheetHeightForSnap(snap: "peek" | "half" | "full") {
  return NEARBY_SHEET_SNAP[snap];
}

export function spotSheetHeightForSnap(snap: "peek" | "half" | "full") {
  return SPOT_SHEET_SNAP[snap];
}