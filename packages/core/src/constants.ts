// --- Translation Limits ---
export const LIMITS = {
  MAX_BODY_BYTES: 65536,
  MAX_ITEMS_PER_BATCH: 40,
  MAX_CHARS_PER_ITEM: 1500,
  MAX_CHARS_PER_BATCH: 12000,
} as const;

// --- Message Types ---
export const MESSAGE_TYPES = {
  TRANSLATE_BATCH: 'NARANHI_TRANSLATE_BATCH',
  TOGGLE_PAGE: 'NARANHI_TOGGLE_PAGE',
  GET_PAGE_STATE: 'NARANHI_GET_PAGE_STATE',
  TOGGLE_YT_SUBTITLE: 'NARANHI_TOGGLE_YT_SUBTITLE',
  GET_YT_SUBTITLE_STATE: 'NARANHI_GET_YT_SUBTITLE_STATE',
  SHOW_TOOLTIP: 'NARANHI_SHOW_TOOLTIP',
  SHOW_BANNER: 'NARANHI_SHOW_BANNER',
  CLEAR_CACHE: 'NARANHI_CLEAR_CACHE',
  SEGMENT_TEXT: 'NARANHI_SEGMENT_TEXT',
} as const;

// --- YouTube Hook Events ---
export const YT_HOOK_EVENT = 'NARANHI_YT_TIMEDTEXT_V1' as const;

// --- Sentence Boundary ---
export const SENTENCE_BOUNDARY = /(?<=[.!?。！？])\s+/u;

// --- Default Settings ---
export const DEFAULT_SETTINGS = {
  engine: 'deepl' as const,
  targetLang: 'KO',
  sourceLang: '',
  deepl: {
    proxyUrl: 'http://localhost:8787',
    formality: '',
  },
  openai: {
    apiKey: '',
    model: 'gpt-4o-mini',
    baseUrl: 'https://api.openai.com/v1',
  },
  google: {
    apiKey: '',
  },
  displayMode: 'bilingual' as const,
  translationPosition: 'below' as const,
  floatingButton: true,
  theme: 'auto' as const,
  visibleOnly: true,
  visibleRootMargin: '350px 0px 600px 0px',
  batchFlushMs: 120,
  cacheEnabled: false,
  shortcuts: {} as Record<string, string>,
} as const;

// --- Supported Languages ---
export const SUPPORTED_LANGUAGES = [
  { code: 'KO', name: '한국어', nativeName: '한국어' },
  { code: 'EN', name: 'English', nativeName: 'English' },
  { code: 'JA', name: 'Japanese', nativeName: '日本語' },
  { code: 'ZH', name: 'Chinese', nativeName: '中文' },
  { code: 'DE', name: 'German', nativeName: 'Deutsch' },
  { code: 'FR', name: 'French', nativeName: 'Français' },
  { code: 'ES', name: 'Spanish', nativeName: 'Español' },
  { code: 'PT', name: 'Portuguese', nativeName: 'Português' },
  { code: 'RU', name: 'Russian', nativeName: 'Русский' },
  { code: 'IT', name: 'Italian', nativeName: 'Italiano' },
] as const;
