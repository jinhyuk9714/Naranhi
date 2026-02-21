export {
  normalizeText,
  normalizeCaptionText,
  RecentCaptionDeduper,
  WindowPendingQueue,
} from './subtitle';

export type { NormalizeCaptionOptions, QueueItem } from './subtitle';

export {
  DEFAULT_HOLD_MS,
  cueTextSimilarity,
  selectCueByTimeAndText,
  resolveRenderText,
  resolveRenderTextWithPlayback,
} from './render-policy';

export type { Cue, RenderState, PlaybackSnapshot } from './render-policy';

export {
  DEFAULT_WORDS_REGEX,
  LANGS_CONFIG,
  calculateCueConfidence,
  sha1Hex,
  buildCueId,
  eventsToSimpleCues,
  isLowConfidenceAsrWindow,
  selectActiveCue,
  YouTubeAsrStabilizer,
  ManualCaptionSentenceMerger,
  CueTranslationQueue,
  DomFallbackCommitter,
} from './asr-stabilizer';

export type {
  AsrCue,
  StabilizerOptions,
  BuildCuesPayload,
  LowConfidenceOptions,
  SentenceMergerOptions,
  DomFallbackOptions,
} from './asr-stabilizer';

export {
  FLAG_KEY,
  EVENT_TYPE,
  fnv1aHex,
  isTimedTextURL,
  trackLang,
  isAsr,
  trackSignature,
  installFetchHook,
  installXHRHook,
  installHookBridge,
} from './hook-bridge';

export type {
  TimedTextSeg,
  TimedTextEvent,
  HookBridgePayload,
} from './hook-bridge';
