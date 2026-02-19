import type { TranslationRequest, TranslationResult } from '@naranhi/core';
import { SUPPORTED_LANGUAGES } from '@naranhi/core';
import type { TranslationEngine } from './types';

interface OpenAIConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export class OpenAIEngine implements TranslationEngine {
  readonly id = 'openai' as const;
  readonly name = 'OpenAI';
  private config: OpenAIConfig;

  constructor(config: OpenAIConfig) {
    this.config = config;
  }

  updateConfig(config: Partial<OpenAIConfig>): void {
    this.config = { ...this.config, ...config };
  }

  async translate(request: TranslationRequest): Promise<TranslationResult[]> {
    const baseUrl = (this.config.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
    const url = `${baseUrl}/chat/completions`;

    const targetName = this.getLanguageName(request.targetLang);
    const sourceName = request.sourceLang ? this.getLanguageName(request.sourceLang) : null;

    const textsToTranslate = request.items.map((item) => item.text);

    const systemPrompt = this.buildSystemPrompt(targetName, sourceName);
    const userPrompt = this.buildUserPrompt(textsToTranslate);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        (errorData as Record<string, Record<string, string>>)?.error?.message ||
          `OpenAI error: ${response.status}`,
      );
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };

    const content = data.choices[0]?.message?.content || '';
    const translations = this.parseTranslations(content, request.items);

    return translations;
  }

  async testConnection(): Promise<boolean> {
    try {
      const baseUrl = (this.config.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
      const response = await fetch(`${baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.config.apiKey}` },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private getLanguageName(code: string): string {
    const lang = SUPPORTED_LANGUAGES.find((l) => l.code === code.toUpperCase());
    return lang?.name || code;
  }

  private buildSystemPrompt(targetLang: string, sourceLang: string | null): string {
    const source = sourceLang ? ` from ${sourceLang}` : '';
    return [
      `You are a professional translator. Translate the following text${source} to ${targetLang}.`,
      'Maintain the original tone, style, and formatting.',
      'If multiple texts are provided (separated by |||), translate each one separately and return them separated by ||| in the same order.',
      'Return ONLY the translations, nothing else.',
    ].join('\n');
  }

  private buildUserPrompt(texts: string[]): string {
    return texts.join('\n|||\n');
  }

  private parseTranslations(
    content: string,
    items: TranslationRequest['items'],
  ): TranslationResult[] {
    const parts = content.split(/\n?\|\|\|\n?/);

    return items.map((item, index) => ({
      id: item.id,
      translatedText: (parts[index] || '').trim(),
    }));
  }
}
