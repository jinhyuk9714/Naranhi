/* Minimal vendored Readability-compatible interface for extension runtime. */
(function attachReadability(root) {
  function normalizeText(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function collectBlocks(container) {
    const selector = "p,li,blockquote,h1,h2,h3,h4,h5,h6";
    return Array.from(container.querySelectorAll(selector));
  }

  function scoreContainer(container) {
    const blocks = collectBlocks(container);
    if (!blocks.length) {
      return normalizeText(container.textContent || "").length;
    }

    let score = 0;
    for (const block of blocks) {
      const text = normalizeText(block.textContent || "");
      if (text.length < 20) continue;
      score += Math.min(text.length, 320);
    }

    score += Math.min(container.querySelectorAll("img,figure,video").length * 12, 96);
    return score;
  }

  class Readability {
    constructor(doc) {
      this._doc = doc;
    }

    parse() {
      if (!this._doc || !this._doc.body) return null;

      const candidates = [];
      const seen = new Set();
      const pushUnique = (el) => {
        if (!el || seen.has(el)) return;
        seen.add(el);
        candidates.push(el);
      };

      for (const el of this._doc.querySelectorAll("article,main,[role='main'],section,div")) {
        pushUnique(el);
      }
      pushUnique(this._doc.body);

      let best = null;
      let bestScore = -1;
      for (const candidate of candidates) {
        const score = scoreContainer(candidate);
        if (score > bestScore) {
          bestScore = score;
          best = candidate;
        }
      }

      if (!best) return null;

      const textContent = normalizeText(best.innerText || best.textContent || "");
      if (!textContent) return null;

      return {
        title: this._doc.title || "",
        byline: null,
        dir: null,
        lang: this._doc.documentElement?.lang || "",
        content: best.innerHTML || "",
        textContent,
        excerpt: textContent.slice(0, 200),
        length: textContent.length,
        containerHint: {
          tagName: (best.tagName || "").toLowerCase(),
          id: best.id || "",
          className: best.className || "",
        },
      };
    }
  }

  root.Readability = Readability;
})(typeof globalThis !== "undefined" ? globalThis : this);
