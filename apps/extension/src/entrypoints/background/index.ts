import {
  LIMITS,
  MESSAGE_TYPES,
  normalizeText,
  normalizeOptions,
  sha256Hex,
  buildCacheKeyMaterial,
  expandItems,
  buildBatches,
  buildRequestPayload,
} from '@naranhi/core';
import type {
  TranslationItem,
  TranslationOptions,
  TranslationError,
  NaranhiSettings,
} from '@naranhi/core';
import { EngineManager } from '@naranhi/engines';
import type { EngineConfig } from '@naranhi/engines';
import { InflightTranslations } from './inflight';
import { handleSelectionTranslateRequest } from './selection-translate';
import { inflateSettings } from '../../lib/settings-storage';

export default defineBackground(() => {
  // --- Constants ---
  const CONTEXT_MENU_ID = 'naranhi-translate-selection';
  const LOCAL_CACHE_KEY = 'naranhiCacheV1';
  const LOCAL_CACHE_META_KEY = 'naranhiCacheMetaV1';
  const MEMORY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
  const LOCAL_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  const MEMORY_CACHE_MAX_ENTRIES = 1500;
  const LOCAL_CACHE_MAX_ENTRIES = 3000;
  const RETRY_DELAY_MS = 500;
  const RETRY_ATTEMPTS = 1;

  // --- Memory Cache ---
  const memoryCache = new Map<string, { value: string; ts: number }>();
  const inflightTranslations = new InflightTranslations<string>();

  // --- Engine Manager (lazily initialized) ---
  let engineManager: EngineManager | null = null;

  async function getEngineManager(): Promise<EngineManager> {
    if (engineManager) return engineManager;

    const settings = await loadSettings();
    const config: EngineConfig = {
      deepl: { proxyUrl: settings.deepl.proxyUrl, formality: settings.deepl.formality },
    };
    if (settings.openai.apiKey) {
      config.openai = {
        apiKey: settings.openai.apiKey,
        model: settings.openai.model,
        baseUrl: settings.openai.baseUrl,
      };
    }
    if (settings.google.apiKey !== undefined) {
      config.google = { apiKey: settings.google.apiKey };
    }

    engineManager = new EngineManager(config);
    try {
      engineManager.setActiveEngine(settings.engine);
    } catch {
      // fallback to deepl if configured engine not available
    }

    return engineManager;
  }

  // --- Settings ---
  async function loadSettings(): Promise<NaranhiSettings> {
    const stored = await chrome.storage.sync.get(null);
    return inflateSettings(stored);
  }

  // --- Context Menu ---
  function ensureContextMenu(): void {
    chrome.contextMenus.remove(CONTEXT_MENU_ID, () => {
      void chrome.runtime.lastError; // consume
      chrome.contextMenus.create(
        {
          id: CONTEXT_MENU_ID,
          title: 'Translate with Naranhi',
          contexts: ['selection'],
        },
        () => void chrome.runtime.lastError,
      );
    });
  }

  chrome.runtime.onInstalled.addListener(() => ensureContextMenu());
  chrome.runtime.onStartup.addListener(() => ensureContextMenu());

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== CONTEXT_MENU_ID) return;
    void handleSelectionTranslate(info, tab);
  });

  // --- Message Handling ---
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    void (async () => {
      if (msg?.type === MESSAGE_TYPES.TRANSLATE_BATCH) {
        const settings = await loadSettings();
        const runId = String(msg.runId || '');
        const items: TranslationItem[] = Array.isArray(msg.items) ? msg.items : [];
        if (!runId) throw makeError('BAD_REQUEST', 'Missing runId', false);

        const result = await translateItems(items, settings, msg.options, msg.channel);
        sendResponse({ ok: true, data: { runId, ...result } });
        return;
      }

      if (msg?.type === MESSAGE_TYPES.CLEAR_CACHE) {
        await clearAllCaches();
        sendResponse({ ok: true });
        return;
      }

      sendResponse({ ok: false, error: makeError('BAD_REQUEST', 'Unknown message type', false) });
    })().catch((err) => {
      sendResponse({ ok: false, error: normalizeError(err) });
    });

    return true; // keep channel open for async
  });

  // Invalidate engine manager when settings change
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') {
      engineManager = null;
    }
  });

  // --- Translation Core ---
  async function translateItems(
    items: TranslationItem[],
    settings: NaranhiSettings,
    options?: TranslationOptions,
    channel: string = 'page',
  ): Promise<{ translations: Array<{ id: string; text: string }> }> {
    const { expandedItems, originalItems } = expandItems(items, LIMITS.MAX_CHARS_PER_ITEM);
    if (!expandedItems.length) return { translations: [] };

    const normalizedOptions = normalizeOptions(options || {}) as TranslationOptions;
    const useCache = settings.cacheEnabled;

    // Build cache keys
    const keyedSegments = await Promise.all(
      expandedItems.map(async (segment) => {
        const material = buildCacheKeyMaterial({
          text: segment.text,
          sourceLang: settings.sourceLang,
          targetLang: settings.targetLang,
          options: normalizedOptions,
        });
        return { ...segment, cacheKey: await sha256Hex(material) };
      }),
    );

    // Deduplicate by cache key
    const uniqueByKey = new Map<string, TranslationItem>();
    for (const segment of keyedSegments) {
      if (!uniqueByKey.has(segment.cacheKey)) {
        uniqueByKey.set(segment.cacheKey, { id: segment.cacheKey, text: segment.text });
      }
    }

    // Check caches
    let persistent: PersistentCacheState | null = null;
    if (useCache) {
      try {
        persistent = await loadPersistentCache();
      } catch {
        persistent = null;
      }
    }

    const translationByKey = new Map<string, string>();
    const missingItems: TranslationItem[] = [];
    const waitingInflight = new Map<string, Promise<string>>();

    for (const [cacheKey, uniqueItem] of uniqueByKey.entries()) {
      if (useCache) {
        const memVal = getMemoryCache(cacheKey);
        if (memVal !== null) {
          translationByKey.set(cacheKey, memVal);
          continue;
        }
        if (persistent) {
          const persisted = readPersistentCache(persistent, cacheKey);
          if (persisted !== null) {
            translationByKey.set(cacheKey, persisted);
            setMemoryCache(cacheKey, persisted);
            continue;
          }
        }
      }

      const inflight = inflightTranslations.wait(cacheKey);
      if (inflight) {
        waitingInflight.set(cacheKey, inflight);
        continue;
      }

      missingItems.push(uniqueItem);
    }

    const claimedKeys = inflightTranslations.claim(missingItems.map((item) => item.id));

    // Translate missing items via engine
    if (missingItems.length) {
      const manager = await getEngineManager();
      const batches = buildBatches({
        items: missingItems,
        targetLang: settings.targetLang,
        sourceLang: settings.sourceLang,
        options: normalizedOptions,
        limits: LIMITS,
      });

      const fetchedEntries = new Map<string, string>();
      try {
        for (const batch of batches) {
          const results = await manager.translate({
            items: batch,
            targetLang: settings.targetLang,
            sourceLang: settings.sourceLang || undefined,
            options: normalizedOptions,
          });

          const byId = new Map(results.map((r) => [r.id, r.translatedText]));
          for (const requestItem of batch) {
            const translated = byId.get(requestItem.id);
            if (translated === undefined) {
              throw makeError('UNKNOWN', 'Translation response missing item', true);
            }
            translationByKey.set(requestItem.id, translated);
            fetchedEntries.set(requestItem.id, translated);
            inflightTranslations.resolve(requestItem.id, translated);
          }
        }
      } catch (err) {
        inflightTranslations.rejectAll(claimedKeys, err);
        throw err;
      }

      if (useCache) {
        for (const [key, value] of fetchedEntries) {
          setMemoryCache(key, value);
          if (persistent) writePersistentCache(persistent, key, value);
        }
      }
    }

    if (waitingInflight.size) {
      for (const [key, pending] of waitingInflight.entries()) {
        translationByKey.set(key, await pending);
      }
    }

    // Save persistent cache
    if (persistent?.dirty) {
      try {
        await savePersistentCache(persistent);
      } catch {
        // non-fatal
      }
    }

    // Reassemble segments into original items
    const segmentTranslations = new Map<string, string>();
    for (const segment of keyedSegments) {
      const translated = translationByKey.get(segment.cacheKey);
      if (translated === undefined) {
        throw makeError('UNKNOWN', 'Failed to resolve translated segment', true);
      }
      segmentTranslations.set(segment.id, translated);
    }

    const translations = originalItems.map((original) => {
      const parts = original.segmentIds
        .map((segId) => segmentTranslations.get(segId) || '')
        .filter(Boolean);
      return { id: original.id, text: normalizeText(parts.join(' ')) };
    });

    return { translations };
  }

  // --- Selection Translate ---
  async function handleSelectionTranslate(
    info: chrome.contextMenus.OnClickData,
    tab: chrome.tabs.Tab | undefined,
  ): Promise<void> {
    await handleSelectionTranslateRequest({
      selectionText: String(info.selectionText || ''),
      tabId: tab?.id,
      translateOne: async (text) => {
        const settings = await loadSettings();
        const result = await translateItems([{ id: 'selection', text }], settings);
        return result?.translations?.[0]?.text || '';
      },
      sendMessage: safeSendMessage,
    });
  }

  async function safeSendMessage(tabId: number, message: unknown): Promise<void> {
    try {
      await chrome.tabs.sendMessage(tabId, message);
    } catch {
      // tab may no longer have content script
    }
  }

  // --- Memory Cache ---
  function getMemoryCache(key: string): string | null {
    const hit = memoryCache.get(key);
    if (!hit) return null;
    if (Date.now() - hit.ts > MEMORY_CACHE_TTL_MS) {
      memoryCache.delete(key);
      return null;
    }
    return hit.value;
  }

  function setMemoryCache(key: string, value: string): void {
    memoryCache.set(key, { value, ts: Date.now() });
    while (memoryCache.size > MEMORY_CACHE_MAX_ENTRIES) {
      const oldest = memoryCache.keys().next().value;
      if (!oldest) break;
      memoryCache.delete(oldest);
    }
  }

  // --- Persistent Cache ---
  interface PersistentCacheState {
    entries: Record<string, { value: string; ts: number }>;
    meta: { order: string[] };
    dirty: boolean;
  }

  async function loadPersistentCache(): Promise<PersistentCacheState> {
    const raw = await chrome.storage.local.get({
      [LOCAL_CACHE_KEY]: {},
      [LOCAL_CACHE_META_KEY]: { order: [] },
    });
    const entries = raw[LOCAL_CACHE_KEY] ?? {};
    const meta = raw[LOCAL_CACHE_META_KEY] ?? { order: [] };
    if (!Array.isArray(meta.order)) meta.order = [];
    return { entries, meta, dirty: false };
  }

  function readPersistentCache(state: PersistentCacheState, key: string): string | null {
    const hit = state.entries[key];
    if (!hit || typeof hit.value !== 'string' || typeof hit.ts !== 'number') {
      if (hit) {
        delete state.entries[key];
        state.dirty = true;
      }
      return null;
    }
    if (Date.now() - hit.ts > LOCAL_CACHE_TTL_MS) {
      delete state.entries[key];
      state.meta.order = state.meta.order.filter((k) => k !== key);
      state.dirty = true;
      return null;
    }
    return hit.value;
  }

  function writePersistentCache(state: PersistentCacheState, key: string, value: string): void {
    state.entries[key] = { value, ts: Date.now() };
    state.meta.order = state.meta.order.filter((k) => k !== key);
    state.meta.order.push(key);
    while (state.meta.order.length > LOCAL_CACHE_MAX_ENTRIES) {
      const oldest = state.meta.order.shift();
      if (oldest) delete state.entries[oldest];
    }
    state.dirty = true;
  }

  async function savePersistentCache(state: PersistentCacheState): Promise<void> {
    await chrome.storage.local.set({
      [LOCAL_CACHE_KEY]: state.entries,
      [LOCAL_CACHE_META_KEY]: {
        order: state.meta.order,
        count: state.meta.order.length,
        updatedAt: Date.now(),
      },
    });
  }

  async function clearAllCaches(): Promise<void> {
    memoryCache.clear();
    await chrome.storage.local.remove([LOCAL_CACHE_KEY, LOCAL_CACHE_META_KEY]);
  }

  // --- Error Helpers ---
  function makeError(
    code: string,
    message: string,
    retryable: boolean,
    statusCode?: number,
  ): TranslationError {
    return { code, message, retryable, ...(statusCode ? { statusCode } : {}) };
  }

  function normalizeError(err: unknown): TranslationError {
    if (err && typeof err === 'object' && 'code' in err && 'message' in err) {
      return err as TranslationError;
    }
    return makeError('UNKNOWN', (err as Error)?.message || 'Unknown error', false);
  }
});
