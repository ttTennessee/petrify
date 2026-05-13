// Per-run resource pool manager. Tracks remaining capacity for each declared pool
// and grants/releases token units. Not thread-safe — all calls happen from the
// scheduler's single event loop.

export interface AcquireResult {
  acquired: boolean;
  // When acquired:false, lists the pools that were short on capacity.
  shortOn?: string[];
}

export class ResourcePool {
  private capacity: Record<string, number>;
  private remaining: Record<string, number>;

  constructor(declared: Record<string, number>) {
    this.capacity = { ...declared };
    this.remaining = { ...declared };
  }

  tryAcquire(
    claims: Array<{ name: string; amount: number }>,
  ): AcquireResult {
    const shortOn: string[] = [];
    for (const c of claims) {
      const have = this.remaining[c.name] ?? 0;
      if (have < c.amount) shortOn.push(c.name);
    }
    if (shortOn.length > 0) return { acquired: false, shortOn };
    for (const c of claims) {
      this.remaining[c.name]! -= c.amount;
    }
    return { acquired: true };
  }

  release(claims: Array<{ name: string; amount: number; release?: boolean }>) {
    for (const c of claims) {
      if (c.release === false) continue;
      const cap = this.capacity[c.name] ?? 0;
      this.remaining[c.name] = Math.min(cap, (this.remaining[c.name] ?? 0) + c.amount);
    }
  }

  snapshot(): Record<string, number> {
    return { ...this.remaining };
  }
}
