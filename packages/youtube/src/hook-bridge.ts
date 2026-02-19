/**
 * YouTube Hook Bridge — intercepts fetch/XHR for timedtext data.
 * Ported from _legacy/extension/ytHookBridge.js
 *
 * This script is intended to be injected into the page's MAIN world
 * (not the content script isolated world) so it can intercept YouTube's
 * network calls for subtitle data.
 *
 * Usage in WXT content script:
 *   const script = document.createElement('script');
 *   script.src = browser.runtime.getURL('/hook-bridge.js');
 *   document.documentElement.appendChild(script);
 *
 * Or via WXT's world: 'MAIN' content script.
 */

export const FLAG_KEY = '__NARANHI_YT_HOOK_BRIDGE_V1__';
export const EVENT_TYPE = 'NARANHI_YT_TIMEDTEXT_V1';
const MAX_RESPONSE_BYTES = 512 * 1024;
const MAX_TEXT_FOR_HASH = 200000;

// ---------------------------------------------------------------------------
// FNV-1a hash
// ---------------------------------------------------------------------------

export function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  const text = String(input || '');
  const limit = Math.min(text.length, MAX_TEXT_FOR_HASH);
  for (let i = 0; i < limit; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

function toURL(value: string | undefined): URL | null {
  try {
    return new URL(String(value || ''), globalThis.location?.href || 'https://www.youtube.com');
  } catch {
    return null;
  }
}

export function isTimedTextURL(urlObj: URL | null): boolean {
  if (!urlObj) return false;
  const pathname = String(urlObj.pathname || '');
  if (pathname.includes('/api/timedtext')) return true;
  if (!pathname.includes('videoplayback')) return false;
  return urlObj.searchParams.has('text');
}

export function trackLang(urlObj: URL | null): string {
  return String(urlObj?.searchParams.get('tlang') || urlObj?.searchParams.get('lang') || '').toLowerCase();
}

export function isAsr(urlObj: URL | null): boolean {
  return String(urlObj?.searchParams.get('kind') || '').toLowerCase() === 'asr';
}

export function trackSignature(urlObj: URL | null): string {
  const params = urlObj?.searchParams;
  if (!params) return 'default';

  const keys = ['lang', 'tlang', 'kind', 'name', 'fmt', 'v', 'id'];
  const pairs: string[] = [];
  for (const key of keys) {
    if (!params.has(key)) continue;
    pairs.push(`${key}=${params.get(key)}`);
  }
  if (!pairs.length) return 'default';
  return pairs.join('&');
}

// ---------------------------------------------------------------------------
// Timedtext event parsing
// ---------------------------------------------------------------------------

export interface TimedTextSeg {
  utf8: string;
  tOffsetMs?: number;
}

export interface TimedTextEvent {
  tStartMs: number;
  dDurationMs: number;
  segs: TimedTextSeg[];
}

export interface HookBridgePayload {
  url: string;
  trackLang: string;
  isAsr: boolean;
  trackSignature: string;
  events: TimedTextEvent[];
  responseHash: string;
  receivedAt: number;
  parseError?: boolean;
  consecutiveParseErrors?: number;
}

function decodeToMs(value: string | null, unit: 'sec' | 'ms'): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return NaN;
  if (unit === 'sec') return Math.max(0, Math.floor(numeric * 1000));
  return Math.max(0, Math.floor(numeric));
}

function parseTimedtextXml(rawText: string): TimedTextEvent[] {
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(rawText, 'text/xml');
  } catch {
    return [];
  }

  if (!doc || doc.querySelector('parsererror')) return [];

  const nodes = Array.from(doc.querySelectorAll('p, text'));
  if (!nodes.length) return [];

  const events: TimedTextEvent[] = [];
  for (const node of nodes) {
    const hasMsAttrs = node.hasAttribute('t') || node.hasAttribute('d');
    const startMs = hasMsAttrs
      ? decodeToMs(node.getAttribute('t'), 'ms')
      : decodeToMs(node.getAttribute('start'), 'sec');
    const durationMs = hasMsAttrs
      ? decodeToMs(node.getAttribute('d'), 'ms')
      : decodeToMs(node.getAttribute('dur'), 'sec');

    if (!Number.isFinite(startMs)) continue;
    if (!Number.isFinite(durationMs) || durationMs <= 0) continue;

    const segNodes = Array.from(node.querySelectorAll('s'));
    const segs: TimedTextSeg[] = [];
    if (segNodes.length) {
      for (const segNode of segNodes) {
        const utf8 = String(segNode.textContent || '').trim();
        if (!utf8) continue;
        const tOffsetMs = decodeToMs(segNode.getAttribute('t'), 'ms');
        segs.push({
          utf8,
          ...(Number.isFinite(tOffsetMs) ? { tOffsetMs } : {}),
        });
      }
    } else {
      const utf8 = String(node.textContent || '').trim();
      if (utf8) {
        segs.push({ utf8, tOffsetMs: 0 });
      }
    }

    if (!segs.length) continue;
    events.push({
      tStartMs: startMs,
      dDurationMs: durationMs,
      segs,
    });
  }

  return events;
}

