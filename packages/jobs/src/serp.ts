// origin: AlaudaAI/Local_Map_SEO@bd17057:packages/jobs/src/serp.ts
// last-synced: 2026-05-06
//
// Provider-agnostic SERP adapter contract. Implementations live in
// `./providers/<name>.ts`. The worker constructs one adapter at startup and
// the rest of the pipeline doesn't know which provider is in use.
//
// Day 4 ships DataForSEO; serper.dev / SerpApi can plug in by adding a new
// `createXxxAdapter()` and switching the worker's instantiation.

import { TokenBucket } from "./rate-limit";

export interface SerpRequest {
  keyword: string;
  lat: number;
  lng: number;
  /** Maximum results to parse and return. Provider may return more. */
  topN?: number;
  /** Google Maps zoom level (`ll=@lat,lng,Nz`) — Google reads this as
   *  the searcher's implied radius. Higher = tighter. Defaults to 15. */
  zoom?: number;
}

export interface SerpResultItem {
  /** Google `place_id`. Required — items without one are dropped upstream. */
  placeId: string;
  name: string;
  /** 1-based rank across the SERP, including ads. */
  rank: number;
  rating?: number;
  reviews?: number;
  /** Provider-supplied business type (e.g. "Coffee shop"). */
  category?: string;
  /** Provider-supplied formatted address. */
  address?: string;
  /** Provider-supplied thumbnail URL (Google CDN). May be hotlinked. */
  thumbnailUrl?: string;
}

export interface SerpResponse {
  results: SerpResultItem[];
  /** Total items the provider returned, before truncation to `topN`. */
  rawCount: number;
  fetchedAt: Date;
}

export interface SerpAdapter {
  /** Stable identifier persisted alongside results (e.g. "dataforseo"). */
  name: string;
  fetch(req: SerpRequest): Promise<SerpResponse>;
}

export class SerpProviderError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly providerCode?: string | number
  ) {
    super(message);
    this.name = "SerpProviderError";
  }
}

export interface RateLimitConfig {
  /** Sustained requests per second. */
  qps: number;
  /** Initial burst capacity. Defaults to qps (1 second's worth). */
  burst?: number;
}

// Wrap an adapter with a token-bucket guard. Concurrent callers share the
// bucket and queue up — they never hit the provider above `qps`. Failed
// attempts that re-enter via BullMQ retries also consume tokens, so a
// 5xx storm can't burn credits faster than the bucket allows.
//
// SCALING CONSTRAINT: the bucket is process-local. With N worker
// instances each instance gets its own bucket and aggregate outbound
// traffic = N * qps, which can exceed the provider cap and cause retry
// storms / unexpected spend. This is correct only while the worker
// runs single-instance. Before scaling Scan worker concurrency past
// one process, replace this bucket with a Redis-backed limiter (see
// the Phase 4+ migration discipline in docs/BLUEPRINT.md).
export function withRateLimit(
  adapter: SerpAdapter,
  cfg: RateLimitConfig
): SerpAdapter {
  const bucket = new TokenBucket(cfg.burst ?? cfg.qps, cfg.qps);
  return {
    name: adapter.name,
    async fetch(req) {
      await bucket.take();
      return adapter.fetch(req);
    },
  };
}

