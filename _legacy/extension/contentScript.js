let enabled = false;
let activeRunId = null;
let activeSettings = null;
let injected = [];
let tooltipEl = null;
let tooltipHideTimer = null;
let tooltipPointerHandler = null;
let tooltipKeyHandler = null;
let bannerEl = null;
let elementIdSeed = 0;
let observer = null;
let flushTimer = null;
let isFlushing = false;
let lastFailedIds = [];

let ytSubtitleEnabled = false;
let ytSubtitleRunId = null;
let ytCaptionContainer = null;
let ytCaptionObserver = null;
let ytContainerCheckTimer = null;
let ytFlushTimer = null;
let ytCollectTimer = null;
let ytRenderTimer = null;
let ytFallbackCheckTimer = null;
let ytBridgeMessageHandler = null;
let ytIsFlushing = false;
let ytWindowElements = new Map();
let ytLastFailedItems = [];
let ytHookDetectedAt = 0;
let ytHookParseFailures = 0;
let ytFallbackMode = false;
let ytPrimaryTrackKey = "";
let ytNoCaptionDeadlineAt = 0;
let ytNoCaptionNotified = false;
let ytSubtitleStartedAt = 0;
let ytTrackStates = new Map();
let ytDomWindowCues = new Map();
let ytCueById = new Map();
let ytTranslatedByCueId = new Map();
let ytSeenHookResponses = new Map();
let ytRenderStates = new Map();
let ytRecentSourceTexts = [];
let ytAiSegmentEnabled = null;

let translationItemsById = new Map();
let translationNodesById = new Map();
let queue = createQueue();

const DEFAULT_SETTINGS = {
  extractionMode: "readability",
  visibleOnly: true,
  visibleRootMargin: "350px 0px 600px 0px",
  batchFlushMs: 120,
};

const MAX_VISIBLE_BATCH_ITEMS = 20;
const YT_FLUSH_MS = 150;
const YT_MAX_ITEMS_PER_FLUSH = 6;
const YT_CAPTION_MIN_LENGTH = 2;
const YT_CAPTION_MAX_LENGTH = 240;
const YT_CONTAINER_WAIT_TIMEOUT_MS = 10000;
const YT_NO_CAPTION_TIMEOUT_MS = 20000;
const YT_CONTAINER_CHECK_INTERVAL_MS = 500;
const YT_COLLECT_DEBOUNCE_MS = 120;
const YT_RENDER_MS = 120;
const YT_HOOK_EVENT_TYPE = "NARANHI_YT_TIMEDTEXT_V1";
const YT_HOOK_IDLE_FALLBACK_MS = 2500;
const YT_HOOK_DEDUPE_TTL_MS = 60000;
const YT_HOOK_PARSE_ERROR_LIMIT = 3;
const YT_HOOK_MAX_EVENTS = 6000;
const YT_TRACK_MAX_CUES = 300;
const YT_TRACK_PRUNE_BEFORE_MS = 45000;
const YT_DOM_QUIET_COMMIT_MS = 700;
const YT_DOM_FORCE_COMMIT_MS = 1800;
const YT_DOM_DEDUPE_TTL_MS = 12000;
const YT_RENDER_HOLD_MS = 900;
const YT_CONTEXT_MAX_CHARS = 800;
const YT_CONTEXT_HISTORY_SIZE = 12;
const YT_CONTEXT_SENTENCE_COUNT = 4;
const YT_AI_SEGMENT_MAX_CUES = 12;
const YT_AI_SEGMENT_REQUEST_TIMEOUT_MS = 900;
const ytSubtitleQueue = createYouTubeCueQueue();
const ytAsrStabilizer = createYouTubeAsrStabilizer();
const ytManualMerger = createYouTubeManualMerger();
const ytDomCommitter = createYouTubeDomCommitter();

function createQueue() {
  const QueueClass = globalThis.NaranhiVisibleQueue?.VisibleTranslationQueue;
  if (QueueClass) return new QueueClass();

  class FallbackQueue {
    constructor() {
      this.pendingQueue = [];
      this.queuedIds = new Set();
      this.translatedIds = new Set();
      this.inflightIds = new Set();
    }

    enqueue(id) {
      const key = String(id || "").trim();
      if (!key) return false;
      if (this.queuedIds.has(key) || this.translatedIds.has(key) || this.inflightIds.has(key)) return false;
      this.queuedIds.add(key);
      this.pendingQueue.push(key);
      return true;
    }

    enqueueMany(ids) {
      for (const id of ids || []) this.enqueue(id);
    }

    take(maxItems) {
      const max = Math.max(1, Number(maxItems) || 1);
      const out = [];

      while (out.length < max && this.pendingQueue.length) {
        const id = this.pendingQueue.shift();
        this.queuedIds.delete(id);
        if (this.translatedIds.has(id) || this.inflightIds.has(id)) continue;
        this.inflightIds.add(id);
        out.push(id);
      }

      return out;
    }

    markTranslated(ids) {
      for (const id of ids || []) {
        const key = String(id || "").trim();
        if (!key) continue;
        this.translatedIds.add(key);
        this.inflightIds.delete(key);
        this.queuedIds.delete(key);
      }
    }

    clearInflight(ids) {
      for (const id of ids || []) {
        const key = String(id || "").trim();
        if (!key) continue;
        this.inflightIds.delete(key);
      }
    }

    hasPending() {
      return this.pendingQueue.length > 0;
    }

    reset() {
      this.pendingQueue = [];
      this.queuedIds.clear();
      this.translatedIds.clear();
      this.inflightIds.clear();
    }
  }

  return new FallbackQueue();
}

function createYouTubeCueQueue() {
  const QueueClass = globalThis.NaranhiYouTubeASR?.CueTranslationQueue;
  if (QueueClass) return new QueueClass();

  return {
    pending: new Map(),
    inflight: new Map(),
    translated: new Set(),
    enqueue(id, text) {
      const key = String(id || "").trim();
      const value = normalizeText(text);
      if (!key || !value || this.translated.has(key)) return false;
      this.pending.set(key, value);
      return true;
    },
    take(maxItems) {
      const max = Number.isFinite(maxItems) ? Math.max(1, Math.floor(maxItems)) : 1;
      const batch = [];
      for (const [id, text] of this.pending) {
        if (batch.length >= max) break;
        if (this.inflight.has(id) || this.translated.has(id)) continue;
        batch.push({ id, text });
      }
      for (const item of batch) {
        this.pending.delete(item.id);
        this.inflight.set(item.id, item.text);
      }
      return batch;
    },
    markTranslated(ids) {
      for (const id of ids || []) {
        const key = String(id || "").trim();
        if (!key) continue;
        this.translated.add(key);
        this.pending.delete(key);
        this.inflight.delete(key);
      }
    },
    clearInflight(ids) {
      for (const id of ids || []) {
        const key = String(id || "").trim();
        if (!key) continue;
        this.inflight.delete(key);
      }
    },
    requeue(items) {
      for (const item of items || []) {
        const id = String(item?.id || "").trim();
        const text = normalizeText(item?.text || "");
        if (!id || !text || this.translated.has(id)) continue;
        this.inflight.delete(id);
        this.pending.set(id, text);
      }
    },
    hasTranslated(id) {
      const key = String(id || "").trim();
      return this.translated.has(key);
    },
    hasPending() {
      return this.pending.size > 0;
    },
    reset() {
      this.pending.clear();
      this.inflight.clear();
      this.translated.clear();
    },
  };
}

function createYouTubeAsrStabilizer() {
  const StabilizerClass = globalThis.NaranhiYouTubeASR?.YouTubeAsrStabilizer;
  if (StabilizerClass) return new StabilizerClass({ maxEvents: YT_HOOK_MAX_EVENTS });

  return {
    buildCues() {
      return [];
    },
  };
}

function createYouTubeManualMerger() {
  const MergerClass = globalThis.NaranhiYouTubeASR?.ManualCaptionSentenceMerger;
  if (MergerClass) return new MergerClass();

  return {
    buildCues() {
      return [];
    },
  };
}

