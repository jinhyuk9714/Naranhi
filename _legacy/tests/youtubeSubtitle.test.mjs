import assert from "node:assert/strict";
import test from "node:test";
import ytLib from "../apps/extension/youtubeSubtitle.js";

const { normalizeCaptionText, RecentCaptionDeduper, WindowPendingQueue } = ytLib;

test("normalizeCaptionText filters empty/music-only/oversized input", () => {
  assert.equal(normalizeCaptionText(""), "");
  assert.equal(normalizeCaptionText(" "), "");
  assert.equal(normalizeCaptionText("♪♪♪"), "");
  assert.equal(normalizeCaptionText("A"), "");
  assert.equal(normalizeCaptionText("x".repeat(241)), "");
  assert.equal(normalizeCaptionText("Hello world"), "Hello world");
});

test("RecentCaptionDeduper blocks same window+text within ttl", () => {
  const deduper = new RecentCaptionDeduper(8000, 120);
  const now = 1000;

  assert.equal(deduper.shouldEnqueue("window-0", "hello", now), true);
  assert.equal(deduper.shouldEnqueue("window-0", "hello", now + 100), false);
  assert.equal(deduper.shouldEnqueue("window-1", "hello", now + 100), true);
  assert.equal(deduper.shouldEnqueue("window-0", "hello", now + 8100), true);
});

test("WindowPendingQueue keeps latest text per window and enforces take size", () => {
  const queue = new WindowPendingQueue();
  queue.enqueue("window-0", "first");
  queue.enqueue("window-0", "latest");
  queue.enqueue("window-1", "line 1");
  queue.enqueue("window-2", "line 2");

  const batch = queue.take(2);
  assert.equal(batch.length, 2);
  assert.equal(batch[0].id, "window-0");
  assert.equal(batch[0].text, "latest");
  assert.equal(batch[1].id, "window-1");
  assert.equal(queue.pendingSize(), 1);
});

test("WindowPendingQueue handles empty pending batch and requeue", () => {
  const queue = new WindowPendingQueue();
  assert.deepEqual(queue.take(6), []);
  assert.equal(queue.hasPending(), false);

  queue.enqueue("window-0", "hello");
  const batch = queue.take(6);
  assert.equal(batch.length, 1);
  queue.requeue(batch);
  assert.equal(queue.hasPending(), true);
  assert.equal(queue.take(6).length, 1);
});
