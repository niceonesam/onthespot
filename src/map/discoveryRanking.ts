type DiscoverySpotLike = {
  distance_m?: number | null;
  description?: string | null;
  source_url?: string | null;
  photo_url?: string | null;
  tags?: string[] | null;
  is_imported?: boolean | null;
};

export function discoveryScore(s: DiscoverySpotLike) {
    const distance = Number(s.distance_m ?? 999999);
    const descriptionLength = s.description?.trim().length ?? 0;
    const confidence = 3;

    const distanceScore =
      distance < 150 ? 40 :
      distance < 400 ? 28 :
      distance < 1000 ? 18 :
      distance < 2500 ? 8 : 0;

    const confidenceScore = confidence * 8;
    const sourceScore = s.source_url ? 10 : 0;
    const photoScore = s.photo_url ? 8 : 0;
    const tagScore = Array.isArray(s.tags) ? Math.min(s.tags.length, 5) * 2 : 0;
    const descriptionScore =
      descriptionLength > 180 ? 8 :
      descriptionLength > 80 ? 4 : 0;
    const importedPenalty = s.is_imported ? 0 : 2;

    return (
      distanceScore +
      confidenceScore +
      sourceScore +
      photoScore +
      tagScore +
      descriptionScore +
      importedPenalty
    );
  }