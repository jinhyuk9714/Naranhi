import assert from "node:assert/strict";
import test from "node:test";
import asrLib from "../apps/extension/youtubeAsrStabilizer.js";

const {
  YouTubeAsrStabilizer,
  CueTranslationQueue,
  DomFallbackCommitter,
  selectActiveCue,
  eventsToSimpleCues,
  buildCueId,
  isLowConfidenceAsrWindow,
} = asrLib;

test("eventsToSimpleCues filters invalid events and keeps valid subtitles", () => {
  const events = [
    { tStartMs: 0, dDurationMs: 600, segs: [{ utf8: "hello world" }] },
    { tStartMs: 700, dDurationMs: undefined, segs: [{ utf8: "ignored" }] },
    { tStartMs: 1200, dDurationMs: 500, aAppend: 1, segs: [{ utf8: "append" }] },
    { tStartMs: 1800, dDurationMs: 500, segs: [] },
  ];

  const cues = eventsToSimpleCues(events, "en::track", "hook");
  assert.equal(cues.length, 1);
  assert.equal(cues[0].text, "hello world");
});

test("YouTubeAsrStabilizer builds deterministic cue ids for ASR events", () => {
  const stabilizer = new YouTubeAsrStabilizer();
  const events = [
    { tStartMs: 0, dDurationMs: 300, segs: [{ utf8: "hello " }] },
    { tStartMs: 320, dDurationMs: 300, segs: [{ utf8: "world" }] },
    { tStartMs: 650, dDurationMs: 300, segs: [{ utf8: "." }] },
    { tStartMs: 1100, dDurationMs: 300, segs: [{ utf8: "how " }] },
    { tStartMs: 1450, dDurationMs: 300, segs: [{ utf8: "are " }] },
    { tStartMs: 1780, dDurationMs: 300, segs: [{ utf8: "you" }] },
    { tStartMs: 2100, dDurationMs: 300, segs: [{ utf8: "?" }] },
  ];

  const cuesA = stabilizer.buildCues({
    events,
    trackLang: "en",
    trackKey: "en::asr",
    source: "hook",
  });
  const cuesB = stabilizer.buildCues({
    events,
    trackLang: "en",
    trackKey: "en::asr",
    source: "hook",
  });

  assert.ok(cuesA.length >= 1);
  assert.deepEqual(
    cuesA.map((cue) => cue.cueId),
    cuesB.map((cue) => cue.cueId)
  );
  assert.ok(cuesA.every((cue) => cue.cueId.startsWith("yt:en::asr:")));
  assert.ok(cuesA.every((cue) => typeof cue.confidence === "number"));
});

test("CueTranslationQueue prevents re-request after markTranslated", () => {
  const queue = new CueTranslationQueue();
  assert.equal(queue.enqueue("cue-1", "hello"), true);
  assert.equal(queue.enqueue("cue-2", "world"), true);

  const batch = queue.take(2);
  assert.equal(batch.length, 2);

  queue.markTranslated(["cue-1"]);
  queue.clearInflight(["cue-2"]);
  queue.requeue([{ id: "cue-1", text: "hello" }, { id: "cue-2", text: "world" }]);

  const secondBatch = queue.take(2);
  assert.equal(secondBatch.length, 1);
  assert.equal(secondBatch[0].id, "cue-2");
});

test("DomFallbackCommitter commits on quiet timeout and dedupes repeated text by ttl", () => {
  const committer = new DomFallbackCommitter({
    quietMs: 700,
    forceMs: 1800,
    minWords: 2,
    minChars: 8,
    dedupeTtlMs: 12000,
  });

  const first = committer.ingest("window-0", "hello world", 1000, 1000);
  assert.equal(first, null);

  const committed = committer.ingest("window-0", "hello world", 1700, 1705);
  assert.ok(committed);
  assert.equal(committed.windowId, "window-0");

  const duplicated = committer.ingest("window-0", "hello world", 2500, 2505);
  assert.equal(duplicated, null);
});

test("selectActiveCue returns current cue and short tail hold cue", () => {
  const cues = [
    { cueId: "a", startMs: 1000, endMs: 2000 },
    { cueId: "b", startMs: 2200, endMs: 3200 },
  ];

  assert.equal(selectActiveCue(cues, 1500)?.cueId, "a");
  assert.equal(selectActiveCue(cues, 2500)?.cueId, "b");
  assert.equal(selectActiveCue(cues, 3600)?.cueId, "b");
  assert.equal(selectActiveCue(cues, 7000), null);
});

test("buildCueId stays stable for same inputs", () => {
  const id1 = buildCueId("en::asr", 100, 200, "hello");
  const id2 = buildCueId("en::asr", 100, 200, "hello");
  const id3 = buildCueId("en::asr", 100, 200, "world");

  assert.equal(id1, id2);
  assert.notEqual(id1, id3);
});

test("isLowConfidenceAsrWindow returns false for stable punctuated cues", () => {
  const cues = [
    { startMs: 0, endMs: 1800, text: "Hello world.", confidence: 0.82 },
    { startMs: 2000, endMs: 3700, text: "How are you?", confidence: 0.84 },
    { startMs: 3900, endMs: 5600, text: "This is stable.", confidence: 0.8 },
  ];
  assert.equal(isLowConfidenceAsrWindow(cues), false);
});
