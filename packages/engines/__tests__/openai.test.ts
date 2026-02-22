import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAIEngine } from '../src/openai';

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

function chatResponse(content: string): unknown {
  return { choices: [{ message: { content } }] };
}

describe('OpenAIEngine', () => {
  let engine: OpenAIEngine;

  beforeEach(() => {
    mockFetch.mockReset();
    engine = new OpenAIEngine({ apiKey: 'sk-test', model: 'gpt-4o-mini' });
  });

  describe('translate', () => {
    const request = {
      items: [{ id: '1', text: 'Hello' }],
      targetLang: 'KO',
    };

    it('sends POST to /chat/completions with auth header', async () => {
      mockFetch.mockResolvedValue(okJson(chatResponse('안녕하세요')));

      await engine.translate(request);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.openai.com/v1/chat/completions');
      expect(opts.method).toBe('POST');
      expect(opts.headers['Authorization']).toBe('Bearer sk-test');
      expect(opts.headers['Content-Type']).toBe('application/json');
    });

    it('uses default baseUrl when not provided', async () => {
      mockFetch.mockResolvedValue(okJson(chatResponse('안녕')));

      await engine.translate(request);

      expect(mockFetch.mock.calls[0][0]).toBe('https://api.openai.com/v1/chat/completions');
    });

    it('uses custom baseUrl when provided', async () => {
      engine.updateConfig({ baseUrl: 'https://custom.api.com/v1' });
      mockFetch.mockResolvedValue(okJson(chatResponse('안녕')));

      await engine.translate(request);

      expect(mockFetch.mock.calls[0][0]).toBe('https://custom.api.com/v1/chat/completions');
    });

    it('strips trailing slashes from baseUrl', async () => {
      engine.updateConfig({ baseUrl: 'https://custom.api.com/v1/' });
      mockFetch.mockResolvedValue(okJson(chatResponse('안녕')));

      await engine.translate(request);

      expect(mockFetch.mock.calls[0][0]).toBe('https://custom.api.com/v1/chat/completions');
    });

    it('includes target language name in system prompt', async () => {
      mockFetch.mockResolvedValue(okJson(chatResponse('안녕')));

      await engine.translate(request);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const systemMsg = body.messages[0].content;
      expect(systemMsg).toContain('한국어');
    });

    it('includes source language in system prompt when provided', async () => {
      mockFetch.mockResolvedValue(okJson(chatResponse('안녕')));

      await engine.translate({ ...request, sourceLang: 'EN' });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const systemMsg = body.messages[0].content;
      expect(systemMsg).toContain('from English');
    });

    it('joins multiple items with ||| separator', async () => {
      mockFetch.mockResolvedValue(okJson(chatResponse('안녕\n|||\n세계')));

      await engine.translate({
        items: [
          { id: '1', text: 'Hello' },
          { id: '2', text: 'World' },
        ],
        targetLang: 'KO',
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const userMsg = body.messages[1].content;
      expect(userMsg).toBe('Hello\n|||\nWorld');
    });

    it('sets temperature to 0.1', async () => {
      mockFetch.mockResolvedValue(okJson(chatResponse('안녕')));

      await engine.translate(request);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.temperature).toBe(0.1);
    });

    it('parses single translation', async () => {
      mockFetch.mockResolvedValue(okJson(chatResponse('안녕하세요')));

      const result = await engine.translate(request);

      expect(result).toEqual([{ id: '1', translatedText: '안녕하세요' }]);
    });

    it('parses multiple translations separated by |||', async () => {
      mockFetch.mockResolvedValue(okJson(chatResponse('안녕\n|||\n세계')));

      const result = await engine.translate({
        items: [
          { id: '1', text: 'Hello' },
          { id: '2', text: 'World' },
        ],
        targetLang: 'KO',
      });

      expect(result).toEqual([
        { id: '1', translatedText: '안녕' },
        { id: '2', translatedText: '세계' },
      ]);
    });

    it('returns empty string for missing translations', async () => {
      mockFetch.mockResolvedValue(okJson(chatResponse('안녕')));

      const result = await engine.translate({
        items: [
          { id: '1', text: 'Hello' },
          { id: '2', text: 'World' },
          { id: '3', text: 'Foo' },
        ],
        targetLang: 'KO',
      });

      expect(result[0].translatedText).toBe('안녕');
      expect(result[1].translatedText).toBe('');
      expect(result[2].translatedText).toBe('');
    });

    it('throws error with OpenAI error message', async () => {
      mockFetch.mockResolvedValue(errResponse(401, { error: { message: 'Invalid API key' } }));

      await expect(engine.translate(request)).rejects.toThrow('Invalid API key');
    });

    it('falls back to generic error on parse failure', async () => {
      mockFetch.mockResolvedValue(errResponse(500));

      await expect(engine.translate(request)).rejects.toThrow('OpenAI error: 500');
    });

    it('falls back to code for unknown language', async () => {
      mockFetch.mockResolvedValue(okJson(chatResponse('xxx')));

      await engine.translate({ items: [{ id: '1', text: 'test' }], targetLang: 'XX' });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const systemMsg = body.messages[0].content;
      expect(systemMsg).toContain('XX');
    });
  });

  describe('testConnection', () => {
    it('sends GET to /models with auth and returns true on 200', async () => {
      mockFetch.mockResolvedValue({ ok: true } as Response);

      expect(await engine.testConnection()).toBe(true);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.openai.com/v1/models');
      expect(opts.headers['Authorization']).toBe('Bearer sk-test');
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

  describe('updateConfig', () => {
    it('merges partial config', async () => {
      engine.updateConfig({ model: 'gpt-4' });
      mockFetch.mockResolvedValue(okJson(chatResponse('test')));

      await engine.translate({ items: [{ id: '1', text: 'hi' }], targetLang: 'KO' });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.model).toBe('gpt-4');
    });
  });
});
