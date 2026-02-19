import assert from "node:assert/strict";
import test from "node:test";
import asrLib from "../apps/extension/youtubeAsrStabilizer.js";

const { ManualCaptionSentenceMerger, isLowConfidenceAsrWindow } = asrLib;

test("ManualCaptionSentenceMerger merges short continuation cues", () => {
  const merger = new ManualCaptionSentenceMerger({
    maxGapMs: 250,
    maxChars: 220,
    maxDurationMs: 7000,
  });

  const events = [
    { tStartMs: 0, dDurationMs: 500, segs: [{ utf8: "This is" }] },
    { tStartMs: 520, dDurationMs: 480, segs: [{ utf8: "a simple test" }] },
    { tStartMs: 1020, dDurationMs: 500, segs: [{ utf8: "." }] },
    { tStartMs: 2300, dDurationMs: 600, segs: [{ utf8: "Next sentence starts." }] },
  ];

  const cues = merger.buildCues({
    events,
    trackKey: "en::track::demo",
    source: "hook",
  });

  assert.equal(cues.length, 2);
  assert.equal(cues[0].text, "This is a simple test");
  assert.equal(cues[1].text, "Next sentence starts.");
});

test("isLowConfidenceAsrWindow detects over-segmented no-punctuation streams", () => {
  const cues = [];
  for (let i = 0; i < 10; i += 1) {
    cues.push({
      startMs: i * 500,
      endMs: i * 500 + 300,
      text: `word ${i}`,
      confidence: 0.35,
    });
  }

  assert.equal(isLowConfidenceAsrWindow(cues), true);
});
