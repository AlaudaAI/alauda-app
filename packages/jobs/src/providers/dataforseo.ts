// origin: AlaudaAI/Local_Map_SEO@bd17057:packages/jobs/src/providers/dataforseo.ts
// last-synced: 2026-05-06
//
// DataForSEO adapter — Google Maps Live SERP, lat/lng targeted.
//
// Endpoint: POST /v3/serp/google/maps/live/advanced
// Auth:     HTTP Basic (login + password from DataForSEO console).
// Pricing:  ~$0.003 per call (Live, depth 100). Bills only on success.

import {
  SerpProviderError,
  type SerpAdapter,
  type SerpRequest,
  type SerpResponse,
  type SerpResultItem,
} from "../serp";

const ENDPOINT =
  "https://api.dataforseo.com/v3/serp/google/maps/live/advanced";

export interface DataForSeoCreds {
  login: string;
  password: string;
}

export function createDataForSeoAdapter(creds: DataForSeoCreds): SerpAdapter {
  const auth =
    "Basic " +
    Buffer.from(`${creds.login}:${creds.password}`).toString("base64");

  return {
    name: "dataforseo",
    async fetch({ keyword, lat, lng, topN = 50, zoom = 15 }: SerpRequest): Promise<SerpResponse> {
      const body = [
        {
          keyword,
          // `<lat>,<lng>,<zoom>z`. Google reads zoom as the searcher's
          // implied radius. Default 15 (~1.2 km) is a compromise; caller
          // can override per-request to test the tradeoff between
          // per-pin specificity and grid-wide visibility.
          location_coordinate: `${lat},${lng},${zoom}z`,
          language_code: "en",
          depth: Math.max(topN, 20),
          // Customer-side device, not viewer-side. Mobile Maps ranking
          // is what the people physically searching at the pin see.
          device: "mobile",
        },
      ];

      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: auth,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new SerpProviderError(
          `DataForSEO HTTP ${res.status}: ${text.slice(0, 200)}`,
          res.status
        );
      }

      const json = (await res.json()) as DataForSeoEnvelope;
      const task = json.tasks?.[0];
      if (!task) {
        throw new SerpProviderError("DataForSEO empty tasks", 502);
      }
      if (task.status_code !== 20000) {
        throw new SerpProviderError(
          `DataForSEO task ${task.status_code}: ${task.status_message ?? "unknown"}`,
          502,
          task.status_code
        );
      }

      const items = task.result?.[0]?.items ?? [];
      const results: SerpResultItem[] = [];
      for (const it of items) {
        if (!it.place_id || !it.title) continue;
        const rank = it.rank_absolute ?? it.rank_group;
        if (typeof rank !== "number") continue;
        results.push({
          placeId: it.place_id,
          name: it.title,
          rank,
          rating: it.rating?.value,
          reviews: it.rating?.votes_count,
          category: it.category ?? undefined,
          address: it.address ?? undefined,
          // DataForSEO Live exposes a list of photos; first is most
          // representative. Skip silently if absent.
          thumbnailUrl:
            (Array.isArray(it.photos) && typeof it.photos[0] === "string"
              ? it.photos[0]
              : undefined),
        });
        if (results.length >= topN) break;
      }
      results.sort((a, b) => a.rank - b.rank);

      return {
        results,
        rawCount: items.length,
        fetchedAt: new Date(),
      };
    },
  };
}

// --- Subset of DataForSEO's response shape we actually use ---
interface DataForSeoEnvelope {
  tasks?: DataForSeoTask[];
}
interface DataForSeoTask {
  status_code?: number;
  status_message?: string;
  result?: { items?: DataForSeoItem[] }[];
}
interface DataForSeoItem {
  place_id?: string;
  title?: string;
  rank_absolute?: number;
  rank_group?: number;
  rating?: { value?: number; votes_count?: number };
  category?: string;
  address?: string;
  photos?: string[];
}
