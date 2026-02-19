import assert from "node:assert/strict";
import test from "node:test";
import visibleQueueLib from "../apps/extension/visibleQueue.js";

const { VisibleTranslationQueue } = visibleQueueLib;

test("queue dedupes ids and takes limited batch", () => {
  const queue = new VisibleTranslationQueue();
  queue.enqueueMany(["a", "b", "a", "c"]);

  const first = queue.take(2);
  assert.deepEqual(first, ["a", "b"]);
  assert.equal(queue.pendingSize ? queue.pendingSize() : queue.pendingQueue.length, 1);
});

test("translated and inflight state transitions stay consistent", () => {
  const queue = new VisibleTranslationQueue();
  queue.enqueueMany(["x", "y"]);
  const ids = queue.take(5);
  assert.deepEqual(ids, ["x", "y"]);

  queue.markTranslated(["x"]);
  queue.clearInflight(["y"]);

  // translated ids should not re-enqueue; cleared inflight can re-enqueue.
  assert.equal(queue.enqueue("x"), false);
  assert.equal(queue.enqueue("y"), true);

  const next = queue.take(5);
  assert.deepEqual(next, ["y"]);
});
