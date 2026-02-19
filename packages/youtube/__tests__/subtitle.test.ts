import { describe, it, expect } from 'vitest';
import {
  normalizeCaptionText,
  RecentCaptionDeduper,
  WindowPendingQueue,
} from '../src/subtitle';

describe('normalizeCaptionText', () => {
  it('filters empty/music-only/oversized input', () => {
    expect(normalizeCaptionText('')).toBe('');
    expect(normalizeCaptionText(' ')).toBe('');
    expect(normalizeCaptionText('♪♪♪')).toBe('');
    expect(normalizeCaptionText('A')).toBe('');
    expect(normalizeCaptionText('x'.repeat(241))).toBe('');
    expect(normalizeCaptionText('Hello world')).toBe('Hello world');
  });
});

describe('RecentCaptionDeduper', () => {
  it('blocks same window+text within ttl', () => {
    const deduper = new RecentCaptionDeduper(8000, 120);
    const now = 1000;

    expect(deduper.shouldEnqueue('window-0', 'hello', now)).toBe(true);
    expect(deduper.shouldEnqueue('window-0', 'hello', now + 100)).toBe(false);
    expect(deduper.shouldEnqueue('window-1', 'hello', now + 100)).toBe(true);
    expect(deduper.shouldEnqueue('window-0', 'hello', now + 8100)).toBe(true);
  });
});

describe('WindowPendingQueue', () => {
  it('keeps latest text per window and enforces take size', () => {
    const queue = new WindowPendingQueue();
    queue.enqueue('window-0', 'first');
    queue.enqueue('window-0', 'latest');
    queue.enqueue('window-1', 'line 1');
    queue.enqueue('window-2', 'line 2');

    const batch = queue.take(2);
    expect(batch.length).toBe(2);
    expect(batch[0].id).toBe('window-0');
    expect(batch[0].text).toBe('latest');
    expect(batch[1].id).toBe('window-1');
    expect(queue.pendingSize()).toBe(1);
  });

  it('handles empty pending batch and requeue', () => {
    const queue = new WindowPendingQueue();
    expect(queue.take(6)).toEqual([]);
    expect(queue.hasPending()).toBe(false);

    queue.enqueue('window-0', 'hello');
    const batch = queue.take(6);
    expect(batch.length).toBe(1);
    queue.requeue(batch);
    expect(queue.hasPending()).toBe(true);
    expect(queue.take(6).length).toBe(1);
  });
});
