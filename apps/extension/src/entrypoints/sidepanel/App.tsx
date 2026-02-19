import React, { useState, useCallback } from 'react';
import { MESSAGE_TYPES, SUPPORTED_LANGUAGES } from '@naranhi/core';
import type { EngineType } from '@naranhi/core';
import { Button, Select } from '@naranhi/ui';
import { useSettings } from '../../hooks/useSettings';

const ENGINE_OPTIONS = [
  { value: 'deepl', label: 'DeepL' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'google', label: 'Google' },
];

const LANGUAGE_OPTIONS = SUPPORTED_LANGUAGES.map((l) => ({
  value: l.code,
  label: `${l.nativeName}`,
}));

interface HistoryEntry {
  id: string;
  source: string;
  translated: string;
  engine: string;
  timestamp: number;
}

export default function App() {
  const { settings, updateSettings } = useSettings();
  const [inputText, setInputText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [translating, setTranslating] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const translateText = useCallback(async () => {
    if (!inputText.trim()) return;
    setTranslating(true);

    try {
      const response = await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.TRANSLATE_BATCH,
        runId: `sidepanel-${Date.now()}`,
        items: [{ id: 'sidepanel', text: inputText }],
        channel: 'page',
      });

      if (response?.ok) {
        const translated = response.data.translations?.[0]?.text || '';
        setTranslatedText(translated);

        if (translated) {
          setHistory((prev) => [
            {
              id: `h-${Date.now()}`,
              source: inputText,
              translated,
              engine: settings.engine,
              timestamp: Date.now(),
            },
            ...prev.slice(0, 49),
          ]);
        }
      }
    } catch {
      setTranslatedText('Translation failed');
    } finally {
      setTranslating(false);
    }
  }, [inputText, settings.engine]);

  return (
    <div className="h-screen flex flex-col bg-white">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
        <h1 className="text-sm font-semibold text-gray-900">Naranhi Translation</h1>
      </div>

      {/* Quick Settings */}
      <div className="px-4 py-2 border-b border-gray-100 flex-shrink-0">
        <div className="flex gap-2">
          <Select
            value={settings.engine}
            options={ENGINE_OPTIONS}
            onChange={(v) => updateSettings({ engine: v as EngineType })}
            className="flex-1"
          />
          <Select
            value={settings.targetLang}
            options={LANGUAGE_OPTIONS}
            onChange={(v) => updateSettings({ targetLang: v })}
            className="flex-1"
          />
        </div>
      </div>

      {/* Translation Input */}
      <div className="p-4 space-y-3 flex-shrink-0">
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Enter text to translate..."
          className="w-full h-24 px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-naranhi-500/40"
        />
        <div className="flex justify-end">
          <Button onClick={translateText} disabled={translating || !inputText.trim()} size="sm">
            {translating ? 'Translating...' : 'Translate'}
          </Button>
        </div>
        {translatedText && (
          <div className="p-3 bg-naranhi-50 rounded-lg text-sm text-gray-800 leading-relaxed">
            {translatedText}
          </div>
        )}
      </div>

      {/* History */}
      <div className="flex-1 overflow-auto px-4 pb-4">
        {history.length > 0 && (
          <>
            <h2 className="text-xs font-medium text-gray-400 uppercase mb-2">History</h2>
            <div className="space-y-2">
              {history.map((entry) => (
                <div key={entry.id} className="p-2 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-400 truncate">{entry.source}</p>
                  <p className="text-sm text-gray-700 mt-0.5">{entry.translated}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
