import { describe, it, expect } from 'vitest';
import {
  cueTextSimilarity,
  selectCueByTimeAndText,
  resolveRenderText,
} from '../src/render-policy';

describe('cueTextSimilarity', () => {
  it('returns higher score for overlapping tokens', () => {
    const near = cueTextSimilarity('hello world from youtube', 'hello world');
    const far = cueTextSimilarity('hello world from youtube', 'completely different');
    expect(near).toBeGreaterThan(far);
  });
});

describe('selectCueByTimeAndText', () => {
  it('prefers matching cue near current time', () => {
    const cues = [
      { startMs: 1000, endMs: 2000, text: 'first example line', confidence: 0.7 },
      { startMs: 2100, endMs: 3200, text: 'second target phrase', confidence: 0.7 },
    ];

    const picked = selectCueByTimeAndText(cues, 2500, 'target phrase shown');
    expect(picked?.text).toBe('second target phrase');
  });
});

describe('resolveRenderText', () => {
  it('keeps previous text within hold window', () => {
    const first = resolveRenderText('translated line', null, 1000, 900);
    expect(first.text).toBe('translated line');

    const hold = resolveRenderText('', first.state, 1700, 900);
    expect(hold.text).toBe('translated line');

    const expired = resolveRenderText('', first.state, 2200, 900);
    expect(expired.text).toBe('');
  });
});
