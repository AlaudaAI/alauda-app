// origin: AlaudaAI/Local_Map_SEO@bd17057:packages/db/src/jobs.ts
// last-synced: 2026-05-06
//
// Shared queue + job-payload definitions. Imported by both web (producer) and
// worker (consumer) so there's exactly one source of truth for queue names
// and payload shapes.

export const QUEUE_NAMES = {
  echo: "echo",
  // Real SERP-fetch queue lands on Day 4. Reserved here so the name is stable.
  serpFetch: "serp-fetch",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// Day 1: dev-only smoke-test job. Web enqueues, worker logs, no DB writes.
export interface EchoJobData {
  message: string;
  enqueuedAt: string;
}

export interface EchoJobResult {
  receivedAt: string;
  message: string;
}

// Day 4: fetch SERP for one grid point, write a ScanResult row,
// deduct one credit. Day 5 fans out to all 25 points per scan.
export interface SerpFetchJobData {
  scanId: string;
  gridPointId: string;
  // Optional per-job provider override for A/B testing Serper vs.
  // DataForSEO from the UI. Worker falls back to env-default when unset.
  provider?: "serper" | "dataforseo";
  // Optional Google Maps zoom override for per-scan tuning. Higher =
  // tighter implied radius. Adapter default applies when unset.
  zoom?: number;
}