function createYouTubeDomCommitter() {
  const CommitterClass = globalThis.NaranhiYouTubeASR?.DomFallbackCommitter;
  if (CommitterClass) {
    return new CommitterClass({
      quietMs: YT_DOM_QUIET_COMMIT_MS,
      forceMs: YT_DOM_FORCE_COMMIT_MS,
      minWords: 2,
      minChars: 8,
      dedupeTtlMs: YT_DOM_DEDUPE_TTL_MS,
    });
  }

  return {
    ingest() {
      return null;
    },
    flush() {
      return [];
    },
    dropMissingWindows() {},
    reset() {},
  };
}

function normalizeText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function ensureStyles() {
  if (document.getElementById("dualread-style")) return;
  const style = document.createElement("style");
  style.id = "dualread-style";
  style.textContent = `
    .dualread-translation {
      margin-top: 6px;
      font-size: 0.95em;
      line-height: 1.35;
      opacity: 0.9;
      border-left: 3px solid rgba(0, 0, 0, 0.15);
      padding-left: 10px;
    }
    .dualread-tooltip {
      position: absolute;
      z-index: 2147483647;
      max-width: 360px;
      background: #111;
      color: #fff;
      padding: 10px 12px;
      border-radius: 8px;
      font-size: 13px;
      line-height: 1.35;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
      white-space: pre-wrap;
    }
    .naranhi-yt-translation {
      display: block;
      margin-top: 0.22em;
      font-size: inherit;
      line-height: inherit;
      font-weight: inherit;
      font-family: inherit;
      color: inherit;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.92);
      pointer-events: none;
      word-break: break-word;
      opacity: 1;
      letter-spacing: 0.01em;
    }
    .naranhi-yt-translation .ytp-caption-segment {
      background: rgba(8, 8, 8, 0.72);
      border-radius: 2px;
      padding: 0 0.15em;
      font-size: inherit;
      line-height: inherit;
      font-family: inherit;
      font-weight: inherit;
      color: inherit;
    }
    .dualread-banner {
      position: fixed;
      top: 16px;
      right: 16px;
      z-index: 2147483647;
      max-width: 420px;
      background: #fff5f5;
      color: #7a1c1c;
      border: 1px solid #f2bbbb;
      border-radius: 10px;
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.18);
      padding: 10px 12px;
      font: 13px/1.4 system-ui, -apple-system, sans-serif;
    }
    .dualread-banner-row {
      display: flex;
      gap: 8px;
      align-items: center;
      margin-top: 8px;
    }
    .dualread-banner button {
      border: 1px solid #c76a6a;
      color: #7a1c1c;
      background: #fff;
      border-radius: 6px;
      padding: 4px 8px;
      cursor: pointer;
    }
  `;
  document.documentElement.appendChild(style);
}

function createRunId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function getElementId(el) {
  if (el.dataset.dualreadId) return el.dataset.dualreadId;
  elementIdSeed += 1;
  const id = `dualread-${Date.now().toString(36)}-${elementIdSeed}`;
  el.dataset.dualreadId = id;
  return id;
}

function isBlockedElement(el) {
  return Boolean(el.closest("nav,header,footer,aside,script,style,noscript,code,pre"));
}

function isVisibleNode(el) {
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function getScopedCandidates(root) {
  const selectors = ["p", "li", "blockquote", "h1", "h2", "h3", "h4", "h5", "h6"];
  const out = [];

  if (root?.matches && root.matches(selectors.join(","))) {
    out.push(root);
  }

  for (const el of root.querySelectorAll(selectors.join(","))) {
    out.push(el);
  }

  return out;
}

function sanitizeSettings(raw) {
  const extractionMode = raw?.extractionMode === "legacy" ? "legacy" : "readability";
  const visibleOnly = raw?.visibleOnly !== false;
  const visibleRootMargin = normalizeText(raw?.visibleRootMargin || DEFAULT_SETTINGS.visibleRootMargin) || DEFAULT_SETTINGS.visibleRootMargin;

  const flush = Number(raw?.batchFlushMs);
  const batchFlushMs = Number.isFinite(flush)
    ? Math.min(1000, Math.max(20, Math.floor(flush)))
    : DEFAULT_SETTINGS.batchFlushMs;

  return { extractionMode, visibleOnly, visibleRootMargin, batchFlushMs };
}

async function loadTranslationSettings() {
  const raw = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return sanitizeSettings(raw);
}

function detectRootContainer(settings) {
  if (settings.extractionMode === "legacy") return document.body;

  try {
    const detector = globalThis.NaranhiContentDetection?.detectPrimaryContainer;
    if (typeof detector === "function") {
      const root = detector(document);
      if (root) return root;
    }
  } catch {
    // fallback below
  }

  return document.body;
}

function buildItems(settings) {
  const root = detectRootContainer(settings);
  const candidates = getScopedCandidates(root || document.body);
  const items = [];

  for (const el of candidates) {
    if (!el || isBlockedElement(el)) continue;
    if (!isVisibleNode(el)) continue;

    const text = normalizeText(el.innerText || "");
    if (text.length < 20) continue;

    items.push({
      id: getElementId(el),
      text,
      el,
    });
  }

  return items;
}

function createTranslationNode(forId, text) {
  const div = document.createElement("div");
  div.className = "dualread-translation";
  div.dataset.dualreadFor = forId;
  div.textContent = text;
  return div;
}

function upsertTranslationNode(item, translatedText) {
  const text = normalizeText(translatedText);
  if (!item || !item.el || !text) return false;

  let node = translationNodesById.get(item.id) || null;
  if (!node || !node.isConnected) {
    node = createTranslationNode(item.id, text);
    item.el.insertAdjacentElement("afterend", node);
    translationNodesById.set(item.id, node);
    injected.push(node);
  } else {
    node.textContent = text;
  }
  return true;
}

function clearTranslations() {
  for (const node of injected) node.remove();
  injected = [];
  translationNodesById.clear();

  for (const node of document.querySelectorAll(".dualread-translation[data-dualread-for]")) {
    node.remove();
  }
}

function clearTooltip() {
  if (tooltipHideTimer) {
    clearTimeout(tooltipHideTimer);
    tooltipHideTimer = null;
  }
  if (tooltipPointerHandler) {
    document.removeEventListener("pointerdown", tooltipPointerHandler, true);
    tooltipPointerHandler = null;
  }
  if (tooltipKeyHandler) {
    document.removeEventListener("keydown", tooltipKeyHandler, true);
    tooltipKeyHandler = null;
  }
  if (tooltipEl) tooltipEl.remove();
  tooltipEl = null;
}

function clearBanner() {
  if (bannerEl) bannerEl.remove();
  bannerEl = null;
}

function disconnectObserver() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
}

function clearFlushTimer() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}

function resetRuntimeState() {
  translationItemsById = new Map();
  queue.reset();
  isFlushing = false;
  lastFailedIds = [];
  disconnectObserver();
  clearFlushTimer();
}

function clearVisuals() {
  clearTranslations();
  clearTooltip();
  clearBanner();
}

function retryFailed(runId) {
  if (!enabled || activeRunId !== runId) return;
  if (!lastFailedIds.length) return;

  queue.enqueueMany(lastFailedIds);
  lastFailedIds = [];
  clearBanner();
  scheduleFlush(runId, true);
}

function showBanner(message, retryable, onRetry) {
  ensureStyles();
  clearBanner();

  bannerEl = document.createElement("div");
  bannerEl.className = "dualread-banner";
  bannerEl.textContent = message || "Naranhi error";

  const row = document.createElement("div");
  row.className = "dualread-banner-row";

  if (retryable && typeof onRetry === "function") {
    const retryBtn = document.createElement("button");
    retryBtn.type = "button";
    retryBtn.textContent = "Retry";
    retryBtn.addEventListener("click", () => {
      onRetry();
    });
    row.appendChild(retryBtn);
  }

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.textContent = "Close";
  closeBtn.addEventListener("click", () => clearBanner());
  row.appendChild(closeBtn);

  bannerEl.appendChild(row);
  document.documentElement.appendChild(bannerEl);
}

