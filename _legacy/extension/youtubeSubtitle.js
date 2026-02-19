(function factory(root, create) {
  if (typeof module === "object" && module.exports) {
    module.exports = create();
    return;
  }
  root.NaranhiYouTubeSubtitle = create();
})(typeof globalThis !== "undefined" ? globalThis : this, function buildYouTubeSubtitleHelpers() {
  const MUSIC_ONLY_RE = /^[\s♪♫♬♩♭♯•·.,!?'"`~:;()[\]{}<>|\\/+=_-]*$/u;

  function normalizeText(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function normalizeCaptionText(raw, options) {
    const opts = options && typeof options === "object" ? options : {};
    const minLength = Number.isFinite(opts.minLength) ? Math.max(1, Math.floor(opts.minLength)) : 2;
    const maxLength = Number.isFinite(opts.maxLength) ? Math.max(minLength, Math.floor(opts.maxLength)) : 240;
    const text = normalizeText(raw);
    if (!text) return "";
    if (text.length < minLength || text.length > maxLength) return "";
    if (MUSIC_ONLY_RE.test(text)) return "";
    if (!/[\p{L}\p{N}]/u.test(text)) return "";
    return text;
  }

  class RecentCaptionDeduper {
    constructor(ttlMs, maxEntries) {
      this.ttlMs = Number.isFinite(ttlMs) ? Math.max(100, Math.floor(ttlMs)) : 8000;
      this.maxEntries = Number.isFinite(maxEntries) ? Math.max(10, Math.floor(maxEntries)) : 120;
      this.history = new Map();
    }

    shouldEnqueue(windowKey, text, now) {
      const key = String(windowKey || "").trim();
      const value = normalizeText(text);
      if (!key || !value) return false;

      const current = Number.isFinite(now) ? now : Date.now();
      this.prune(current);

      const dedupeKey = `${key}::${value}`;
      const seenAt = this.history.get(dedupeKey);
      if (typeof seenAt === "number" && current - seenAt < this.ttlMs) {
        return false;
      }

      if (this.history.has(dedupeKey)) {
        this.history.delete(dedupeKey);
      }
      this.history.set(dedupeKey, current);
      this.prune(current);
      return true;
    }

    prune(now) {
      const current = Number.isFinite(now) ? now : Date.now();
      for (const [key, ts] of this.history) {
        if (current - ts > this.ttlMs) {
          this.history.delete(key);
        }
      }
      while (this.history.size > this.maxEntries) {
        const oldest = this.history.keys().next().value;
        if (!oldest) break;
        this.history.delete(oldest);
      }
    }

    reset() {
      this.history.clear();
    }
  }

  class WindowPendingQueue {
    constructor() {
      this.pending = new Map();
      this.inflight = new Map();
    }

    enqueue(windowKey, text) {
      const key = String(windowKey || "").trim();
      const value = normalizeText(text);
      if (!key || !value) return false;
      this.pending.set(key, value);
      return true;
    }

    enqueueMany(items) {
      let count = 0;
      for (const item of items || []) {
        if (!item || typeof item !== "object") continue;
        if (this.enqueue(item.id || item.key, item.text)) count += 1;
      }
      return count;
    }

    take(maxItems) {
      const max = Number.isFinite(maxItems) ? Math.max(1, Math.floor(maxItems)) : 1;
      const batch = [];

      for (const [id, text] of this.pending) {
        if (batch.length >= max) break;
        if (this.inflight.has(id)) continue;
        batch.push({ id, text });
      }

      for (const item of batch) {
        this.pending.delete(item.id);
        this.inflight.set(item.id, item.text);
      }

      return batch;
    }

    clearInflight(ids) {
      for (const id of ids || []) {
        const key = String(id || "").trim();
        if (!key) continue;
        this.inflight.delete(key);
      }
    }

    requeue(items) {
      for (const item of items || []) {
        if (!item || typeof item !== "object") continue;
        const id = String(item.id || "").trim();
        const text = normalizeText(item.text);
        if (!id || !text) continue;
        this.inflight.delete(id);
        this.pending.set(id, text);
      }
    }

    pendingSize() {
      return this.pending.size;
    }

    hasPending() {
      return this.pending.size > 0;
    }

    reset() {
      this.pending.clear();
      this.inflight.clear();
    }
  }

  return {
    normalizeText,
    normalizeCaptionText,
    RecentCaptionDeduper,
    WindowPendingQueue,
  };
});
