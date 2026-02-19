import type { EngineType, DisplayMode, TranslationPosition, ThemeMode } from './translation';

export interface DeepLSettings {
  proxyUrl: string;
  formality?: string;
}

export interface OpenAISettings {
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export interface GoogleSettings {
  apiKey?: string;
}

export interface NaranhiSettings {
  engine: EngineType;
  targetLang: string;
  sourceLang: string;
  deepl: DeepLSettings;
  openai: OpenAISettings;
  google: GoogleSettings;
  displayMode: DisplayMode;
  translationPosition: TranslationPosition;
  floatingButton: boolean;
  theme: ThemeMode;
  visibleOnly: boolean;
  visibleRootMargin: string;
  batchFlushMs: number;
  cacheEnabled: boolean;
  shortcuts: Record<string, string>;
}
