/**
 * YouTube Subtitle Handler — orchestrates subtitle interception, translation,
 * and rendering for YouTube videos.
 *
 * Runs in the content script's ISOLATED world. Receives hook bridge events
 * from the MAIN world script via postMessage, translates subtitle cues
 * through the background service worker, and renders translated text
 * in a custom overlay (hides YouTube's native captions).
 */

import { MESSAGE_TYPES, LIMITS } from '@naranhi/core';
import {
  EVENT_TYPE,
  YouTubeAsrStabilizer,
  ManualCaptionSentenceMerger,
  CueTranslationQueue,
  DomFallbackCommitter,
  selectActiveCue,
  resolveRenderText,
  normalizeText,
} from '@naranhi/youtube';
import type { HookBridgePayload, AsrCue, RenderState } from '@naranhi/youtube';
import { isYouTubeWatchPageUrl } from '../../lib/youtube-page';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FLUSH_INTERVAL_MS = 150;
const RENDER_INTERVAL_MS = 120;
const FALLBACK_BATCH_SIZE = 20;
const HOOK_TIMEOUT_MS = 2500;
const BUILD_DEBOUNCE_MS = 300;
const DEDUPE_TTL_MS = 60_000;
const CUE_PRUNE_BEHIND_MS = 45_000;
const MAX_CUES_PER_TRACK = 300;
const HOLD_MS = 900;
const OVERLAY_ID = 'naranhi-subtitle-overlay';
const BODY_CLASS = 'naranhi-yt-active';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TrackState {
  cues: AsrCue[];
  cueIds: Set<string>;
  lastHookAt: number;
}

interface HandlerState {
  active: boolean;
  startedAt: number;

  // Hook bridge
  hookDetectedAt: number;
  hookParseFailures: number;
  fallbackMode: boolean;
  primaryTrackKey: string;
  seenResponses: Map<string, number>;

  // Track / translation
  trackStates: Map<string, TrackState>;
  translatedByCueId: Map<string, string>;

  // Event accumulation buffer (per track)
  eventBuffer: Map<string, unknown[]>;
  trackMeta: Map<string, { isAsr: boolean; trackLang: string }>;
  buildTimer: ReturnType<typeof setTimeout> | null;

  // Render
  overlayEl: HTMLElement | null;
  originalEl: HTMLElement | null;
  translatedEl: HTMLElement | null;
  renderStates: Map<string, RenderState>;

  // Fallback DOM observation
  fallbackObserver: MutationObserver | null;

  // Timers
  flushTimer: ReturnType<typeof setTimeout> | null;
  renderTimer: ReturnType<typeof setInterval> | null;
}

// ---------------------------------------------------------------------------
// Style injection
// ---------------------------------------------------------------------------

let stylesInjected = false;

