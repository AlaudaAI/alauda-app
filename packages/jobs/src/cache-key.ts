// origin: AlaudaAI/Local_Map_SEO@bd17057:packages/jobs/src/cache-key.ts
// last-synced: 2026-05-06
//
// Cache key for ScanResult reuse (Day 9 caching).
// Format: `<keyword> | <geoBucket> | <dateBucket>`
//
// Two scans within ~100m and within the same UTC day produce the same key,
// so a re-scan reuses the prior provider call. Day 4 writes this key on
// every result so caching becomes a pure read change.

const GEO_DECIMALS = 3; // 0.001° ≈ 100m latitude

export function geoBucket(lat: number, lng: number): string {
  return `${lat.toFixed(GEO_DECIMALS)},${lng.toFixed(GEO_DECIMALS)}`;
}

export function dateBucket(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function normalizeKeyword(keyword: string): string {
  return keyword.trim().toLowerCase();
}

export function buildCacheKey(input: {
  keyword: string;
  lat: number;
  lng: number;
  date?: Date;
}): string {
  return [
    normalizeKeyword(input.keyword),
    geoBucket(input.lat, input.lng),
    dateBucket(input.date),
  ].join("|");
}
