import type { TranslationRequest, TranslationResult } from '@naranhi/core';
import type { TranslationEngine } from './types';

interface GoogleConfig {
  apiKey?: string;
}

const GOOGLE_TRANSLATE_URL = 'https://translation.googleapis.com/language/translate/v2';

// Language code mapping: our codes → Google Translate codes
const LANG_MAP: Record<string, string> = {
  KO: 'ko',
  EN: 'en',
  JA: 'ja',
  ZH: 'zh-CN',
  DE: 'de',
  FR: 'fr',
  ES: 'es',
  PT: 'pt',
  RU: 'ru',
  IT: 'it',
};

export class GoogleEngine implements TranslationEngine {
  readonly id = 'google' as const;
  readonly name = 'Google Translate';
  private config: GoogleConfig;

  constructor(config: GoogleConfig) {
    this.config = config;
  }

  updateConfig(config: Partial<GoogleConfig>): void {
    this.config = { ...this.config, ...config };
  }

  async translate(request: TranslationRequest): Promise<TranslationResult[]> {
    if (!this.config.apiKey) {
      return this.translateFree(request);
    }
    return this.translateWithApi(request);
  }

  async testConnection(): Promise<boolean> {
    try {
      const result = await this.translate({
        items: [{ id: 'test', text: 'Hello' }],
        targetLang: 'KO',
      });
      return result.length > 0 && result[0].translatedText.length > 0;
    } catch {
      return false;
    }
  }

  private mapLangCode(code: string): string {
    return LANG_MAP[code.toUpperCase()] || code.toLowerCase();
  }

  private async translateWithApi(request: TranslationRequest): Promise<TranslationResult[]> {
    const targetLang = this.mapLangCode(request.targetLang);
    const sourceLang = request.sourceLang ? this.mapLangCode(request.sourceLang) : undefined;

    const url = new URL(GOOGLE_TRANSLATE_URL);
    url.searchParams.set('key', this.config.apiKey!);

    const body: Record<string, unknown> = {
      q: request.items.map((item) => item.text),
      target: targetLang,
      format: 'text',
    };
    if (sourceLang) body.source = sourceLang;

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Google Translate API error: ${response.status}`);
    }

    const data = (await response.json()) as {
      data: {
        translations: Array<{
          translatedText: string;
          detectedSourceLanguage?: string;
        }>;
      };
    };

    return request.items.map((item, index) => ({
      id: item.id,
      translatedText: data.data.translations[index]?.translatedText || '',
      detectedLang: data.data.translations[index]?.detectedSourceLanguage,
    }));
  }

  private async translateFree(request: TranslationRequest): Promise<TranslationResult[]> {
    // Free Google Translate endpoint (rate limited, no API key needed)
    const results: TranslationResult[] = [];
    const targetLang = this.mapLangCode(request.targetLang);
    const sourceLang = request.sourceLang ? this.mapLangCode(request.sourceLang) : 'auto';

    for (const item of request.items) {
      const url = new URL('https://translate.googleapis.com/translate_a/single');
      url.searchParams.set('client', 'gtx');
      url.searchParams.set('sl', sourceLang);
      url.searchParams.set('tl', targetLang);
      url.searchParams.set('dt', 't');
      url.searchParams.set('q', item.text);

      const response = await fetch(url.toString());

      if (!response.ok) {
        throw new Error(`Google Translate error: ${response.status}`);
      }

      const data = (await response.json()) as Array<Array<Array<string>>>;
      const translatedText = data[0]?.map((segment) => segment[0]).join('') || '';

      results.push({
        id: item.id,
        translatedText,
      });
    }

    return results;
  }
}
