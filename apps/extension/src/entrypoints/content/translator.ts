/**
 * Page Translator — orchestrates page translation using visible queue.
 */

import { MESSAGE_TYPES } from '@naranhi/core';
import type { TranslationItem } from '@naranhi/core';
import { detectPrimaryContainer } from './content-detector';
import { VisibleTranslationQueue } from './visible-queue';
import {
  injectStyles,
  findTranslatableBlocks,
  assignBlockIds,
  injectTranslation,
  removeAllTranslations,
} from './dom-injector';

interface TranslatorState {
  enabled: boolean;
  activeRunId: string | null;
  visibleOnly: boolean;
  batchFlushMs: number;
  visibleRootMargin: string;
  extractionMode: 'readability' | 'legacy';
}

const MAX_BATCH_ITEMS = 20;

export class PageTranslator {
  private state: TranslatorState = {
    enabled: false,
    activeRunId: null,
    visibleOnly: true,
    batchFlushMs: 120,
    visibleRootMargin: '350px 0px 600px 0px',
    extractionMode: 'readability',
  };

  private queue = new VisibleTranslationQueue();
  private observer: IntersectionObserver | null = null;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private blockElements = new Map<string, HTMLElement>();

  async enable(): Promise<void> {
    if (this.state.enabled) return;

    // Load settings
    const settings = await chrome.storage.sync.get({
      visibleOnly: true,
      batchFlushMs: 120,
      visibleRootMargin: '350px 0px 600px 0px',
      extractionMode: 'readability',
    });

    this.state.visibleOnly = settings.visibleOnly !== false;
    this.state.batchFlushMs = Number(settings.batchFlushMs) || 120;
    this.state.visibleRootMargin = settings.visibleRootMargin || '350px 0px 600px 0px';
    this.state.extractionMode = settings.extractionMode || 'readability';

    this.state.enabled = true;
    this.state.activeRunId = `run-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    injectStyles();

    // Find translatable blocks
    const container =
      this.state.extractionMode === 'readability'
        ? detectPrimaryContainer(document)
        : document.body;

    if (!container) return;

    const blocks = findTranslatableBlocks(container);
    const items = assignBlockIds(blocks);

    // Store references
    for (const item of items) {
      this.blockElements.set(item.id, item.el);
    }

    if (this.state.visibleOnly) {
      this.setupVisibleQueue(items);
    } else {
      // Translate all blocks at once
      await this.translateBatch(items.map((i) => ({ id: i.id, text: i.text })));
    }
  }

  disable(): void {
    this.state.enabled = false;
    this.state.activeRunId = null;
    this.stopFlushTimer();
    this.observer?.disconnect();
    this.observer = null;
    this.queue.reset();
    this.blockElements.clear();
    removeAllTranslations();
  }

  toggle(): void {
    if (this.state.enabled) {
      this.disable();
    } else {
      void this.enable();
    }
  }

  isEnabled(): boolean {
    return this.state.enabled;
  }

  private setupVisibleQueue(items: Array<{ id: string; text: string; el: HTMLElement }>): void {
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const id = (entry.target as HTMLElement).getAttribute('data-naranhi-id');
          if (id) this.queue.enqueue(id);
        }
      },
      { rootMargin: this.state.visibleRootMargin },
    );

    for (const item of items) {
      this.observer.observe(item.el);
    }

    // Start flush timer
    this.flushTimer = setInterval(() => void this.flushQueue(), this.state.batchFlushMs);
  }

  private stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  private async flushQueue(): Promise<void> {
    if (!this.state.enabled || !this.queue.hasPending()) return;

    const ids = this.queue.take(MAX_BATCH_ITEMS);
    if (!ids.length) return;

    const items: TranslationItem[] = [];
    for (const id of ids) {
      const el = this.blockElements.get(id);
      if (!el) continue;
      const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
      if (text.length >= 20) {
        items.push({ id, text });
      }
    }

    if (items.length) {
      await this.translateBatch(items);
    }
  }

  private async translateBatch(items: TranslationItem[]): Promise<void> {
    const runId = this.state.activeRunId;
    if (!runId) return;

    try {
      const response = await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.TRANSLATE_BATCH,
        runId,
        items,
        channel: 'page',
      });

      if (!response?.ok || response.data?.runId !== runId) return;

      const translations = response.data.translations || [];
      const translatedIds: string[] = [];

      for (const t of translations) {
        if (t.text) {
          injectTranslation(t.id, t.text);
          translatedIds.push(t.id);
        }
      }

      this.queue.markTranslated(translatedIds);
    } catch {
      // Mark items as failed so they can be retried
      this.queue.clearInflight(items.map((i) => i.id));
    }
  }
}
