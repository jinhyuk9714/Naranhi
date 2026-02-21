import { describe, expect, it } from 'vitest';
import { getInjectionMode } from './dom-injector';

describe('getInjectionMode', () => {
  it('appends inside structure-sensitive block tags', () => {
    expect(getInjectionMode('li', 'ul')).toBe('append-inside');
    expect(getInjectionMode('td', 'tr')).toBe('append-inside');
    expect(getInjectionMode('th', 'tr')).toBe('append-inside');
    expect(getInjectionMode('dt', 'dl')).toBe('append-inside');
  });

  it('falls back to insert-after for normal paragraph/headline blocks', () => {
    expect(getInjectionMode('p', 'article')).toBe('insert-after');
    expect(getInjectionMode('h2', 'section')).toBe('insert-after');
    expect(getInjectionMode('blockquote', 'article')).toBe('insert-after');
  });

  it('uses parent guard when parent structure is sensitive', () => {
    expect(getInjectionMode('div', 'table')).toBe('append-inside');
    expect(getInjectionMode('span', 'ol')).toBe('append-inside');
  });
});
