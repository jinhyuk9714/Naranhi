import { useState, useEffect, useCallback } from 'react';
import { DEFAULT_SETTINGS } from '@naranhi/core';
import type { NaranhiSettings } from '@naranhi/core';
import {
  CLIENT_SECRET_STORAGE_KEYS,
  inflateSettings,
  flattenSettingsPatch,
  extractSyncStorageChanges,
} from '../lib/settings-storage';

type PartialSettings = Partial<NaranhiSettings>;

export function useSettings() {
  const [settings, setSettings] = useState<NaranhiSettings>(DEFAULT_SETTINGS as unknown as NaranhiSettings);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    chrome.storage.sync.get(null, (stored) => {
      setSettings(inflateSettings(stored));
      setLoading(false);
    });

    void chrome.storage.sync.remove([...CLIENT_SECRET_STORAGE_KEYS]);

    const onChanged = (changes: Record<string, { newValue?: unknown }>, areaName: string) => {
      if (areaName !== 'sync') return;
      const patch = extractSyncStorageChanges(changes);
      if (!Object.keys(patch).length) return;
      setSettings((prev) => inflateSettings({ ...flattenSettingsPatch(prev), ...patch }));
    };

    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);

  const updateSettings = useCallback(async (updates: PartialSettings) => {
    const flat = flattenSettingsPatch(updates);

    await chrome.storage.sync.set(flat);
    setSettings((prev) => inflateSettings({ ...flattenSettingsPatch(prev), ...flat }));
  }, []);

  return { settings, loading, updateSettings };
}
