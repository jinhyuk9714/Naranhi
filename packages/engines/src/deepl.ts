import type { TranslationRequest, TranslationResult } from '@naranhi/core';
import type { TranslationEngine, EngineUsage } from './types';

interface DeepLConfig {
  proxyUrl: string;
  formality?: string;
}

export class DeepLEngine implements TranslationEngine {
  readonly id = 'deepl' as const;
  readonly name = 'DeepL';
  private config: DeepLConfig;

  constructor(config: DeepLConfig) {
    this.config = config;
  }

  updateConfig(config: Partial<DeepLConfig>): void {
    this.config = { ...this.config, ...config };
  }

  async translate(request: TranslationRequest): Promise<TranslationResult[]> {
    const url = `${this.config.proxyUrl.replace(/\/+$/, '')}/translate`;

    const body: Record<string, unknown> = {
      items: request.items.map((item) => ({ id: item.id, text: item.text })),
      target_lang: request.targetLang,
    };

    if (request.sourceLang) body.source_lang = request.sourceLang;

    const options: Record<string, unknown> = { ...request.options };
    if (this.config.formality) options.formality = this.config.formality;
    if (Object.keys(options).length) body.options = options;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new DeepLError(
        (errorData as Record<string, string>).message || `DeepL proxy error: ${response.status}`,
        response.status,
        response.status === 429,
      );
    }

    const data = (await response.json()) as {
      translations: Array<{
        id: string;
        text: string;
        detected_source_language?: string;
      }>;
    };

    return data.translations.map((t) => ({
      id: t.id,
      translatedText: t.text,
      detectedLang: t.detected_source_language,
    }));
  }

  async testConnection(): Promise<boolean> {
    try {
      const url = `${this.config.proxyUrl.replace(/\/+$/, '')}/health`;
      const response = await fetch(url, { method: 'GET' });
      return response.ok;
    } catch {
      return false;
    }
  }

  async getUsage(): Promise<EngineUsage> {
    // DeepL usage is tracked server-side; proxy could expose /usage endpoint
    return { characterCount: 0, characterLimit: 500000 };
  }
}

export class DeepLError extends Error {
  statusCode: number;
  retryable: boolean;

  constructor(message: string, statusCode: number, retryable: boolean) {
    super(message);
    this.name = 'DeepLError';
    this.statusCode = statusCode;
    this.retryable = retryable;
  }
}
