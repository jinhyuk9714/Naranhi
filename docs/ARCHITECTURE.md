# Architecture (MVP)

## Components
1) Extension (MV3)
- Popup UI (page toggle + YouTube subtitle toggle)
- Options page (v0.2 settings + cache toggle + clear cache)
- Background service worker (module)
- Content scripts:
  - vendored Readability-compatible parser
  - primary-container detector
  - visible-queue state helper
  - YouTube subtitle helper (`normalize/dedupe/queue`)
  - YouTube ASR stabilizer helper (`split/merge/commit`)
  - YouTube render policy helper (`time+text cue matching`, `hold-last-text`)
  - runtime content script (observer + injection + banner/tooltip)
  - YouTube bridge injector (`ytHookBridge.js`, main-world fetch/XHR hook)

2) Proxy server (local)
- HTTP endpoint `/translate`
- Optional HTTP endpoint `/segment` (feature-flagged AI sentence splitter)
- Adds CORS headers
- Adds DeepL Authorization header
- In-memory response cache (request-keyed)
- CORS default policy is `ALLOWED_ORIGINS=local` (local + extension origins only)

## Message flow
Popup -> Content script
- toggle translation on current tab
- toggle YouTube subtitle translation on current tab
- read current tab state (`page`, `youtube subtitle`)

Content script -> Background
- request translation batch `{ runId, items[{id,text}] }`
- in `visibleOnly=true`, sends incremental batches as items enter viewport
- in YouTube subtitle mode, sends committed cue batches with subtitle preset options and context
- optional low-confidence ASR sentence-split request (`DUALREAD_SEGMENT_TEXT`)

Page (main world) -> Content script
- `window.postMessage` subtitle events:
  - `NARANHI_YT_TIMEDTEXT_V1` with `{ url, trackLang, isAsr, trackSignature, events, responseHash, receivedAt }`

Background -> Proxy
- POST `/translate` with `{ items[], target_lang, source_lang?, options? }`
- POST `/segment` (optional, AI splitter enabled only) with `{ lang, chunks[], hints? }`
- request must use `Content-Type: application/json`

Background -> Content script
- return `{ runId, translations[{id,text}] }`
- send `DUALREAD_SHOW_TOOLTIP` for selection translation
- send `DUALREAD_SHOW_BANNER` for recoverable/unrecoverable errors

Proxy -> DeepL API
- POST /v2/translate with Authorization header

## Performance rules
- Container extraction mode:
  - `readability` (default): detect primary container first
  - `legacy`: previous global heuristic
- Visible-only mode:
  - default `true`
  - queues intersecting items via IntersectionObserver
  - flushes queue every `batchFlushMs` with max 20 items/request
- `visibleOnly=false` fallback:
  - full scan once (v0.1 behavior)
- YouTube subtitle mode (`youtube.com/watch` only):
  - hook-first capture: timedtext responses (`/api/timedtext`, `videoplayback?...text`)
  - ASR split/merge stabilization based on `ytAsrConfig` pattern + cue confidence scoring
  - low-confidence English ASR windows may call proxy `/segment` for conditional AI boundary refinement
  - non-ASR tracks use manual caption sentence merger (gap + continuation-word rules)
  - cue-level dedupe by deterministic cue id (`sha1`)
  - fallback to DOM commit mode when hook is unavailable or parse repeatedly fails
  - DOM fallback commit policy:
    - commit on punctuation OR stable `700ms`
    - force commit at `1800ms`
    - same text retranslation TTL `12s`
  - subtitle translation preset:
    - `model_type=prefer_quality_optimized`
    - `preserve_formatting=true`
    - `split_sentences="0"`
    - `context` built from recent source cues + video title (max 800 chars)
  - flush every `150ms`, max `6` lines/flush
  - render active cue by `video.currentTime` + visible caption text similarity
  - missing translation keeps last subtitle line up to `900ms` to reduce flicker
  - 1 translation node per caption window (upsert, skip unchanged writes)
  - track pruning: max `300` cues, drop cues older than `45s`
- Split oversized text by sentence/fixed chunks (`MAX_CHARS_PER_ITEM=1500`).
- Batch under hard limits:
  - `MAX_ITEMS_PER_BATCH=40`
  - `MAX_CHARS_PER_BATCH=12000`
  - `MAX_BODY_BYTES=65536`
- Deduplicate by `sha256(normalizedText + sourceLang + targetLang + options)`.
- Cache defaults:
  - cache is OFF by default
  - when enabled, use background memory cache + `chrome.storage.local`

## Privacy rules
- Do not store raw page URLs unless necessary
- Do not log text payloads in release builds

## Changelog
- v0.1: standardized message schema to `items[{id,text}]` and run-scoped responses.
- v0.1: added hard chunking constraints and retry behavior for retryable failures.
- v0.1: added optional persistent cache (`cacheEnabled`, clear cache control).
- v0.1: replaced blocking `alert` flow with inline banner + retry UX.
- v0.2: added primary-container extraction mode (`readability|legacy`).
- v0.2: added visible-only incremental translation queue with IntersectionObserver.
- v0.2.1: added YouTube subtitle bilingual overlay (desktop watch only).
- v0.2.1: popup now exposes a dedicated YouTube subtitle toggle with per-tab state sync.
- v0.2.2: YouTube subtitle pipeline switched to hybrid hook-first model with ASR stabilization and DOM fallback.
- v0.2.3: added subtitle quality parity layer (manual sentence merger, low-confidence ASR detection, subtitle DeepL preset/context, anti-flicker hold renderer, optional proxy `/segment` AI splitter).
