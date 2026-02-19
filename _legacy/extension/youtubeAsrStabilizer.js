(function factory(root, create) {
  if (typeof module === "object" && module.exports) {
    module.exports = create();
    return;
  }
  root.NaranhiYouTubeASR = create();
})(typeof globalThis !== "undefined" ? globalThis : this, function buildYouTubeAsrHelpers() {
  const MUSIC_ONLY_RE = /^[\s♪♫♬♩♭♯•·.,!?'"`~:;()[\]{}<>|\\/+=_-]*$/u;

  const DEFAULT_WORDS_REGEX =
    "etc\\.|Mr\\.|Mrs\\.|Ms\\.|Dr\\.|Prof\\.|Sr\\.|Jr\\.|U\\.S\\.|U\\.K\\.|Co\\.|Inc\\.|Ltd\\.|St\\.|p\\.a\\.|\\d+\\.";

  const MANUAL_CONTINUATION_START_WORDS = new Set([
    "and",
    "but",
    "or",
    "so",
    "because",
    "if",
    "then",
    "that",
    "which",
    "who",
    "when",
    "while",
    "to",
    "for",
    "of",
    "in",
    "on",
  ]);

  const LANGS_CONFIG = {
    base: {
      isSpaceLang: false,
      splitConfig: {
        minInterval: 1000,
        maxWords: 17,
      },
      mergeConfig: {
        minInterval: 1500,
        maxWords: 19,
      },
    },
    en: {
      isSpaceLang: true,
      splitConfig: {
        symbolBreakWords: ["mhm", "um", ">>", "- "],
        breakMiniTime: 300,
        breakWords: [
          "mhm",
          "um",
          ">>",
          "- ",
          "in fact",
          "such as",
          "or even",
          "get me",
          "well i'm",
          "i didn't",
          "i know",
          "i need",
          "i will",
          "i'll",
          "i mean",
          "you are",
          "what does",
          "no problem",
          "as we",
          "if you",
          "hello",
          "okay",
          "oh",
          "yep",
          "yes",
          "hey",
          "hi",
          "yeah",
          "essentially",
          "because",
          "and",
          "but",
          "which",
          "so",
          "where",
          "what",
          "now",
          "or",
          "how",
          "after",
        ],
        skipWords: ["uh"],
      },
      mergeConfig: {
        endWords: [
          "in",
          "is",
          "and",
          "are",
          "not",
          "an",
          "a",
          "some",
          "the",
          "but",
          "our",
          "for",
          "of",
          "if",
          "his",
          "her",
          "my",
          "noticed",
          "come",
          "mean",
          "why",
          "this",
          "has",
          "make",
          "gpt",
          "p.m",
          "a.m",
        ],
        startWords: ["or", "to", "in", "has", "of", "are", "is", "lines", "with", "days", "years", "tokens"],
      },
      endCompatibleConfigs: [
        {
          minInterval: 1000,
          minWordLength: 3,
          sentenceMinWord: 20,
        },
        {
          minInterval: 1500,
          minWordLength: 1,
          sentenceMinWord: 20,
        },
      ],
    },
  };

  function normalizeText(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function normalizeCaptionText(raw, options) {
    const opts = options && typeof options === "object" ? options : {};
    const minLength = Number.isFinite(opts.minLength) ? Math.max(1, Math.floor(opts.minLength)) : 2;
    const maxLength = Number.isFinite(opts.maxLength) ? Math.max(minLength, Math.floor(opts.maxLength)) : 240;
    const text = normalizeText(raw);
    if (!text) return "";
    if (text.length < minLength || text.length > maxLength) return "";
    if (MUSIC_ONLY_RE.test(text)) return "";
    if (!/[\p{L}\p{N}]/u.test(text)) return "";
    return text;
  }

  function countWords(text) {
    return normalizeText(text).split(/\s+/).filter(Boolean).length;
  }

  function hasTerminalPunctuation(text) {
    return /[.?!。？！…]$/.test(normalizeText(text));
  }

  function calculateCueConfidence(text, startMs, endMs, explicitWordCount) {
    const normalized = normalizeText(text);
    if (!normalized) return 0;

    const words = Number.isFinite(explicitWordCount) && explicitWordCount > 0
      ? explicitWordCount
      : countWords(normalized);
    const duration = Math.max(1, Number(endMs || 0) - Number(startMs || 0));
    const msPerWord = words > 0 ? duration / words : duration;

    let score = 0.25;
    if (words >= 3 && words <= 22) score += 0.2;
    if (hasTerminalPunctuation(normalized)) score += 0.35;
    if (msPerWord >= 180) score += 0.12;
    if (msPerWord >= 260) score += 0.08;
    if (normalized.length >= 14) score += 0.08;
    if (normalized.length > 220) score -= 0.1;
    if (!/[a-z0-9]/i.test(normalized)) score -= 0.15;

    return Math.max(0, Math.min(1, Number(score.toFixed(3))));
  }

  function sha1Hex(message) {
    function rotl(n, bits) {
      return (n << bits) | (n >>> (32 - bits));
    }

    function toHex(n) {
      return (n >>> 0).toString(16).padStart(8, "0");
    }

    const text = unescape(encodeURIComponent(String(message || "")));
    const words = [];
    for (let i = 0; i < text.length; i += 1) {
      words[i >> 2] |= text.charCodeAt(i) << (24 - (i % 4) * 8);
    }
    words[text.length >> 2] |= 0x80 << (24 - (text.length % 4) * 8);
    words[(((text.length + 8) >> 6) + 1) * 16 - 1] = text.length * 8;

    let h0 = 0x67452301;
    let h1 = 0xefcdab89;
    let h2 = 0x98badcfe;
    let h3 = 0x10325476;
    let h4 = 0xc3d2e1f0;

    for (let i = 0; i < words.length; i += 16) {
      const w = new Array(80);
      for (let j = 0; j < 16; j += 1) w[j] = words[i + j] || 0;
      for (let j = 16; j < 80; j += 1) w[j] = rotl(w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16], 1);

      let a = h0;
      let b = h1;
      let c = h2;
      let d = h3;
      let e = h4;

      for (let j = 0; j < 80; j += 1) {
        let f;
        let k;
        if (j < 20) {
          f = (b & c) | (~b & d);
          k = 0x5a827999;
        } else if (j < 40) {
          f = b ^ c ^ d;
          k = 0x6ed9eba1;
        } else if (j < 60) {
          f = (b & c) | (b & d) | (c & d);
          k = 0x8f1bbcdc;
        } else {
          f = b ^ c ^ d;
          k = 0xca62c1d6;
        }

        const temp = (rotl(a, 5) + f + e + k + w[j]) | 0;
        e = d;
        d = c;
        c = rotl(b, 30);
        b = a;
        a = temp;
      }

      h0 = (h0 + a) | 0;
      h1 = (h1 + b) | 0;
      h2 = (h2 + c) | 0;
      h3 = (h3 + d) | 0;
      h4 = (h4 + e) | 0;
    }

    return `${toHex(h0)}${toHex(h1)}${toHex(h2)}${toHex(h3)}${toHex(h4)}`;
  }

  function buildCueId(trackKey, startMs, endMs, text) {
    const safeTrack = String(trackKey || "unknown").replace(/\s+/g, "_");
    return `yt:${safeTrack}:${Math.max(0, Math.floor(startMs || 0))}:${Math.max(0, Math.floor(endMs || 0))}:${sha1Hex(
      text
    )}`;
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function mergeLangConfig(langCode) {
    const base = deepClone(LANGS_CONFIG.base);
    const normalized = String(langCode || "").toLowerCase();
    let extra = LANGS_CONFIG[normalized] || null;
    if (!extra && normalized.startsWith("zh")) extra = LANGS_CONFIG.zh || null;
    if (!extra) return base;

    const merged = { ...base, ...deepClone(extra) };
    for (const [key, value] of Object.entries(merged)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      if (!base[key] || typeof base[key] !== "object" || Array.isArray(base[key])) continue;
      if (value === base[key]) continue;
      merged[key] = { ...base[key], ...value };
    }
    return merged;
  }

  function eventsToTokens(events, isSpaceLang) {
    const out = [];
    let asciiCount = 0;
    let pendingSpace = "";

    for (const event of events || []) {
      if (!event || typeof event !== "object") continue;
      const start = Number(event.tStartMs);
      const duration = Number(event.dDurationMs);
      const segs = Array.isArray(event.segs) ? event.segs : [];
      if (!Number.isFinite(start) || !segs.length) continue;

      for (const seg of segs) {
        if (!seg || typeof seg !== "object") continue;
        const raw = String(seg.utf8 || "");
        if (!raw) continue;

        if (isSpaceLang) {
          if (raw === "\n") {
            pendingSpace = " ";
            continue;
          }
          if (/[a-z]/i.test(raw)) asciiCount += 1;
          out.push({
            tStartMs: start + (Number(seg.tOffsetMs) || 0),
            utf8: (pendingSpace + raw).toLowerCase(),
          });
          pendingSpace = "";
          continue;
        }

        out.push({
          tStartMs: start + (Number(seg.tOffsetMs) || 0),
          utf8: raw,
        });
      }

      if (Number.isFinite(duration) && out.length) {
        out[out.length - 1].tEndMs = start + duration;
      }
    }

    if (isSpaceLang && asciiCount <= (events?.length || 0) * 0.1) {
      return normalizeEnglishArtifacts(out);
    }

    return out;
  }

  function normalizeEnglishArtifacts(tokens) {
    const out = [];
    let buffer = [];

    function flush() {
      if (!buffer.length) return;
      out.push({
        tStartMs: buffer[0].tStartMs,
        utf8: buffer.map((item) => item.utf8).reduceRight((acc, value) => value + acc, ""),
      });
      buffer = [];
    }

    for (const token of tokens || []) {
      const text = String(token?.utf8 || "");
      const hasAlpha = /[a-z]/i.test(text);
      let consumed = false;

      if (hasAlpha) {
        buffer.push(token);
        consumed = true;
      }

      const looksWord = /^[a-z'.]+\s*[a-z'.]+$/i.test(text) || (buffer.length === 1 && /\b[a-z.']+$/i.test(text));
      if (looksWord) continue;

      if (hasAlpha && /^[^a-z]/i.test(text)) {
        buffer.pop();
        flush();
        buffer = [token];
        continue;
      }

      if (buffer.length) flush();
      if (!consumed) out.push(token);
    }

    flush();
    return out;
  }

  function earlySkip(config, tokens) {
    return tokens.slice(0, 20).find((token) => {
      const text = normalizeText(token?.utf8 || "");
      if (!text) return false;
      if (config.isSpaceLang) return text.split(/\s+/).length >= 3;
      return text.length >= 4;
    });
  }

  function groupByTerminalPunctuation(tokens, wordRegexStr) {
    if (!tokens.length) return null;
    const punctuation = /[.?!。？！]/;
    const count = tokens.filter((token) => punctuation.test(token?.utf8 || "")).length;
    if (count < 10) return null;

    const terminalWordRegex = new RegExp(wordRegexStr || DEFAULT_WORDS_REGEX);
    const groups = [];
    let current = [];

    for (const token of tokens) {
      const text = normalizeText(token?.utf8 || "");
      if (!text) continue;
      current.push(token);
      const last = text[text.length - 1] || "";
      if (punctuation.test(last) && !terminalWordRegex.test(text)) {
        groups.push(current.slice());
        current = [];
      }
    }

    if (current.length) groups.push(current.slice());
    return groups;
  }

  function tokenWordCount(group) {
    let text = "";
    for (const token of group || []) text += String(token?.utf8 || "");
    const parts = normalizeText(text).split(/\s+/).filter(Boolean);
    return parts.length;
  }

  function breakByInterval(tokens, options) {
    if (!tokens.length) return [];

    const breakWords = options.breakWords || [];
    const skipWords = options.skipWords || [];
    const minInterval = Number(options.minInterval) || 1000;
    const breakMiniTime = Number(options.breakMiniTime) || 500;

    let anchor = Number(tokens[0]?.tStartMs) || 0;
    const groups = [];
    let current = [];

    function pushBreak(token, forced) {
      anchor = Number(token?.tStartMs) || anchor;
      groups.push(current);
      current = forced;
      if (current[0]) current[0].isBreak = true;
    }

    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];
      const next = tokens[i + 1];
      const tokenText = normalizeText(token?.utf8 || "");
      const elapsed = (Number(token?.tStartMs) || 0) - anchor;

      if (breakWords.includes(tokenText) && elapsed > breakMiniTime) {
        pushBreak(token, [token]);
        continue;
      }

      if (next) {
        const pair = normalizeText(`${token?.utf8 || ""}${next?.utf8 || ""}`);
        if (breakWords.includes(pair) && elapsed > breakMiniTime) {
          pushBreak(token, [token, next]);
          i += 1;
          continue;
        }
      }

      if (skipWords.includes(tokenText) && tokens[i + 1]) {
        anchor = Number(tokens[i + 1].tStartMs) || anchor;
        current.push(tokens[i + 1]);
        i += 1;
        continue;
      }

      if (elapsed <= minInterval) {
        anchor = Number(token?.tStartMs) || anchor;
        current.push(token);
        continue;
      }

      groups.push(current);
      current = [token];
      anchor = Number(token?.tStartMs) || anchor;
    }

    if (current.length) groups.push(current);
    return groups.filter((group) => Array.isArray(group) && group.length > 0);
  }

  function splitAndBalance(tokens, options) {
    const firstPass = breakByInterval(tokens, options);
    const output = [];
    let singles = [];

    function flushSingles() {
      if (!singles.length) return;
      output.push(singles.slice());
      singles = [];
    }

    for (const group of firstPass) {
      if (tokenWordCount(group) > options.maxWords && group.length > 1) {
        flushSingles();
        const nested = splitAndBalance(group, {
          ...options,
          minInterval: Math.max(100, (Number(options.minInterval) || 1000) - 100),
        });
        output.push(...nested);
        continue;
      }

      if (group.length === 1 && tokenWordCount(group) <= 1) {
        singles.push(group[0]);
        continue;
      }

      flushSingles();
      output.push(group);
    }

    flushSingles();
    return output;
  }

  function escapeRegExp(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function mergeGroupsByBoundary(groups, options) {
    const startWords = Array.isArray(options.startWords) ? options.startWords : [];
    const endWords = Array.isArray(options.endWords) ? options.endWords : [];
    if (!groups.length || (!startWords.length && !endWords.length)) return groups;

    const startPattern = startWords.length
      ? new RegExp(`^\\s*(${startWords.map(escapeRegExp).join("|")})$`, "i")
      : null;
    const endPattern = endWords.length
      ? new RegExp(`\\b(${endWords.map(escapeRegExp).join("|")})\\s*$`, "i")
      : null;

    const merged = [groups[0]];

    for (let i = 0; i < groups.length - 1; i += 1) {
      const tail = groups[i][groups[i].length - 1];
      const head = groups[i + 1][0];
      const gap = (Number(head?.tStartMs) || 0) - (Number(tail?.tStartMs) || 0);
      const holder = merged[merged.length - 1];

      const shouldMerge =
        !head?.isBreak &&
        gap <= (Number(options.minInterval) || 1000) &&
        ((startPattern && startPattern.test(String(head?.utf8 || ""))) ||
          (endPattern && endPattern.test(String(tail?.utf8 || ""))));

      if (!shouldMerge) {
        merged.push(groups[i + 1]);
        continue;
      }

      const candidate = [...holder, ...groups[i + 1]];
      if (tokenWordCount(candidate) <= (Number(options.maxWords) || 20)) {
        holder.push(...groups[i + 1]);
      } else {
        merged.push(groups[i + 1]);
      }
    }

    return merged;
  }

  function mergeShortTailGroups(groups, options) {
    const out = [...groups];
    for (let i = out.length - 1; i > 0; i -= 1) {
      const current = out[i];
      const previous = out[i - 1];
      if (!current.length || !previous.length) continue;
      if (current.length > (Number(options.minWordLength) || 1)) continue;
      if (current.length + previous.length >= (Number(options.sentenceMinWord) || 20)) continue;
      if ((Number(current[0]?.tStartMs) || 0) - (Number(previous[previous.length - 1]?.tStartMs) || 0) >
          (Number(options.minInterval) || 1000)) continue;
      if (current[0]?.isBreak) continue;
      previous.push(...current);
      out.splice(i, 1);
    }
    return out;
  }

  function resolveCueEnd(group, nextGroup) {
    const explicitEnd = Number(group[group.length - 1]?.tEndMs);
    const nextStart = Number(nextGroup?.[0]?.tStartMs);
    const fallback = Number(group[group.length - 1]?.tStartMs) || 0;
    if (!Number.isFinite(explicitEnd) || (Number.isFinite(nextStart) && explicitEnd > nextStart)) {
      return Number.isFinite(nextStart) ? nextStart : fallback;
    }
    return explicitEnd;
  }

  function groupsToCues(groups, trackKey, source) {
    const cues = [];
    for (let i = 0; i < groups.length; i += 1) {
      const group = groups[i];
      if (!group || !group.length) continue;
      const startMs = Number(group[0]?.tStartMs) || 0;
      let endMs = resolveCueEnd(group, groups[i + 1]);
      if (!Number.isFinite(endMs) || endMs <= startMs) {
        endMs = startMs + 1800;
      }

      let text = "";
      for (const token of group) text += String(token?.utf8 || "");
      text = normalizeText(text.replace(/\n/gi, " "));
      if (!text) continue;

      cues.push({
        cueId: buildCueId(trackKey, startMs, endMs, text),
        trackKey,
        startMs,
        endMs,
        text,
        source,
        confidence: calculateCueConfidence(text, startMs, endMs, countWords(text)),
      });
    }
    return cues;
  }

  function sanitizeEvents(events) {
    const out = [];
    for (const event of events || []) {
      if (!event || typeof event !== "object") continue;
      if (!Array.isArray(event.segs) || !event.segs.length) continue;
      if (!Number.isFinite(Number(event.dDurationMs))) continue;
      if (Number(event.aAppend) === 1) continue;
      out.push(event);
    }
    out.sort((a, b) => Number(a.tStartMs || 0) - Number(b.tStartMs || 0));
    return out;
  }

  function eventsToSimpleCues(events, trackKey, source) {
    const cleaned = sanitizeEvents(events);
    const cues = [];

    for (const event of cleaned) {
      const startMs = Number(event.tStartMs || 0);
      const durationMs = Number(event.dDurationMs || 0);
      const endMs = durationMs > 0 ? startMs + durationMs : startMs + 1800;

      const parts = [];
      for (const seg of event.segs || []) {
        const raw = normalizeText(seg?.utf8 || "");
        if (raw) parts.push(raw);
      }

      const text = normalizeCaptionText(parts.join(" "), { minLength: 2, maxLength: 240 });
      if (!text) continue;

      cues.push({
        cueId: buildCueId(trackKey, startMs, endMs, text),
        trackKey,
        startMs,
        endMs,
        text,
        source,
        confidence: calculateCueConfidence(text, startMs, endMs, countWords(text)),
      });
    }

    return cues;
  }

  class YouTubeAsrStabilizer {
    constructor(options) {
      const opts = options && typeof options === "object" ? options : {};
      this.wordsRegex = String(opts.wordsRegex || DEFAULT_WORDS_REGEX);
      this.maxEvents = Number.isFinite(opts.maxEvents) ? Math.max(100, Math.floor(opts.maxEvents)) : 6000;
    }

    buildCues(payload) {
      const trackLang = String(payload?.trackLang || "").toLowerCase();
      const trackKey = String(payload?.trackKey || `${trackLang || "auto"}::asr`);
      const source = String(payload?.source || "hook");

      const inputEvents = Array.isArray(payload?.events) ? payload.events.slice(-this.maxEvents) : [];
      const events = sanitizeEvents(inputEvents);
      if (!events.length) return [];

      const config = mergeLangConfig(trackLang);
      if (!config) return eventsToSimpleCues(events, trackKey, source);

      const tokens = eventsToTokens(events, Boolean(config.isSpaceLang));
      if (!tokens.length) return [];
      if (earlySkip(config, tokens)) return [];

      const symbolList = groupByTerminalPunctuation(tokens, this.wordsRegex);
      if (symbolList?.length) {
        const splitConfig = config.splitConfig || {};
        const groups = [];
        for (const chunk of symbolList) {
          const broken = splitAndBalance(chunk, {
            breakWords: splitConfig.symbolBreakWords,
            skipWords: splitConfig.skipWords,
            minInterval: (Number(splitConfig.minInterval) || 1000) * 5,
            maxWords: Number(splitConfig.maxWords) || 20,
            breakMiniTime: Number(splitConfig.breakMiniTime) || 500,
          });
          groups.push(...broken);
        }
        return groupsToCues(groups, trackKey, source);
      }

      const splitConfig = config.splitConfig || {};
      const mergedConfig = config.mergeConfig || {};

      const splitGroups = splitAndBalance(tokens, {
        breakWords: splitConfig.breakWords,
        skipWords: splitConfig.skipWords,
        minInterval: Number(splitConfig.minInterval) || 1000,
        maxWords: Number(splitConfig.maxWords) || 15,
        breakMiniTime: Number(splitConfig.breakMiniTime) || 500,
      });

      let groups = mergeGroupsByBoundary(splitGroups, {
        startWords: mergedConfig.startWords,
        endWords: mergedConfig.endWords,
        minInterval: Number(mergedConfig.minInterval) || 1000,
        maxWords: Number(mergedConfig.maxWords) || 20,
      });

      for (const cfg of config.endCompatibleConfigs || []) {
        groups = mergeShortTailGroups(groups, {
          minInterval: Number(cfg.minInterval) || 1000,
          minWordLength: Number(cfg.minWordLength) || 1,
          sentenceMinWord: Number(cfg.sentenceMinWord) || 20,
        });
      }

      return groupsToCues(groups, trackKey, source);
    }
  }

  function isLowConfidenceAsrWindow(cues, options) {
    const list = Array.isArray(cues) ? cues : [];
    if (!list.length) return false;

    const opts = options && typeof options === "object" ? options : {};
    const windowMs = Number.isFinite(opts.windowMs) ? Math.max(1000, Math.floor(opts.windowMs)) : 8000;
    const minCueCount = Number.isFinite(opts.minCueCount) ? Math.max(2, Math.floor(opts.minCueCount)) : 8;
    const shortGapMs = Number.isFinite(opts.shortGapMs) ? Math.max(20, Math.floor(opts.shortGapMs)) : 180;

    const firstStart = Number(list[0]?.startMs || 0);
    let shortGapCount = 0;
    for (let i = 1; i < list.length; i += 1) {
      const prevEnd = Number(list[i - 1]?.endMs || list[i - 1]?.startMs || 0);
      const currStart = Number(list[i]?.startMs || 0);
      if (currStart - prevEnd <= shortGapMs) {
        shortGapCount += 1;
      }
    }

    const punctuationRatio =
      list.filter((cue) => hasTerminalPunctuation(cue?.text || "")).length / Math.max(1, list.length);
    const avgConfidence =
      list.reduce((acc, cue) => acc + Number(cue?.confidence || 0), 0) / Math.max(1, list.length);
    const overSegmented = list.length >= minCueCount && Number(list[list.length - 1]?.endMs || 0) - firstStart <= windowMs;
    const tooManyShortGaps = shortGapCount >= Math.floor(list.length * 0.6);

    return (punctuationRatio < 0.15 && overSegmented) || (avgConfidence < 0.52 && tooManyShortGaps);
  }

  function startsLikeContinuation(text) {
    const normalized = normalizeText(text).toLowerCase();
    if (!normalized) return false;
    const firstWord = normalized.split(/\s+/)[0] || "";
    if (!firstWord) return false;
    if (MANUAL_CONTINUATION_START_WORDS.has(firstWord)) return true;
    return /^[a-z]/.test(firstWord);
  }

  class ManualCaptionSentenceMerger {
    constructor(options) {
      const opts = options && typeof options === "object" ? options : {};
      this.maxGapMs = Number.isFinite(opts.maxGapMs) ? Math.max(30, Math.floor(opts.maxGapMs)) : 250;
      this.maxChars = Number.isFinite(opts.maxChars) ? Math.max(40, Math.floor(opts.maxChars)) : 220;
      this.maxDurationMs = Number.isFinite(opts.maxDurationMs) ? Math.max(800, Math.floor(opts.maxDurationMs)) : 7000;
      this.shortTailWords = Number.isFinite(opts.shortTailWords) ? Math.max(1, Math.floor(opts.shortTailWords)) : 4;
    }

    buildCues(payload) {
      const trackKey = String(payload?.trackKey || "manual::track");
      const source = String(payload?.source || "hook");
      const baseCues = eventsToSimpleCues(payload?.events || [], trackKey, source);
      if (baseCues.length <= 1) return baseCues;

      const merged = [];
      let current = null;

      const flushCurrent = () => {
        if (!current) return;
        const text = normalizeCaptionText(current.text, { minLength: 2, maxLength: 240 });
        if (!text) {
          current = null;
          return;
        }

        merged.push({
          cueId: buildCueId(trackKey, current.startMs, current.endMs, text),
          trackKey,
          startMs: current.startMs,
          endMs: current.endMs,
          text,
          source,
          confidence: calculateCueConfidence(text, current.startMs, current.endMs, countWords(text)),
        });
        current = null;
      };

      for (const cue of baseCues) {
        if (!current) {
          current = { ...cue };
          continue;
        }

        const gapMs = Math.max(0, Number(cue.startMs || 0) - Number(current.endMs || 0));
        const currentText = normalizeText(current.text);
        const nextText = normalizeText(cue.text);
        const joined = normalizeText(`${currentText} ${nextText}`);
        const durationMs = Math.max(0, Number(cue.endMs || 0) - Number(current.startMs || 0));

        const shouldMerge =
          gapMs < this.maxGapMs &&
          !hasTerminalPunctuation(currentText) &&
          (startsLikeContinuation(nextText) || countWords(nextText) <= this.shortTailWords) &&
          joined.length <= this.maxChars &&
          durationMs <= this.maxDurationMs;

        if (shouldMerge) {
          current.text = joined;
          current.endMs = cue.endMs;
          continue;
        }

        flushCurrent();
        current = { ...cue };
      }

      flushCurrent();
      return merged;
    }
  }

  class CueTranslationQueue {
    constructor() {
      this.pending = new Map();
      this.inflight = new Map();
      this.translated = new Set();
    }

    enqueue(id, text) {
      const key = String(id || "").trim();
      const value = normalizeText(text);
      if (!key || !value) return false;
      if (this.translated.has(key)) return false;
      this.pending.set(key, value);
      return true;
    }

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
    }

    markTranslated(ids) {
      for (const id of ids || []) {
        const key = String(id || "").trim();
        if (!key) continue;
        this.translated.add(key);
        this.pending.delete(key);
        this.inflight.delete(key);
      }
    }

    clearInflight(ids) {
      for (const id of ids || []) {
        const key = String(id || "").trim();
        if (!key) continue;
        this.inflight.delete(key);
      }
    }

    requeue(items) {
      for (const item of items || []) {
        const id = String(item?.id || "").trim();
        const text = normalizeText(item?.text || "");
        if (!id || !text || this.translated.has(id)) continue;
        this.inflight.delete(id);
        this.pending.set(id, text);
      }
    }

    hasPending() {
      return this.pending.size > 0;
    }

    hasTranslated(id) {
      const key = String(id || "").trim();
      return this.translated.has(key);
    }

    reset() {
      this.pending.clear();
      this.inflight.clear();
      this.translated.clear();
    }
  }

  class DomFallbackCommitter {
    constructor(options) {
      const opts = options && typeof options === "object" ? options : {};
      this.quietMs = Number.isFinite(opts.quietMs) ? Math.max(100, Math.floor(opts.quietMs)) : 700;
      this.forceMs = Number.isFinite(opts.forceMs) ? Math.max(this.quietMs, Math.floor(opts.forceMs)) : 1800;
      this.minWords = Number.isFinite(opts.minWords) ? Math.max(1, Math.floor(opts.minWords)) : 2;
      this.minChars = Number.isFinite(opts.minChars) ? Math.max(1, Math.floor(opts.minChars)) : 8;
      this.dedupeTtlMs = Number.isFinite(opts.dedupeTtlMs) ? Math.max(1000, Math.floor(opts.dedupeTtlMs)) : 12000;
      this.maxHistory = Number.isFinite(opts.maxHistory) ? Math.max(10, Math.floor(opts.maxHistory)) : 160;
      this.states = new Map();
      this.history = new Map();
    }

    dropMissingWindows(validWindowIds) {
      const valid = validWindowIds instanceof Set ? validWindowIds : new Set(validWindowIds || []);
      for (const key of this.states.keys()) {
        if (valid.has(key)) continue;
        this.states.delete(key);
      }
    }

    ingest(windowKey, rawText, videoTimeMs, nowMs) {
      const key = String(windowKey || "").trim();
      if (!key) return null;

      const now = Number.isFinite(nowMs) ? nowMs : Date.now();
      const videoMs = Number.isFinite(videoTimeMs) ? Math.max(0, Math.floor(videoTimeMs)) : 0;
      const text = normalizeCaptionText(rawText, { minLength: 2, maxLength: 240 });
      if (!text) return null;

      let state = this.states.get(key);
      if (!state) {
        state = {
          currentText: text,
          firstSeenAt: now,
          lastChangedAt: now,
          lastCommittedText: "",
          lastCommittedAt: 0,
          lastEndMs: videoMs,
        };
        this.states.set(key, state);
      } else if (state.currentText !== text) {
        const changed = state.currentText;
        const isPrefixGrowth = text.startsWith(changed);

        if (!isPrefixGrowth && this.canCommitText(changed)) {
          const commit = this.commit(key, state, changed, videoMs, now);
          state.currentText = text;
          state.firstSeenAt = now;
          state.lastChangedAt = now;
          if (commit) return commit;
        } else {
          state.currentText = text;
          state.lastChangedAt = now;
          if (!isPrefixGrowth) state.firstSeenAt = now;
        }
      }

      if (this.shouldCommit(state, now)) {
        return this.commit(key, state, state.currentText, videoMs, now);
      }

      return null;
    }

    flush(videoTimeMs, nowMs) {
      const now = Number.isFinite(nowMs) ? nowMs : Date.now();
      const videoMs = Number.isFinite(videoTimeMs) ? Math.max(0, Math.floor(videoTimeMs)) : 0;
      const commits = [];

      for (const [windowKey, state] of this.states) {
        if (!state?.currentText) continue;
        if (!this.shouldCommit(state, now)) continue;
        const cue = this.commit(windowKey, state, state.currentText, videoMs, now);
        if (cue) commits.push(cue);
      }

      return commits;
    }

    canCommitText(text) {
      const normalized = normalizeText(text);
      if (!normalized) return false;
      if (normalized.length < this.minChars) return false;
      if (normalized.split(/\s+/).filter(Boolean).length < this.minWords) return false;
      return true;
    }

    shouldCommit(state, now) {
      const text = normalizeText(state?.currentText || "");
      if (!this.canCommitText(text)) return false;
      if (/[.?!。？！]$/.test(text)) return true;
      if (now - Number(state.lastChangedAt || now) >= this.quietMs) return true;
      if (now - Number(state.firstSeenAt || now) >= this.forceMs) return true;
      return false;
    }

    commit(windowKey, state, text, videoMs, now) {
      const normalized = normalizeText(text);
      if (!this.canCommitText(normalized)) return null;

      this.pruneHistory(now);
      const historyKey = `${windowKey}::${normalized}`;
      const seenAt = this.history.get(historyKey);
      if (typeof seenAt === "number" && now - seenAt < this.dedupeTtlMs) {
        state.firstSeenAt = now;
        state.lastChangedAt = now;
        return null;
      }

      state.firstSeenAt = now;
      state.lastChangedAt = now;
      state.lastCommittedText = normalized;
      state.lastCommittedAt = now;

      const startMs = Math.max(videoMs, Number(state.lastEndMs || videoMs));
      const endMs = startMs + 2200;
      state.lastEndMs = endMs;

      this.history.set(historyKey, now);
      while (this.history.size > this.maxHistory) {
        const oldest = this.history.keys().next().value;
        if (!oldest) break;
        this.history.delete(oldest);
      }

      return {
        cueId: buildCueId(`dom:${windowKey}`, startMs, endMs, normalized),
        trackKey: `dom:${windowKey}`,
        startMs,
        endMs,
        text: normalized,
        source: "dom",
        windowId: windowKey,
        confidence: calculateCueConfidence(normalized, startMs, endMs, countWords(normalized)),
      };
    }

    pruneHistory(now) {
      for (const [key, ts] of this.history) {
        if (now - ts > this.dedupeTtlMs) {
          this.history.delete(key);
        }
      }
    }

    reset() {
      this.states.clear();
      this.history.clear();
    }
  }

  function selectActiveCue(cues, currentMs) {
    const list = Array.isArray(cues) ? cues : [];
    if (!list.length) return null;

    const now = Number.isFinite(currentMs) ? currentMs : 0;
    let lastPast = null;

    for (const cue of list) {
      const start = Number(cue?.startMs || 0);
      const end = Number(cue?.endMs || 0);
      if (now >= start && now <= end) return cue;
      if (start <= now) {
        if (!lastPast || start > Number(lastPast.startMs || 0)) {
          lastPast = cue;
        }
      }
    }

    if (lastPast && now - Number(lastPast.endMs || 0) <= 2500) {
      return lastPast;
    }

    return null;
  }

  return {
    DEFAULT_WORDS_REGEX,
    LANGS_CONFIG,
    normalizeText,
    normalizeCaptionText,
    sha1Hex,
    buildCueId,
    eventsToSimpleCues,
    isLowConfidenceAsrWindow,
    selectActiveCue,
    YouTubeAsrStabilizer,
    ManualCaptionSentenceMerger,
    CueTranslationQueue,
    DomFallbackCommitter,
  };
});
