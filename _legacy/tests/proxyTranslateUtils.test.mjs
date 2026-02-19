import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDeepLBody,
  isJsonContentType,
  mapDeepLError,
  mapErrorToResponse,
  normalizeTranslatePayload,
  proxyError,
  resolveAllowedOrigin,
} from "../apps/proxy/translateUtils.mjs";

test("normalizeTranslatePayload validates and normalizes request", () => {
  const payload = normalizeTranslatePayload({
    items: [
      { id: "a", text: "  hello   world " },
      { id: "b", text: "bonjour" },
    ],
    target_lang: "ko",
    source_lang: "en",
    options: {
      preserve_formatting: true,
      split_sentences: 0,
      model_type: "prefer_quality_optimized",
      unknown_option: "ignored",
    },
  });

  assert.equal(payload.target_lang, "KO");
  assert.equal(payload.source_lang, "EN");
  assert.equal(payload.items[0].text, "hello world");
  assert.equal(payload.options.preserve_formatting, true);
  assert.equal(payload.options.split_sentences, "0");
  assert.equal(payload.options.model_type, "prefer_quality_optimized");
  assert.equal(Object.hasOwn(payload.options, "unknown_option"), false);
});

test("normalizeTranslatePayload clamps context and drops invalid option values", () => {
  const payload = normalizeTranslatePayload({
    items: [{ id: "a", text: "hello" }],
    target_lang: "KO",
    options: {
      split_sentences: "unsupported",
      model_type: "unknown-model",
      context: "a".repeat(2500),
    },
  });

  assert.equal(payload.options.split_sentences, undefined);
  assert.equal(payload.options.model_type, undefined);
  assert.equal(payload.options.context.length, 2000);
});

test("normalizeTranslatePayload supports legacy text array input", () => {
  const payload = normalizeTranslatePayload({
    text: ["a", "b"],
    target_lang: "EN",
  });

  assert.equal(payload.items.length, 2);
  assert.equal(payload.items[0].id, "0");
  assert.equal(payload.items[1].id, "1");
});

test("normalizeTranslatePayload throws BAD_REQUEST on missing target_lang", () => {
  assert.throws(
    () => normalizeTranslatePayload({ items: [{ id: "a", text: "x" }] }),
    (err) => err.code === "BAD_REQUEST" && err.statusCode === 400
  );
});

test("buildDeepLBody converts normalized payload to DeepL schema", () => {
  const payload = normalizeTranslatePayload({
    items: [{ id: "a", text: "hello" }],
    target_lang: "KO",
    source_lang: "EN",
    options: { preserve_formatting: true },
  });

  const body = buildDeepLBody(payload);
  assert.deepEqual(body.text, ["hello"]);
  assert.equal(body.target_lang, "KO");
  assert.equal(body.source_lang, "EN");
  assert.equal(body.preserve_formatting, true);
});

test("mapDeepLError maps status codes to stable error codes", () => {
  assert.deepEqual(mapDeepLError(401), { code: "DEEPL_AUTH", retryable: false, statusCode: 401 });
  assert.deepEqual(mapDeepLError(429), { code: "DEEPL_RATE_LIMIT", retryable: true, statusCode: 429 });
  assert.deepEqual(mapDeepLError(456), { code: "DEEPL_QUOTA", retryable: false, statusCode: 456 });
  assert.deepEqual(mapDeepLError(503), { code: "UNKNOWN", retryable: true, statusCode: 503 });
});

test("mapErrorToResponse serializes proxyError safely", () => {
  const err = proxyError("DEEPL_AUTH", "Invalid key", 403, false);
  const out = mapErrorToResponse(err);

  assert.equal(out.statusCode, 403);
  assert.equal(out.error.code, "DEEPL_AUTH");
  assert.equal(out.error.message, "Invalid key");
  assert.equal(out.error.retryable, false);
});

test("isJsonContentType accepts application/json with optional charset", () => {
  assert.equal(isJsonContentType("application/json"), true);
  assert.equal(isJsonContentType("application/json; charset=utf-8"), true);
  assert.equal(isJsonContentType("text/plain"), false);
  assert.equal(isJsonContentType(undefined), false);
});

test("resolveAllowedOrigin handles local/default and allowlist patterns", () => {
  assert.equal(resolveAllowedOrigin("chrome-extension://abcd", "local"), "chrome-extension://abcd");
  assert.equal(resolveAllowedOrigin("http://localhost:3000", "local"), "http://localhost:3000");
  assert.equal(resolveAllowedOrigin("https://evil.example", "local"), null);

  assert.equal(resolveAllowedOrigin("https://app.example", "https://app.example"), "https://app.example");
  assert.equal(resolveAllowedOrigin("chrome-extension://xyz", "chrome-extension://*"), "chrome-extension://xyz");
  assert.equal(resolveAllowedOrigin("https://evil.example", "https://app.example,chrome-extension://*"), null);

  assert.equal(resolveAllowedOrigin("https://any.example", "*"), "*");
});
