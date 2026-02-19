import React, { useState, useEffect, useCallback } from 'react';
import { MESSAGE_TYPES, SUPPORTED_LANGUAGES } from '@naranhi/core';
import type { EngineType } from '@naranhi/core';
import { Toggle } from '@naranhi/ui';
import { Select } from '@naranhi/ui';
import { useSettings } from '../../hooks/useSettings';

const ENGINE_OPTIONS = [
  { value: 'deepl', label: 'DeepL' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'google', label: 'Google' },
];

const LANGUAGE_OPTIONS = SUPPORTED_LANGUAGES.map((l) => ({
  value: l.code,
  label: `${l.nativeName} (${l.code})`,
}));

export default function App() {
  const { settings, loading, updateSettings } = useSettings();
  const [pageEnabled, setPageEnabled] = useState(false);
  const [ytEnabled, setYtEnabled] = useState(false);
  const [isYouTube, setIsYouTube] = useState(false);

  useEffect(() => {
    // Query active tab state
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tab = tabs[0];
      if (!tab?.id) return;

      const url = tab.url || '';
      setIsYouTube(url.includes('youtube.com/watch'));

      try {
        const pageState = await chrome.tabs.sendMessage(tab.id, {
          type: MESSAGE_TYPES.GET_PAGE_STATE,
        });
        if (pageState?.ok) setPageEnabled(pageState.data.enabled);
      } catch {
        // content script may not be loaded
      }

      try {
        const ytState = await chrome.tabs.sendMessage(tab.id, {
          type: MESSAGE_TYPES.GET_YT_SUBTITLE_STATE,
        });
        if (ytState?.ok) setYtEnabled(ytState.data.enabled);
      } catch {
        // not on YouTube
      }
    });
  }, []);

  const togglePage = useCallback(async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = tabs[0]?.id;
    if (!tabId) return;

    try {
      const resp = await chrome.tabs.sendMessage(tabId, {
        type: MESSAGE_TYPES.TOGGLE_PAGE,
      });
      if (resp?.ok) setPageEnabled(resp.data.enabled);
    } catch {
      // failed
    }
  }, []);

  const toggleYt = useCallback(async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = tabs[0]?.id;
    if (!tabId) return;

    try {
      const resp = await chrome.tabs.sendMessage(tabId, {
        type: MESSAGE_TYPES.TOGGLE_YT_SUBTITLE,
      });
      if (resp?.ok) setYtEnabled(resp.data.enabled);
    } catch {
      // failed
    }
  }, []);

  if (loading) {
    return (
      <div className="w-72 p-4 flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-naranhi-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-72 bg-white">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <h1 className="text-base font-semibold text-gray-900">Naranhi</h1>
          <span className="text-xs px-2 py-0.5 bg-naranhi-50 text-naranhi-600 rounded-full font-medium">
            {settings.engine.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Controls */}
      <div className="p-4 space-y-4">
        {/* Engine & Language */}
        <div className="grid grid-cols-2 gap-2">
          <Select
            label="Engine"
            value={settings.engine}
            options={ENGINE_OPTIONS}
            onChange={(v) => updateSettings({ engine: v as EngineType })}
          />
          <Select
            label="Target"
            value={settings.targetLang}
            options={LANGUAGE_OPTIONS}
            onChange={(v) => updateSettings({ targetLang: v })}
          />
        </div>

        {/* Page Translation Toggle */}
        <div className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
          <span className="text-sm font-medium text-gray-700">Page Translation</span>
          <Toggle checked={pageEnabled} onChange={togglePage} size="sm" />
        </div>

        {/* YouTube Subtitle Toggle */}
        <div
          className={`flex items-center justify-between py-2 px-3 rounded-lg ${
            isYouTube ? 'bg-gray-50' : 'bg-gray-50 opacity-50'
          }`}
        >
          <span className="text-sm font-medium text-gray-700">YouTube Subtitles</span>
          <Toggle
            checked={ytEnabled}
            onChange={toggleYt}
            disabled={!isYouTube}
            size="sm"
          />
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-gray-100 flex justify-between items-center">
        <button
          onClick={() => chrome.runtime.openOptionsPage()}
          className="text-xs text-naranhi-600 hover:text-naranhi-700 font-medium"
        >
          Settings
        </button>
        <button
          onClick={() => chrome.sidePanel?.open?.({ windowId: chrome.windows?.WINDOW_ID_CURRENT })}
          className="text-xs text-gray-500 hover:text-gray-700"
        >
          Side Panel
        </button>
      </div>
    </div>
  );
}
