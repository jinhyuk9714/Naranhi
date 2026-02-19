(function factory(root, create) {
  if (typeof module === "object" && module.exports) {
    module.exports = create();
    return;
  }
  root.NaranhiYouTubeRender = create();
})(typeof globalThis !== "undefined" ? globalThis : this, function buildYouTubeRenderPolicy() {
  const DEFAULT_HOLD_MS = 900;
  const WINDOW_MATCH_MS = 6000;

  function normalizeText(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function tokenize(text) {
    return normalizeText(text)
      .toLowerCase()
      .split(/[^a-z0-9\u00c0-\u024f\u0400-\u04ff\u3040-\u30ff\u3400-\u9fff]+/u)
      .filter(Boolean);
  }

  function cueTextSimilarity(left, right) {
    const leftTokens = new Set(tokenize(left));
    const rightTokens = new Set(tokenize(right));
    if (!leftTokens.size || !rightTokens.size) return 0;

    let intersection = 0;
    for (const token of leftTokens) {
      if (rightTokens.has(token)) intersection += 1;
    }

    const union = leftTokens.size + rightTokens.size - intersection;
    if (!union) return 0;
    return intersection / union;
  }

  function proximityScore(cue, videoMs) {
    const start = Number(cue?.startMs || 0);
    const end = Number(cue?.endMs || 0);
    if (videoMs >= start && videoMs <= end) return 1;

    const dist = videoMs < start ? start - videoMs : videoMs - end;
    if (dist >= WINDOW_MATCH_MS) return 0;
    return 1 - dist / WINDOW_MATCH_MS;
  }

  function selectCueByTimeAndText(cues, videoMs, windowText, selectActiveCueFn) {
    const list = Array.isArray(cues) ? cues : [];
    if (!list.length) return null;

    const time = Number.isFinite(videoMs) ? videoMs : 0;
    const normalizedWindowText = normalizeText(windowText);
    const pickActive = typeof selectActiveCueFn === "function" ? selectActiveCueFn : null;

    let bestCue = null;
    let bestScore = -1;

    for (const cue of list) {
      const prox = proximityScore(cue, time);
      if (prox <= 0) continue;

      const similarity = normalizedWindowText ? cueTextSimilarity(normalizedWindowText, cue?.text || "") : 0;
      const cueConfidence = Number(cue?.confidence || 0);
      const score = prox * 2 + similarity * 2 + cueConfidence * 0.5;

      if (score > bestScore) {
        bestScore = score;
        bestCue = cue;
      }
    }

    if (bestCue) return bestCue;
    return pickActive ? pickActive(list, time) : null;
  }

  function resolveRenderText(translatedText, previousState, nowMs, holdMs = DEFAULT_HOLD_MS) {
    const now = Number.isFinite(nowMs) ? nowMs : Date.now();
    const hold = Number.isFinite(holdMs) ? Math.max(0, Math.floor(holdMs)) : DEFAULT_HOLD_MS;
    const state = previousState && typeof previousState === "object"
      ? { lastText: normalizeText(previousState.lastText || ""), lastShownAt: Number(previousState.lastShownAt || 0) }
      : { lastText: "", lastShownAt: 0 };

    const current = normalizeText(translatedText);
    if (current) {
      return {
        text: current,
        state: {
          lastText: current,
          lastShownAt: now,
        },
      };
    }

    if (state.lastText && now - state.lastShownAt <= hold) {
      return { text: state.lastText, state };
    }

    return {
      text: "",
      state: {
        lastText: "",
        lastShownAt: 0,
      },
    };
  }

  return {
    DEFAULT_HOLD_MS,
    normalizeText,
    cueTextSimilarity,
    selectCueByTimeAndText,
    resolveRenderText,
  };
});
