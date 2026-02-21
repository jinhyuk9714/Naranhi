import { describe, expect, it } from 'vitest';
import { flattenSettingsPatch, inflateSettings, sanitizeProxyUrl } from './settings-storage';

describe('settings-storage', () => {
  it('inflates legacy/flat keys into normalized settings', () => {
    const settings = inflateSettings({
      engine: 'deepl',
      targetLang: 'ko',
      sourceLang: 'en',
      proxyUrl: 'localhost:8787',
      deeplFormality: 'less',
      openaiApiKey: 'sk-test',
      visibleOnly: false,
      batchFlushMs: '240',
    });

    expect(settings.targetLang).toBe('KO');
    expect(settings.sourceLang).toBe('EN');
    expect(settings.deepl.proxyUrl).toBe('http://localhost:8787');
    expect(settings.deepl.formality).toBe('less');
    expect(settings.openai.apiKey).toBe('sk-test');
    expect(settings.visibleOnly).toBe(false);
    expect(settings.batchFlushMs).toBe(240);
  });

  it('flattens nested patches with stable storage keys', () => {
    const flat = flattenSettingsPatch({
      deepl: { proxyUrl: 'https://proxy.example.com/', formality: 'default' },
      openai: { apiKey: 'sk-new', model: 'gpt-4o' },
      visibleRootMargin: '0px 0px 300px 0px',
      shortcuts: { toggle: 'Alt+T' },
    });

    expect(flat.deeplProxyUrl).toBe('https://proxy.example.com');
    expect(flat.deeplFormality).toBe('default');
    expect(flat.openaiApiKey).toBe('sk-new');
    expect(flat.openaiModel).toBe('gpt-4o');
    expect(flat.visibleRootMargin).toBe('0px 0px 300px 0px');
    expect(flat.shortcuts).toEqual({ toggle: 'Alt+T' });
  });

  it('sanitizes invalid proxy url to localhost default', () => {
    expect(sanitizeProxyUrl('')).toBe('http://localhost:8787');
    expect(sanitizeProxyUrl('ws://bad')).toBe('http://localhost:8787');
    expect(sanitizeProxyUrl('https://proxy.example.com/')).toBe('https://proxy.example.com');
  });
});
