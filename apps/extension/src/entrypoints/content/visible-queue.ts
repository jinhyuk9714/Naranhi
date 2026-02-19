/**
 * Visible Translation Queue — tracks which blocks need translation.
 * Ported from _legacy/extension/visibleQueue.js
 */

export class VisibleTranslationQueue {
  private pendingQueue: string[] = [];
  private queuedIds = new Set<string>();
  private translatedIds = new Set<string>();
  private inflightIds = new Set<string>();

  enqueue(id: string): boolean {
    const key = String(id || '').trim();
    if (!key) return false;
    if (this.translatedIds.has(key)) return false;
    if (this.inflightIds.has(key)) return false;
    if (this.queuedIds.has(key)) return false;

    this.queuedIds.add(key);
    this.pendingQueue.push(key);
    return true;
  }

  enqueueMany(ids: string[]): number {
    let added = 0;
    for (const id of ids || []) {
      if (this.enqueue(id)) added += 1;
    }
    return added;
  }

  take(maxItems: number): string[] {
    const max = Number.isFinite(maxItems) ? Math.max(1, Math.floor(maxItems)) : 1;
    const out: string[] = [];

    while (out.length < max && this.pendingQueue.length) {
      const id = this.pendingQueue.shift()!;
      this.queuedIds.delete(id);
      if (this.translatedIds.has(id) || this.inflightIds.has(id)) continue;

      this.inflightIds.add(id);
      out.push(id);
    }

    return out;
  }

  markTranslated(ids: string[]): void {
    for (const id of ids || []) {
      const key = String(id || '').trim();
      if (!key) continue;
      this.translatedIds.add(key);
      this.inflightIds.delete(key);
      this.queuedIds.delete(key);
    }
  }

  clearInflight(ids: string[]): void {
    for (const id of ids || []) {
      const key = String(id || '').trim();
      if (!key) continue;
      this.inflightIds.delete(key);
    }
  }

  reset(): void {
    this.pendingQueue = [];
    this.queuedIds.clear();
    this.translatedIds.clear();
    this.inflightIds.clear();
  }

  pendingSize(): number {
    return this.pendingQueue.length;
  }

  hasPending(): boolean {
    return this.pendingQueue.length > 0;
  }
}
