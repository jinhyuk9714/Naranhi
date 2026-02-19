import type { EngineType, TranslationRequest, TranslationResult } from '@naranhi/core';
import type { TranslationEngine, EngineConfig } from './types';
import { DeepLEngine } from './deepl';
import { OpenAIEngine } from './openai';
import { GoogleEngine } from './google';

export class EngineManager {
  private engines: Map<EngineType, TranslationEngine> = new Map();
  private activeEngineId: EngineType = 'deepl';

  constructor(config: EngineConfig = {}) {
    if (config.deepl) {
      this.engines.set('deepl', new DeepLEngine(config.deepl));
    }
    if (config.openai) {
      this.engines.set('openai', new OpenAIEngine(config.openai));
    }
    if (config.google) {
      this.engines.set('google', new GoogleEngine(config.google));
    }
  }

  /** Get the currently active engine */
  getActiveEngine(): TranslationEngine | undefined {
    return this.engines.get(this.activeEngineId);
  }

  /** Get a specific engine by ID */
  getEngine(id: EngineType): TranslationEngine | undefined {
    return this.engines.get(id);
  }

  /** Set the active engine */
  setActiveEngine(id: EngineType): void {
    if (!this.engines.has(id)) {
      throw new Error(`Engine "${id}" is not registered`);
    }
    this.activeEngineId = id;
  }

  /** Get the active engine ID */
  getActiveEngineId(): EngineType {
    return this.activeEngineId;
  }

  /** Register or update an engine */
  registerEngine(engine: TranslationEngine): void {
    this.engines.set(engine.id, engine);
  }

  /** List all registered engine IDs */
  listEngines(): EngineType[] {
    return Array.from(this.engines.keys());
  }

  /** Translate using the active engine */
  async translate(request: TranslationRequest): Promise<TranslationResult[]> {
    const engine = this.getActiveEngine();
    if (!engine) {
      throw new Error(`No active engine configured (active: ${this.activeEngineId})`);
    }
    return engine.translate(request);
  }

  /** Translate with fallback: try active engine first, then fallbacks */
  async translateWithFallback(
    request: TranslationRequest,
    fallbackOrder?: EngineType[],
  ): Promise<TranslationResult[]> {
    const order = fallbackOrder || this.listEngines();
    const errors: Error[] = [];

    // Try active engine first
    const active = this.getActiveEngine();
    if (active) {
      try {
        return await active.translate(request);
      } catch (err) {
        errors.push(err as Error);
      }
    }

    // Try fallbacks
    for (const engineId of order) {
      if (engineId === this.activeEngineId) continue;
      const engine = this.engines.get(engineId);
      if (!engine) continue;

      try {
        return await engine.translate(request);
      } catch (err) {
        errors.push(err as Error);
      }
    }

    throw new Error(
      `All engines failed: ${errors.map((e) => e.message).join('; ')}`,
    );
  }

  /** Test connection for a specific engine */
  async testConnection(id: EngineType): Promise<boolean> {
    const engine = this.engines.get(id);
    if (!engine) return false;
    return engine.testConnection();
  }

  /** Test all registered engines */
  async testAllConnections(): Promise<Record<EngineType, boolean>> {
    const results: Partial<Record<EngineType, boolean>> = {};
    for (const [id, engine] of this.engines) {
      try {
        results[id] = await engine.testConnection();
      } catch {
        results[id] = false;
      }
    }
    return results as Record<EngineType, boolean>;
  }
}
