import { useState, useEffect, useCallback } from 'react';
import { DEFAULT_SETTINGS } from '@naranhi/core';
import type { NaranhiSettings } from '@naranhi/core';
import { inflateSettings, flattenSettingsPatch } from '../lib/settings-storage';

type PartialSettings = Partial<NaranhiSettings>;

export function useSettings() {
  const [settings, setSettings] = useState<NaranhiSettings>(DEFAULT_SETTINGS as unknown as NaranhiSettings);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    chrome.storage.sync.get(null, (stored) => {
      setSettings(inflateSettings(stored));
      setLoading(false);
    });
  }, []);

  const updateSettings = useCallback(async (updates: PartialSettings) => {
    const flat = flattenSettingsPatch(updates);

    await chrome.storage.sync.set(flat);
    setSettings((prev) => inflateSettings({ ...flattenSettingsPatch(prev), ...flat }));
  }, []);

  return { settings, loading, updateSettings };
}
