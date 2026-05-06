// origin: AlaudaAI/Local_Map_SEO@bd17057:packages/jobs/src/rate-limit.ts
// last-synced: 2026-05-06
//
// Per-provider rate limiting via a classic token bucket. Used to keep
// our outbound SERP calls under the provider's QPS cap so retry storms
// don't burn credits. `take()` blocks (resolves) when a token frees up,
// rather than rejecting — workers that share the bucket simply queue.
//
// Pure logic, no timers held: tokens are replenished lazily at read.
//
// SCALING CONSTRAINT: in-memory only. Multi-process workers each get
// their own bucket — combined outbound = N * qps. Single-instance only
// until a Redis-backed replacement lands (Phase 4+).

export class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    public readonly capacity: number,
    public readonly refillPerSec: number,
    private readonly now: () => number = Date.now
  ) {
    if (capacity <= 0) throw new Error("capacity must be > 0");
    if (refillPerSec <= 0) throw new Error("refillPerSec must be > 0");
    this.tokens = capacity;
    this.lastRefill = now();
  }

  /** Synchronous attempt — true if a token was granted. */
  tryTake(): boolean {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  /** Block (yield) until a token is available. */
  async take(): Promise<void> {
    while (!this.tryTake()) {
      // ms-until-next-token, lower-bounded so we don't busy-loop on clock drift
      const wait = Math.max(20, 1000 / this.refillPerSec);
      await new Promise((r) => setTimeout(r, wait));
    }
  }

  /** Currently available tokens, for tests / introspection. */
  available(): number {
    this.refill();
    return this.tokens;
  }

  private refill() {
    const now = this.now();
    const elapsed = (now - this.lastRefill) / 1000;
    if (elapsed > 0) {
      this.tokens = Math.min(
        this.capacity,
        this.tokens + elapsed * this.refillPerSec
      );
      this.lastRefill = now;
    }
  }
}
