// origin: AlaudaAI/Local_Map_SEO@bd17057:packages/jobs/src/providers/serper.ts
// last-synced: 2026-05-06
//
// Serper.dev adapter — Google Maps SERP, lat/lng targeted.
//
// Endpoint: POST https://google.serper.dev/maps
// Auth:     X-API-KEY header.
// Pricing:  ~$0.0003 per call (10× cheaper than DataForSEO live).
// Quota:    free tier ships ~2.5k calls; check serper.dev dashboard.

import {
  SerpProviderError,
  type SerpAdapter,
  type SerpRequest,
  type SerpResponse,
  type SerpResultItem,
} from "../serp";

const ENDPOINT = "https://google.serper.dev/maps";

export interface SerperCreds {
  apiKey: string;
}

export function createSerperAdapter(creds: SerperCreds): SerpAdapter {
  return {
    name: "serper",
    async fetch({ keyword, lat, lng, topN = 50, zoom = 15 }: SerpRequest): Promise<SerpResponse> {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "X-API-KEY": creds.apiKey,
          "Content-Type": "application/json",
        },
        // `ll` is "@lat,lng,zoom". Google interprets zoom as the searcher's
        // implied radius. Default 15 is a compromise between z=14 (~5 km,
        // SERPs collapse to neighborhood-uniform) and z=17 (~300 m, where
        // grid corners can't see the business at all). Caller can override
        // per-request via the `zoom` field on SerpRequest.
        body: JSON.stringify({
          q: keyword,
          ll: `@${lat},${lng},${zoom}z`,
          gl: "us",
          hl: "en",
          // Most "near me" / Maps queries happen on mobile, and Google
          // serves a different ranking for mobile vs. desktop. We're
          // estimating what the customer at the pin sees, not what our
          // (desktop) report viewer sees — those are different devices.
          device: "mobile",
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new SerpProviderError(
          `Serper HTTP ${res.status}: ${text.slice(0, 200)}`,
          res.status
        );
      }

      const data = (await res.json()) as SerperEnvelope;
      const places = data.places ?? [];
      const results: SerpResultItem[] = [];
      for (const p of places) {
        if (!p.placeId || !p.title) continue;
        if (typeof p.position !== "number") continue;
        // Serper has shipped `thumbnailUrl` and `thumbnail` historically;
        // accept either so we don't break on field renames.
        const thumb =
          (typeof p.thumbnailUrl === "string" && p.thumbnailUrl) ||
          (typeof p.thumbnail === "string" && p.thumbnail) ||
          undefined;
        results.push({
          placeId: p.placeId,
          name: p.title,
          rank: p.position,
          rating: typeof p.rating === "number" ? p.rating : undefined,
          reviews: typeof p.ratingCount === "number" ? p.ratingCount : undefined,
          category:
            typeof p.category === "string" && p.category ? p.category : undefined,
          address:
            typeof p.address === "string" && p.address ? p.address : undefined,
          thumbnailUrl: thumb,
        });
        if (results.length >= topN) break;
      }
      results.sort((a, b) => a.rank - b.rank);

      return {
        results,
        rawCount: places.length,
        fetchedAt: new Date(),
      };
    },
  };
}

// --- Subset of Serper's response shape we use ---
interface SerperEnvelope {
  places?: SerperPlace[];
}
interface SerperPlace {
  position?: number;
  title?: string;
  placeId?: string;
  rating?: number;
  ratingCount?: number;
  category?: string;
  address?: string;
  thumbnailUrl?: string;
  thumbnail?: string;
}
