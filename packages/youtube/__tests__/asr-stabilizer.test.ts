import { describe, it, expect } from 'vitest';
import {
  YouTubeAsrStabilizer,
  CueTranslationQueue,
  DomFallbackCommitter,
  selectActiveCue,
  eventsToSimpleCues,
  buildCueId,
  isLowConfidenceAsrWindow,
  ManualCaptionSentenceMerger,
} from '../src/asr-stabilizer';

describe('eventsToSimpleCues', () => {
  it('filters invalid events and keeps valid subtitles', () => {
    const events = [
      { tStartMs: 0, dDurationMs: 600, segs: [{ utf8: 'hello world' }] },
      { tStartMs: 700, dDurationMs: undefined, segs: [{ utf8: 'ignored' }] },
      { tStartMs: 1200, dDurationMs: 500, aAppend: 1, segs: [{ utf8: 'append' }] },
      { tStartMs: 1800, dDurationMs: 500, segs: [] },
    ];

    const cues = eventsToSimpleCues(events as any, 'en::track', 'hook');
    expect(cues.length).toBe(1);
    expect(cues[0].text).toBe('hello world');
  });
});

describe('YouTubeAsrStabilizer', () => {
  it('builds deterministic cue ids for ASR events', () => {
    const stabilizer = new YouTubeAsrStabilizer();
    const events = [
      { tStartMs: 0, dDurationMs: 300, segs: [{ utf8: 'hello ' }] },
      { tStartMs: 320, dDurationMs: 300, segs: [{ utf8: 'world' }] },
      { tStartMs: 650, dDurationMs: 300, segs: [{ utf8: '.' }] },
      { tStartMs: 1100, dDurationMs: 300, segs: [{ utf8: 'how ' }] },
      { tStartMs: 1450, dDurationMs: 300, segs: [{ utf8: 'are ' }] },
      { tStartMs: 1780, dDurationMs: 300, segs: [{ utf8: 'you' }] },
      { tStartMs: 2100, dDurationMs: 300, segs: [{ utf8: '?' }] },
    ];

    const cuesA = stabilizer.buildCues({
      events,
      trackLang: 'en',
      trackKey: 'en::asr',
      source: 'hook',
    });
    const cuesB = stabilizer.buildCues({
      events,
      trackLang: 'en',
      trackKey: 'en::asr',
      source: 'hook',
    });

    expect(cuesA.length).toBeGreaterThanOrEqual(1);
    expect(cuesA.map((cue) => cue.cueId)).toEqual(cuesB.map((cue) => cue.cueId));
    expect(cuesA.every((cue) => cue.cueId.startsWith('yt:en::asr:'))).toBe(true);
    expect(cuesA.every((cue) => typeof cue.confidence === 'number')).toBe(true);
  });
});

describe('CueTranslationQueue', () => {
  it('prevents re-request after markTranslated', () => {
    const queue = new CueTranslationQueue();
    expect(queue.enqueue('cue-1', 'hello')).toBe(true);
    expect(queue.enqueue('cue-2', 'world')).toBe(true);

    const batch = queue.take(2);
    expect(batch.length).toBe(2);

    queue.markTranslated(['cue-1']);
    queue.clearInflight(['cue-2']);
    queue.requeue([
      { id: 'cue-1', text: 'hello' },
      { id: 'cue-2', text: 'world' },
    ]);

    const secondBatch = queue.take(2);
    expect(secondBatch.length).toBe(1);
    expect(secondBatch[0].id).toBe('cue-2');
  });
});

describe('DomFallbackCommitter', () => {
  it('commits on quiet timeout and dedupes repeated text by ttl', () => {
    const committer = new DomFallbackCommitter({
      quietMs: 700,
      forceMs: 1800,
      minWords: 2,
      minChars: 8,
      dedupeTtlMs: 12000,
    });

    const first = committer.ingest('window-0', 'hello world', 1000, 1000);
    expect(first).toBeNull();

    const committed = committer.ingest('window-0', 'hello world', 1700, 1705);
    expect(committed).not.toBeNull();
    expect(committed!.windowId).toBe('window-0');

    const duplicated = committer.ingest('window-0', 'hello world', 2500, 2505);
    expect(duplicated).toBeNull();
  });
});

describe('selectActiveCue', () => {
  it('returns current cue and short tail hold cue', () => {
    const cues = [
      { cueId: 'a', trackKey: 'test', startMs: 1000, endMs: 2000, text: 'a', source: 'hook', confidence: 0.8 },
      { cueId: 'b', trackKey: 'test', startMs: 2200, endMs: 3200, text: 'b', source: 'hook', confidence: 0.8 },
    ];

    expect(selectActiveCue(cues, 1500)?.cueId).toBe('a');
    expect(selectActiveCue(cues, 2500)?.cueId).toBe('b');
    expect(selectActiveCue(cues, 3600)?.cueId).toBe('b');
    expect(selectActiveCue(cues, 7000)).toBeNull();
  });
});

describe('buildCueId', () => {
  it('stays stable for same inputs', () => {
    const id1 = buildCueId('en::asr', 100, 200, 'hello');
    const id2 = buildCueId('en::asr', 100, 200, 'hello');
    const id3 = buildCueId('en::asr', 100, 200, 'world');

    expect(id1).toBe(id2);
    expect(id1).not.toBe(id3);
  });
});

describe('isLowConfidenceAsrWindow', () => {
  it('returns false for stable punctuated cues', () => {
    const cues = [
      { cueId: '1', trackKey: 'test', startMs: 0, endMs: 1800, text: 'Hello world.', source: 'hook', confidence: 0.82 },
      { cueId: '2', trackKey: 'test', startMs: 2000, endMs: 3700, text: 'How are you?', source: 'hook', confidence: 0.84 },
      { cueId: '3', trackKey: 'test', startMs: 3900, endMs: 5600, text: 'This is stable.', source: 'hook', confidence: 0.8 },
    ];
    expect(isLowConfidenceAsrWindow(cues)).toBe(false);
  });

  it('detects over-segmented no-punctuation streams', () => {
    const cues = [];
    for (let i = 0; i < 10; i += 1) {
      cues.push({
        cueId: `cue-${i}`,
        trackKey: 'test',
        startMs: i * 500,
        endMs: i * 500 + 300,
        text: `word ${i}`,
        source: 'hook',
        confidence: 0.35,
      });
    }
    expect(isLowConfidenceAsrWindow(cues)).toBe(true);
  });
});

describe('ManualCaptionSentenceMerger', () => {
  it('merges short continuation cues', () => {
    const merger = new ManualCaptionSentenceMerger({
      maxGapMs: 250,
      maxChars: 220,
      maxDurationMs: 7000,
    });

    const events = [
      { tStartMs: 0, dDurationMs: 500, segs: [{ utf8: 'This is' }] },
      { tStartMs: 520, dDurationMs: 480, segs: [{ utf8: 'a simple test' }] },
      { tStartMs: 1020, dDurationMs: 500, segs: [{ utf8: '.' }] },
      { tStartMs: 2300, dDurationMs: 600, segs: [{ utf8: 'Next sentence starts.' }] },
    ];

    const cues = merger.buildCues({
      events,
      trackLang: 'en',
      trackKey: 'en::track::demo',
      source: 'hook',
    });

    expect(cues.length).toBe(2);
    expect(cues[0].text).toBe('This is a simple test');
    expect(cues[1].text).toBe('Next sentence starts.');
  });
});