let consecutiveParseErrors = 0;

function parseTimedtextEvents(rawText: string, sourceUrl: string): TimedTextEvent[] {
  const text = typeof rawText === 'string' ? rawText : '';
  if (!text) return [];

  try {
    const json = JSON.parse(text);
    const jsonEvents = Array.isArray(json?.events) ? json.events : [];
    if (jsonEvents.length) return jsonEvents;
  } catch {
    // try XML fallback below
  }

  const xmlEvents = parseTimedtextXml(text);
  if (xmlEvents.length) return xmlEvents;

  const trimmed = text.trim();
  const looksStructured = trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.startsWith('<');
  if (!looksStructured) return [];

  consecutiveParseErrors += 1;
  postPayload({
    url: String(sourceUrl || ''),
    parseError: true,
    consecutiveParseErrors,
    receivedAt: Date.now(),
  } as unknown as HookBridgePayload);
  return [];
}

// ---------------------------------------------------------------------------
// Message posting
// ---------------------------------------------------------------------------

function postPayload(payload: HookBridgePayload): void {
  globalThis.postMessage(
    {
      source: 'naranhi-yt-bridge',
      type: EVENT_TYPE,
      payload,
    },
    '*',
  );
}

function processTimedText(urlObj: URL, rawText: string): void {
  const text = typeof rawText === 'string' ? rawText : '';
  if (!text || text.length > MAX_RESPONSE_BYTES) return;

  const events = parseTimedtextEvents(text, urlObj.toString());
  if (!events.length) return;

  consecutiveParseErrors = 0;

  postPayload({
    url: urlObj.toString(),
    trackLang: trackLang(urlObj),
    isAsr: isAsr(urlObj),
    trackSignature: trackSignature(urlObj),
    events,
    responseHash: fnv1aHex(text),
    receivedAt: Date.now(),
  });
}

// ---------------------------------------------------------------------------
// Fetch & XHR hooks
// ---------------------------------------------------------------------------

export function installFetchHook(): void {
  const originalFetch = globalThis.fetch;
  if (typeof originalFetch !== 'function') return;

  globalThis.fetch = async function patchedFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const response = await originalFetch.apply(this, [input, init]);
    try {
      const target = typeof input === 'string' ? input : (input as Request)?.url;
      const urlObj = toURL(target);
      if (!isTimedTextURL(urlObj)) return response;
      if (!response?.ok) return response;

      const clone = response.clone();
      const body = await clone.text();
      processTimedText(urlObj!, body);
    } catch {
      // no-op
    }
    return response;
  };
}

export function installXHRHook(): void {
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function patchedOpen(
    method: string,
    url: string | URL,
    ...rest: unknown[]
  ) {
    (this as XMLHttpRequest & { __naranhiYtHookURL?: string }).__naranhiYtHookURL = String(url);
    return (originalOpen as Function).call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function patchedSend(...args: unknown[]) {
    this.addEventListener(
      'load',
      function onLoad(this: XMLHttpRequest) {
        try {
          const rawUrl =
            this.responseURL ||
            (this as XMLHttpRequest & { __naranhiYtHookURL?: string }).__naranhiYtHookURL;
          const urlObj = toURL(rawUrl);
          if (!isTimedTextURL(urlObj)) return;

          if (this.responseType && (this.responseType as string) !== '' && this.responseType !== 'text') {
            return;
          }

          const body = typeof this.responseText === 'string' ? this.responseText : '';
          processTimedText(urlObj!, body);
        } catch {
          // no-op
        }
      },
      { once: true },
    );

    return (originalSend as Function).apply(this, args);
  };
}

// ---------------------------------------------------------------------------
// Main installer
// ---------------------------------------------------------------------------

export function installHookBridge(): void {
  if ((globalThis as Record<string, unknown>)[FLAG_KEY]) return;
  (globalThis as Record<string, unknown>)[FLAG_KEY] = true;

  installFetchHook();
  installXHRHook();
}
