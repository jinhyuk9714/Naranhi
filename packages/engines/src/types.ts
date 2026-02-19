import type {
  EngineType,
  TranslationRequest,
  TranslationResult,
} from '@naranhi/core';

export interface EngineUsage {
  characterCount: number;
  characterLimit: number;
}

export interface TranslationEngine {
  /** Unique engine identifier */
  id: EngineType;
  /** Human-readable name */
  name: string;
  /** Translate a batch of items */
  translate(request: TranslationRequest): Promise<TranslationResult[]>;
  /** Test if the engine is reachable and configured */
  testConnection(): Promise<boolean>;
  /** Optional: get usage statistics */
  getUsage?(): Promise<EngineUsage>;
}

export interface EngineConfig {
  deepl?: {
    proxyUrl: string;
    formality?: string;
  };
  openai?: {
    apiKey: string;
    model: string;
    baseUrl?: string;
  };
  google?: {
    apiKey?: string;
  };
}
