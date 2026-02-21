/**
 * Naranhi DeepL Proxy Server — TypeScript version.
 * Ported from _legacy/proxy/server.mjs
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  MAX_BODY_BYTES,
  normalizeTranslatePayload,
  buildDeepLBody,
  buildRequestCacheKey,
  isJsonContentType,
  mapDeepLError,
  mapErrorToResponse,
  proxyError,
  resolveAllowedOrigin,
  shouldRetryDeepLStatus,
  parseRetryAfterMs,
  computeBackoffDelayMs,
} from './translate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- .env loader ---
function loadDotEnv(): void {
  const candidates = [path.resolve(process.cwd(), '.env'), path.resolve(__dirname, '..', '.env')];
  const envPath = candidates.find((c) => fs.existsSync(c));
  if (!envPath) return;

  const raw = fs.readFileSync(envPath, 'utf-8');
  for (const lineRaw of raw.split(/\r?\n/)) {
    const line = lineRaw.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = line.slice(0, eqIdx).trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = line.slice(eqIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadDotEnv();

function getEnv(name: string, fallback?: string): string | undefined {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

const AUTH_KEY = getEnv('DEEPL_AUTH_KEY');
const API_BASE = getEnv('DEEPL_API_BASE', 'https://api-free.deepl.com')!;
const PORT = parseInt(getEnv('PORT', '8787')!, 10);
const ALLOWED_ORIGINS = getEnv('ALLOWED_ORIGINS', 'local')!;
const CACHE_TTL_MS = parseInt(getEnv('CACHE_TTL_MS', '86400000')!, 10);
const DEEPL_RETRY_ATTEMPTS = parseInt(getEnv('DEEPL_RETRY_ATTEMPTS', '2')!, 10);

if (!AUTH_KEY) {
  console.error('Missing DEEPL_AUTH_KEY. Set env var or create .env file.');
  process.exit(1);
}

// --- Cache ---
const cache = new Map<string, { ts: number; value: unknown }>();

// --- Helpers ---
function json(
  res: http.ServerResponse,
  statusCode: number,
  obj: unknown,
  headers: Record<string, string> = {},
): void {
  const body = JSON.stringify(obj);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(Buffer.byteLength(body)),
    ...headers,
  });
  res.end(body);
}

function text(
  res: http.ServerResponse,
  statusCode: number,
  body: string,
  headers: Record<string, string> = {},
): void {
  res.writeHead(statusCode, {
    'content-type': 'text/plain; charset=utf-8',
    'content-length': String(Buffer.byteLength(body)),
    ...headers,
  });
  res.end(body);
}

function ensureJsonRequest(req: http.IncomingMessage): void {
  if (!isJsonContentType(req.headers['content-type'])) {
    throw proxyError('BAD_REQUEST', 'Content-Type must be application/json', 415, false);
  }
}

async function readJson(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += (chunk as Buffer).length;
    if (bytes > MAX_BODY_BYTES) {
      throw proxyError('BAD_REQUEST', 'Request body too large', 413, false);
    }
    chunks.push(chunk as Buffer);
  }

  const raw = Buffer.concat(chunks).toString('utf-8');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    throw proxyError('BAD_REQUEST', 'Invalid JSON body', 400, false);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function deeplTranslate(normalizedPayload: ReturnType<typeof normalizeTranslatePayload>): Promise<unknown> {
  const body = buildDeepLBody(normalizedPayload);

  for (let attempt = 0; attempt <= DEEPL_RETRY_ATTEMPTS; attempt += 1) {
    const resp = await fetch(`${API_BASE}/v2/translate`, {
      method: 'POST',
      headers: {
        authorization: `DeepL-Auth-Key ${AUTH_KEY}`,
        'content-type': 'application/json',
        'user-agent': 'NaranhiProxy/1.0',
      },
      body: JSON.stringify(body),
    });

    const data = (await resp.json().catch(() => null)) as Record<string, unknown> | null;
    if (resp.ok) return data;

    const mapped = mapDeepLError(resp.status);
    const canRetry = shouldRetryDeepLStatus(resp.status) && attempt < DEEPL_RETRY_ATTEMPTS;
    if (!canRetry) {
      throw proxyError(
        mapped.code,
        (data?.message as string) || (data?.error as string) || `DeepL error ${resp.status}`,
        mapped.statusCode,
        mapped.retryable,
      );
    }

    const retryAfterMs = parseRetryAfterMs(resp.headers.get('retry-after'));
    const backoffMs = computeBackoffDelayMs(attempt);
    await sleep(retryAfterMs ?? backoffMs);
  }

  throw proxyError('UNKNOWN', 'DeepL retry budget exhausted', 503, true);
}

// --- Server ---
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const origin = req.headers.origin;
  const allowed = resolveAllowedOrigin(origin, ALLOWED_ORIGINS);
  const corsHeaders: Record<string, string> = allowed
    ? {
        'access-control-allow-origin': allowed,
        'access-control-allow-methods': 'GET,POST,OPTIONS',
        'access-control-allow-headers': 'content-type',
        ...(allowed === '*' ? {} : { vary: 'Origin' }),
      }
    : {};

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    return res.end();
  }

  if (u.pathname === '/health') {
    return text(res, 200, 'ok', corsHeaders);
  }

  if (u.pathname === '/translate') {
    if (req.method !== 'POST') {
      return json(res, 405, { error: { code: 'BAD_REQUEST', message: 'Method not allowed', retryable: false } }, corsHeaders);
    }

    try {
      ensureJsonRequest(req);
      const payload = await readJson(req);
      if (!payload) throw proxyError('BAD_REQUEST', 'Missing JSON body', 400, false);
      const normalizedPayload = normalizeTranslatePayload(payload);
      const key = buildRequestCacheKey(normalizedPayload, API_BASE);

      const now = Date.now();
      const cached = cache.get(key);
      let deeplData: Record<string, unknown>;
      let cacheState = 'MISS';

      if (cached && now - cached.ts < CACHE_TTL_MS) {
        deeplData = cached.value as Record<string, unknown>;
        cacheState = 'HIT';
      } else {
        deeplData = (await deeplTranslate(normalizedPayload)) as Record<string, unknown>;
        cache.set(key, { ts: now, value: deeplData });
      }

      const translations = normalizedPayload.items.map((item, index) => ({
        id: item.id,
        text: ((deeplData?.translations as Array<Record<string, string>>)?.[index]?.text) || '',
        detected_source_language:
          ((deeplData?.translations as Array<Record<string, string>>)?.[index]?.detected_source_language) || '',
      }));

      return json(res, 200, { translations, meta: { cache: cacheState, provider: 'deepl' } }, corsHeaders);
    } catch (err) {
      const mapped = mapErrorToResponse(err);
      return json(res, mapped.statusCode, { error: mapped.error }, corsHeaders);
    }
  }

  return json(res, 404, { error: { code: 'BAD_REQUEST', message: 'Not found', retryable: false } }, corsHeaders);
});

server.listen(PORT, () => {
  console.log(`Naranhi proxy listening on http://localhost:${PORT}`);
  console.log(`DeepL base: ${API_BASE}`);
});
