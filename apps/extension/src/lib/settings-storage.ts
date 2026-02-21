import { DEFAULT_SETTINGS } from '@naranhi/core';
import type { NaranhiSettings } from '@naranhi/core';

type FlatStorage = Record<string, unknown>;
type PartialSettings = Partial<NaranhiSettings>;
type StorageChanges = Record<string, { newValue?: unknown }>;

export function sanitizeProxyUrl(raw: unknown): string {
  const value = String(raw || '').trim().replace(/\/$/, '');
  if (!value || !/^https?:\/\//i.test(value)) return 'http://localhost:8787';
  return value;
}

export function inflateSettings(stored: FlatStorage): NaranhiSettings {
  return {
    ...DEFAULT_SETTINGS,
    engine: String(stored.engine || DEFAULT_SETTINGS.engine) as NaranhiSettings['engine'],
    targetLang: String(stored.targetLang || DEFAULT_SETTINGS.targetLang).toUpperCase(),
    sourceLang: String(stored.sourceLang || DEFAULT_SETTINGS.sourceLang).toUpperCase(),
    deepl: {
      proxyUrl: sanitizeProxyUrl(stored.deeplProxyUrl || stored.proxyUrl || DEFAULT_SETTINGS.deepl.proxyUrl),
      formality: String(stored.deeplFormality || DEFAULT_SETTINGS.deepl.formality || ''),
    },
    openai: {
      apiKey: String(stored.openaiApiKey || DEFAULT_SETTINGS.openai.apiKey),
      model: String(stored.openaiModel || DEFAULT_SETTINGS.openai.model),
      baseUrl: String(stored.openaiBaseUrl || DEFAULT_SETTINGS.openai.baseUrl),
    },
    google: {
      apiKey: String(stored.googleApiKey || DEFAULT_SETTINGS.google.apiKey || ''),
    },
    displayMode: String(stored.displayMode || DEFAULT_SETTINGS.displayMode) as NaranhiSettings['displayMode'],
    translationPosition: String(
      stored.translationPosition || DEFAULT_SETTINGS.translationPosition,
    ) as NaranhiSettings['translationPosition'],
    floatingButton: stored.floatingButton !== false,
    theme: String(stored.theme || DEFAULT_SETTINGS.theme) as NaranhiSettings['theme'],
    visibleOnly: stored.visibleOnly !== false,
    visibleRootMargin: String(stored.visibleRootMargin || DEFAULT_SETTINGS.visibleRootMargin),
    batchFlushMs: Number(stored.batchFlushMs) || DEFAULT_SETTINGS.batchFlushMs,
    cacheEnabled: Boolean(stored.cacheEnabled),
    shortcuts: (stored.shortcuts as Record<string, string>) || DEFAULT_SETTINGS.shortcuts,
  } as NaranhiSettings;
}

export function extractSyncStorageChanges(changes: StorageChanges): FlatStorage {
  const flat: FlatStorage = {};
  for (const [key, change] of Object.entries(changes || {})) {
    if (change && Object.prototype.hasOwnProperty.call(change, 'newValue')) {
      flat[key] = change.newValue;
    }
  }
  return flat;
}

export function flattenSettingsPatch(updates: PartialSettings): FlatStorage {
  const flat: FlatStorage = {};

  if (updates.engine !== undefined) flat.engine = updates.engine;
  if (updates.targetLang !== undefined) flat.targetLang = updates.targetLang;
  if (updates.sourceLang !== undefined) flat.sourceLang = updates.sourceLang;

  if (updates.deepl) {
    if (updates.deepl.proxyUrl !== undefined) flat.deeplProxyUrl = sanitizeProxyUrl(updates.deepl.proxyUrl);
    if (updates.deepl.formality !== undefined) flat.deeplFormality = updates.deepl.formality;
  }

  if (updates.openai) {
    if (updates.openai.apiKey !== undefined) flat.openaiApiKey = updates.openai.apiKey;
    if (updates.openai.model !== undefined) flat.openaiModel = updates.openai.model;
    if (updates.openai.baseUrl !== undefined) flat.openaiBaseUrl = updates.openai.baseUrl;
  }

  if (updates.google) {
    if (updates.google.apiKey !== undefined) flat.googleApiKey = updates.google.apiKey;
  }

  if (updates.displayMode !== undefined) flat.displayMode = updates.displayMode;
  if (updates.translationPosition !== undefined) flat.translationPosition = updates.translationPosition;
  if (updates.floatingButton !== undefined) flat.floatingButton = updates.floatingButton;
  if (updates.theme !== undefined) flat.theme = updates.theme;
  if (updates.visibleOnly !== undefined) flat.visibleOnly = updates.visibleOnly;
  if (updates.visibleRootMargin !== undefined) flat.visibleRootMargin = updates.visibleRootMargin;
  if (updates.batchFlushMs !== undefined) flat.batchFlushMs = updates.batchFlushMs;
  if (updates.cacheEnabled !== undefined) flat.cacheEnabled = updates.cacheEnabled;
  if (updates.shortcuts !== undefined) flat.shortcuts = updates.shortcuts;

  return flat;
}
