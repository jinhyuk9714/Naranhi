/**
 * Proxy translate utilities — payload validation, DeepL body building, CORS, error mapping.
 * Ported from _legacy/proxy/translateUtils.mjs
 */

import crypto from 'crypto';

export const MAX_BODY_BYTES = 65536;
const EXTENSION_ORIGIN_PREFIXES = ['chrome-extension://', 'edge-extension://', 'moz-extension://'];

const ALLOWED_OPTIONS = new Set([
  'formality',
  'split_sentences',
  'tag_handling',
  'tag_handling_version',
  'preserve_formatting',
  'context',
  'model_type',
]);

const ALLOWED_SPLIT_SENTENCES = new Set(['0', '1', 'nonewlines']);
const ALLOWED_TAG_HANDLING = new Set(['html', 'xml']);
const ALLOWED_TAG_HANDLING_VERSION = new Set(['v2']);
const ALLOWED_MODEL_TYPES = new Set([
  'latency_optimized',
  'quality_optimized',
  'prefer_quality_optimized',
]);
const MAX_CONTEXT_CHARS = 2000;

export interface ProxyError extends Error {
  code: string;
  statusCode: number;
  retryable: boolean;
}

export function proxyError(
  code: string,
  message: string,
  statusCode: number,
  retryable = false,
): ProxyError {
  const err = new Error(message) as ProxyError;
  err.code = code;
  err.statusCode = statusCode;
  err.retryable = retryable;
  return err;
}

export function normalizeText(text: unknown): string {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function normalizeOptionValue(key: string, value: unknown): unknown {
  if (value === undefined || value === null) return undefined;

  switch (key) {
    case 'formality': {
      const normalized = String(value).trim().toLowerCase();
      return normalized || undefined;
    }
    case 'split_sentences': {
      const normalized = String(value).trim().toLowerCase();
      return normalized && ALLOWED_SPLIT_SENTENCES.has(normalized) ? normalized : undefined;
    }
    case 'tag_handling': {
      const normalized = String(value).trim().toLowerCase();
      return normalized && ALLOWED_TAG_HANDLING.has(normalized) ? normalized : undefined;
    }
    case 'tag_handling_version': {
      const normalized = String(value).trim().toLowerCase();
      return normalized && ALLOWED_TAG_HANDLING_VERSION.has(normalized) ? normalized : undefined;
    }
    case 'preserve_formatting':
      return Boolean(value);
    case 'context': {
      const normalized = normalizeText(value);
      return normalized ? normalized.slice(0, MAX_CONTEXT_CHARS) : undefined;
    }
    case 'model_type': {
      const normalized = String(value).trim().toLowerCase();
      return normalized && ALLOWED_MODEL_TYPES.has(normalized) ? normalized : undefined;
    }
    default:
      return undefined;
  }
}

function normalizeOptions(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(input as Record<string, unknown>).sort()) {
    if (!ALLOWED_OPTIONS.has(key)) continue;
    const normalized = normalizeOptionValue(key, (input as Record<string, unknown>)[key]);
    if (normalized === undefined) continue;
    out[key] = normalized;
  }
  return out;
}

export interface NormalizedPayload {
  items: Array<{ id: string; text: string }>;
  target_lang: string;
  source_lang: string;
  options: Record<string, unknown>;
}

export function normalizeTranslatePayload(payload: unknown): NormalizedPayload {
  if (!payload || typeof payload !== 'object') {
    throw proxyError('BAD_REQUEST', 'Missing or invalid JSON body', 400, false);
  }

  const p = payload as Record<string, unknown>;
  const targetLang = String(p.target_lang || '').trim().toUpperCase();
  if (!targetLang) {
    throw proxyError('BAD_REQUEST', 'Missing target_lang', 400, false);
  }

  let items: Array<{ id?: unknown; text?: unknown }> = [];
  if (Array.isArray(p.items)) {
    items = p.items;
  } else if (Array.isArray(p.text)) {
    items = (p.text as string[]).map((text, idx) => ({ id: String(idx), text }));
  } else if (typeof p.text === 'string') {
    items = [{ id: '0', text: p.text }];
  }

  const normalizedItems = items
    .map((item, idx) => ({
      id: String(item?.id ?? idx),
      text: normalizeText(item?.text || ''),
    }))
    .filter((item) => item.id && item.text);

  if (!normalizedItems.length) {
    throw proxyError('BAD_REQUEST', 'Missing translate items', 400, false);
  }

  return {
    items: normalizedItems,
    target_lang: targetLang,
    source_lang: String(p.source_lang || '').trim().toUpperCase(),
    options: normalizeOptions(p.options),
  };
}

