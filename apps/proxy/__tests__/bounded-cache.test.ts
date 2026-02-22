import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BoundedCache } from '../src/bounded-cache';

describe('BoundedCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stores and retrieves values', () => {
    const cache = new BoundedCache<string>(10, 60_000);
    cache.set('key1', 'value1');

    expect(cache.get('key1')).toBe('value1');
  });

  it('returns undefined for missing keys', () => {
    const cache = new BoundedCache<string>(10, 60_000);

    expect(cache.get('nonexistent')).toBeUndefined();
  });

  it('returns undefined for expired entries', () => {
    const cache = new BoundedCache<string>(10, 1_000);
    cache.set('key1', 'value1');

    vi.advanceTimersByTime(1_001);

    expect(cache.get('key1')).toBeUndefined();
  });

  it('returns value before TTL expiration', () => {
    const cache = new BoundedCache<string>(10, 1_000);
    cache.set('key1', 'value1');

    vi.advanceTimersByTime(999);

    expect(cache.get('key1')).toBe('value1');
  });

  it('evicts oldest entry when maxEntries exceeded', () => {
    const cache = new BoundedCache<string>(3, 60_000);
    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('c', '3');
    cache.set('d', '4'); // should evict 'a'

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe('2');
    expect(cache.get('c')).toBe('3');
    expect(cache.get('d')).toBe('4');
    expect(cache.size).toBe(3);
  });

  it('evicts multiple entries when needed', () => {
    const cache = new BoundedCache<string>(2, 60_000);
    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('c', '3'); // evicts 'a'
    cache.set('d', '4'); // evicts 'b'

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBeUndefined();
    expect(cache.size).toBe(2);
  });

  it('updates existing key without increasing size', () => {
    const cache = new BoundedCache<string>(3, 60_000);
    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('a', 'updated');

    expect(cache.size).toBe(2);
    expect(cache.get('a')).toBe('updated');
  });

  it('clear removes all entries', () => {
    const cache = new BoundedCache<string>(10, 60_000);
    cache.set('a', '1');
    cache.set('b', '2');
    cache.clear();

    expect(cache.size).toBe(0);
    expect(cache.get('a')).toBeUndefined();
  });

  it('expired entries are removed on get', () => {
    const cache = new BoundedCache<string>(10, 1_000);
    cache.set('a', '1');

    vi.advanceTimersByTime(1_001);
    cache.get('a'); // triggers deletion

    expect(cache.size).toBe(0);
  });
});
