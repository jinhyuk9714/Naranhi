/**
 * YouTube Render Policy — cue selection by time/text and anti-flicker hold.
 * Ported from _legacy/extension/youtubeRenderPolicy.js
 */

import { normalizeText } from './subtitle';

export const DEFAULT_HOLD_MS = 900;
const WINDOW_MATCH_MS = 6000;

function tokenize(text: string): string[] {
  return normalizeText(text)
    .toLowerCase()
    .split(/[^a-z0-9\u00c0-\u024f\u0400-\u04ff\u3040-\u30ff\u3400-\u9fff]+/u)
    .filter(Boolean);
}

export function cueTextSimilarity(left: string, right: string): number {
  const leftTokens = new Set(tokenize(left));
  const rightTokens = new Set(tokenize(right));
  if (!leftTokens.size || !rightTokens.size) return 0;

  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1;
  }

  const union = leftTokens.size + rightTokens.size - intersection;
  if (!union) return 0;
  return intersection / union;
}

export interface Cue {
  startMs: number;
  endMs: number;
  text: string;
  confidence?: number;
}

function proximityScore(cue: Cue, videoMs: number): number {
  const start = Number(cue?.startMs || 0);
  const end = Number(cue?.endMs || 0);
  if (videoMs >= start && videoMs <= end) return 1;

  const dist = videoMs < start ? start - videoMs : videoMs - end;
  if (dist >= WINDOW_MATCH_MS) return 0;
  return 1 - dist / WINDOW_MATCH_MS;
}

export function selectCueByTimeAndText(
  cues: Cue[],
  videoMs: number,
  windowText?: string,
  selectActiveCueFn?: (cues: Cue[], time: number) => Cue | null,
): Cue | null {
  const list = Array.isArray(cues) ? cues : [];
  if (!list.length) return null;

  const time = Number.isFinite(videoMs) ? videoMs : 0;
  const normalizedWindowText = normalizeText(windowText);
  const pickActive = typeof selectActiveCueFn === 'function' ? selectActiveCueFn : null;

  let bestCue: Cue | null = null;
  let bestScore = -1;

  for (const cue of list) {
    const prox = proximityScore(cue, time);
    if (prox <= 0) continue;

    const similarity = normalizedWindowText
      ? cueTextSimilarity(normalizedWindowText, cue?.text || '')
      : 0;
    const cueConfidence = Number(cue?.confidence || 0);
    const score = prox * 2 + similarity * 2 + cueConfidence * 0.5;

    if (score > bestScore) {
      bestScore = score;
      bestCue = cue;
    }
  }

  if (bestCue) return bestCue;
  return pickActive ? pickActive(list, time) : null;
}

export interface RenderState {
  lastText: string;
  lastShownAt: number;
}

export interface PlaybackSnapshot {
  videoMs: number;
  paused: boolean;
}

function isSeekDiscontinuity(previous: PlaybackSnapshot | null | undefined, current: PlaybackSnapshot): boolean {
  if (!previous) return false;
  if (!Number.isFinite(previous.videoMs) || !Number.isFinite(current.videoMs)) return false;
  return Math.abs(current.videoMs - previous.videoMs) > 1500;
}

export function resolveRenderText(
  translatedText: string | null | undefined,
  previousState?: RenderState | null,
  nowMs?: number,
  holdMs: number = DEFAULT_HOLD_MS,
): { text: string; state: RenderState } {
  const now = Number.isFinite(nowMs) ? nowMs! : Date.now();
  const hold = Number.isFinite(holdMs) ? Math.max(0, Math.floor(holdMs)) : DEFAULT_HOLD_MS;
  const state: RenderState =
    previousState && typeof previousState === 'object'
      ? {
          lastText: normalizeText(previousState.lastText || ''),
          lastShownAt: Number(previousState.lastShownAt || 0),
        }
      : { lastText: '', lastShownAt: 0 };

  const current = normalizeText(translatedText);
  if (current) {
    return {
      text: current,
      state: { lastText: current, lastShownAt: now },
    };
  }

  if (state.lastText && now - state.lastShownAt <= hold) {
    return { text: state.lastText, state };
  }

  return {
    text: '',
    state: { lastText: '', lastShownAt: 0 },
  };
}

export function resolveRenderTextWithPlayback(
  translatedText: string | null | undefined,
  previousState: RenderState | null | undefined,
  playback: PlaybackSnapshot,
  previousPlayback?: PlaybackSnapshot | null,
  nowMs?: number,
  holdMs: number = DEFAULT_HOLD_MS,
): { text: string; state: RenderState } {
  const normalized = normalizeText(translatedText);
  if (normalized) {
    return resolveRenderText(normalized, previousState, nowMs, holdMs);
  }

  if (isSeekDiscontinuity(previousPlayback, playback)) {
    return resolveRenderText('', null, nowMs, holdMs);
  }

  // While paused, keep previous render text regardless of hold timeout.
  if (playback.paused && previousState?.lastText) {
    return {
      text: normalizeText(previousState.lastText),
      state: {
        lastText: normalizeText(previousState.lastText),
        lastShownAt: Number(previousState.lastShownAt || nowMs || Date.now()),
      },
    };
  }

  return resolveRenderText('', previousState, nowMs, holdMs);
}