export function buildDeepLBody(normalizedPayload: NormalizedPayload): Record<string, unknown> {
  const body: Record<string, unknown> = {
    text: normalizedPayload.items.map((item) => item.text),
    target_lang: normalizedPayload.target_lang,
  };

  if (normalizedPayload.source_lang) body.source_lang = normalizedPayload.source_lang;
  if (Object.keys(normalizedPayload.options).length) Object.assign(body, normalizedPayload.options);
  return body;
}

export function buildRequestCacheKey(normalizedPayload: NormalizedPayload, apiBase: string): string {
  return hashKey({
    apiBase,
    text: normalizedPayload.items.map((item) => item.text),
    target_lang: normalizedPayload.target_lang,
    source_lang: normalizedPayload.source_lang,
    options: normalizedPayload.options,
  });
}

export function hashKey(value: unknown): string {
  const h = crypto.createHash('sha256');
  h.update(JSON.stringify(value));
  return h.digest('hex');
}

export function mapDeepLError(
  statusCode: number,
  _fallbackMessage?: string,
): { code: string; retryable: boolean; statusCode: number } {
  if (statusCode === 400) return { code: 'BAD_REQUEST', retryable: false, statusCode };
  if (statusCode === 401 || statusCode === 403) return { code: 'DEEPL_AUTH', retryable: false, statusCode };
  if (statusCode === 429) return { code: 'DEEPL_RATE_LIMIT', retryable: true, statusCode };
  if (statusCode === 456) return { code: 'DEEPL_QUOTA', retryable: false, statusCode };
  if (statusCode >= 500) return { code: 'UNKNOWN', retryable: true, statusCode };
  return { code: 'UNKNOWN', retryable: false, statusCode };
}

export function mapErrorToResponse(err: unknown): {
  statusCode: number;
  error: { code: string; message: string; retryable: boolean };
} {
  const e = err as ProxyError;
  if (e?.code && e?.statusCode) {
    return {
      statusCode: e.statusCode,
      error: { code: e.code, message: e.message, retryable: Boolean(e.retryable) },
    };
  }
  return {
    statusCode: 500,
    error: { code: 'UNKNOWN', message: (err as Error)?.message || 'Unknown error', retryable: false },
  };
}

export function isJsonContentType(value: unknown): boolean {
  const text = String(value || '').trim().toLowerCase();
  return text === 'application/json' || text.startsWith('application/json;');
}

function isTrustedLocalOrigin(origin: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }

  if (EXTENSION_ORIGIN_PREFIXES.some((prefix) => parsed.href.startsWith(prefix))) return true;

  const host = parsed.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
  return isLocal && (parsed.protocol === 'http:' || parsed.protocol === 'https:');
}

function matchOriginPattern(origin: string, pattern: string): boolean {
  const token = String(pattern).trim();
  if (!token) return false;
  if (token === 'local') return isTrustedLocalOrigin(origin);
  if (token.endsWith('*')) return origin.startsWith(token.slice(0, -1));
  return origin === token;
}

export function resolveAllowedOrigin(origin: string | undefined, allowedOriginsRaw: string): string | null {
  if (!origin) return null;

  const raw = String(allowedOriginsRaw || 'local').trim();
  if (!raw || raw === 'local') return isTrustedLocalOrigin(origin) ? origin : null;
  if (raw === '*') return '*';

  const patterns = raw.split(',').map((part) => part.trim()).filter(Boolean);
  if (!patterns.length) return isTrustedLocalOrigin(origin) ? origin : null;
  return patterns.some((p) => matchOriginPattern(origin, p)) ? origin : null;
}
