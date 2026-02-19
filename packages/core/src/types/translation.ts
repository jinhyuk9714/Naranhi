export type EngineType = 'deepl' | 'openai' | 'google';

export type DisplayMode = 'bilingual' | 'translation-only';
export type TranslationPosition = 'below' | 'side' | 'hover';
export type ThemeMode = 'light' | 'dark' | 'auto';

export interface TranslationItem {
  id: string;
  text: string;
}

export interface TranslationRequest {
  items: TranslationItem[];
  sourceLang?: string;
  targetLang: string;
  options?: TranslationOptions;
}

export interface TranslationOptions {
  formality?: string;
  splitSentences?: string;
  tagHandling?: string;
  preserveFormatting?: boolean;
  context?: string;
  modelType?: string;
}

export interface TranslationResult {
  id: string;
  translatedText: string;
  detectedLang?: string;
}

export interface TranslationError {
  code: string;
  message: string;
  retryable: boolean;
  statusCode?: number;
}

export interface ExpandedItem {
  id: string;
  text: string;
  originalId: string;
  segmentIndex: number;
}

export interface OriginalItemMapping {
  id: string;
  segmentIds: string[];
}

export interface BatchPayload {
  items: TranslationItem[];
  target_lang: string;
  source_lang?: string;
  options?: TranslationOptions;
}
