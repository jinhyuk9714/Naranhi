import { describe, it, expect } from 'vitest';
import {
  buildDeepLBody,
  isJsonContentType,
  mapDeepLError,
  mapErrorToResponse,
  normalizeTranslatePayload,
  proxyError,
  resolveAllowedOrigin,
  shouldRetryDeepLStatus,
  parseRetryAfterMs,
  computeBackoffDelayMs,
} from '../src/translate';

describe('normalizeTranslatePayload', () => {
  it('validates and normalizes request', () => {
    const payload = normalizeTranslatePayload({
      items: [
        { id: 'a', text: '  hello   world ' },
        { id: 'b', text: 'bonjour' },
      ],
      target_lang: 'ko',
      source_lang: 'en',
      options: {
        preserve_formatting: true,
        split_sentences: 0,
        model_type: 'prefer_quality_optimized',
        unknown_option: 'ignored',
      },
    });

    expect(payload.target_lang).toBe('KO');
    expect(payload.source_lang).toBe('EN');
    expect(payload.items[0].text).toBe('hello world');
    expect(payload.options.preserve_formatting).toBe(true);
    expect(payload.options.split_sentences).toBe('0');
    expect(payload.options.model_type).toBe('prefer_quality_optimized');
    expect(Object.hasOwn(payload.options, 'unknown_option')).toBe(false);
  });

  it('clamps context and drops invalid option values', () => {
    const payload = normalizeTranslatePayload({
      items: [{ id: 'a', text: 'hello' }],
      target_lang: 'KO',
      options: {
        split_sentences: 'unsupported',
        model_type: 'unknown-model',
        context: 'a'.repeat(2500),
      },
    });

    expect(payload.options.split_sentences).toBeUndefined();
    expect(payload.options.model_type).toBeUndefined();
    expect((payload.options.context as string).length).toBe(2000);
  });

  it('supports legacy text array input', () => {
    const payload = normalizeTranslatePayload({
      text: ['a', 'b'],
      target_lang: 'EN',
    });

    expect(payload.items.length).toBe(2);
    expect(payload.items[0].id).toBe('0');
    expect(payload.items[1].id).toBe('1');
  });

  it('throws BAD_REQUEST on missing target_lang', () => {
    expect(() =>
      normalizeTranslatePayload({ items: [{ id: 'a', text: 'x' }] }),
    ).toThrow();

    try {
      normalizeTranslatePayload({ items: [{ id: 'a', text: 'x' }] });
    } catch (err: any) {
      expect(err.code).toBe('BAD_REQUEST');
      expect(err.statusCode).toBe(400);
    }
  });
});

describe('buildDeepLBody', () => {
  it('converts normalized payload to DeepL schema', () => {
    const payload = normalizeTranslatePayload({
      items: [{ id: 'a', text: 'hello' }],
      target_lang: 'KO',
      source_lang: 'EN',
      options: { preserve_formatting: true },
    });

    const body = buildDeepLBody(payload);
    expect(body.text).toEqual(['hello']);
    expect(body.target_lang).toBe('KO');
    expect(body.source_lang).toBe('EN');
    expect(body.preserve_formatting).toBe(true);
  });
});

describe('mapDeepLError', () => {
  it('maps status codes to stable error codes', () => {
    expect(mapDeepLError(401)).toEqual({ code: 'DEEPL_AUTH', retryable: false, statusCode: 401 });
    expect(mapDeepLError(429)).toEqual({ code: 'DEEPL_RATE_LIMIT', retryable: true, statusCode: 429 });
    expect(mapDeepLError(456)).toEqual({ code: 'DEEPL_QUOTA', retryable: false, statusCode: 456 });
    expect(mapDeepLError(503)).toEqual({ code: 'UNKNOWN', retryable: true, statusCode: 503 });
  });
});

describe('deepl retry helpers', () => {
  it('marks retryable statuses for rate-limit and server errors', () => {
    expect(shouldRetryDeepLStatus(429)).toBe(true);
    expect(shouldRetryDeepLStatus(503)).toBe(true);
    expect(shouldRetryDeepLStatus(456)).toBe(false);
    expect(shouldRetryDeepLStatus(400)).toBe(false);
  });

  it('parses Retry-After seconds/date and computes bounded backoff', () => {
    expect(parseRetryAfterMs('2')).toBe(2000);
    expect(parseRetryAfterMs('invalid')).toBeNull();

    const delay0 = computeBackoffDelayMs(0);
    const delay1 = computeBackoffDelayMs(1);
    const delay10 = computeBackoffDelayMs(10);

    expect(delay0).toBe(300);
    expect(delay1).toBe(600);
    expect(delay10).toBe(4000);
  });
});

describe('mapErrorToResponse', () => {
  it('serializes proxyError safely', () => {
    const err = proxyError('DEEPL_AUTH', 'Invalid key', 403, false);
    const out = mapErrorToResponse(err);

    expect(out.statusCode).toBe(403);
    expect(out.error.code).toBe('DEEPL_AUTH');
    expect(out.error.message).toBe('Invalid key');
    expect(out.error.retryable).toBe(false);
  });
});

describe('isJsonContentType', () => {
  it('accepts application/json with optional charset', () => {
    expect(isJsonContentType('application/json')).toBe(true);
    expect(isJsonContentType('application/json; charset=utf-8')).toBe(true);
    expect(isJsonContentType('text/plain')).toBe(false);
    expect(isJsonContentType(undefined)).toBe(false);
  });
});

describe('resolveAllowedOrigin', () => {
  it('handles local/default and allowlist patterns', () => {
    expect(resolveAllowedOrigin('chrome-extension://abcd', 'local')).toBe('chrome-extension://abcd');
    expect(resolveAllowedOrigin('http://localhost:3000', 'local')).toBe('http://localhost:3000');
    expect(resolveAllowedOrigin('https://evil.example', 'local')).toBeNull();

    expect(resolveAllowedOrigin('https://app.example', 'https://app.example')).toBe('https://app.example');
    expect(resolveAllowedOrigin('chrome-extension://xyz', 'chrome-extension://*')).toBe('chrome-extension://xyz');
    expect(resolveAllowedOrigin('https://evil.example', 'https://app.example,chrome-extension://*')).toBeNull();

    expect(resolveAllowedOrigin('https://any.example', '*')).toBe('*');
  });
});
