import { describe, it, expect } from 'vitest';
import {
  LIMITS,
  buildBatches,
  buildCacheKeyMaterial,
  buildRequestPayload,
  estimatePayloadBytes,
  expandItems,
  normalizeText,
  sha256Hex,
  splitTextByLimit,
} from '../src/index';

describe('buildBatches', () => {
  it('keeps item/char/byte limits', () => {
    const items = Array.from({ length: 120 }, (_, idx) => ({
      id: `id-${idx}`,
      text: `Sentence ${idx} ${'x'.repeat(600)}`,
    }));

    const batches = buildBatches({
      items,
      targetLang: 'KO',
      sourceLang: 'EN',
      options: { preserve_formatting: true },
      limits: LIMITS,
    });

    expect(batches.length).toBeGreaterThan(1);
    for (const batch of batches) {
      expect(batch.length).toBeLessThanOrEqual(LIMITS.MAX_ITEMS_PER_BATCH);
      const chars = batch.reduce((sum, item) => sum + item.text.length, 0);
      expect(chars).toBeLessThanOrEqual(LIMITS.MAX_CHARS_PER_BATCH);

      const payload = buildRequestPayload(batch, 'KO', 'EN', { preserve_formatting: true });
      const bytes = estimatePayloadBytes(payload);
      expect(bytes).toBeLessThanOrEqual(LIMITS.MAX_BODY_BYTES);
    }
  });
});

describe('splitTextByLimit', () => {
  it('chunks long text and preserves normalized order', () => {
    const longText = Array.from({ length: 80 }, (_, idx) => `Sentence ${idx}!`).join(' ');
    const chunks = splitTextByLimit(longText, 120);
    expect(chunks.length).toBeGreaterThan(1);

    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(120);
    }

    expect(normalizeText(chunks.join(' '))).toBe(normalizeText(longText));
  });

  it('splits mixed punctuation paragraphs at natural sentence boundaries', () => {
    const mixed =
      '첫 문장입니다.다음 문장은 공백 없이 이어집니다! Third sentence has English punctuation? 마지막 문장도 충분히 깁니다; 그리고 이어집니다: 끝.';
    const chunks = splitTextByLimit(mixed, 45);

    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((chunk) => chunk.length <= 45)).toBe(true);

    const compactSentenceSpacing = (value: string) =>
      normalizeText(value).replace(/([.!?。！？])\s*/gu, '$1');

    expect(compactSentenceSpacing(chunks.join(' '))).toBe(compactSentenceSpacing(mixed));
  });

  it('falls back to whitespace-aware cuts for overlong sentence', () => {
    const noPunctuation = Array.from({ length: 120 }, (_, i) => `token${i}`).join(' ');
    const chunks = splitTextByLimit(noPunctuation, 80);

    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((chunk) => chunk.length <= 80)).toBe(true);
    expect(normalizeText(chunks.join(' '))).toBe(normalizeText(noPunctuation));
  });
});

describe('expandItems', () => {
  it('keeps segment order for reassembly of long paragraph', () => {
    const longParagraph = Array.from({ length: 90 }, (_, i) => `문장${i}.`).join('');
    const { expandedItems, originalItems } = expandItems([{ id: 'p1', text: longParagraph }], 60);

    expect(expandedItems.length).toBeGreaterThan(1);
    expect(originalItems).toHaveLength(1);
    expect(originalItems[0].segmentIds).toHaveLength(expandedItems.length);
    expect(originalItems[0].segmentIds).toEqual(expandedItems.map((item) => item.id));
  });
});

describe('cache key material and hash', () => {
  it('are stable for same normalized inputs', async () => {
    const base = {
      text: '  hello    world ',
      sourceLang: 'en',
      targetLang: 'ko',
      options: { preserve_formatting: true, formality: 'default' },
    };

    const material1 = buildCacheKeyMaterial(base);
    const material2 = buildCacheKeyMaterial({
      text: 'hello world',
      sourceLang: 'en',
      targetLang: 'ko',
      options: { formality: 'default', preserve_formatting: true },
    });

    expect(material1).toBe(material2);
    expect(await sha256Hex(material1)).toBe(await sha256Hex(material2));

    const material3 = buildCacheKeyMaterial({
      ...base,
      options: { preserve_formatting: false, formality: 'default' },
    });
    expect(material1).not.toBe(material3);
  });

  it('same normalized text yields same hashed cache key for dedupe', async () => {
    const key1 = await sha256Hex(
      buildCacheKeyMaterial({
        text: 'same text',
        sourceLang: '',
        targetLang: 'KO',
        options: {},
      }),
    );
    const key2 = await sha256Hex(
      buildCacheKeyMaterial({
        text: '  same   text ',
        sourceLang: '',
        targetLang: 'KO',
        options: {},
      }),
    );

    expect(key1).toBe(key2);
  });
});
