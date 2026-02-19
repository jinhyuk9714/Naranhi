import assert from "node:assert/strict";
import test from "node:test";
import renderLib from "../apps/extension/youtubeRenderPolicy.js";

const { cueTextSimilarity, selectCueByTimeAndText, resolveRenderText } = renderLib;

test("cueTextSimilarity returns higher score for overlapping tokens", () => {
  const near = cueTextSimilarity("hello world from youtube", "hello world");
  const far = cueTextSimilarity("hello world from youtube", "completely different");
  assert.ok(near > far);
});

test("selectCueByTimeAndText prefers matching cue near current time", () => {
  const cues = [
    { cueId: "a", startMs: 1000, endMs: 2000, text: "first example line", confidence: 0.7 },
    { cueId: "b", startMs: 2100, endMs: 3200, text: "second target phrase", confidence: 0.7 },
  ];

  const picked = selectCueByTimeAndText(cues, 2500, "target phrase shown");
  assert.equal(picked?.cueId, "b");
});

test("resolveRenderText keeps previous text within hold window", () => {
  const first = resolveRenderText("translated line", null, 1000, 900);
  assert.equal(first.text, "translated line");

  const hold = resolveRenderText("", first.state, 1700, 900);
  assert.equal(hold.text, "translated line");

  const expired = resolveRenderText("", first.state, 2200, 900);
  assert.equal(expired.text, "");
});

