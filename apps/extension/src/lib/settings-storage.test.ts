import { describe, expect, it } from 'vitest';
import {
  extractSyncStorageChanges,
  flattenSettingsPatch,
  inflateSettings,
  sanitizeProxyUrl,
  sanitizeVisibleRootMargin,
} from './settings-storage';

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
    expect(settings.openai.apiKey).toBe('');
    expect(settings.visibleOnly).toBe(false);
    expect(settings.batchFlushMs).toBe(240);
  });

  it('flattens nested patches with stable storage keys', () => {
    const flat = flattenSettingsPatch({
      deepl: { proxyUrl: 'https://proxy.example.com/', formality: 'default' },
      openai: { apiKey: 'sk-new', model: 'gpt-4o' },
      google: { apiKey: 'g-secret' },
      visibleRootMargin: '0px 0px 300px 0px',
      shortcuts: { toggle: 'Alt+T' },
    });

    expect(flat.deeplProxyUrl).toBe('https://proxy.example.com');
    expect(flat.deeplFormality).toBe('default');
    expect(flat.openaiApiKey).toBeUndefined();
    expect(flat.googleApiKey).toBeUndefined();
    expect(flat.openaiModel).toBe('gpt-4o');
    expect(flat.visibleRootMargin).toBe('0px 0px 300px 0px');
    expect(flat.shortcuts).toEqual({ toggle: 'Alt+T' });
  });

  it('extracts sync storage new values into flat patch', () => {
    const patch = extractSyncStorageChanges({
      targetLang: { oldValue: 'EN', newValue: 'JA' },
      deeplProxyUrl: { newValue: 'https://proxy.example.com' },
      openaiApiKey: { newValue: 'sk-should-not-pass' },
      ignored: {},
    });

    expect(patch).toEqual({
      targetLang: 'JA',
      deeplProxyUrl: 'https://proxy.example.com',
    });
  });

  it('sanitizes invalid proxy url to localhost default', () => {
    expect(sanitizeProxyUrl('')).toBe('http://localhost:8787');
    expect(sanitizeProxyUrl('ws://bad')).toBe('http://localhost:8787');
    expect(sanitizeProxyUrl('https://proxy.example.com/')).toBe('https://proxy.example.com');
  });

  it('rejects invalid option values and clamps numeric options safely', () => {
    const inflated = inflateSettings({
      engine: 'bad-engine',
      displayMode: 'invalid-mode',
      translationPosition: 'floating-anywhere',
      theme: 'neon',
      deeplFormality: 'ultra-formal',
      openaiBaseUrl: 'not-a-url',
      batchFlushMs: -500,
      visibleRootMargin: 'calc(100vh)',
    });

    expect(inflated.engine).toBe('deepl');
    expect(inflated.displayMode).toBe('bilingual');
    expect(inflated.translationPosition).toBe('below');
    expect(inflated.theme).toBe('auto');
    expect(inflated.deepl.formality).toBe('');
    expect(inflated.openai.baseUrl).toBe('https://api.openai.com/v1');
    expect(inflated.batchFlushMs).toBe(20);
    expect(inflated.visibleRootMargin).toBe('350px 0px 600px 0px');

    const flat = flattenSettingsPatch({
      batchFlushMs: 5000,
      visibleRootMargin: '10px BAD 30px',
      deepl: { formality: 'invalid' },
      openai: { baseUrl: 'file:///tmp/nope' },
    });

    expect(flat.batchFlushMs).toBe(1000);
    expect(flat.visibleRootMargin).toBe('350px 0px 600px 0px');
    expect(flat.deeplFormality).toBe('');
    expect(flat.openaiBaseUrl).toBe('https://api.openai.com/v1');
  });

  it('allows safe root margin token formats only', () => {
    expect(sanitizeVisibleRootMargin('0px 0px 300px 0px')).toBe('0px 0px 300px 0px');
    expect(sanitizeVisibleRootMargin('10%')).toBe('10%');
    expect(sanitizeVisibleRootMargin('1em 2em')).toBe('350px 0px 600px 0px');
  });
});