function injectStyles(): void {
  if (stylesInjected) return;
  const style = document.createElement('style');
  style.textContent = `
/* Hide native YouTube captions when handler is active */
body.${BODY_CLASS} #ytp-caption-window-container,
body.${BODY_CLASS} .ytp-caption-window-container {
  display: none !important;
}

/* Custom subtitle overlay */
#${OVERLAY_ID} {
  position: absolute;
  z-index: 40;
  bottom: 72px;
  left: 50%;
  transform: translateX(-50%);
  width: 80%;
  text-align: center;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

#movie_player.ytp-autohide #${OVERLAY_ID} {
  bottom: 12px;
}

.naranhi-sub-original,
.naranhi-sub-translated {
  display: inline-block;
  background: rgba(8, 8, 8, 0.75);
  padding: 2px 8px;
  border-radius: 3px;
  font-size: 1.4rem;
  line-height: 1.5;
  color: #fff;
  font-family: 'YouTube Noto', Roboto, Arial, Helvetica, sans-serif;
  word-break: break-word;
  max-width: 100%;
}

.naranhi-sub-translated {
  font-size: 1.2rem;
  opacity: 0.92;
}`;
  document.head.appendChild(style);
  stylesInjected = true;
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

function getVideoMs(): number {
  const video = document.querySelector('video');
  if (!video || !Number.isFinite(video.currentTime)) return 0;
  return Math.floor(video.currentTime * 1000);
}

function createOverlay(): { overlay: HTMLElement; original: HTMLElement; translated: HTMLElement } | null {
  const player = document.querySelector('#movie_player');
  if (!player) return null;

  // Remove existing overlay if any
  const existing = document.getElementById(OVERLAY_ID);
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;

  const original = document.createElement('div');
  original.className = 'naranhi-sub-original';

  const translated = document.createElement('div');
  translated.className = 'naranhi-sub-translated';

  overlay.appendChild(original);
  overlay.appendChild(translated);
  player.appendChild(overlay);

  return { overlay, original, translated };
}

function removeOverlay(): void {
  document.getElementById(OVERLAY_ID)?.remove();
}

function updateOverlay(
  originalEl: HTMLElement | null,
  translatedEl: HTMLElement | null,
  overlayEl: HTMLElement | null,
  originalText: string,
  translatedText: string,
): void {
  if (!originalEl || !translatedEl || !overlayEl) return;

  if (!originalText && !translatedText) {
    overlayEl.style.display = 'none';
    return;
  }

  overlayEl.style.display = '';

  if (originalText) {
    originalEl.textContent = originalText;
    originalEl.style.display = '';
  } else {
    originalEl.style.display = 'none';
  }

  if (translatedText) {
    translatedEl.textContent = translatedText;
    translatedEl.style.display = '';
  } else {
    translatedEl.style.display = 'none';
  }
}

// ---------------------------------------------------------------------------
// Fallback DOM text extraction
// ---------------------------------------------------------------------------

function findCaptionContainer(): Element | null {
  return (
    document.querySelector('.ytp-caption-window-container') ||
    document.querySelector('.caption-window')
  );
}

function extractVisibleCaptionText(container: Element): string {
  const segments = container.querySelectorAll('.ytp-caption-segment');
  const parts: string[] = [];
  segments.forEach((seg) => {
    const t = normalizeText(seg.textContent || '');
    if (t) parts.push(t);
  });
  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Handler factory
// ---------------------------------------------------------------------------

export interface YouTubeSubtitleHandler {
  start(): Promise<void>;
  stop(): void;
  isActive(): boolean;
}

export function createYouTubeSubtitleHandler(): YouTubeSubtitleHandler {
  const stabilizer = new YouTubeAsrStabilizer({ maxEvents: 6000 });
  const manualMerger = new ManualCaptionSentenceMerger();
  const translationQueue = new CueTranslationQueue();
  const domCommitter = new DomFallbackCommitter({ quietMs: 700, forceMs: 1800 });

  let state: HandlerState = freshState();
  let boundBridgeListener: ((event: MessageEvent) => void) | null = null;
  let boundNavigateListener: (() => void) | null = null;

  function freshState(): HandlerState {
    return {
      active: false,
      startedAt: 0,
      hookDetectedAt: 0,
      hookParseFailures: 0,
      fallbackMode: false,
      primaryTrackKey: '',
      seenResponses: new Map(),
      trackStates: new Map(),
      translatedByCueId: new Map(),
      eventBuffer: new Map(),
      trackMeta: new Map(),
      buildTimer: null,
      overlayEl: null,
      originalEl: null,
      translatedEl: null,
      renderStates: new Map(),
      fallbackObserver: null,
      flushTimer: null,
      renderTimer: null,
    };
  }

  // --- Hook bridge listener ---

  function onBridgeMessage(event: MessageEvent): void {
    if (!state.active) return;
    if (event.source !== window) return;

    const data = event.data;
    if (!data || data.source !== 'naranhi-yt-bridge' || data.type !== EVENT_TYPE) return;

    const payload: HookBridgePayload = data.payload;
    if (!payload) return;

    // Parse error handling
    if (payload.parseError) {
      state.hookParseFailures += 1;
      if (state.hookParseFailures >= 3) {
        state.fallbackMode = true;
        attachFallbackObserver();
      }
      return;
    }

    state.hookDetectedAt = Date.now();
    state.fallbackMode = false;

    // Deduplicate
    const dedupeKey = `${payload.url}::${payload.responseHash}`;
    const lastSeen = state.seenResponses.get(dedupeKey);
    if (lastSeen && Date.now() - lastSeen < DEDUPE_TTL_MS) return;
    state.seenResponses.set(dedupeKey, Date.now());

    // Build track key
    const trackLang = String(payload.trackLang || 'auto').toLowerCase();
    const kind = payload.isAsr ? 'asr' : 'track';
    const sig = String(payload.trackSignature || '').slice(0, 32);
    const trackKey = `${trackLang}::${kind}::${sig}`;

    // Accumulate events in buffer (merge with existing)
    const existing = state.eventBuffer.get(trackKey) || [];
    state.eventBuffer.set(trackKey, mergeEvents(existing, payload.events as unknown[]));
    state.trackMeta.set(trackKey, { isAsr: payload.isAsr, trackLang });

    // Debounce: wait for additional responses before building cues
    if (state.buildTimer) clearTimeout(state.buildTimer);
    state.buildTimer = setTimeout(() => {
      state.buildTimer = null;
      rebuildCuesFromBuffer(trackKey);
    }, BUILD_DEBOUNCE_MS);
  }

  function mergeEvents(existing: unknown[], incoming: unknown[]): unknown[] {
    const byStart = new Map<number, unknown>();
    for (const e of [...existing, ...incoming]) {
      if (!e || typeof e !== 'object') continue;
      const start = Number((e as Record<string, unknown>).tStartMs || 0);
      byStart.set(start, e);
    }
    return [...byStart.values()].sort(
      (a, b) => Number((a as Record<string, unknown>).tStartMs || 0) - Number((b as Record<string, unknown>).tStartMs || 0),
    );
  }

  function rebuildCuesFromBuffer(trackKey: string): void {
    if (!state.active) return;
    const events = state.eventBuffer.get(trackKey);
    if (!events?.length) return;

    const meta = state.trackMeta.get(trackKey);
    if (!meta) return;

    let cues: AsrCue[];
    if (meta.isAsr) {
      cues = stabilizer.buildCues({
        events,
        trackLang: meta.trackLang,
        trackKey,
        source: 'hook',
      } as Parameters<typeof stabilizer.buildCues>[0]);
    } else {
      cues = manualMerger.buildCues({
        events,
        trackKey,
        source: 'hook',
      } as Parameters<typeof manualMerger.buildCues>[0]);
    }

    // No fallback to word-level cues — wait for more data if stabilizer can't build sentences
    if (!cues.length) return;

    // Replace track with fresh sentence-level cues
    const track: TrackState = { cues: [], cueIds: new Set(), lastHookAt: Date.now() };
    state.trackStates.set(trackKey, track);
    state.primaryTrackKey = trackKey;

    addCuesToTrack(trackKey, cues);
    void batchTranslateAllCues(cues);
  }

  function addCuesToTrack(trackKey: string, cues: AsrCue[]): void {
    let track = state.trackStates.get(trackKey);
    if (!track) {
      track = { cues: [], cueIds: new Set(), lastHookAt: Date.now() };
      state.trackStates.set(trackKey, track);
    }

    track.lastHookAt = Date.now();
    state.primaryTrackKey = trackKey;

    for (const cue of cues) {
      if (track.cueIds.has(cue.cueId)) continue;
      track.cueIds.add(cue.cueId);
      track.cues.push(cue);
    }

    // Prune old cues
    const videoMs = getVideoMs();
    if (track.cues.length > MAX_CUES_PER_TRACK) {
      const cutoff = videoMs - CUE_PRUNE_BEHIND_MS;
      track.cues = track.cues.filter((c) => c.endMs >= cutoff);
      track.cueIds = new Set(track.cues.map((c) => c.cueId));
    }
  }

  // --- Pre-translation (hook mode) ---

  async function batchTranslateAllCues(cues: AsrCue[]): Promise<void> {
    if (!state.active || !cues.length) return;

    // Filter out already-translated cues
    const untranslated = cues.filter((c) => !state.translatedByCueId.has(c.cueId));
    if (!untranslated.length) return;

    // Split into batches respecting char limits
    const batches: Array<Array<{ id: string; text: string }>> = [];
    let current: Array<{ id: string; text: string }> = [];
    let currentChars = 0;

    for (const cue of untranslated) {
      const len = cue.text.length;
      if (currentChars + len > LIMITS.MAX_CHARS_PER_BATCH && current.length > 0) {
        batches.push(current);
        current = [];
        currentChars = 0;
      }
      current.push({ id: cue.cueId, text: cue.text });
      currentChars += len;
    }
    if (current.length) batches.push(current);

    // Translate each batch sequentially
    for (const batch of batches) {
      if (!state.active) return;
      try {
        const resp = await chrome.runtime.sendMessage({
          type: MESSAGE_TYPES.TRANSLATE_BATCH,
          runId: `yt-sub-${Date.now()}`,
          items: batch,
          channel: 'yt-subtitle',
        });

        if (resp?.ok && Array.isArray(resp.data?.translations)) {
          for (const t of resp.data.translations) {
            if (t.id && t.text) {
              state.translatedByCueId.set(t.id, t.text);
            }
          }
        }
      } catch {
        // Non-fatal — untranslated cues will show no translation
      }
    }
  }

  // --- Translation flush (DOM fallback only) ---

  function scheduleFlush(): void {
    if (state.flushTimer || !state.active) return;
    state.flushTimer = setTimeout(() => {
      state.flushTimer = null;
      void flushTranslationQueue();
    }, FLUSH_INTERVAL_MS);
  }

  async function flushTranslationQueue(): Promise<void> {
    if (!state.active || !translationQueue.hasPending()) return;

    const batch = translationQueue.take(FALLBACK_BATCH_SIZE);
    if (!batch.length) return;

    try {
      const resp = await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.TRANSLATE_BATCH,
        runId: `yt-sub-${Date.now()}`,
        items: batch.map((item) => ({ id: item.id, text: item.text })),
        channel: 'yt-subtitle',
      });

      if (resp?.ok && Array.isArray(resp.data?.translations)) {
        const ids: string[] = [];
        for (const t of resp.data.translations) {
          if (t.id && t.text) {
            state.translatedByCueId.set(t.id, t.text);
            ids.push(t.id);
          }
        }
        translationQueue.markTranslated(ids);
      } else {
        translationQueue.requeue(batch);
      }
    } catch {
      translationQueue.requeue(batch);
    }

    if (translationQueue.hasPending()) {
      scheduleFlush();
    }
  }

  // --- Fallback DOM observer (text extraction only, not rendering) ---

  function attachFallbackObserver(): void {
    if (state.fallbackObserver) return;

    const container = findCaptionContainer();
    if (!container) return;

    state.fallbackObserver = new MutationObserver(() => {
      if (!state.active || !state.fallbackMode) return;
      const text = extractVisibleCaptionText(container);
      if (!text) return;

      const videoMs = getVideoMs();
      const now = Date.now();
      const committed = domCommitter.ingest('fallback', text, videoMs, now);
      if (committed) {
        addCuesToTrack('dom:fallback', [committed]);
        translationQueue.enqueue(committed.cueId, committed.text);
        scheduleFlush();
      }
    });

    state.fallbackObserver.observe(container, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  }

  // --- Render loop (video time polling) ---

  function renderLoop(): void {
    if (!state.active) return;

    // Ensure overlay exists
    if (!state.overlayEl?.isConnected) {
      const result = createOverlay();
      if (!result) return;
      state.overlayEl = result.overlay;
      state.originalEl = result.original;
      state.translatedEl = result.translated;
    }

    const videoMs = getVideoMs();
    const now = Date.now();

    // Check fallback mode
    if (!state.fallbackMode && state.hookDetectedAt === 0 && now - state.startedAt > HOOK_TIMEOUT_MS) {
      state.fallbackMode = true;
      attachFallbackObserver();
    }

    // Find active cue by time
    let cue: AsrCue | null = null;

    if (state.fallbackMode) {
      // Check all DOM fallback tracks
      for (const [key, track] of state.trackStates) {
        if (key.startsWith('dom:') && track.cues.length) {
          cue = selectActiveCue(track.cues, videoMs);
          if (cue) break;
        }
      }
    } else {
      const track = state.trackStates.get(state.primaryTrackKey);
      if (track?.cues.length) {
        cue = selectActiveCue(track.cues, videoMs);
      }
    }

    // Hook mode: only show cue when translation is ready (bilingual pair)
    // Fallback mode: show original even without translation (on-demand translation is slower)
    let originalText = '';
    let translatedText = '';

    if (cue) {
      const translation = state.translatedByCueId.get(cue.cueId);
      if (translation || state.fallbackMode) {
        originalText = cue.text;
        translatedText = translation || '';
      }
    }

    // Anti-flicker hold for both lines
    const { text: renderOriginal, state: nextOrigState } = resolveRenderText(
      originalText || null,
      state.renderStates.get('orig'),
      now,
      HOLD_MS,
    );
    const { text: renderTranslated, state: nextTransState } = resolveRenderText(
      translatedText || null,
      state.renderStates.get('trans'),
      now,
      HOLD_MS,
    );

    state.renderStates.set('orig', nextOrigState);
    state.renderStates.set('trans', nextTransState);

    updateOverlay(state.originalEl, state.translatedEl, state.overlayEl, renderOriginal, renderTranslated);
  }

  // --- SPA navigation ---

  function onNavigate(): void {
    if (!state.active) return;
    if (!isYouTubeWatchPageUrl(location.href)) {
      stop();
    }
  }

  // --- Public API ---

  async function start(): Promise<void> {
    if (state.active) return;
    if (!isYouTubeWatchPageUrl(location.href)) return;

    injectStyles();
    state = freshState();
    state.active = true;
    state.startedAt = Date.now();

    translationQueue.reset();
    domCommitter.reset();

    // Hide native captions
    document.body.classList.add(BODY_CLASS);

    // Create overlay
    const result = createOverlay();
    if (result) {
      state.overlayEl = result.overlay;
      state.originalEl = result.original;
      state.translatedEl = result.translated;
    }

    // Bind hook bridge listener
    boundBridgeListener = onBridgeMessage;
    window.addEventListener('message', boundBridgeListener);

    // Bind SPA navigation
    boundNavigateListener = onNavigate;
    document.addEventListener('yt-navigate-finish', boundNavigateListener);

    // Start render loop (video time polling)
    state.renderTimer = setInterval(renderLoop, RENDER_INTERVAL_MS);
  }

  function stop(): void {
    state.active = false;

    // Remove listeners
    if (boundBridgeListener) {
      window.removeEventListener('message', boundBridgeListener);
      boundBridgeListener = null;
    }
    if (boundNavigateListener) {
      document.removeEventListener('yt-navigate-finish', boundNavigateListener);
      boundNavigateListener = null;
    }

    // Disconnect fallback observer
    if (state.fallbackObserver) {
      state.fallbackObserver.disconnect();
      state.fallbackObserver = null;
    }

    // Clear timers
    if (state.buildTimer) clearTimeout(state.buildTimer);
    if (state.flushTimer) clearTimeout(state.flushTimer);
    if (state.renderTimer) clearInterval(state.renderTimer);

    // Clean up DOM
    removeOverlay();
    document.body.classList.remove(BODY_CLASS);

    // Reset queues
    translationQueue.reset();
    domCommitter.reset();
  }

  function isActive(): boolean {
    return state.active;
  }

  return { start, stop, isActive };
}
