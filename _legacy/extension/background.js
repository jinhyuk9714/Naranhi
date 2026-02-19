import {
  LIMITS,
  buildBatches,
  buildCacheKeyMaterial,
  buildRequestPayload,
  expandItems,
  normalizeOptions,
  normalizeText,
  sha256Hex,
} from "./translationPipeline.mjs";

const CONTEXT_MENU_ID = "dualread-translate-selection";

const LOCAL_CACHE_KEY = "dualreadCacheV1";
const LOCAL_CACHE_META_KEY = "dualreadCacheMetaV1";
const MEMORY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const LOCAL_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MEMORY_CACHE_MAX_ENTRIES = 1500;
const LOCAL_CACHE_MAX_ENTRIES = 3000;
const RETRY_DELAY_MS = 500;
const RETRY_ATTEMPTS = 1;
const SEGMENT_RETRY_ATTEMPTS = 0;
const SUBTITLE_CONTEXT_MAX_CHARS = 800;
const SEGMENT_MAX_CHUNKS = 12;
const SEGMENT_MAX_CHARS_PER_CHUNK = 4000;

const ALLOWED_OPTION_KEYS = new Set([
  "formality",
  "split_sentences",
  "tag_handling",
  "tag_handling_version",
  "preserve_formatting",
  "context",
  "model_type",
]);

const ALLOWED_MODEL_TYPES = new Set([
  "latency_optimized",
  "quality_optimized",
  "prefer_quality_optimized",
]);

const memoryCache = new Map(); // key -> { value, ts }

function ensureContextMenu() {
  chrome.contextMenus.remove(CONTEXT_MENU_ID, () => {
    // Consume expected "not found" error so Chrome does not emit unchecked runtime.lastError.
    const removeErr = chrome.runtime.lastError;
    if (removeErr && !String(removeErr.message || "").includes("Cannot find menu item")) {
      // no-op: non-fatal remove error
    }

    chrome.contextMenus.create(
      {
        id: CONTEXT_MENU_ID,
        title: "Translate with Naranhi",
        contexts: ["selection"],
      },
      () => {
        if (chrome.runtime.lastError) {
          // no-op: context menu may already exist in some update paths
        }
      }
    );
  });
}

chrome.runtime.onInstalled.addListener(() => {
  ensureContextMenu();
});

chrome.runtime.onStartup.addListener(() => {
  ensureContextMenu();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID) return;
  void handleSelectionTranslate(info, tab);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  void (async () => {
    if (msg?.type === "DUALREAD_TRANSLATE_BATCH") {
      const settings = await getSettings();
      const runId = typeof msg.runId === "string" ? msg.runId : "";
      const items = Array.isArray(msg.items) ? msg.items : [];
      const channel = normalizeChannel(msg.channel);
      if (!runId) throw errorOf("BAD_REQUEST", "Missing runId", false);

      const result = await translateItems(items, settings, msg.options, channel);
      sendResponse({ ok: true, data: { runId, ...result } });
      return;
    }

    if (msg?.type === "DUALREAD_SEGMENT_TEXT") {
      const settings = await getSettings();
      const payload = normalizeSegmentRequestPayload(msg.payload);
      const data = await requestSegment(payload, settings.proxyUrl);
      sendResponse({ ok: true, data });
      return;
    }

    if (msg?.type === "DUALREAD_CLEAR_CACHE") {
      await clearAllCaches();
      sendResponse({ ok: true });
      return;
    }

    sendResponse({ ok: false, error: errorOf("BAD_REQUEST", "Unknown message type", false) });
  })().catch((err) => {
    sendResponse({ ok: false, error: normalizeError(err) });
  });

  return true; // async
});

async function getSettings() {
  const settings = await chrome.storage.sync.get({
    proxyUrl: "http://localhost:8787",
    targetLang: "KO",
    sourceLang: "",
    cacheEnabled: false,
  });

  return {
    proxyUrl: sanitizeProxyUrl(settings.proxyUrl),
    targetLang: String(settings.targetLang || "KO").toUpperCase(),
    sourceLang: String(settings.sourceLang || "").toUpperCase(),
    cacheEnabled: Boolean(settings.cacheEnabled),
  };
}

