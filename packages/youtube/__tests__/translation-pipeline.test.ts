import { describe, expect, it } from 'vitest';
import { ManualCaptionSentenceMerger, CueTranslationQueue, selectActiveCue, resolveRenderText } from '../src';

describe('youtube subtitle translation pipeline', () => {
  it('collects cues, batches translation requests, then resolves render text', () => {
    const merger = new ManualCaptionSentenceMerger();
    const queue = new CueTranslationQueue();

    const cues = merger.buildCues({
      events: [
        { tStartMs: 0, dDurationMs: 500, segs: [{ utf8: 'This is' }] },
        { tStartMs: 520, dDurationMs: 480, segs: [{ utf8: 'a simple test' }] },
        { tStartMs: 1020, dDurationMs: 500, segs: [{ utf8: '.' }] },
        { tStartMs: 2300, dDurationMs: 600, segs: [{ utf8: 'Next sentence starts.' }] },
      ],
      trackLang: 'en',
      trackKey: 'en::track::demo',
      source: 'hook',
    });

    expect(cues.length).toBe(2);

    for (const cue of cues) {
      expect(queue.enqueue(cue.cueId, cue.text)).toBe(true);
    }

    const batch = queue.take(10);
    expect(batch).toHaveLength(2);
    expect(batch.map((item) => item.id)).toEqual(cues.map((cue) => cue.cueId));

    const translatedByCueId = new Map(batch.map((item) => [item.id, `KO:${item.text}`]));
    queue.markTranslated(batch.map((item) => item.id));

    const activeCue = selectActiveCue(cues, 700);
    expect(activeCue).not.toBeNull();

    const translated = translatedByCueId.get(activeCue!.cueId);
    expect(translated).toBe('KO:This is a simple test');

    const rendered = resolveRenderText(translated, null, 1000, 900);
    expect(rendered.text).toBe('KO:This is a simple test');
  });
});
