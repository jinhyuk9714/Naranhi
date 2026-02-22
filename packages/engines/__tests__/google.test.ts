import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoogleEngine } from '../src/google';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function okJson(data: unknown): Response {
  return { ok: true, status: 200, json: () => Promise.resolve(data) } as Response;
}

function errResponse(status: number): Response {
  return { ok: false, status, json: () => Promise.reject(new Error('error')) } as Response;
}

describe('GoogleEngine', () => {
  describe('API mode (apiKey provided)', () => {
    let engine: GoogleEngine;

    beforeEach(() => {
      mockFetch.mockReset();
      engine = new GoogleEngine({ apiKey: 'test-key' });
    });

    it('sends POST to v2 API with key in query param', async () => {
      mockFetch.mockResolvedValue(
        okJson({ data: { translations: [{ translatedText: '안녕' }] } }),
      );

      await engine.translate({
        items: [{ id: '1', text: 'Hello' }],
        targetLang: 'KO',
      });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('translation.googleapis.com/language/translate/v2');
      expect(url).toContain('key=test-key');
    });

    it('maps language codes via LANG_MAP', async () => {
      mockFetch.mockResolvedValue(
        okJson({ data: { translations: [{ translatedText: '你好' }] } }),
      );

      await engine.translate({
        items: [{ id: '1', text: 'Hello' }],
        targetLang: 'ZH',
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.target).toBe('zh-CN');
    });

    it('sends all items as q array', async () => {
      mockFetch.mockResolvedValue(
        okJson({
          data: {
            translations: [
              { translatedText: '안녕' },
              { translatedText: '세계' },
            ],
          },
        }),
      );

      await engine.translate({
        items: [
          { id: '1', text: 'Hello' },
          { id: '2', text: 'World' },
        ],
        targetLang: 'KO',
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.q).toEqual(['Hello', 'World']);
    });

    it('includes source lang when provided', async () => {
      mockFetch.mockResolvedValue(
        okJson({ data: { translations: [{ translatedText: '안녕' }] } }),
      );

      await engine.translate({
        items: [{ id: '1', text: 'Hello' }],
        targetLang: 'KO',
        sourceLang: 'EN',
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.source).toBe('en');
    });

    it('omits source when sourceLang not provided', async () => {
      mockFetch.mockResolvedValue(
        okJson({ data: { translations: [{ translatedText: '안녕' }] } }),
      );

      await engine.translate({
        items: [{ id: '1', text: 'Hello' }],
        targetLang: 'KO',
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.source).toBeUndefined();
    });

    it('maps response to TranslationResult array', async () => {
      mockFetch.mockResolvedValue(
        okJson({
          data: {
            translations: [
              { translatedText: '안녕', detectedSourceLanguage: 'en' },
              { translatedText: '세계', detectedSourceLanguage: 'en' },
            ],
          },
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
        { id: '1', translatedText: '안녕', detectedLang: 'en' },
        { id: '2', translatedText: '세계', detectedLang: 'en' },
      ]);
    });

    it('throws on non-ok response', async () => {
      mockFetch.mockResolvedValue(errResponse(403));

      await expect(
        engine.translate({ items: [{ id: '1', text: 'Hi' }], targetLang: 'KO' }),
      ).rejects.toThrow('Google Translate API error: 403');
    });

    it('falls back to lowercase for unknown language code', async () => {
      mockFetch.mockResolvedValue(
        okJson({ data: { translations: [{ translatedText: 'test' }] } }),
      );

      await engine.translate({
        items: [{ id: '1', text: 'Hello' }],
        targetLang: 'XX',
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.target).toBe('xx');
    });
  });

  describe('Free mode (no apiKey)', () => {
    let engine: GoogleEngine;

    beforeEach(() => {
      mockFetch.mockReset();
      engine = new GoogleEngine({});
    });

    it('uses free endpoint when apiKey is empty', async () => {
      mockFetch.mockResolvedValue(okJson([[['안녕', 'Hello']]]));

      await engine.translate({
        items: [{ id: '1', text: 'Hello' }],
        targetLang: 'KO',
      });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('translate.googleapis.com/translate_a/single');
    });

    it('sends correct query params', async () => {
      mockFetch.mockResolvedValue(okJson([[['안녕', 'Hello']]]));

      await engine.translate({
        items: [{ id: '1', text: 'Hello' }],
        targetLang: 'KO',
        sourceLang: 'EN',
      });

      const url = new URL(mockFetch.mock.calls[0][0] as string);
      expect(url.searchParams.get('client')).toBe('gtx');
      expect(url.searchParams.get('sl')).toBe('en');
      expect(url.searchParams.get('tl')).toBe('ko');
      expect(url.searchParams.get('dt')).toBe('t');
      expect(url.searchParams.get('q')).toBe('Hello');
    });

    it('makes one fetch per item (sequential)', async () => {
      mockFetch
        .mockResolvedValueOnce(okJson([[['안녕', 'Hello']]]))
        .mockResolvedValueOnce(okJson([[['세계', 'World']]]));

      await engine.translate({
        items: [
          { id: '1', text: 'Hello' },
          { id: '2', text: 'World' },
        ],
        targetLang: 'KO',
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('uses "auto" when sourceLang not provided', async () => {
      mockFetch.mockResolvedValue(okJson([[['안녕', 'Hello']]]));

      await engine.translate({
        items: [{ id: '1', text: 'Hello' }],
        targetLang: 'KO',
      });

      const url = new URL(mockFetch.mock.calls[0][0] as string);
      expect(url.searchParams.get('sl')).toBe('auto');
    });

    it('parses nested array response', async () => {
      mockFetch.mockResolvedValue(okJson([[['안녕하세요', 'Hello']]]));

      const result = await engine.translate({
        items: [{ id: '1', text: 'Hello' }],
        targetLang: 'KO',
      });

      expect(result[0].translatedText).toBe('안녕하세요');
    });

    it('concatenates multiple segments', async () => {
      mockFetch.mockResolvedValue(
        okJson([
          [
            ['안녕 ', 'Hello '],
            ['세계', 'World'],
          ],
        ]),
      );

      const result = await engine.translate({
        items: [{ id: '1', text: 'Hello World' }],
        targetLang: 'KO',
      });

      expect(result[0].translatedText).toBe('안녕 세계');
    });

    it('throws on non-ok response', async () => {
      mockFetch.mockResolvedValue(errResponse(429));

      await expect(
        engine.translate({ items: [{ id: '1', text: 'Hi' }], targetLang: 'KO' }),
      ).rejects.toThrow('Google Translate error: 429');
    });
  });

  describe('testConnection', () => {
    let engine: GoogleEngine;

    beforeEach(() => {
      mockFetch.mockReset();
      engine = new GoogleEngine({});
    });

    it('returns true when test translation succeeds', async () => {
      mockFetch.mockResolvedValue(okJson([[['안녕하세요', 'Hello']]]));

      expect(await engine.testConnection()).toBe(true);
    });

    it('returns false when translation throws', async () => {
      mockFetch.mockRejectedValue(new Error('network error'));

      expect(await engine.testConnection()).toBe(false);
    });
  });

  describe('updateConfig', () => {
    it('switches to API mode after adding apiKey', async () => {
      mockFetch.mockReset();
      const engine = new GoogleEngine({});
      engine.updateConfig({ apiKey: 'new-key' });

      mockFetch.mockResolvedValue(
        okJson({ data: { translations: [{ translatedText: '안녕' }] } }),
      );

      await engine.translate({
        items: [{ id: '1', text: 'Hello' }],
        targetLang: 'KO',
      });

      // Should use API mode now (apiKey present)
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('translation.googleapis.com/language/translate/v2');
      expect(url).toContain('key=new-key');
    });
  });
});
