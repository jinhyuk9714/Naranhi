import { useState, useEffect, useCallback } from 'react';
import { DEFAULT_SETTINGS } from '@naranhi/core';
import type { EngineType, NaranhiSettings } from '@naranhi/core';

type PartialSettings = Partial<NaranhiSettings>;

export function useSettings() {
  const [settings, setSettings] = useState<NaranhiSettings>(DEFAULT_SETTINGS as unknown as NaranhiSettings);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    chrome.storage.sync.get(null, (stored) => {
      setSettings({
        engine: (stored.engine as EngineType) || 'deepl',
        targetLang: stored.targetLang || 'KO',
        sourceLang: stored.sourceLang || '',
        deepl: {
          proxyUrl: stored.deeplProxyUrl || stored.proxyUrl || 'http://localhost:8787',
          formality: stored.deeplFormality || '',
        },
        openai: {
          apiKey: stored.openaiApiKey || '',
          model: stored.openaiModel || 'gpt-4o-mini',
          baseUrl: stored.openaiBaseUrl || 'https://api.openai.com/v1',
        },
        google: {
          apiKey: stored.googleApiKey || '',
        },
        displayMode: stored.displayMode || 'bilingual',
        translationPosition: stored.translationPosition || 'below',
        floatingButton: stored.floatingButton !== false,
        theme: stored.theme || 'auto',
        visibleOnly: stored.visibleOnly !== false,
        visibleRootMargin: stored.visibleRootMargin || '350px 0px 600px 0px',
        batchFlushMs: Number(stored.batchFlushMs) || 120,
        cacheEnabled: Boolean(stored.cacheEnabled),
        shortcuts: stored.shortcuts || {},
      });
      setLoading(false);
    });
  }, []);

  const updateSettings = useCallback(async (updates: PartialSettings) => {
    const flat: Record<string, unknown> = {};

    if (updates.engine !== undefined) flat.engine = updates.engine;
    if (updates.targetLang !== undefined) flat.targetLang = updates.targetLang;
    if (updates.sourceLang !== undefined) flat.sourceLang = updates.sourceLang;
    if (updates.deepl) {
      if (updates.deepl.proxyUrl !== undefined) flat.deeplProxyUrl = updates.deepl.proxyUrl;
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
    if (updates.batchFlushMs !== undefined) flat.batchFlushMs = updates.batchFlushMs;
    if (updates.cacheEnabled !== undefined) flat.cacheEnabled = updates.cacheEnabled;

    await chrome.storage.sync.set(flat);
    setSettings((prev) => ({ ...prev, ...updates } as NaranhiSettings));
  }, []);

  return { settings, loading, updateSettings };
}
