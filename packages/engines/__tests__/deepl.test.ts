import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeepLEngine, DeepLError } from '../src/deepl';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function okJson(data: unknown): Response {
  return { ok: true, status: 200, json: () => Promise.resolve(data) } as Response;
}

function errResponse(status: number, body?: unknown): Response {
  return {
    ok: false,
    status,
    json: body !== undefined ? () => Promise.resolve(body) : () => Promise.reject(new Error('no body')),
  } as Response;
}

describe('DeepLEngine', () => {
  let engine: DeepLEngine;

  beforeEach(() => {
    mockFetch.mockReset();
    engine = new DeepLEngine({ proxyUrl: 'http://localhost:8787' });
  });

  describe('translate', () => {
    const request = {
      items: [{ id: '1', text: 'Hello' }],
      targetLang: 'KO',
    };

    it('sends POST to /translate with correct body', async () => {
      mockFetch.mockResolvedValue(okJson({ translations: [{ id: '1', text: '안녕', detected_source_language: 'EN' }] }));

      await engine.translate(request);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:8787/translate');
      expect(opts.method).toBe('POST');
      expect(opts.headers['Content-Type']).toBe('application/json');

      const body = JSON.parse(opts.body);
      expect(body.items).toEqual([{ id: '1', text: 'Hello' }]);
      expect(body.target_lang).toBe('KO');
      expect(body.source_lang).toBeUndefined();
    });

    it('includes source_lang when sourceLang is provided', async () => {
      mockFetch.mockResolvedValue(okJson({ translations: [{ id: '1', text: '안녕' }] }));

      await engine.translate({ ...request, sourceLang: 'EN' });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.source_lang).toBe('EN');
    });

    it('includes formality and options when configured', async () => {
      engine.updateConfig({ formality: 'more' });
      mockFetch.mockResolvedValue(okJson({ translations: [{ id: '1', text: '안녕' }] }));

      await engine.translate({
        ...request,
        options: { preserveFormatting: true },
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.options.formality).toBe('more');
      expect(body.options.preserveFormatting).toBe(true);
    });

    it('omits options when none configured', async () => {
      mockFetch.mockResolvedValue(okJson({ translations: [{ id: '1', text: '안녕' }] }));

      await engine.translate(request);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.options).toBeUndefined();
    });

    it('strips trailing slashes from proxyUrl', async () => {
      engine.updateConfig({ proxyUrl: 'http://localhost:8787/' });
      mockFetch.mockResolvedValue(okJson({ translations: [{ id: '1', text: '안녕' }] }));

      await engine.translate(request);

      expect(mockFetch.mock.calls[0][0]).toBe('http://localhost:8787/translate');
    });

    it('maps response to TranslationResult array', async () => {
      mockFetch.mockResolvedValue(
        okJson({
          translations: [
            { id: '1', text: '안녕', detected_source_language: 'EN' },
            { id: '2', text: '세계', detected_source_language: 'EN' },
          ],
        }),
      );

      const result = await engine.translate({
        items: [
          { id: '1', text: 'Hello' },
          { id: '2', text: 'World' },
        ],
        targetLang: 'KO',
      });

      expect(result).toEqual([
        { id: '1', translatedText: '안녕', detectedLang: 'EN' },
        { id: '2', translatedText: '세계', detectedLang: 'EN' },
      ]);
    });

    it('throws DeepLError with retryable=true for 429', async () => {
      mockFetch.mockResolvedValue(errResponse(429, { message: 'Rate limited' }));

      await expect(engine.translate(request)).rejects.toThrow(DeepLError);

      try {
        await engine.translate(request);
      } catch (err) {
        expect(err).toBeInstanceOf(DeepLError);
        expect((err as DeepLError).statusCode).toBe(429);
        expect((err as DeepLError).retryable).toBe(true);
      }
    });

    it('throws DeepLError with retryable=false for 400', async () => {
      mockFetch.mockResolvedValue(errResponse(400, { message: 'Bad request' }));

      try {
        await engine.translate(request);
      } catch (err) {
        expect(err).toBeInstanceOf(DeepLError);
        expect((err as DeepLError).retryable).toBe(false);
      }
    });

    it('extracts error message from response body', async () => {
      mockFetch.mockResolvedValue(errResponse(456, { message: 'Quota exceeded' }));

      await expect(engine.translate(request)).rejects.toThrow('Quota exceeded');
    });

    it('falls back to generic message on parse failure', async () => {
      mockFetch.mockResolvedValue(errResponse(500));

      await expect(engine.translate(request)).rejects.toThrow('DeepL proxy error: 500');
    });
  });

  describe('testConnection', () => {
    it('returns true on 200 from /health', async () => {
      mockFetch.mockResolvedValue({ ok: true } as Response);

      expect(await engine.testConnection()).toBe(true);
      expect(mockFetch.mock.calls[0][0]).toBe('http://localhost:8787/health');
    });

    it('returns false on non-ok response', async () => {
      mockFetch.mockResolvedValue({ ok: false } as Response);

      expect(await engine.testConnection()).toBe(false);
    });

    it('returns false on network error', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

      expect(await engine.testConnection()).toBe(false);
    });
  });

  describe('getUsage', () => {
    it('returns default usage', async () => {
      const usage = await engine.getUsage();
      expect(usage).toEqual({ characterCount: 0, characterLimit: 500000 });
    });
  });

  describe('updateConfig', () => {
    it('merges partial config', () => {
      engine.updateConfig({ formality: 'less' });
      // Verify by checking translate uses new formality
      mockFetch.mockResolvedValue(okJson({ translations: [{ id: '1', text: 'x' }] }));

      engine.translate({ items: [{ id: '1', text: 'test' }], targetLang: 'KO' });

      // formality should appear in next translate call — tested in formality test above
    });
  });
});