function sanitizeProxyUrl(raw) {
  const value = String(raw || "").trim().replace(/\/$/, "");
  if (!value) return "http://localhost:8787";
  if (!/^https?:\/\//i.test(value)) return "http://localhost:8787";
  return value;
}

function normalizeChannel(channel) {
  const value = String(channel || "").trim().toLowerCase();
  return value === "yt-subtitle" ? "yt-subtitle" : "page";
}

function clampContext(text, maxChars = SUBTITLE_CONTEXT_MAX_CHARS) {
  const normalized = normalizeText(text || "");
  if (!normalized) return "";
  return normalized.slice(0, Math.max(1, Math.floor(maxChars)));
}

function sanitizeModelType(raw) {
  const value = String(raw || "").trim().toLowerCase();
  if (!value) return "prefer_quality_optimized";
  return ALLOWED_MODEL_TYPES.has(value) ? value : "prefer_quality_optimized";
}

function pickAllowedOptions(rawOptions) {
  if (!rawOptions || typeof rawOptions !== "object") return {};
  const out = {};
  for (const [key, value] of Object.entries(rawOptions)) {
    if (!ALLOWED_OPTION_KEYS.has(key)) continue;
    out[key] = value;
  }
  if (typeof out.context === "string") {
    out.context = clampContext(out.context, 2000);
    if (!out.context) delete out.context;
  }
  return out;
}

function resolveBatchOptions(channel, rawOptions) {
  const normalizedChannel = normalizeChannel(channel);
  if (normalizedChannel !== "yt-subtitle") {
    return pickAllowedOptions(rawOptions);
  }

  const picked = pickAllowedOptions(rawOptions);
  const context = clampContext(picked.context, SUBTITLE_CONTEXT_MAX_CHARS);
  const options = {
    ...picked,
    model_type: sanitizeModelType(picked.model_type),
    preserve_formatting: true,
    split_sentences: "0",
  };

  if (context) {
    options.context = context;
  } else {
    delete options.context;
  }

  return options;
}

function normalizeSegmentRequestPayload(rawPayload) {
  if (!rawPayload || typeof rawPayload !== "object") {
    throw errorOf("BAD_REQUEST", "Invalid segment payload", false);
  }

  const lang = String(rawPayload.lang || "en").trim().toLowerCase() || "en";
  const hints = rawPayload.hints && typeof rawPayload.hints === "object" ? rawPayload.hints : {};
  const chunksRaw = Array.isArray(rawPayload.chunks) ? rawPayload.chunks : [];

  if (!chunksRaw.length) {
    throw errorOf("BAD_REQUEST", "Missing segment chunks", false);
  }
  if (chunksRaw.length > SEGMENT_MAX_CHUNKS) {
    throw errorOf("BAD_REQUEST", "Too many segment chunks", false);
  }

  const chunks = chunksRaw
    .map((chunk, index) => ({
      id: String(chunk?.id ?? index),
      text: normalizeText(chunk?.text || ""),
    }))
    .filter((chunk) => chunk.id && chunk.text)
    .map((chunk) => ({
      ...chunk,
      text: chunk.text.slice(0, SEGMENT_MAX_CHARS_PER_CHUNK),
    }));

  if (!chunks.length) {
    throw errorOf("BAD_REQUEST", "Empty segment chunks", false);
  }

  return { lang, chunks, hints };
}

async function handleSelectionTranslate(info, tab) {
  const selectionText = normalizeText(info.selectionText || "");
  if (!selectionText || !tab?.id) return;

  const settings = await getSettings();
  try {
    const result = await translateItems([{ id: "selection", text: selectionText }], settings);
    const translatedText = result?.translations?.[0]?.text || "";
    if (!translatedText) {
      throw errorOf("UNKNOWN", "No translation returned", true);
    }

    await safeSendMessage(tab.id, {
      type: "DUALREAD_SHOW_TOOLTIP",
      translatedText,
    });
  } catch (err) {
    const normalized = normalizeError(err);
    await safeSendMessage(tab.id, {
      type: "DUALREAD_SHOW_BANNER",
      message: normalized.message,
      retryable: normalized.retryable,
    });
  }
}

async function safeSendMessage(tabId, message) {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch {
    // The tab may no longer have the content script loaded.
  }
}

async function translateItems(items, settings, options, channel = "page") {
  const { expandedItems, originalItems } = expandItems(items, LIMITS.MAX_CHARS_PER_ITEM);
  if (!expandedItems.length) return { translations: [] };

  const normalizedOptions = normalizeOptions(resolveBatchOptions(channel, options));
  const useCache = settings.cacheEnabled;
  const keyedSegments = await Promise.all(
    expandedItems.map(async (segment) => {
      const material = buildCacheKeyMaterial({
        text: segment.text,
        sourceLang: settings.sourceLang,
        targetLang: settings.targetLang,
        options: normalizedOptions,
      });
      return {
        ...segment,
        cacheKey: await sha256Hex(material),
      };
    })
  );

  const uniqueByKey = new Map(); // cacheKey -> { id, text }
  for (const segment of keyedSegments) {
    if (!uniqueByKey.has(segment.cacheKey)) {
      uniqueByKey.set(segment.cacheKey, { id: segment.cacheKey, text: segment.text });
    }
  }

  let persistent = null;
  if (useCache) {
    try {
      persistent = await loadPersistentCache();
    } catch {
      persistent = null;
    }
  }
  const translationByKey = new Map();
  const missingItems = [];

  for (const [cacheKey, uniqueItem] of uniqueByKey.entries()) {
    if (useCache) {
      const memoryValue = getMemoryCache(cacheKey);
      if (memoryValue !== null) {
        translationByKey.set(cacheKey, memoryValue);
        continue;
      }

      if (persistent) {
        const persistedValue = readPersistentCache(persistent, cacheKey);
        if (persistedValue !== null) {
          translationByKey.set(cacheKey, persistedValue);
          setMemoryCache(cacheKey, persistedValue);
          continue;
        }
      }
    }

    missingItems.push(uniqueItem);
  }

  if (missingItems.length) {
    const batches = buildBatches({
      items: missingItems,
      targetLang: settings.targetLang,
      sourceLang: settings.sourceLang,
      options: normalizedOptions,
      limits: LIMITS,
    });

    const fetchedEntries = new Map();
    for (const batch of batches) {
      const payload = buildRequestPayload(batch, settings.targetLang, settings.sourceLang, normalizedOptions);
      const data = await requestTranslate(payload, settings.proxyUrl);
      const translations = Array.isArray(data?.translations) ? data.translations : [];
      const byId = new Map(
        translations.map((item) => [String(item?.id || ""), normalizeText(item?.text || "")])
      );

      for (const requestItem of batch) {
        const translatedText = byId.get(requestItem.id);
        if (translatedText === undefined) {
          throw errorOf("UNKNOWN", "Translation response missing item", true);
        }
        translationByKey.set(requestItem.id, translatedText);
        fetchedEntries.set(requestItem.id, translatedText);
      }
    }

    if (useCache) {
      for (const [cacheKey, value] of fetchedEntries.entries()) {
        setMemoryCache(cacheKey, value);
        if (persistent) {
          writePersistentCache(persistent, cacheKey, value);
        }
      }
    }
  }

  if (persistent?.dirty) {
    try {
      await savePersistentCache(persistent);
    } catch {
      // Cache persistence errors must not break translation delivery.
    }
  }

  const segmentTranslations = new Map();
  for (const segment of keyedSegments) {
    const translated = translationByKey.get(segment.cacheKey);
    if (translated === undefined) {
      throw errorOf("UNKNOWN", "Failed to resolve translated segment", true);
    }
    segmentTranslations.set(segment.id, translated);
  }

  const translations = [];
  for (const original of originalItems) {
    const parts = original.segmentIds
      .map((segmentId) => segmentTranslations.get(segmentId) || "")
      .filter(Boolean);
    translations.push({
      id: original.id,
      text: normalizeText(parts.join(" ")),
    });
  }

  return { translations };
}

async function requestTranslate(payload, proxyUrl, attempt = 0) {
  let resp;
  try {
    resp = await fetch(`${proxyUrl}/translate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    if (attempt < RETRY_ATTEMPTS) {
      await sleep(RETRY_DELAY_MS * 2 ** attempt);
      return requestTranslate(payload, proxyUrl, attempt + 1);
    }
    throw errorOf("PROXY_DOWN", "Cannot reach proxy server. Check proxy health and URL.", true);
  }

  const data = await resp.json().catch(() => null);
  if (resp.ok) return data;

  const err = normalizeProxyError(data, resp.status);
  if (attempt < RETRY_ATTEMPTS && err.retryable) {
    await sleep(RETRY_DELAY_MS * 2 ** attempt);
    return requestTranslate(payload, proxyUrl, attempt + 1);
  }
  throw err;
}

async function requestSegment(payload, proxyUrl, attempt = 0) {
  let resp;
  try {
    resp = await fetch(`${proxyUrl}/segment`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    if (attempt < SEGMENT_RETRY_ATTEMPTS) {
      await sleep(RETRY_DELAY_MS * 2 ** attempt);
      return requestSegment(payload, proxyUrl, attempt + 1);
    }
    throw errorOf("PROXY_DOWN", "Cannot reach proxy server for segmentation.", true);
  }

  const data = await resp.json().catch(() => null);
  if (resp.ok) return data;

  const err = normalizeProxyError(data, resp.status);
  if (attempt < SEGMENT_RETRY_ATTEMPTS && err.retryable) {
    await sleep(RETRY_DELAY_MS * 2 ** attempt);
    return requestSegment(payload, proxyUrl, attempt + 1);
  }
  throw err;
}

function normalizeProxyError(data, statusCode) {
  if (data?.error && typeof data.error === "object") {
    return errorOf(
      data.error.code || "UNKNOWN",
      data.error.message || `Proxy error ${statusCode}`,
      Boolean(data.error.retryable),
      statusCode
    );
  }
  if (statusCode === 429) return errorOf("DEEPL_RATE_LIMIT", "Rate limit reached. Retry shortly.", true, statusCode);
  if (statusCode >= 500) return errorOf("UNKNOWN", "Translation server error.", true, statusCode);
  return errorOf("UNKNOWN", `Proxy error ${statusCode}`, false, statusCode);
}

function errorOf(code, message, retryable, statusCode) {
  return {
    code,
    message,
    retryable: Boolean(retryable),
    ...(statusCode ? { statusCode } : {}),
  };
}

function normalizeError(err) {
  if (err?.code && err?.message) return err;
  return errorOf("UNKNOWN", err?.message || "Unknown error", false);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getMemoryCache(cacheKey) {
  const hit = memoryCache.get(cacheKey);
  if (!hit) return null;
  if (Date.now() - hit.ts > MEMORY_CACHE_TTL_MS) {
    memoryCache.delete(cacheKey);
    return null;
  }
  return hit.value;
}

function setMemoryCache(cacheKey, value) {
  memoryCache.set(cacheKey, { value, ts: Date.now() });
  while (memoryCache.size > MEMORY_CACHE_MAX_ENTRIES) {
    const oldestKey = memoryCache.keys().next().value;
    if (!oldestKey) break;
    memoryCache.delete(oldestKey);
  }
}

async function loadPersistentCache() {
  const raw = await chrome.storage.local.get({
    [LOCAL_CACHE_KEY]: {},
    [LOCAL_CACHE_META_KEY]: { order: [] },
  });

  const entries = raw[LOCAL_CACHE_KEY] && typeof raw[LOCAL_CACHE_KEY] === "object" ? raw[LOCAL_CACHE_KEY] : {};
  const meta = raw[LOCAL_CACHE_META_KEY] && typeof raw[LOCAL_CACHE_META_KEY] === "object"
    ? raw[LOCAL_CACHE_META_KEY]
    : { order: [] };

  if (!Array.isArray(meta.order)) meta.order = [];
  return { entries, meta, dirty: false };
}

function readPersistentCache(cacheState, cacheKey) {
  const hit = cacheState.entries[cacheKey];
  if (!hit || typeof hit.value !== "string") return null;
  if (typeof hit.ts !== "number") {
    delete cacheState.entries[cacheKey];
    cacheState.dirty = true;
    return null;
  }

  if (Date.now() - hit.ts > LOCAL_CACHE_TTL_MS) {
    delete cacheState.entries[cacheKey];
    cacheState.meta.order = cacheState.meta.order.filter((k) => k !== cacheKey);
    cacheState.dirty = true;
    return null;
  }
  return hit.value;
}

function writePersistentCache(cacheState, cacheKey, value) {
  cacheState.entries[cacheKey] = { value, ts: Date.now() };
  cacheState.meta.order = cacheState.meta.order.filter((k) => k !== cacheKey);
  cacheState.meta.order.push(cacheKey);

  while (cacheState.meta.order.length > LOCAL_CACHE_MAX_ENTRIES) {
    const oldest = cacheState.meta.order.shift();
    if (!oldest) break;
    delete cacheState.entries[oldest];
  }
  cacheState.dirty = true;
}

async function savePersistentCache(cacheState) {
  await chrome.storage.local.set({
    [LOCAL_CACHE_KEY]: cacheState.entries,
    [LOCAL_CACHE_META_KEY]: {
      order: cacheState.meta.order,
      count: cacheState.meta.order.length,
      updatedAt: Date.now(),
    },
  });
}

async function clearAllCaches() {
  memoryCache.clear();
  await chrome.storage.local.remove([LOCAL_CACHE_KEY, LOCAL_CACHE_META_KEY]);
}
