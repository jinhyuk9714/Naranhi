export const LIMITS = {
  MAX_BODY_BYTES: 65536,
  MAX_ITEMS_PER_BATCH: 40,
  MAX_CHARS_PER_ITEM: 1500,
  MAX_CHARS_PER_BATCH: 12000,
};

const SENTENCE_BOUNDARY = /(?<=[.!?。！？])\s+/u;

export function normalizeText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function normalizeOptionValue(value) {
  if (Array.isArray(value)) return value.map((item) => normalizeOptionValue(item));
  if (!value || typeof value !== "object") return value;

  const out = {};
  for (const key of Object.keys(value).sort()) {
    out[key] = normalizeOptionValue(value[key]);
  }
  return out;
}

export function normalizeOptions(options) {
  if (!options || typeof options !== "object") return {};
  return normalizeOptionValue(options);
}

export function buildCacheKeyMaterial({ text, sourceLang, targetLang, options }) {
  return JSON.stringify({
    text: normalizeText(text),
    sourceLang: sourceLang || "",
    targetLang: targetLang || "",
    options: normalizeOptions(options),
  });
}

export async function sha256Hex(input) {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Missing WebCrypto subtle API");
  }

  const bytes = new TextEncoder().encode(String(input));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}

function splitOversizedSentence(text, maxChars, out) {
  for (let idx = 0; idx < text.length; idx += maxChars) {
    out.push(text.slice(idx, idx + maxChars));
  }
}

export function splitTextByLimit(text, maxChars = LIMITS.MAX_CHARS_PER_ITEM) {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  if (normalized.length <= maxChars) return [normalized];

  const sentences = normalized.split(SENTENCE_BOUNDARY).filter(Boolean);
  if (!sentences.length) {
    const chunks = [];
    splitOversizedSentence(normalized, maxChars, chunks);
    return chunks;
  }

  const out = [];
  let current = "";

  for (const sentenceRaw of sentences) {
    const sentence = normalizeText(sentenceRaw);
    if (!sentence) continue;

    if (sentence.length > maxChars) {
      if (current) {
        out.push(current);
        current = "";
      }
      splitOversizedSentence(sentence, maxChars, out);
      continue;
    }

    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length > maxChars) {
      out.push(current);
      current = sentence;
      continue;
    }
    current = candidate;
  }

  if (current) out.push(current);
  return out.filter(Boolean);
}

export function expandItems(items, maxChars = LIMITS.MAX_CHARS_PER_ITEM) {
  const expandedItems = [];
  const originalItems = [];

  for (const item of Array.isArray(items) ? items : []) {
    const id = String(item?.id || "").trim();
    const text = normalizeText(item?.text || "");
    if (!id || !text) continue;

    const segments = splitTextByLimit(text, maxChars);
    if (!segments.length) continue;

    const segmentIds = [];
    for (let i = 0; i < segments.length; i += 1) {
      const segmentId = `${id}__${i}`;
      segmentIds.push(segmentId);
      expandedItems.push({
        id: segmentId,
        text: segments[i],
        originalId: id,
        segmentIndex: i,
      });
    }

    originalItems.push({ id, segmentIds });
  }

  return { expandedItems, originalItems };
}

export function buildRequestPayload(items, targetLang, sourceLang, options) {
  const payload = {
    items: items.map((item) => ({
      id: String(item.id),
      text: String(item.text),
    })),
    target_lang: targetLang,
  };

  if (sourceLang) payload.source_lang = sourceLang;
  const normalizedOptions = normalizeOptions(options);
  if (Object.keys(normalizedOptions).length) payload.options = normalizedOptions;
  return payload;
}

export function estimatePayloadBytes(payload) {
  return new TextEncoder().encode(JSON.stringify(payload)).length;
}

export function buildBatches({
  items,
  targetLang,
  sourceLang,
  options,
  limits = LIMITS,
}) {
  const batches = [];
  let current = [];
  let currentChars = 0;

  for (const item of items) {
    if (item.text.length > limits.MAX_CHARS_PER_ITEM) {
      throw new Error("Item exceeds MAX_CHARS_PER_ITEM");
    }

    const nextItems = current.concat(item);
    const nextChars = currentChars + item.text.length;
    const nextPayload = buildRequestPayload(nextItems, targetLang, sourceLang, options);
    const nextBytes = estimatePayloadBytes(nextPayload);

    const exceeds =
      nextItems.length > limits.MAX_ITEMS_PER_BATCH ||
      nextChars > limits.MAX_CHARS_PER_BATCH ||
      nextBytes > limits.MAX_BODY_BYTES;

    if (exceeds) {
      if (!current.length) {
        throw new Error("Single item exceeds request size limit");
      }

      batches.push(current);
      current = [item];
      currentChars = item.text.length;

      const singlePayload = buildRequestPayload(current, targetLang, sourceLang, options);
      const singleBytes = estimatePayloadBytes(singlePayload);
      if (singleBytes > limits.MAX_BODY_BYTES) {
        throw new Error("Single item exceeds MAX_BODY_BYTES");
      }
      continue;
    }

    current = nextItems;
    currentChars = nextChars;
  }

  if (current.length) {
    batches.push(current);
  }
  return batches;
}
