import type { TranslationItem, TranslationResult, TranslationError, TranslationOptions } from './translation';

// --- Request Messages ---

export interface TranslateBatchMessage {
  type: 'NARANHI_TRANSLATE_BATCH';
  runId: string;
  items: TranslationItem[];
  channel?: 'page' | 'subtitle';
  options?: TranslationOptions;
}

export interface TogglePageMessage {
  type: 'NARANHI_TOGGLE_PAGE';
}

export interface GetPageStateMessage {
  type: 'NARANHI_GET_PAGE_STATE';
}

export interface ToggleYtSubtitleMessage {
  type: 'NARANHI_TOGGLE_YT_SUBTITLE';
}

export interface GetYtSubtitleStateMessage {
  type: 'NARANHI_GET_YT_SUBTITLE_STATE';
}

export interface ShowTooltipMessage {
  type: 'NARANHI_SHOW_TOOLTIP';
  translatedText: string;
}

export interface ShowBannerMessage {
  type: 'NARANHI_SHOW_BANNER';
  message: string;
  retryable: boolean;
}

export interface PageStateChangedMessage {
  type: 'NARANHI_PAGE_STATE_CHANGED';
  enabled: boolean;
}

export interface ClearCacheMessage {
  type: 'NARANHI_CLEAR_CACHE';
}

export interface SegmentTextMessage {
  type: 'NARANHI_SEGMENT_TEXT';
  payload: {
    lang: string;
    chunks: string[];
    hints?: string;
  };
}

export type NaranhiMessage =
  | TranslateBatchMessage
  | TogglePageMessage
  | GetPageStateMessage
  | PageStateChangedMessage
  | ToggleYtSubtitleMessage
  | GetYtSubtitleStateMessage
  | ShowTooltipMessage
  | ShowBannerMessage
  | ClearCacheMessage
  | SegmentTextMessage;

// --- Response Messages ---

export interface SuccessResponse<T = unknown> {
  ok: true;
  data: T;
}

export interface ErrorResponse {
  ok: false;
  error: TranslationError;
}

export type NaranhiResponse<T = unknown> = SuccessResponse<T> | ErrorResponse;

export interface TranslateBatchResponseData {
  runId: string;
  translations: TranslationResult[];
}

export interface PageStateData {
  enabled: boolean;
}

export interface YtSubtitleStateData {
  enabled: boolean;
}
