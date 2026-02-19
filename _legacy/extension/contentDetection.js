(function factory(root, create) {
  if (typeof module === "object" && module.exports) {
    module.exports = create();
    return;
  }
  root.NaranhiContentDetection = create();
})(typeof globalThis !== "undefined" ? globalThis : this, function buildContentDetection() {
  const ROOT_SELECTORS = ["article", "main", "[role='main']", "body"];

  function normalizeText(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function tokenize(text) {
    return normalizeText(text)
      .toLowerCase()
      .split(/[^a-z0-9\u00c0-\u024f\u0400-\u04ff\u3040-\u30ff\u4e00-\u9fff]+/i)
      .filter((token) => token.length > 2);
  }

  function tokenOverlapRatio(source, target) {
    const sourceTokens = tokenize(source).slice(0, 120);
    if (!sourceTokens.length) return 0;

    const targetSet = new Set(tokenize(target));
    let matched = 0;
    for (const token of sourceTokens) {
      if (targetSet.has(token)) matched += 1;
    }
    return matched / sourceTokens.length;
  }

  function classOverlapScore(a, b) {
    const setA = new Set(String(a || "").split(/\s+/).filter(Boolean));
    const setB = new Set(String(b || "").split(/\s+/).filter(Boolean));
    if (!setA.size || !setB.size) return 0;

    let overlap = 0;
    for (const cls of setA) {
      if (setB.has(cls)) overlap += 1;
    }
    return overlap / Math.max(setA.size, setB.size);
  }

  function computeCandidateContentScore(element) {
    if (!element) return 0;
    const blocks = element.querySelectorAll("p,li,blockquote,h1,h2,h3,h4,h5,h6");
    if (!blocks.length) {
      return normalizeText(element.innerText || element.textContent || "").length;
    }

    let score = 0;
    for (const block of blocks) {
      const text = normalizeText(block.innerText || block.textContent || "");
      if (text.length < 20) continue;
      score += Math.min(320, text.length);
    }
    return score;
  }

  function getPrimaryCandidates(doc) {
    if (!doc || !doc.body) return [];
    const seen = new Set();
    const out = [];

    for (const selector of ROOT_SELECTORS) {
      for (const element of doc.querySelectorAll(selector)) {
        if (seen.has(element)) continue;
        seen.add(element);
        out.push(element);
      }
    }
    if (!seen.has(doc.body)) out.push(doc.body);
    return out;
  }

  function pickBestCandidate(candidates, signal) {
    if (!candidates.length) return null;

    const snippet = normalizeText(signal?.textContent || "").slice(0, 1600);
    const hint = signal?.containerHint || {};

    let best = null;
    let bestScore = -1;
    for (const candidate of candidates) {
      const text = normalizeText(candidate.innerText || candidate.textContent || "");
      if (!text) continue;

      let score = computeCandidateContentScore(candidate) * 0.001;
      if (hint.id && candidate.id === hint.id) score += 120;
      if (hint.tagName && String(candidate.tagName || "").toLowerCase() === String(hint.tagName).toLowerCase()) {
        score += 15;
      }
      if (hint.className) score += classOverlapScore(candidate.className, hint.className) * 20;
      if (snippet) score += tokenOverlapRatio(snippet, text) * 100;

      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
    return best;
  }

  function pickHeuristicCandidate(candidates) {
    if (!candidates.length) return null;
    let best = candidates[0];
    let bestScore = computeCandidateContentScore(best);

    for (const candidate of candidates.slice(1)) {
      const score = computeCandidateContentScore(candidate);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    return best;
  }

  function detectPrimaryContainer(doc) {
    const candidates = getPrimaryCandidates(doc);
    if (!candidates.length) return doc?.body || null;

    try {
      if (typeof Readability === "function") {
        const clonedDoc = doc.cloneNode(true);
        const parsed = new Readability(clonedDoc).parse();
        const matched = pickBestCandidate(candidates, parsed);
        if (matched) return matched;
      }
    } catch {
      // fallback below
    }
    return pickHeuristicCandidate(candidates);
  }

  return {
    detectPrimaryContainer,
    getPrimaryCandidates,
    pickBestCandidate,
    pickHeuristicCandidate,
    __test__: {
      normalizeText,
      tokenOverlapRatio,
      classOverlapScore,
    },
  };
});