function showTooltip(translatedText) {
  const text = normalizeText(translatedText);
  if (!text) return;

  ensureStyles();
  clearTooltip();

  tooltipEl = document.createElement("div");
  tooltipEl.className = "dualread-tooltip";
  tooltipEl.textContent = text;

  const PADDING = 8;
  const ESTIMATED_WIDTH = 360;
  const sel = window.getSelection();
  let x = window.scrollX + Math.max(PADDING, window.innerWidth - ESTIMATED_WIDTH);
  let y = window.scrollY + 48;
  if (sel && sel.rangeCount > 0) {
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    x = window.scrollX + rect.left;
    y = window.scrollY + rect.bottom + PADDING;
  }

  const minX = window.scrollX + PADDING;
  const maxX = window.scrollX + Math.max(PADDING, window.innerWidth - ESTIMATED_WIDTH - PADDING);
  const minY = window.scrollY + PADDING;
  const maxY = window.scrollY + Math.max(PADDING, window.innerHeight - 120);
  x = Math.min(maxX, Math.max(minX, x));
  y = Math.min(maxY, Math.max(minY, y));

  tooltipEl.style.left = `${x}px`;
  tooltipEl.style.top = `${y}px`;
  (document.body || document.documentElement).appendChild(tooltipEl);

  tooltipPointerHandler = (event) => {
    if (!tooltipEl) return;
    const target = event.target;
    if (target instanceof Node && tooltipEl.contains(target)) return;
    clearTooltip();
  };
  document.addEventListener("pointerdown", tooltipPointerHandler, true);

  tooltipKeyHandler = (event) => {
    if (event.key === "Escape") {
      clearTooltip();
    }
  };
  document.addEventListener("keydown", tooltipKeyHandler, true);

  tooltipHideTimer = setTimeout(() => {
    clearTooltip();
  }, 6000);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isYouTubeWatchPage() {
  const host = String(window.location.hostname || "").toLowerCase();
  const isYouTubeHost = host === "www.youtube.com" || host === "youtube.com";
  return isYouTubeHost && window.location.pathname.startsWith("/watch");
}

function normalizeYouTubeCaptionText(rawText) {
  const helper = globalThis.NaranhiYouTubeSubtitle?.normalizeCaptionText;
  if (typeof helper === "function") {
    return helper(rawText, {
      minLength: YT_CAPTION_MIN_LENGTH,
      maxLength: YT_CAPTION_MAX_LENGTH,
    });
  }

  const text = normalizeText(rawText);
  if (!text) return "";
  if (text.length < YT_CAPTION_MIN_LENGTH || text.length > YT_CAPTION_MAX_LENGTH) return "";
  if (/^[\s♪♫♬♩♭♯•·.,!?'"`~:;()[\]{}<>|\\/+=_-]*$/u.test(text)) return "";
  if (!/[\p{L}\p{N}]/u.test(text)) return "";
  return text;
}

function getCurrentYouTubeVideoMs() {
  const video = document.querySelector(".html5-video-player video, video");
  if (!(video instanceof HTMLVideoElement)) return 0;
  if (!Number.isFinite(video.currentTime)) return 0;
  return Math.max(0, Math.floor(video.currentTime * 1000));
}

function findYouTubeCaptionContainer() {
  return (
    document.querySelector(".html5-video-player .ytp-caption-window-container") ||
    document.querySelector(".ytp-caption-window-container")
  );
}

function ensureYouTubeCaptionsEnabled() {
  const button =
    document.querySelector(".html5-video-player .ytp-subtitles-button") ||
    document.querySelector(".ytp-subtitles-button");
  if (!button) return;

  const pressed = String(button.getAttribute("aria-pressed") || "").toLowerCase();
  if (pressed === "true") return;

  button.click();
}

function isYouTubeCaptionsEnabled() {
  const button =
    document.querySelector(".html5-video-player .ytp-subtitles-button") ||
    document.querySelector(".ytp-subtitles-button");
  if (!button) return false;
  return String(button.getAttribute("aria-pressed") || "").toLowerCase() === "true";
}

function isInjectedYouTubeSubtitleNode(node) {
  if (!node) return false;
  if (node.nodeType === Node.ELEMENT_NODE) {
    return node.matches?.(".naranhi-yt-translation") || Boolean(node.closest?.(".naranhi-yt-translation"));
  }
  if (node.nodeType === Node.TEXT_NODE) {
    return Boolean(node.parentElement?.closest(".naranhi-yt-translation"));
  }
  return false;
}

function shouldIgnoreYouTubeMutations(mutations) {
  if (!Array.isArray(mutations) || !mutations.length) return false;

  for (const mutation of mutations) {
    if (mutation.type === "characterData") {
      if (!isInjectedYouTubeSubtitleNode(mutation.target)) return false;
      continue;
    }

    const changedNodes = [...(mutation.addedNodes || []), ...(mutation.removedNodes || [])];
    if (!changedNodes.length) return false;

    for (const node of changedNodes) {
      if (!isInjectedYouTubeSubtitleNode(node)) return false;
    }
  }

  return true;
}

function collectTextContentList(elements) {
  const out = [];
  for (const element of elements || []) {
    if (!element || isInjectedYouTubeSubtitleNode(element)) continue;
    const text = normalizeText(element.textContent || "");
    if (!text) continue;
    out.push(text);
  }
  return out;
}

function collectWindowFallbackText(windowEl) {
  if (!windowEl || !windowEl.ownerDocument) return "";
  const walker = windowEl.ownerDocument.createTreeWalker(windowEl, NodeFilter.SHOW_TEXT);
  const out = [];

  let current = walker.nextNode();
  while (current) {
    if (!isInjectedYouTubeSubtitleNode(current)) {
      const text = normalizeText(current.textContent || "");
      if (text) out.push(text);
    }
    current = walker.nextNode();
  }
  return normalizeText(out.join(" "));
}

function extractYouTubeCaptionItems(container) {
  if (!container) return [];

  const windows = Array.from(
    container.querySelectorAll(
      ".ytp-caption-window, .ytp-caption-window-rollup, .ytp-caption-window-top, .ytp-caption-window-bottom, .caption-window"
    )
  );

  const items = [];
  for (const [index, windowEl] of windows.entries()) {
    const segmentParts = collectTextContentList(windowEl.querySelectorAll(".ytp-caption-segment"));
    const visualLineParts = collectTextContentList(windowEl.querySelectorAll(".caption-visual-line"));
    const captionTextRoots = collectTextContentList(windowEl.querySelectorAll(".captions-text"));

    const rawText = segmentParts.length
      ? segmentParts.join(" ")
      : visualLineParts.length
        ? visualLineParts.join(" ")
        : captionTextRoots.length
          ? captionTextRoots.join(" ")
          : collectWindowFallbackText(windowEl);
    const text = normalizeYouTubeCaptionText(rawText);

    items.push({
      id: `window-${index}`,
      text,
      windowEl,
    });
  }

  return items;
}

function cleanupStaleYouTubeSubtitleNodes(validWindowIds) {
  for (const key of ytRenderStates.keys()) {
    if (validWindowIds.has(key)) continue;
    ytRenderStates.delete(key);
  }

  for (const node of document.querySelectorAll(".naranhi-yt-translation[data-naranhi-yt-for]")) {
    const forId = String(node.getAttribute("data-naranhi-yt-for") || "");
    if (validWindowIds.has(forId)) continue;
    node.remove();
  }
}

function removeYouTubeSubtitleNode(windowId) {
  const key = String(windowId || "").trim();
  if (!key) return;
  ytRenderStates.delete(key);
  for (const node of document.querySelectorAll(".naranhi-yt-translation[data-naranhi-yt-for]")) {
    if (node.getAttribute("data-naranhi-yt-for") !== key) continue;
    node.remove();
  }
}

function getReferenceCaptionLine(windowEl) {
  const lines = windowEl.querySelectorAll(".caption-visual-line");
  for (const line of lines) {
    if (!(line instanceof Element)) continue;
    if (line.classList.contains("naranhi-yt-translation")) continue;
    return line;
  }
  return null;
}

function getReferenceCaptionSegment(windowEl) {
  const segments = windowEl.querySelectorAll(".ytp-caption-segment");
  for (const segment of segments) {
    if (!(segment instanceof Element)) continue;
    if (segment.hasAttribute("data-naranhi-yt-segment")) continue;
    if (segment.closest(".naranhi-yt-translation")) continue;
    return segment;
  }
  return null;
}

function copyInlineStyle(sourceEl, targetEl) {
  if (!sourceEl || !targetEl) return;
  const styleValue = sourceEl.getAttribute("style");
  if (styleValue) {
    targetEl.setAttribute("style", styleValue);
  } else {
    targetEl.removeAttribute("style");
  }
}

function applyYouTubeCaptionTypography(windowEl, lineNode, segmentNode) {
  const refLine = getReferenceCaptionLine(windowEl);
  const refSegment = getReferenceCaptionSegment(windowEl);

  copyInlineStyle(refLine, lineNode);
  copyInlineStyle(refSegment, segmentNode);

  if (refLine) {
    const lineStyle = window.getComputedStyle(refLine);
    lineNode.style.fontSize = lineStyle.fontSize;
    lineNode.style.lineHeight = lineStyle.lineHeight;
    lineNode.style.fontFamily = lineStyle.fontFamily;
    lineNode.style.fontWeight = lineStyle.fontWeight;
    lineNode.style.letterSpacing = lineStyle.letterSpacing;
  }

  if (refSegment) {
    const segmentStyle = window.getComputedStyle(refSegment);
    segmentNode.style.fontSize = segmentStyle.fontSize;
    segmentNode.style.lineHeight = segmentStyle.lineHeight;
    segmentNode.style.fontFamily = segmentStyle.fontFamily;
    segmentNode.style.fontWeight = segmentStyle.fontWeight;
    segmentNode.style.letterSpacing = segmentStyle.letterSpacing;
    segmentNode.style.color = segmentStyle.color;
    segmentNode.style.backgroundColor = segmentStyle.backgroundColor;
    segmentNode.style.borderRadius = segmentStyle.borderRadius;
  }
}

function upsertYouTubeSubtitleNode(windowEl, windowId, translatedText) {
  if (!windowEl || !windowEl.isConnected) return false;

  const text = normalizeText(translatedText);
  if (!text) return false;

  const mountRoot = windowEl.querySelector(".captions-text") || windowEl;
  let node = null;
  for (const candidate of mountRoot.querySelectorAll(".naranhi-yt-translation[data-naranhi-yt-for]")) {
    if (candidate.getAttribute("data-naranhi-yt-for") === windowId) {
      node = candidate;
      break;
    }
  }

  if (!node) {
    node = document.createElement("span");
    node.className = "caption-visual-line naranhi-yt-translation";
    node.setAttribute("data-naranhi-yt-for", windowId);
    const segment = document.createElement("span");
    segment.className = "ytp-caption-segment";
    segment.setAttribute("data-naranhi-yt-segment", "1");
    node.appendChild(segment);
    mountRoot.appendChild(node);
  }

  let segmentNode = node.querySelector(".ytp-caption-segment[data-naranhi-yt-segment='1']");
  if (!(segmentNode instanceof Element)) {
    segmentNode = document.createElement("span");
    segmentNode.className = "ytp-caption-segment";
    segmentNode.setAttribute("data-naranhi-yt-segment", "1");
    node.textContent = "";
    node.appendChild(segmentNode);
  }

  applyYouTubeCaptionTypography(windowEl, node, segmentNode);
  if (segmentNode.textContent === text) return false;
  segmentNode.textContent = text;
  return true;
}

function clearYouTubeSubtitleNodes() {
  for (const node of document.querySelectorAll(".naranhi-yt-translation[data-naranhi-yt-for]")) {
    node.remove();
  }
}

function clearYouTubeFlushTimer() {
  if (ytFlushTimer) {
    clearTimeout(ytFlushTimer);
    ytFlushTimer = null;
  }
}

function clearYouTubeCollectTimer() {
  if (ytCollectTimer) {
    clearTimeout(ytCollectTimer);
    ytCollectTimer = null;
  }
}

function clearYouTubeRenderTimer() {
  if (ytRenderTimer) {
    clearTimeout(ytRenderTimer);
    ytRenderTimer = null;
  }
}

function clearYouTubeFallbackCheckTimer() {
  if (ytFallbackCheckTimer) {
    clearInterval(ytFallbackCheckTimer);
    ytFallbackCheckTimer = null;
  }
}

function disconnectYouTubeCaptionObserver() {
  if (ytCaptionObserver) {
    ytCaptionObserver.disconnect();
    ytCaptionObserver = null;
  }
}

function clearYouTubeContainerCheckTimer() {
  if (ytContainerCheckTimer) {
    clearInterval(ytContainerCheckTimer);
    ytContainerCheckTimer = null;
  }
}

function ensureYouTubeHookBridgeInjected() {
  if (document.getElementById("naranhi-yt-hook-bridge")) return true;
  try {
    const script = document.createElement("script");
    script.id = "naranhi-yt-hook-bridge";
    script.src = chrome.runtime.getURL("ytHookBridge.js");
    script.async = false;
    (document.documentElement || document.head || document.body).appendChild(script);
    return true;
  } catch {
    return false;
  }
}

function clearYouTubeHookResponseDedupe(now = Date.now()) {
  for (const [key, seenAt] of ytSeenHookResponses) {
    if (now - seenAt > YT_HOOK_DEDUPE_TTL_MS) {
      ytSeenHookResponses.delete(key);
    }
  }
}

function buildYouTubeHookDedupeKey(payload) {
  const url = String(payload?.url || "");
  const hash = String(payload?.responseHash || "");
  if (url && hash) return `${url}::${hash}`;
  const events = Array.isArray(payload?.events) ? payload.events : [];
  const first = Number(events[0]?.tStartMs || 0);
  const last = Number(events[events.length - 1]?.tStartMs || 0);
  return `${url}::${events.length}::${first}::${last}`;
}

function buildYouTubeTrackKey(payload) {
  const trackLang = String(payload?.trackLang || "").toLowerCase() || "auto";
  const kind = payload?.isAsr ? "asr" : "track";
  const signature = normalizeText(payload?.trackSignature || "default").replace(/\s+/g, "_");
  return `${trackLang}::${kind}::${signature || "default"}`;
}

function recordYouTubeSourceText(text) {
  const normalized = normalizeText(text);
  if (!normalized) return;

  const last = ytRecentSourceTexts[ytRecentSourceTexts.length - 1];
  if (last === normalized) return;
  ytRecentSourceTexts.push(normalized);
  while (ytRecentSourceTexts.length > YT_CONTEXT_HISTORY_SIZE) {
    ytRecentSourceTexts.shift();
  }
}

function getYouTubeTitleContext() {
  const rawTitle = normalizeText(document.title || "");
  if (!rawTitle) return "";
  const cleaned = rawTitle.replace(/\s*-\s*YouTube\s*$/i, "");
  return normalizeText(cleaned).slice(0, 120);
}

function buildYouTubeTranslateContext() {
  const history = ytRecentSourceTexts.slice(-YT_CONTEXT_SENTENCE_COUNT);
  const title = getYouTubeTitleContext();
  const parts = [];

  if (title) parts.push(`Title: ${title}`);
  if (history.length) parts.push(history.join(" "));

  return normalizeText(parts.join(" ")).slice(0, YT_CONTEXT_MAX_CHARS);
}

function buildYouTubeSubtitleTranslateOptions() {
  const options = {
    model_type: "prefer_quality_optimized",
    preserve_formatting: true,
    split_sentences: "0",
  };

  const context = buildYouTubeTranslateContext();
  if (context) options.context = context;
  return options;
}

function selectYouTubeActiveCue(cues, videoMs) {
  const selector = globalThis.NaranhiYouTubeASR?.selectActiveCue;
  if (typeof selector === "function") {
    return selector(cues, videoMs);
  }

  const list = Array.isArray(cues) ? cues : [];
  if (!list.length) return null;

  let lastPast = null;
  for (const cue of list) {
    const start = Number(cue?.startMs || 0);
    const end = Number(cue?.endMs || 0);
    if (videoMs >= start && videoMs <= end) return cue;
    if (start <= videoMs && (!lastPast || start > Number(lastPast.startMs || 0))) {
      lastPast = cue;
    }
  }

  if (lastPast && videoMs - Number(lastPast.endMs || 0) <= 2500) {
    return lastPast;
  }
  return null;
}

function selectHookCueForWindow(trackCues, videoMs, windowText) {
  const selector = globalThis.NaranhiYouTubeRender?.selectCueByTimeAndText;
  if (typeof selector === "function") {
    return selector(trackCues, videoMs, windowText, selectYouTubeActiveCue);
  }
  return selectYouTubeActiveCue(trackCues, videoMs);
}

function resolveYouTubeRenderText(windowId, translatedText, nowMs) {
  const prev = ytRenderStates.get(windowId) || { lastText: "", lastShownAt: 0 };
  const resolver = globalThis.NaranhiYouTubeRender?.resolveRenderText;
  const resolved = typeof resolver === "function"
    ? resolver(translatedText, prev, nowMs, YT_RENDER_HOLD_MS)
    : {
        text: normalizeText(translatedText),
        state: {
          lastText: normalizeText(translatedText),
          lastShownAt: nowMs,
        },
      };

  const nextText = normalizeText(resolved?.text || "");
  const nextState = resolved?.state && typeof resolved.state === "object"
    ? resolved.state
    : { lastText: nextText, lastShownAt: nowMs };

  if (nextText) {
    ytRenderStates.set(windowId, {
      lastText: normalizeText(nextState.lastText || nextText),
      lastShownAt: Number(nextState.lastShownAt || nowMs),
    });
  } else {
    ytRenderStates.delete(windowId);
  }

  return nextText;
}

function getYouTubeTrackState(trackKey) {
  const key = String(trackKey || "").trim();
  if (!key) return null;
  let state = ytTrackStates.get(key);
  if (!state) {
    state = {
      cues: [],
      cueIds: new Set(),
      lastHookAt: 0,
    };
    ytTrackStates.set(key, state);
  }
  return state;
}

function pruneYouTubeTrackState(trackState, videoMs) {
  if (!trackState) return;
  const keepAfter = Math.max(0, videoMs - YT_TRACK_PRUNE_BEFORE_MS);
  const kept = [];
  for (const cue of trackState.cues || []) {
    if (Number(cue?.endMs || 0) < keepAfter) continue;
    kept.push(cue);
  }

  while (kept.length > YT_TRACK_MAX_CUES) {
    kept.shift();
  }

  trackState.cues = kept;
  trackState.cueIds = new Set(kept.map((cue) => cue.cueId));
}

function enqueueYouTubeCue(cue) {
  const id = String(cue?.cueId || "").trim();
  const text = normalizeText(cue?.text || "");
  if (!id || !text) return false;
  ytCueById.set(id, cue);
  recordYouTubeSourceText(text);
  if (ytSubtitleQueue.hasTranslated(id)) return false;
  return ytSubtitleQueue.enqueue(id, text);
}

function addHookCues(trackKey, cues) {
  const state = getYouTubeTrackState(trackKey);
  if (!state) return 0;

  let added = 0;
  for (const cue of cues || []) {
    const cueId = String(cue?.cueId || "").trim();
    if (!cueId || state.cueIds.has(cueId)) continue;
    state.cueIds.add(cueId);
    state.cues.push(cue);
    enqueueYouTubeCue(cue);
    added += 1;
  }

  if (!added) return 0;

  state.cues.sort((a, b) => Number(a?.startMs || 0) - Number(b?.startMs || 0));
  state.lastHookAt = Date.now();
  pruneYouTubeTrackState(state, getCurrentYouTubeVideoMs());
  return added;
}

function addDomFallbackCue(cue) {
  const windowId = String(cue?.windowId || "").trim();
  if (!windowId) return false;

  const list = ytDomWindowCues.get(windowId) || [];
  if (list.find((item) => item.cueId === cue.cueId)) return false;

  list.push(cue);
  list.sort((a, b) => Number(a?.startMs || 0) - Number(b?.startMs || 0));
  while (list.length > 40) {
    list.shift();
  }

  ytDomWindowCues.set(windowId, list);
  return enqueueYouTubeCue(cue);
}

function renderYouTubeSubtitle(runId) {
  if (!ytSubtitleEnabled || ytSubtitleRunId !== runId) return;

  const container = ytCaptionContainer?.isConnected ? ytCaptionContainer : findYouTubeCaptionContainer();
  if (!container) return;

  const items = extractYouTubeCaptionItems(container);
  if (items.some((item) => item.text)) {
    if (ytNoCaptionNotified) {
      ytNoCaptionNotified = false;
      clearBanner();
    }
    ytNoCaptionDeadlineAt = Date.now() + YT_NO_CAPTION_TIMEOUT_MS;
  }
  ytWindowElements = new Map(items.map((item) => [item.id, item.windowEl]));
  const validWindowIds = new Set(items.map((item) => item.id));
  cleanupStaleYouTubeSubtitleNodes(validWindowIds);
  ytDomCommitter.dropMissingWindows(validWindowIds);

  const videoMs = getCurrentYouTubeVideoMs();
  const now = Date.now();
  const trackState = ytTrackStates.get(ytPrimaryTrackKey);

  for (const item of items) {
    let translated = "";

    if (ytFallbackMode) {
      const domCues = ytDomWindowCues.get(item.id) || [];
      const activeDomCue = selectYouTubeActiveCue(domCues, videoMs);
      if (activeDomCue) translated = normalizeText(ytTranslatedByCueId.get(activeDomCue.cueId) || "");
    } else if (trackState?.cues?.length) {
      const activeHookCue = selectHookCueForWindow(trackState.cues, videoMs, item.text);
      if (activeHookCue) translated = normalizeText(ytTranslatedByCueId.get(activeHookCue.cueId) || "");
    }

    const renderText = resolveYouTubeRenderText(item.id, translated, now);
    if (renderText) {
      upsertYouTubeSubtitleNode(item.windowEl, item.id, renderText);
    } else {
      removeYouTubeSubtitleNode(item.id);
    }
  }
}

function scheduleYouTubeRender(runId, immediate) {
  if (!ytSubtitleEnabled || ytSubtitleRunId !== runId) return;

  if (ytRenderTimer && !immediate) return;
  if (ytRenderTimer && immediate) {
    clearTimeout(ytRenderTimer);
    ytRenderTimer = null;
  }

  ytRenderTimer = setTimeout(() => {
    ytRenderTimer = null;
    renderYouTubeSubtitle(runId);
  }, immediate ? 0 : YT_RENDER_MS);
}

function shouldUseYouTubeAiSegmentation(trackLang, cues) {
  if (!String(trackLang || "").toLowerCase().startsWith("en")) return false;
  if (ytAiSegmentEnabled === false) return false;

  const detector = globalThis.NaranhiYouTubeASR?.isLowConfidenceAsrWindow;
  if (typeof detector === "function") {
    return detector(cues);
  }

  const list = Array.isArray(cues) ? cues : [];
  if (list.length < 8) return false;
  const punctuated = list.filter((cue) => /[.?!。？！…]$/.test(String(cue?.text || ""))).length;
  return punctuated / Math.max(1, list.length) < 0.15;
}

function buildCueIdForYouTube(trackKey, startMs, endMs, text) {
  const builder = globalThis.NaranhiYouTubeASR?.buildCueId;
  if (typeof builder === "function") {
    return builder(trackKey, startMs, endMs, text);
  }
  return `${trackKey}:${startMs}:${endMs}:${text}`;
}

function buildCuesFromSegmentSentences(baseCues, sentences, trackKey) {
  const list = Array.isArray(baseCues) ? baseCues : [];
  const normalizedSentences = (Array.isArray(sentences) ? sentences : [])
    .map((value) => normalizeYouTubeCaptionText(value))
    .filter(Boolean);

  if (!list.length || normalizedSentences.length < 2) return [];

  const startMs = Number(list[0]?.startMs || 0);
  const endMs = Number(list[list.length - 1]?.endMs || startMs + 2400);
  const totalDuration = Math.max(600, endMs - startMs);
  const totalChars = normalizedSentences.reduce((acc, text) => acc + text.length, 0);

  let cursor = startMs;
  const out = [];
  for (let i = 0; i < normalizedSentences.length; i += 1) {
    const sentence = normalizedSentences[i];
    const isLast = i === normalizedSentences.length - 1;
    let segmentDuration = isLast
      ? Math.max(250, endMs - cursor)
      : Math.max(250, Math.floor(totalDuration * (sentence.length / Math.max(1, totalChars))));
    if (!isLast && cursor + segmentDuration >= endMs) {
      segmentDuration = Math.max(250, endMs - cursor - 1);
    }

    const cueStart = cursor;
    const cueEnd = isLast ? endMs : Math.max(cueStart + 250, cueStart + segmentDuration);
    cursor = cueEnd;

    out.push({
      cueId: buildCueIdForYouTube(trackKey, cueStart, cueEnd, sentence),
      trackKey,
      startMs: cueStart,
      endMs: cueEnd,
      text: sentence,
      source: "hook",
      confidence: 0.82,
    });
  }

  return out.filter((cue) => cue.endMs > cue.startMs);
}

async function requestYouTubeAiSegmentation(runId, trackLang, cues, trackKey) {
  if (!ytSubtitleEnabled || ytSubtitleRunId !== runId) return [];
  if (!shouldUseYouTubeAiSegmentation(trackLang, cues)) return [];

  const slice = (Array.isArray(cues) ? cues : []).slice(-YT_AI_SEGMENT_MAX_CUES);
  if (slice.length < 2) return [];

  const chunkText = normalizeText(slice.map((cue) => cue.text).join(" "));
  if (!chunkText) return [];

  const timeoutResponse = delay(YT_AI_SEGMENT_REQUEST_TIMEOUT_MS).then(() => ({
    ok: false,
    error: { code: "TIMEOUT", message: "Segment request timeout" },
  }));

  let response;
  try {
    const segmentRequest = chrome.runtime.sendMessage({
      type: "DUALREAD_SEGMENT_TEXT",
      payload: {
        lang: trackLang || "en",
        chunks: [{ id: "yt-asr-0", text: chunkText }],
        hints: { mode: "yt-asr" },
      },
    }).catch(() => ({
      ok: false,
      error: { code: "SEGMENT_FAILED", message: "Segment request failed" },
    }));

    response = await Promise.race([
      segmentRequest,
      timeoutResponse,
    ]);
  } catch {
    return [];
  }

  if (!response?.ok) {
    const code = String(response?.error?.code || "");
    if (code === "FEATURE_DISABLED") {
      ytAiSegmentEnabled = false;
    }
    return [];
  }

  ytAiSegmentEnabled = true;
  const sentences = response.data?.segments?.[0]?.sentences;
  return buildCuesFromSegmentSentences(slice, sentences, trackKey);
}

async function handleYouTubeBridgePayload(payload, runId) {
  if (!ytSubtitleEnabled || ytSubtitleRunId !== runId) return;
  if (!payload || typeof payload !== "object") return;

  if (payload.parseError) {
    const count = Number(payload.consecutiveParseErrors);
    ytHookParseFailures = Number.isFinite(count) ? count : ytHookParseFailures + 1;
    if (ytHookParseFailures >= YT_HOOK_PARSE_ERROR_LIMIT) {
      ytFallbackMode = true;
    }
    return;
  }

  const now = Date.now();
  clearYouTubeHookResponseDedupe(now);

  const dedupeKey = buildYouTubeHookDedupeKey(payload);
  const seenAt = ytSeenHookResponses.get(dedupeKey);
  if (typeof seenAt === "number" && now - seenAt < YT_HOOK_DEDUPE_TTL_MS) return;
  ytSeenHookResponses.set(dedupeKey, now);

  const inputEvents = Array.isArray(payload.events) ? payload.events.slice(-YT_HOOK_MAX_EVENTS) : [];
  if (!inputEvents.length) return;

  const trackLang = String(payload.trackLang || "").toLowerCase();
  const trackKey = buildYouTubeTrackKey(payload);

  let cues = [];
  if (payload.isAsr) {
    cues = ytAsrStabilizer.buildCues({
      events: inputEvents,
      trackLang,
      trackKey,
      source: "hook",
    });
    const aiRefined = await requestYouTubeAiSegmentation(runId, trackLang, cues, trackKey);
    if (aiRefined.length) {
      cues = aiRefined;
    }
  } else {
    cues = ytManualMerger.buildCues({
      events: inputEvents,
      trackLang,
      trackKey,
      source: "hook",
    });
  }

  if (!cues.length) {
    const toSimple = globalThis.NaranhiYouTubeASR?.eventsToSimpleCues;
    if (typeof toSimple === "function") {
      cues = toSimple(inputEvents, trackKey, "hook");
    }
  }

  if (!cues.length) return;

  ytHookDetectedAt = now;
  ytHookParseFailures = 0;
  ytFallbackMode = false;
  ytPrimaryTrackKey = trackKey;
  ytNoCaptionNotified = false;
  ytNoCaptionDeadlineAt = now + YT_NO_CAPTION_TIMEOUT_MS;
  clearBanner();

  if (addHookCues(trackKey, cues) > 0) {
    scheduleYouTubeSubtitleFlush(runId, false);
    scheduleYouTubeRender(runId, false);
  }
}

function bindYouTubeHookBridge(runId) {
  if (ytBridgeMessageHandler) return;
  ytBridgeMessageHandler = (event) => {
    if (!ytSubtitleEnabled || ytSubtitleRunId !== runId) return;
    if (event.source !== window) return;

    const data = event.data;
    if (!data || data.source !== "naranhi-yt-bridge") return;
    if (data.type !== YT_HOOK_EVENT_TYPE) return;
    void handleYouTubeBridgePayload(data.payload, runId);
  };
  window.addEventListener("message", ytBridgeMessageHandler);
}

function unbindYouTubeHookBridge() {
  if (!ytBridgeMessageHandler) return;
  window.removeEventListener("message", ytBridgeMessageHandler);
  ytBridgeMessageHandler = null;
}

function resetYouTubeSubtitleRuntime() {
  disconnectYouTubeCaptionObserver();
  clearYouTubeContainerCheckTimer();
  clearYouTubeFlushTimer();
  clearYouTubeCollectTimer();
  clearYouTubeRenderTimer();
  clearYouTubeFallbackCheckTimer();
  unbindYouTubeHookBridge();

  ytCaptionContainer = null;
  ytIsFlushing = false;
  ytWindowElements = new Map();
  ytLastFailedItems = [];
  ytHookDetectedAt = 0;
  ytHookParseFailures = 0;
  ytFallbackMode = false;
  ytPrimaryTrackKey = "";
  ytNoCaptionDeadlineAt = 0;
  ytNoCaptionNotified = false;
  ytSubtitleStartedAt = 0;
  ytTrackStates = new Map();
  ytDomWindowCues = new Map();
  ytCueById = new Map();
  ytTranslatedByCueId = new Map();
  ytSeenHookResponses = new Map();
  ytRenderStates = new Map();
  ytRecentSourceTexts = [];
  ytAiSegmentEnabled = null;
  ytSubtitleQueue.reset();
  ytDomCommitter.reset();
}

function scheduleYouTubeCaptionCollect(runId, immediate) {
  if (!ytSubtitleEnabled || ytSubtitleRunId !== runId) return;

  if (ytCollectTimer && !immediate) return;
  if (ytCollectTimer && immediate) {
    clearTimeout(ytCollectTimer);
    ytCollectTimer = null;
  }

  const delayMs = immediate ? 0 : YT_COLLECT_DEBOUNCE_MS;
  ytCollectTimer = setTimeout(() => {
    ytCollectTimer = null;
    collectYouTubeCaptionItems(runId, false);
  }, delayMs);
}

function stopYouTubeSubtitleTranslation() {
  ytSubtitleEnabled = false;
  ytSubtitleRunId = null;
  resetYouTubeSubtitleRuntime();
  clearYouTubeSubtitleNodes();
}

function getYouTubeSubtitleState() {
  const supported = isYouTubeWatchPage();
  if (!supported && ytSubtitleEnabled) {
    stopYouTubeSubtitleTranslation();
  }
  return {
    ok: true,
    enabled: supported ? ytSubtitleEnabled : false,
    supported,
  };
}

async function waitForYouTubeCaptionContainer(runId, timeoutMs) {
  const startedAt = Date.now();
  while (ytSubtitleEnabled && ytSubtitleRunId === runId) {
    const found = findYouTubeCaptionContainer();
    if (found) return found;

    if (Date.now() - startedAt >= timeoutMs) break;
    await delay(250);
  }
  return null;
}

async function waitForInitialYouTubeCaptionItems(runId, timeoutMs) {
  const startedAt = Date.now();
  while (ytSubtitleEnabled && ytSubtitleRunId === runId) {
    const container = ytCaptionContainer?.isConnected ? ytCaptionContainer : findYouTubeCaptionContainer();
    if (container) {
      const items = extractYouTubeCaptionItems(container);
      if (items.some((item) => item.text)) return items;
    }

    if (Date.now() - startedAt >= timeoutMs) break;
    await delay(250);
  }
  return [];
}

function bindYouTubeCaptionContainer(container, runId) {
  if (!container) return;
  if (ytCaptionContainer === container && ytCaptionObserver) return;

  disconnectYouTubeCaptionObserver();
  ytCaptionContainer = container;

  ytCaptionObserver = new MutationObserver((mutations) => {
    if (!ytSubtitleEnabled || ytSubtitleRunId !== runId) return;
    if (shouldIgnoreYouTubeMutations(mutations)) return;
    scheduleYouTubeCaptionCollect(runId, false);
  });
  ytCaptionObserver.observe(container, {
    subtree: true,
    childList: true,
    characterData: true,
  });

  scheduleYouTubeRender(runId, true);
}

function startYouTubeContainerHealthCheck(runId) {
  clearYouTubeContainerCheckTimer();
  ytContainerCheckTimer = setInterval(() => {
    if (!ytSubtitleEnabled || ytSubtitleRunId !== runId) {
      clearYouTubeContainerCheckTimer();
      return;
    }

    if (ytCaptionContainer && ytCaptionContainer.isConnected) return;

    const found = findYouTubeCaptionContainer();
    if (!found) return;

    bindYouTubeCaptionContainer(found, runId);
    scheduleYouTubeCaptionCollect(runId, true);
  }, YT_CONTAINER_CHECK_INTERVAL_MS);
}

function startYouTubeFallbackWatchdog(runId) {
  clearYouTubeFallbackCheckTimer();
  ytFallbackCheckTimer = setInterval(() => {
    if (!ytSubtitleEnabled || ytSubtitleRunId !== runId) {
      clearYouTubeFallbackCheckTimer();
      return;
    }

    if (!ytFallbackMode) {
      const now = Date.now();
      if (now - ytHookDetectedAt < YT_HOOK_IDLE_FALLBACK_MS) return;

      const container = ytCaptionContainer?.isConnected ? ytCaptionContainer : findYouTubeCaptionContainer();
      if (!container) return;
      const items = extractYouTubeCaptionItems(container);
      if (!items.some((item) => item.text)) return;

      ytFallbackMode = true;
      scheduleYouTubeCaptionCollect(runId, true);
      return;
    }

    if (!ytNoCaptionNotified && ytNoCaptionDeadlineAt && Date.now() >= ytNoCaptionDeadlineAt) {
      const elapsedSinceStart = Date.now() - Number(ytSubtitleStartedAt || 0);
      if (elapsedSinceStart < YT_NO_CAPTION_TIMEOUT_MS) return;

      if (!isYouTubeCaptionsEnabled()) {
        ensureYouTubeCaptionsEnabled();
        ytNoCaptionDeadlineAt = Date.now() + 5000;
        return;
      }

      const videoMs = getCurrentYouTubeVideoMs();
      if (videoMs < 1000) return;

      const container = ytCaptionContainer?.isConnected ? ytCaptionContainer : findYouTubeCaptionContainer();
      if (!container) return;
      const items = container ? extractYouTubeCaptionItems(container) : [];
      if (!items.some((item) => item.text) && !ytHookDetectedAt) {
        ytNoCaptionNotified = true;
        showBanner("No captions detected on this video.", false, null);
      }
    }
  }, 500);
}

function collectYouTubeCaptionItems(runId, immediateFlush) {
  if (!ytSubtitleEnabled || ytSubtitleRunId !== runId) return;

  const container = ytCaptionContainer?.isConnected ? ytCaptionContainer : findYouTubeCaptionContainer();
  if (!container) return;

  if (container !== ytCaptionContainer) {
    bindYouTubeCaptionContainer(container, runId);
  }

  const items = extractYouTubeCaptionItems(container);
  ytWindowElements = new Map(items.map((item) => [item.id, item.windowEl]));
  const validWindowIds = new Set(items.map((item) => item.id));
  cleanupStaleYouTubeSubtitleNodes(validWindowIds);
  ytDomCommitter.dropMissingWindows(validWindowIds);

  if (!ytFallbackMode) {
    scheduleYouTubeRender(runId, false);
    return;
  }

  const now = Date.now();
  const videoMs = getCurrentYouTubeVideoMs();
  const commits = [];

  for (const item of items) {
    if (!item.text) continue;
    const committed = ytDomCommitter.ingest(item.id, item.text, videoMs, now);
    if (committed) commits.push(committed);
  }

  commits.push(...ytDomCommitter.flush(videoMs, now));

  const seenCueIds = new Set();
  for (const cue of commits) {
    if (!cue || !cue.cueId || seenCueIds.has(cue.cueId)) continue;
    seenCueIds.add(cue.cueId);
    addDomFallbackCue(cue);
  }

  if (ytSubtitleQueue.hasPending()) {
    scheduleYouTubeSubtitleFlush(runId, Boolean(immediateFlush));
  }
  scheduleYouTubeRender(runId, false);
}

function scheduleYouTubeSubtitleFlush(runId, immediate) {
  if (!ytSubtitleEnabled || ytSubtitleRunId !== runId) return;

  if (ytFlushTimer && !immediate) return;
  if (ytFlushTimer && immediate) {
    clearTimeout(ytFlushTimer);
    ytFlushTimer = null;
  }

  const delayMs = immediate ? 0 : YT_FLUSH_MS;
  ytFlushTimer = setTimeout(() => {
    ytFlushTimer = null;
    void flushYouTubeSubtitleQueue(runId);
  }, delayMs);
}

function retryYouTubeSubtitle(runId) {
  if (!ytSubtitleEnabled || ytSubtitleRunId !== runId) return;
  if (!ytLastFailedItems.length) return;

  ytSubtitleQueue.requeue(ytLastFailedItems);
  ytLastFailedItems = [];
  clearBanner();
  scheduleYouTubeSubtitleFlush(runId, true);
}

async function flushYouTubeSubtitleQueue(runId) {
  if (!ytSubtitleEnabled || ytSubtitleRunId !== runId) return;
  if (ytIsFlushing) return;

  const batch = ytSubtitleQueue.take(YT_MAX_ITEMS_PER_FLUSH);
  if (!batch.length) return;

  ytIsFlushing = true;

  try {
    const options = buildYouTubeSubtitleTranslateOptions();
    const response = await chrome.runtime.sendMessage({
      type: "DUALREAD_TRANSLATE_BATCH",
      runId,
      items: batch,
      channel: "yt-subtitle",
      options,
    });

    if (!ytSubtitleEnabled || ytSubtitleRunId !== runId) return;
    if (!response?.ok) {
      throw response?.error || { code: "UNKNOWN", message: "Subtitle translation failed.", retryable: true };
    }

    const byId = new Map(
      (response.data?.translations || []).map((item) => [String(item?.id || ""), normalizeText(item?.text || "")])
    );

    const translatedIds = [];
    const unresolved = [];
    for (const item of batch) {
      const translated = byId.get(item.id);
      if (translated === undefined) {
        unresolved.push(item);
        continue;
      }

      ytTranslatedByCueId.set(item.id, translated);
      translatedIds.push(item.id);
    }

    ytSubtitleQueue.markTranslated(translatedIds);
    ytSubtitleQueue.clearInflight(unresolved.map((item) => item.id));

    if (unresolved.length) {
      ytLastFailedItems = unresolved;
      showBanner(
        "Some subtitle lines were skipped. Retry to try again.",
        true,
        () => retryYouTubeSubtitle(runId)
      );
    } else {
      ytLastFailedItems = [];
    }

    if (translatedIds.length) {
      scheduleYouTubeRender(runId, true);
    }
  } catch (err) {
    ytSubtitleQueue.clearInflight(batch.map((item) => item.id));
    ytLastFailedItems = batch;

    if (!ytSubtitleEnabled || ytSubtitleRunId !== runId) return;

    showBanner(
      err?.message || "Subtitle translation failed.",
      Boolean(err?.retryable),
      () => retryYouTubeSubtitle(runId)
    );
  } finally {
    ytIsFlushing = false;
    if (ytSubtitleEnabled && ytSubtitleRunId === runId && ytSubtitleQueue.hasPending()) {
      scheduleYouTubeSubtitleFlush(runId, false);
    }
  }
}

async function startYouTubeSubtitleTranslation() {
  if (!isYouTubeWatchPage()) {
    stopYouTubeSubtitleTranslation();
    return { ok: true, enabled: false, supported: false };
  }

  ensureStyles();
  clearYouTubeSubtitleNodes();
  clearBanner();
  ensureYouTubeCaptionsEnabled();

  ytSubtitleEnabled = true;
  ytSubtitleRunId = createRunId();
  resetYouTubeSubtitleRuntime();
  ytSubtitleStartedAt = Date.now();
  ytNoCaptionDeadlineAt = ytSubtitleStartedAt + YT_NO_CAPTION_TIMEOUT_MS;
  ytNoCaptionNotified = false;

  const runId = ytSubtitleRunId;
  const hookReady = ensureYouTubeHookBridgeInjected();
  if (!hookReady) {
    ytFallbackMode = true;
  } else {
    bindYouTubeHookBridge(runId);
  }

  const container = findYouTubeCaptionContainer();
  if (container) {
    bindYouTubeCaptionContainer(container, runId);
  }
  startYouTubeContainerHealthCheck(runId);
  startYouTubeFallbackWatchdog(runId);

  scheduleYouTubeCaptionCollect(runId, true);
  scheduleYouTubeRender(runId, true);

  return { ok: true, enabled: true, supported: true };
}

async function toggleYouTubeSubtitleTranslation() {
  if (!isYouTubeWatchPage()) {
    stopYouTubeSubtitleTranslation();
    clearBanner();
    return { ok: true, enabled: false, supported: false };
  }

  if (ytSubtitleEnabled) {
    stopYouTubeSubtitleTranslation();
    clearBanner();
    return { ok: true, enabled: false, supported: true };
  }

  return startYouTubeSubtitleTranslation();
}

function parseRootMarginTopBottom(rootMargin) {
  const values = String(rootMargin || "").split(/\s+/).filter(Boolean);
  const [topRaw, , bottomRaw] = values;

  const parsePx = (raw, fallback) => {
    if (!raw) return fallback;
    const value = parseInt(raw, 10);
    return Number.isFinite(value) ? value : fallback;
  };

  return {
    top: parsePx(topRaw, 350),
    bottom: parsePx(bottomRaw, 600),
  };
}

function enqueueInitiallyVisible(items) {
  const margin = parseRootMarginTopBottom(activeSettings.visibleRootMargin);
  const viewportTop = -margin.top;
  const viewportBottom = window.innerHeight + margin.bottom;

  const initialIds = [];
  for (const item of items) {
    const rect = item.el.getBoundingClientRect();
    if (rect.bottom < viewportTop || rect.top > viewportBottom) continue;
    initialIds.push(item.id);
  }

  queue.enqueueMany(initialIds);
}

function scheduleFlush(runId, immediate) {
  if (!enabled || activeRunId !== runId) return;

  if (flushTimer && !immediate) return;
  if (flushTimer && immediate) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  const delay = immediate ? 0 : activeSettings.batchFlushMs;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushQueue(runId);
  }, delay);
}

async function flushQueue(runId) {
  if (!enabled || activeRunId !== runId) return;
  if (isFlushing) return;

  const ids = queue.take(MAX_VISIBLE_BATCH_ITEMS);
  if (!ids.length) return;

  const items = ids
    .map((id) => translationItemsById.get(id))
    .filter(Boolean)
    .map((item) => ({ id: item.id, text: item.text }));

  const requestedIds = items.map((item) => item.id);
  const missingIds = ids.filter((id) => !requestedIds.includes(id));
  if (missingIds.length) queue.clearInflight(missingIds);
  if (!requestedIds.length) {
    if (queue.hasPending()) scheduleFlush(runId, false);
    return;
  }

  isFlushing = true;

  try {
    const resp = await chrome.runtime.sendMessage({
      type: "DUALREAD_TRANSLATE_BATCH",
      runId,
      items,
    });

    if (!enabled || activeRunId !== runId) return;

    if (!resp?.ok) {
      throw resp?.error || { code: "UNKNOWN", message: "Translation failed", retryable: true };
    }

    const byId = new Map(
      (resp.data?.translations || []).map((item) => [String(item?.id || ""), normalizeText(item?.text || "")])
    );

    const succeeded = [];
    for (const id of requestedIds) {
      const translated = byId.get(id);
      const source = translationItemsById.get(id);
      if (!source || translated === undefined) continue;

      if (upsertTranslationNode(source, translated)) {
        succeeded.push(id);
      }
    }

    queue.markTranslated(succeeded);

    const unresolved = requestedIds.filter((id) => !succeeded.includes(id));
    queue.clearInflight(unresolved);
    lastFailedIds = unresolved;

    if (unresolved.length) {
      showBanner("Some blocks were skipped. Retry to try again.", true, () => retryFailed(runId));
    } else {
      lastFailedIds = [];
    }
  } catch (err) {
    queue.clearInflight(requestedIds);
    lastFailedIds = requestedIds;

    if (!enabled || activeRunId !== runId) return;

    showBanner(
      err?.message || "Translation failed.",
      Boolean(err?.retryable),
      () => retryFailed(runId)
    );
  } finally {
    isFlushing = false;
    if (enabled && activeRunId === runId && queue.hasPending()) {
      scheduleFlush(runId, false);
    }
  }
}

function startObserver(runId, items) {
  if (!activeSettings.visibleOnly || !("IntersectionObserver" in globalThis)) {
    queue.enqueueMany(items.map((item) => item.id));
    scheduleFlush(runId, true);
    return;
  }

  const callback = (entries) => {
    if (!enabled || activeRunId !== runId) return;

    const ids = [];
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const id = entry.target?.dataset?.dualreadId;
      if (id) ids.push(id);
    }

    if (!ids.length) return;
    queue.enqueueMany(ids);
    scheduleFlush(runId, false);
  };

  try {
    observer = new IntersectionObserver(callback, {
      root: null,
      rootMargin: activeSettings.visibleRootMargin,
      threshold: 0,
    });
  } catch {
    observer = new IntersectionObserver(callback, {
      root: null,
      rootMargin: DEFAULT_SETTINGS.visibleRootMargin,
      threshold: 0,
    });
  }

  for (const item of items) {
    observer.observe(item.el);
  }

  enqueueInitiallyVisible(items);
  scheduleFlush(runId, false);
}

