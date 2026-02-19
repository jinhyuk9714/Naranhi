import assert from "node:assert/strict";
import test from "node:test";
import contentDetectionLib from "../apps/extension/contentDetection.js";

const { detectPrimaryContainer, pickBestCandidate, pickHeuristicCandidate, __test__ } = contentDetectionLib;

function createCandidate({ id, tagName = "ARTICLE", className = "", text }) {
  const segments = String(text || "")
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);

  const blocks = segments.map((segment) => ({ innerText: segment, textContent: segment }));
  const flattened = segments.join(" ");

  return {
    id,
    tagName,
    className,
    innerText: flattened,
    textContent: flattened,
    querySelectorAll() {
      return blocks;
    },
  };
}

test("pickBestCandidate prefers matching readability hint and text overlap", () => {
  const a = createCandidate({
    id: "main",
    tagName: "MAIN",
    className: "article content",
    text: "This is the detailed tutorial content.|It has many paragraphs and examples.",
  });
  const b = createCandidate({
    id: "sidebar",
    tagName: "ASIDE",
    className: "sidebar links",
    text: "Menu links.|Short snippets.",
  });

  const picked = pickBestCandidate([a, b], {
    textContent: "detailed tutorial content with many examples and paragraphs",
    containerHint: { id: "main", tagName: "main", className: "content article" },
  });

  assert.equal(picked, a);
});

test("pickHeuristicCandidate falls back to richer text container", () => {
  const short = createCandidate({
    id: "short",
    text: "One line only.",
  });
  const long = createCandidate({
    id: "long",
    text: "Long paragraph with substantial text content for article detection.|Another long paragraph here.",
  });

  assert.equal(pickHeuristicCandidate([short, long]), long);
});

test("token overlap helper rewards semantic similarity", () => {
  const overlap = __test__.tokenOverlapRatio(
    "alpha beta gamma delta",
    "beta gamma and unrelated terms"
  );
  assert.ok(overlap > 0.4);
});

test("detectPrimaryContainer falls back to heuristic when Readability is unavailable", () => {
  const short = createCandidate({ id: "short", tagName: "MAIN", text: "small text" });
  const rich = createCandidate({
    id: "rich",
    tagName: "ARTICLE",
    text: "This is a large body of article text.|Another detailed paragraph for reading mode.",
  });

  const doc = {
    body: rich,
    querySelectorAll(selector) {
      if (selector === "article") return [rich];
      if (selector === "main") return [short];
      if (selector === "[role='main']") return [];
      if (selector === "body") return [rich];
      return [];
    },
    cloneNode() {
      return this;
    },
  };

  const picked = detectPrimaryContainer(doc);
  assert.equal(picked, rich);
});
