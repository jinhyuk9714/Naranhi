(function factory(root, create) {
  if (typeof module === "object" && module.exports) {
    module.exports = create();
    return;
  }
  root.NaranhiVisibleQueue = create();
})(typeof globalThis !== "undefined" ? globalThis : this, function buildVisibleQueue() {
  class VisibleTranslationQueue {
    constructor() {
      this.pendingQueue = [];
      this.queuedIds = new Set();
      this.translatedIds = new Set();
      this.inflightIds = new Set();
    }

    enqueue(id) {
      const key = String(id || "").trim();
      if (!key) return false;
      if (this.translatedIds.has(key)) return false;
      if (this.inflightIds.has(key)) return false;
      if (this.queuedIds.has(key)) return false;

      this.queuedIds.add(key);
      this.pendingQueue.push(key);
      return true;
    }

    enqueueMany(ids) {
      let added = 0;
      for (const id of ids || []) {
        if (this.enqueue(id)) added += 1;
      }
      return added;
    }

    take(maxItems) {
      const max = Number.isFinite(maxItems) ? Math.max(1, Math.floor(maxItems)) : 1;
      const out = [];

      while (out.length < max && this.pendingQueue.length) {
        const id = this.pendingQueue.shift();
        this.queuedIds.delete(id);
        if (this.translatedIds.has(id) || this.inflightIds.has(id)) continue;

        this.inflightIds.add(id);
        out.push(id);
      }

      return out;
    }

    markTranslated(ids) {
      for (const id of ids || []) {
        const key = String(id || "").trim();
        if (!key) continue;
        this.translatedIds.add(key);
        this.inflightIds.delete(key);
        this.queuedIds.delete(key);
      }
    }

    clearInflight(ids) {
      for (const id of ids || []) {
        const key = String(id || "").trim();
        if (!key) continue;
        this.inflightIds.delete(key);
      }
    }

    reset() {
      this.pendingQueue = [];
      this.queuedIds.clear();
      this.translatedIds.clear();
      this.inflightIds.clear();
    }

    pendingSize() {
      return this.pendingQueue.length;
    }

    hasPending() {
      return this.pendingQueue.length > 0;
    }
  }

  return { VisibleTranslationQueue };
});