async function translatePage(runId) {
  ensureStyles();
  clearTranslations();
  clearBanner();
  resetRuntimeState();

  activeSettings = await loadTranslationSettings();
  const items = buildItems(activeSettings);
  if (!items.length) {
    showBanner("No translatable blocks found on this page.", false, null);
    return;
  }

  translationItemsById = new Map(items.map((item) => [item.id, item]));

  if (activeSettings.visibleOnly) {
    startObserver(runId, items);
    return;
  }

  queue.enqueueMany(items.map((item) => item.id));
  scheduleFlush(runId, true);
}

async function runTranslation() {
  const runId = createRunId();
  activeRunId = runId;

  try {
    await translatePage(runId);
  } catch (err) {
    if (!enabled || activeRunId !== runId) return;
    showBanner(
      err?.message || "Translation failed.",
      Boolean(err?.retryable),
      () => retryFailed(runId)
    );
  }
}

async function togglePageTranslation() {
  if (enabled) {
    enabled = false;
    activeRunId = null;
    resetRuntimeState();
    clearVisuals();
    return;
  }

  enabled = true;
  await runTranslation();
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "DUALREAD_TOGGLE_PAGE") {
    void togglePageTranslation();
    return;
  }

  if (msg?.type === "DUALREAD_GET_PAGE_STATE") {
    sendResponse({ ok: true, enabled });
    return;
  }

  if (msg?.type === "DUALREAD_GET_YT_SUBTITLE_STATE") {
    sendResponse(getYouTubeSubtitleState());
    return;
  }

  if (msg?.type === "DUALREAD_TOGGLE_YT_SUBTITLE") {
    void (async () => {
      try {
        const result = await toggleYouTubeSubtitleTranslation();
        sendResponse(result);
      } catch {
        sendResponse({
          ok: false,
          enabled: false,
          supported: isYouTubeWatchPage(),
        });
      }
    })();
    return true;
  }

  if (msg?.type === "DUALREAD_SHOW_TOOLTIP") {
    showTooltip(msg.translatedText || "");
    return;
  }

  if (msg?.type === "DUALREAD_SHOW_BANNER") {
    showBanner(msg.message || "Naranhi error", Boolean(msg.retryable), null);
  }
});
