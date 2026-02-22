/**
 * A Map-based cache with TTL expiration and FIFO eviction when max size is exceeded.
 * Uses Map insertion order for oldest-first eviction.
 */
export class BoundedCache<T> {
  private map = new Map<string, { ts: number; value: T }>();

  constructor(
    private maxEntries: number,
    private ttlMs: number,
  ) {}

  get(key: string): T | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.ts > this.ttlMs) {
      this.map.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    this.map.set(key, { ts: Date.now(), value });
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (!oldest) break;
      this.map.delete(oldest);
    }
  }

  get size(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }
}
