import { DEFAULT_SETTINGS } from '@naranhi/core';
import type { NaranhiSettings } from '@naranhi/core';

type FlatStorage = Record<string, unknown>;
type PartialSettings = Partial<NaranhiSettings>;
type StorageChanges = Record<string, { newValue?: unknown }>;

const ALLOWED_ENGINES = new Set(['deepl', 'openai', 'google']);
export const CLIENT_SECRET_STORAGE_KEYS = ['openaiApiKey', 'googleApiKey'] as const;
const SENSITIVE_CLIENT_KEYS = new Set<string>(CLIENT_SECRET_STORAGE_KEYS);
const ALLOWED_DISPLAY_MODES = new Set(['bilingual', 'translation-only', 'original-only']);
const ALLOWED_TRANSLATION_POSITIONS = new Set(['below', 'side', 'hover']);
const ALLOWED_THEMES = new Set(['auto', 'light', 'dark']);
const ALLOWED_DEEPL_FORMALITY = new Set(['', 'default', 'more', 'less', 'prefer_more', 'prefer_less']);
const BATCH_FLUSH_MIN_MS = 20;
const BATCH_FLUSH_MAX_MS = 1000;

function asAllowed<T extends string>(value: unknown, allowed: Set<string>, fallback: T): T {
  const normalized = String(value || '').trim();
  return (allowed.has(normalized) ? normalized : fallback) as T;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function sanitizeProxyUrl(raw: unknown): string {
  const value = String(raw || '').trim().replace(/\/$/, '');
  if (!value || !/^https?:\/\//i.test(value)) return 'http://localhost:8787';
  return value;
}

export function sanitizeHttpUrl(raw: unknown, fallback: string): string {
  const value = String(raw || '').trim().replace(/\/$/, '');
  if (!value || !/^https?:\/\//i.test(value)) return fallback;
  return value;
}

export function sanitizeDeepLFormality(raw: unknown): string {
  const normalized = String(raw || '').trim().toLowerCase();
  return ALLOWED_DEEPL_FORMALITY.has(normalized) ? normalized : '';
}

export function sanitizeVisibleRootMargin(raw: unknown): string {
  const value = String(raw || '').trim();
  if (!value) return DEFAULT_SETTINGS.visibleRootMargin;

  // CSS margin shorthand: 1~4 values, px/% only to keep parser safe and predictable.
  const tokenPattern = /^-?\d+(?:\.\d+)?(?:px|%)$/;
  const parts = value.split(/\s+/).filter(Boolean);
  if (parts.length < 1 || parts.length > 4) return DEFAULT_SETTINGS.visibleRootMargin;
  if (!parts.every((part) => tokenPattern.test(part))) return DEFAULT_SETTINGS.visibleRootMargin;
  return parts.join(' ');
}

export function inflateSettings(stored: FlatStorage): NaranhiSettings {
  return {
    ...DEFAULT_SETTINGS,
    engine: asAllowed(stored.engine, ALLOWED_ENGINES, DEFAULT_SETTINGS.engine),
    targetLang: String(stored.targetLang || DEFAULT_SETTINGS.targetLang).trim().toUpperCase(),
    sourceLang: String(stored.sourceLang || DEFAULT_SETTINGS.sourceLang).trim().toUpperCase(),
    deepl: {
      proxyUrl: sanitizeProxyUrl(stored.deeplProxyUrl || stored.proxyUrl || DEFAULT_SETTINGS.deepl.proxyUrl),
      formality: sanitizeDeepLFormality(stored.deeplFormality || DEFAULT_SETTINGS.deepl.formality || ''),
    },
    openai: {
      apiKey: '',
      model: String(stored.openaiModel || DEFAULT_SETTINGS.openai.model),
      baseUrl: sanitizeHttpUrl(stored.openaiBaseUrl, DEFAULT_SETTINGS.openai.baseUrl || 'https://api.openai.com/v1'),
    },
    google: {
      apiKey: '',
    },
    displayMode: asAllowed(stored.displayMode, ALLOWED_DISPLAY_MODES, DEFAULT_SETTINGS.displayMode),
    translationPosition: asAllowed(
      stored.translationPosition,
      ALLOWED_TRANSLATION_POSITIONS,
      DEFAULT_SETTINGS.translationPosition,
    ),
    floatingButton: stored.floatingButton !== false,
    theme: asAllowed(stored.theme, ALLOWED_THEMES, DEFAULT_SETTINGS.theme),
    visibleOnly: stored.visibleOnly !== false,
    visibleRootMargin: sanitizeVisibleRootMargin(stored.visibleRootMargin),
    batchFlushMs: clampNumber(stored.batchFlushMs, BATCH_FLUSH_MIN_MS, BATCH_FLUSH_MAX_MS, DEFAULT_SETTINGS.batchFlushMs),
    cacheEnabled: Boolean(stored.cacheEnabled),
    shortcuts: (stored.shortcuts as Record<string, string>) || DEFAULT_SETTINGS.shortcuts,
  } as NaranhiSettings;
}

export function extractSyncStorageChanges(changes: StorageChanges): FlatStorage {
  const flat: FlatStorage = {};
  for (const [key, change] of Object.entries(changes || {})) {
    if (SENSITIVE_CLIENT_KEYS.has(key)) continue;
    if (change && Object.prototype.hasOwnProperty.call(change, 'newValue')) {
      flat[key] = change.newValue;
    }
  }
  return flat;
}

export function flattenSettingsPatch(updates: PartialSettings): FlatStorage {
  const flat: FlatStorage = {};

  if (updates.engine !== undefined) flat.engine = asAllowed(updates.engine, ALLOWED_ENGINES, DEFAULT_SETTINGS.engine);
  if (updates.targetLang !== undefined) flat.targetLang = String(updates.targetLang).trim().toUpperCase();
  if (updates.sourceLang !== undefined) flat.sourceLang = String(updates.sourceLang).trim().toUpperCase();

  if (updates.deepl) {
    if (updates.deepl.proxyUrl !== undefined) flat.deeplProxyUrl = sanitizeProxyUrl(updates.deepl.proxyUrl);
    if (updates.deepl.formality !== undefined) flat.deeplFormality = sanitizeDeepLFormality(updates.deepl.formality);
  }

  if (updates.openai) {
    if (updates.openai.model !== undefined) flat.openaiModel = updates.openai.model;
    if (updates.openai.baseUrl !== undefined) {
      flat.openaiBaseUrl = sanitizeHttpUrl(updates.openai.baseUrl, DEFAULT_SETTINGS.openai.baseUrl || 'https://api.openai.com/v1');
    }
  }

  if (updates.google) {
    // client-side API key persistence is intentionally blocked
  }

  if (updates.displayMode !== undefined) {
    flat.displayMode = asAllowed(updates.displayMode, ALLOWED_DISPLAY_MODES, DEFAULT_SETTINGS.displayMode);
  }
  if (updates.translationPosition !== undefined) {
    flat.translationPosition = asAllowed(
      updates.translationPosition,
      ALLOWED_TRANSLATION_POSITIONS,
      DEFAULT_SETTINGS.translationPosition,
    );
  }
  if (updates.floatingButton !== undefined) flat.floatingButton = updates.floatingButton;
  if (updates.theme !== undefined) flat.theme = asAllowed(updates.theme, ALLOWED_THEMES, DEFAULT_SETTINGS.theme);
  if (updates.visibleOnly !== undefined) flat.visibleOnly = updates.visibleOnly;
  if (updates.visibleRootMargin !== undefined) flat.visibleRootMargin = sanitizeVisibleRootMargin(updates.visibleRootMargin);
  if (updates.batchFlushMs !== undefined) {
    flat.batchFlushMs = clampNumber(updates.batchFlushMs, BATCH_FLUSH_MIN_MS, BATCH_FLUSH_MAX_MS, DEFAULT_SETTINGS.batchFlushMs);
  }
  if (updates.cacheEnabled !== undefined) flat.cacheEnabled = updates.cacheEnabled;
  if (updates.shortcuts !== undefined) flat.shortcuts = updates.shortcuts;

  return flat;
}
