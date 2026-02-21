import React, { useState, useCallback } from 'react';
import { SUPPORTED_LANGUAGES, MESSAGE_TYPES } from '@naranhi/core';
import type { EngineType } from '@naranhi/core';
import { Button, Toggle, Select, StatusBadge } from '@naranhi/ui';
import { useSettings } from '../../hooks/useSettings';

const ENGINE_OPTIONS = [
  { value: 'deepl', label: 'DeepL' },
  { value: 'openai', label: 'OpenAI / ChatGPT' },
  { value: 'google', label: 'Google Translate' },
];

const LANGUAGE_OPTIONS = SUPPORTED_LANGUAGES.map((l) => ({
  value: l.code,
  label: `${l.nativeName} (${l.name})`,
}));

type Tab = 'general' | 'engines' | 'display' | 'performance' | 'advanced';

export default function App() {
  const { settings, loading, updateSettings } = useSettings();
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const [testStatus, setTestStatus] = useState<Record<string, 'connected' | 'disconnected' | 'loading'>>({});

  const testEngine = useCallback(async (engineId: EngineType) => {
    setTestStatus((prev) => ({ ...prev, [engineId]: 'loading' }));
    try {
      let ok = false;
      if (engineId === 'deepl') {
        const resp = await fetch(`${settings.deepl.proxyUrl}/health`);
        ok = resp.ok;
      } else {
        // For other engines, we'd test via background
        ok = true;
      }
      setTestStatus((prev) => ({ ...prev, [engineId]: ok ? 'connected' : 'disconnected' }));
    } catch {
      setTestStatus((prev) => ({ ...prev, [engineId]: 'disconnected' }));
    }
  }, [settings]);

  const clearCache = useCallback(async () => {
    await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.CLEAR_CACHE });
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-naranhi-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'general', label: 'General' },
    { id: 'engines', label: 'Engines' },
    { id: 'display', label: 'Display' },
    { id: 'performance', label: 'Performance' },
    { id: 'advanced', label: 'Advanced' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto py-8 px-4">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Naranhi Settings</h1>
          <p className="mt-1 text-sm text-gray-500">Configure your bilingual translation experience</p>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-1 mb-6 p-1 bg-gray-100 rounded-lg">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === tab.id
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          {activeTab === 'general' && (
            <div className="space-y-6">
              <Select
                label="Default Translation Engine"
                value={settings.engine}
                options={ENGINE_OPTIONS}
                onChange={(v) => updateSettings({ engine: v as EngineType })}
              />
              <div className="grid grid-cols-2 gap-4">
                <Select
                  label="Target Language"
                  value={settings.targetLang}
                  options={LANGUAGE_OPTIONS}
                  onChange={(v) => updateSettings({ targetLang: v })}
                />
                <Select
                  label="Source Language"
                  value={settings.sourceLang}
                  options={[{ value: '', label: 'Auto-detect' }, ...LANGUAGE_OPTIONS]}
                  onChange={(v) => updateSettings({ sourceLang: v })}
                />
              </div>
              <Select
                label="Theme"
                value={settings.theme}
                options={[
                  { value: 'auto', label: 'System' },
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
                ]}
                onChange={(v) => updateSettings({ theme: v as 'auto' | 'light' | 'dark' })}
              />
            </div>
          )}

          {activeTab === 'engines' && (
            <div className="space-y-8">
              {/* DeepL */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-gray-900">DeepL (via Proxy)</h3>
                  {testStatus.deepl && <StatusBadge status={testStatus.deepl} />}
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase">Proxy URL</label>
                  <input
                    type="url"
                    value={settings.deepl.proxyUrl}
                    onChange={(e) => updateSettings({ deepl: { ...settings.deepl, proxyUrl: e.target.value } })}
                    className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-naranhi-500/40"
                    placeholder="http://localhost:8787"
                  />
                </div>
                <Button variant="secondary" size="sm" onClick={() => testEngine('deepl')}>
                  Test Connection
                </Button>
              </div>

              {/* OpenAI */}
              <div className="space-y-3 pt-6 border-t">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-gray-900">OpenAI / ChatGPT</h3>
                  {testStatus.openai && <StatusBadge status={testStatus.openai} />}
                </div>
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                  API keys are never stored in the extension. Configure provider credentials on your proxy/backend only.
                </p>
                <Select
                  label="Model"
                  value={settings.openai.model}
                  options={[
                    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
                    { value: 'gpt-4o', label: 'GPT-4o' },
                    { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
                  ]}
                  onChange={(v) => updateSettings({ openai: { ...settings.openai, model: v } })}
                />
              </div>

              {/* Google */}
              <div className="space-y-3 pt-6 border-t">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-gray-900">Google Translate</h3>
                  {testStatus.google && <StatusBadge status={testStatus.google} />}
                </div>
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                  Google API keys are also backend-only. Keep secrets on the proxy server, not in client storage.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'display' && (
            <div className="space-y-6">
              <Select
                label="Translation Position"
                value={settings.translationPosition}
                options={[
                  { value: 'below', label: 'Below original text' },
                  { value: 'side', label: 'Side by side' },
                  { value: 'hover', label: 'Show on hover' },
                ]}
                onChange={(v) => updateSettings({ translationPosition: v as 'below' | 'side' | 'hover' })}
              />
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700">Show floating button</span>
                <Toggle
                  checked={settings.floatingButton}
                  onChange={(v) => updateSettings({ floatingButton: v })}
                />
              </div>
            </div>
          )}

          {activeTab === 'performance' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">Visible-only translation</p>
                  <p className="text-xs text-gray-400">Only translate blocks visible in viewport</p>
                </div>
                <Toggle
                  checked={settings.visibleOnly}
                  onChange={(v) => updateSettings({ visibleOnly: v })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">Translation cache</p>
                  <p className="text-xs text-gray-400">Cache translations for faster revisits</p>
                </div>
                <Toggle
                  checked={settings.cacheEnabled}
                  onChange={(v) => updateSettings({ cacheEnabled: v })}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase">Batch flush interval (ms)</label>
                <input
                  type="number"
                  min={20}
                  max={1000}
                  value={settings.batchFlushMs}
                  onChange={(e) => updateSettings({ batchFlushMs: Number(e.target.value) })}
                  className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-naranhi-500/40"
                />
              </div>
              <Button variant="secondary" size="sm" onClick={clearCache}>
                Clear Translation Cache
              </Button>
            </div>
          )}

          {activeTab === 'advanced' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">
                Advanced settings for power users. Per-site rules and keyboard shortcuts will be available in a future update.
              </p>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs font-mono text-gray-400">Version 1.0.0</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
