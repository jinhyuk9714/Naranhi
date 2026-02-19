import { LIMITS } from '../constants';
import { normalizeText, normalizeOptions, splitTextByLimit } from './text';
import type {
  TranslationItem,
  TranslationOptions,
  ExpandedItem,
  OriginalItemMapping,
  BatchPayload,
} from '../types';

export function expandItems(
  items: TranslationItem[],
  maxChars: number = LIMITS.MAX_CHARS_PER_ITEM,
): { expandedItems: ExpandedItem[]; originalItems: OriginalItemMapping[] } {
  const expandedItems: ExpandedItem[] = [];
  const originalItems: OriginalItemMapping[] = [];

  for (const item of Array.isArray(items) ? items : []) {
    const id = String(item?.id || '').trim();
    const text = normalizeText(item?.text || '');
    if (!id || !text) continue;

    const segments = splitTextByLimit(text, maxChars);
    if (!segments.length) continue;

    const segmentIds: string[] = [];
    for (let i = 0; i < segments.length; i += 1) {
      const segmentId = `${id}__${i}`;
      segmentIds.push(segmentId);
      expandedItems.push({
        id: segmentId,
        text: segments[i],
        originalId: id,
        segmentIndex: i,
      });
    }

    originalItems.push({ id, segmentIds });
  }

  return { expandedItems, originalItems };
}

export function buildRequestPayload(
  items: TranslationItem[],
  targetLang: string,
  sourceLang?: string,
  options?: TranslationOptions,
): BatchPayload {
  const payload: BatchPayload = {
    items: items.map((item) => ({
      id: String(item.id),
      text: String(item.text),
    })),
    target_lang: targetLang,
  };

  if (sourceLang) payload.source_lang = sourceLang;
  const normalizedOptions = normalizeOptions(options);
  if (Object.keys(normalizedOptions).length) {
    payload.options = normalizedOptions as TranslationOptions;
  }
  return payload;
}

export function estimatePayloadBytes(payload: BatchPayload): number {
  return new TextEncoder().encode(JSON.stringify(payload)).length;
}

interface BuildBatchesParams {
  items: TranslationItem[];
  targetLang: string;
  sourceLang?: string;
  options?: TranslationOptions;
  limits?: typeof LIMITS;
}

export function buildBatches({
  items,
  targetLang,
  sourceLang,
  options,
  limits = LIMITS,
}: BuildBatchesParams): TranslationItem[][] {
  const batches: TranslationItem[][] = [];
  let current: TranslationItem[] = [];
  let currentChars = 0;

  for (const item of items) {
    if (item.text.length > limits.MAX_CHARS_PER_ITEM) {
      throw new Error('Item exceeds MAX_CHARS_PER_ITEM');
    }

    const nextItems = current.concat(item);
    const nextChars = currentChars + item.text.length;
    const nextPayload = buildRequestPayload(nextItems, targetLang, sourceLang, options);
    const nextBytes = estimatePayloadBytes(nextPayload);

    const exceeds =
      nextItems.length > limits.MAX_ITEMS_PER_BATCH ||
      nextChars > limits.MAX_CHARS_PER_BATCH ||
      nextBytes > limits.MAX_BODY_BYTES;

    if (exceeds) {
      if (!current.length) {
        throw new Error('Single item exceeds request size limit');
      }

      batches.push(current);
      current = [item];
      currentChars = item.text.length;

      const singlePayload = buildRequestPayload(current, targetLang, sourceLang, options);
      const singleBytes = estimatePayloadBytes(singlePayload);
      if (singleBytes > limits.MAX_BODY_BYTES) {
        throw new Error('Single item exceeds MAX_BODY_BYTES');
      }
      continue;
    }

    current = nextItems;
    currentChars = nextChars;
  }

  if (current.length) {
    batches.push(current);
  }
  return batches;
}
