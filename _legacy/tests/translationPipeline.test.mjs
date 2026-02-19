import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";
import {
  LIMITS,
  buildBatches,
  buildCacheKeyMaterial,
  buildRequestPayload,
  estimatePayloadBytes,
  normalizeText,
  sha256Hex,
  splitTextByLimit,
} from "../apps/extension/translationPipeline.mjs";

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

test("buildBatches keeps item/char/byte limits", () => {
  const items = Array.from({ length: 120 }, (_, idx) => ({
    id: `id-${idx}`,
    text: `Sentence ${idx} ${"x".repeat(600)}`,
  }));

  const batches = buildBatches({
    items,
    targetLang: "KO",
    sourceLang: "EN",
    options: { preserve_formatting: true },
    limits: LIMITS,
  });

  assert.ok(batches.length > 1);
  for (const batch of batches) {
    assert.ok(batch.length <= LIMITS.MAX_ITEMS_PER_BATCH);
    const chars = batch.reduce((sum, item) => sum + item.text.length, 0);
    assert.ok(chars <= LIMITS.MAX_CHARS_PER_BATCH);

    const payload = buildRequestPayload(batch, "KO", "EN", { preserve_formatting: true });
    const bytes = estimatePayloadBytes(payload);
    assert.ok(bytes <= LIMITS.MAX_BODY_BYTES);
  }
});

test("splitTextByLimit chunks long text and preserves normalized order", () => {
  const longText = Array.from({ length: 80 }, (_, idx) => `Sentence ${idx}!`).join(" ");
  const chunks = splitTextByLimit(longText, 120);
  assert.ok(chunks.length > 1);

  for (const chunk of chunks) {
    assert.ok(chunk.length <= 120);
  }

  assert.equal(normalizeText(chunks.join(" ")), normalizeText(longText));
});

test("cache key material and hash are stable", async () => {
  const base = {
    text: "  hello    world ",
    sourceLang: "en",
    targetLang: "ko",
    options: { preserve_formatting: true, formality: "default" },
  };

  const material1 = buildCacheKeyMaterial(base);
  const material2 = buildCacheKeyMaterial({
    text: "hello world",
    sourceLang: "en",
    targetLang: "ko",
    options: { formality: "default", preserve_formatting: true },
  });

  assert.equal(material1, material2);
  assert.equal(await sha256Hex(material1), await sha256Hex(material2));

  const material3 = buildCacheKeyMaterial({
    ...base,
    options: { preserve_formatting: false, formality: "default" },
  });
  assert.notEqual(material1, material3);
});

test("same normalized text yields same hashed cache key for dedupe", async () => {
  const key1 = await sha256Hex(
    buildCacheKeyMaterial({
      text: "same text",
      sourceLang: "",
      targetLang: "KO",
      options: {},
    })
  );
  const key2 = await sha256Hex(
    buildCacheKeyMaterial({
      text: "  same   text ",
      sourceLang: "",
      targetLang: "KO",
      options: {},
    })
  );

  assert.equal(key1, key2);
});
