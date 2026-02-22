import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EngineType, TranslationRequest } from '@naranhi/core';
import type { TranslationEngine } from '../src/types';
import { EngineManager } from '../src/manager';

function createMockEngine(id: EngineType, overrides: Partial<TranslationEngine> = {}): TranslationEngine {
  return {
    id,
    name: `Mock ${id}`,
    translate: vi.fn().mockResolvedValue([{ id: '1', translatedText: `${id}-result` }]),
    testConnection: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

const baseRequest: TranslationRequest = {
  items: [{ id: '1', text: 'Hello' }],
  targetLang: 'KO',
};

describe('EngineManager', () => {
  describe('constructor', () => {
    it('registers engines from config', () => {
      const manager = new EngineManager({
        deepl: { proxyUrl: 'http://localhost:8787' },
        openai: { apiKey: 'sk-test', model: 'gpt-4o-mini' },
      });

      expect(manager.listEngines()).toContain('deepl');
      expect(manager.listEngines()).toContain('openai');
      expect(manager.listEngines()).not.toContain('google');
    });

    it('defaults activeEngineId to deepl', () => {
      const manager = new EngineManager({
        deepl: { proxyUrl: 'http://localhost:8787' },
      });

      expect(manager.getActiveEngineId()).toBe('deepl');
    });

    it('handles empty config', () => {
      const manager = new EngineManager();

      expect(manager.listEngines()).toEqual([]);
    });
  });

  describe('getActiveEngine', () => {
    it('returns the engine matching activeEngineId', () => {
      const manager = new EngineManager({
        deepl: { proxyUrl: 'http://localhost:8787' },
      });

      const engine = manager.getActiveEngine();
      expect(engine).toBeDefined();
      expect(engine!.id).toBe('deepl');
    });

    it('returns undefined when no engine matches', () => {
      const manager = new EngineManager();

      expect(manager.getActiveEngine()).toBeUndefined();
    });
  });

  describe('getEngine', () => {
    it('returns engine by id', () => {
      const manager = new EngineManager({
        openai: { apiKey: 'sk-test', model: 'gpt-4o-mini' },
      });

      expect(manager.getEngine('openai')).toBeDefined();
    });

    it('returns undefined for unregistered id', () => {
      const manager = new EngineManager();

      expect(manager.getEngine('google')).toBeUndefined();
    });
  });

  describe('setActiveEngine', () => {
    it('changes activeEngineId', () => {
      const manager = new EngineManager({
        deepl: { proxyUrl: 'http://localhost:8787' },
        openai: { apiKey: 'sk-test', model: 'gpt-4o-mini' },
      });

      manager.setActiveEngine('openai');
      expect(manager.getActiveEngineId()).toBe('openai');
    });

    it('throws for unregistered engine id', () => {
      const manager = new EngineManager();

      expect(() => manager.setActiveEngine('google')).toThrow('Engine "google" is not registered');
    });
  });

  describe('registerEngine', () => {
    it('adds new engine', () => {
      const manager = new EngineManager();
      const mock = createMockEngine('google');

      manager.registerEngine(mock);

      expect(manager.listEngines()).toContain('google');
      expect(manager.getEngine('google')).toBe(mock);
    });

    it('replaces existing engine with same id', () => {
      const manager = new EngineManager();
      const first = createMockEngine('deepl');
      const second = createMockEngine('deepl');

      manager.registerEngine(first);
      manager.registerEngine(second);

      expect(manager.getEngine('deepl')).toBe(second);
    });
  });

  describe('listEngines', () => {
    it('returns all registered engine ids', () => {
      const manager = new EngineManager({
        deepl: { proxyUrl: 'http://localhost:8787' },
        openai: { apiKey: 'sk-test', model: 'gpt-4o-mini' },
        google: { apiKey: 'google-key' },
      });

      const ids = manager.listEngines();
      expect(ids).toHaveLength(3);
      expect(ids).toContain('deepl');
      expect(ids).toContain('openai');
      expect(ids).toContain('google');
    });
  });

  describe('translate', () => {
    it('delegates to active engine', async () => {
      const manager = new EngineManager();
      const mock = createMockEngine('deepl');
      manager.registerEngine(mock);
      manager.setActiveEngine('deepl');

      await manager.translate(baseRequest);

      expect(mock.translate).toHaveBeenCalledWith(baseRequest);
    });

    it('throws when no active engine configured', async () => {
      const manager = new EngineManager();

      await expect(manager.translate(baseRequest)).rejects.toThrow(
        'No active engine configured (active: deepl)',
      );
    });
  });

  describe('translateWithFallback', () => {
    let manager: EngineManager;
    let deepl: TranslationEngine;
    let openai: TranslationEngine;
    let google: TranslationEngine;

    beforeEach(() => {
      manager = new EngineManager();
      deepl = createMockEngine('deepl');
      openai = createMockEngine('openai');
      google = createMockEngine('google');

      manager.registerEngine(deepl);
      manager.registerEngine(openai);
      manager.registerEngine(google);
      manager.setActiveEngine('deepl');
    });

    it('returns result from active engine when it succeeds', async () => {
      const result = await manager.translateWithFallback(baseRequest);

      expect(result).toEqual([{ id: '1', translatedText: 'deepl-result' }]);
      expect(openai.translate).not.toHaveBeenCalled();
      expect(google.translate).not.toHaveBeenCalled();
    });

    it('falls back to next engine when active fails', async () => {
      (deepl.translate as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DeepL down'));

      const result = await manager.translateWithFallback(baseRequest);

      expect(result).toEqual([{ id: '1', translatedText: 'openai-result' }]);
    });

    it('skips active engine id in fallback list', async () => {
      (deepl.translate as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('fail'));

      await manager.translateWithFallback(baseRequest);

      // deepl.translate called once (as active), not again in fallback loop
      expect(deepl.translate).toHaveBeenCalledTimes(1);
    });

    it('uses custom fallbackOrder', async () => {
      (deepl.translate as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('fail'));

      await manager.translateWithFallback(baseRequest, ['google', 'openai']);

      expect(google.translate).toHaveBeenCalled();
      // google succeeded, so openai should not be called
      expect(openai.translate).not.toHaveBeenCalled();
    });

    it('throws aggregated error when all engines fail', async () => {
      (deepl.translate as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('deepl-err'));
      (openai.translate as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('openai-err'));
      (google.translate as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('google-err'));

      await expect(manager.translateWithFallback(baseRequest)).rejects.toThrow(
        'All engines failed: deepl-err; openai-err; google-err',
      );
    });

    it('handles no active engine gracefully', async () => {
      const emptyManager = new EngineManager();
      const mock = createMockEngine('openai');
      emptyManager.registerEngine(mock);

      const result = await emptyManager.translateWithFallback(baseRequest);

      expect(result).toEqual([{ id: '1', translatedText: 'openai-result' }]);
    });
  });

  describe('testConnection', () => {
    it('delegates to specific engine', async () => {
      const manager = new EngineManager();
      const mock = createMockEngine('deepl');
      manager.registerEngine(mock);

      expect(await manager.testConnection('deepl')).toBe(true);
      expect(mock.testConnection).toHaveBeenCalled();
    });

    it('returns false for unregistered engine', async () => {
      const manager = new EngineManager();

      expect(await manager.testConnection('google')).toBe(false);
    });
  });

  describe('testAllConnections', () => {
    it('tests all registered engines', async () => {
      const manager = new EngineManager();
      manager.registerEngine(createMockEngine('deepl'));
      manager.registerEngine(
        createMockEngine('openai', { testConnection: vi.fn().mockResolvedValue(false) }),
      );

      const results = await manager.testAllConnections();

      expect(results.deepl).toBe(true);
      expect(results.openai).toBe(false);
    });

    it('returns false for engines that throw', async () => {
      const manager = new EngineManager();
      manager.registerEngine(
        createMockEngine('deepl', {
          testConnection: vi.fn().mockRejectedValue(new Error('network error')),
        }),
      );

      const results = await manager.testAllConnections();

      expect(results.deepl).toBe(false);
    });
  });
});
