export interface DeferredEntry<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

export class InflightTranslations<T> {
  private entries = new Map<string, DeferredEntry<T>>();

  wait(key: string): Promise<T> | null {
    return this.entries.get(key)?.promise || null;
  }

  claim(keys: string[]): string[] {
    const claimed: string[] = [];
    for (const key of keys) {
      if (!key || this.entries.has(key)) continue;
      let resolve!: (value: T) => void;
      let reject!: (reason?: unknown) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      this.entries.set(key, { promise, resolve, reject });
      claimed.push(key);
    }
    return claimed;
  }

  resolve(key: string, value: T): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    entry.resolve(value);
    this.entries.delete(key);
  }

  rejectAll(keys: string[], reason: unknown): void {
    for (const key of keys) {
      const entry = this.entries.get(key);
      if (!entry) continue;
      entry.reject(reason);
      this.entries.delete(key);
    }
  }
}
