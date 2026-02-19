(function installNaranhiYouTubeHookBridge() {
  const FLAG_KEY = "__NARANHI_YT_HOOK_BRIDGE_V1__";
  if (globalThis[FLAG_KEY]) return;
  globalThis[FLAG_KEY] = true;

  const EVENT_TYPE = "NARANHI_YT_TIMEDTEXT_V1";
  const MAX_RESPONSE_BYTES = 512 * 1024;
  const MAX_TEXT_FOR_HASH = 200000;

  let consecutiveParseErrors = 0;

  function fnv1aHex(input) {
    let hash = 0x811c9dc5;
    const text = String(input || "");
    const limit = Math.min(text.length, MAX_TEXT_FOR_HASH);
    for (let i = 0; i < limit; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16);
  }

  function toURL(value) {
    try {
      return new URL(String(value || ""), globalThis.location.href);
    } catch {
      return null;
    }
  }

  function isTimedTextURL(urlObj) {
    if (!urlObj) return false;
    const pathname = String(urlObj.pathname || "");
    if (pathname.includes("/api/timedtext")) return true;
    if (!pathname.includes("videoplayback")) return false;
    return urlObj.searchParams.has("text");
  }

  function trackLang(urlObj) {
    return String(urlObj?.searchParams.get("tlang") || urlObj?.searchParams.get("lang") || "").toLowerCase();
  }

  function isAsr(urlObj) {
    return String(urlObj?.searchParams.get("kind") || "").toLowerCase() === "asr";
  }

  function trackSignature(urlObj) {
    const params = urlObj?.searchParams;
    if (!params) return "default";

    const keys = ["lang", "tlang", "kind", "name", "fmt", "v", "id"];
    const pairs = [];
    for (const key of keys) {
      if (!params.has(key)) continue;
      pairs.push(`${key}=${params.get(key)}`);
    }
    if (!pairs.length) return "default";
    return pairs.join("&");
  }

  function postPayload(payload) {
    globalThis.postMessage(
      {
        source: "naranhi-yt-bridge",
        type: EVENT_TYPE,
        payload,
      },
      "*"
    );
  }

  function processTimedText(urlObj, rawText) {
    const text = typeof rawText === "string" ? rawText : "";
    if (!text || text.length > MAX_RESPONSE_BYTES) return;

    const events = parseTimedtextEvents(text, urlObj.toString());
    if (!events.length) return;

    consecutiveParseErrors = 0;

    postPayload({
      url: urlObj.toString(),
      trackLang: trackLang(urlObj),
      isAsr: isAsr(urlObj),
      trackSignature: trackSignature(urlObj),
      events,
      responseHash: fnv1aHex(text),
      receivedAt: Date.now(),
    });
  }

  function parseTimedtextEvents(rawText, sourceUrl) {
    const text = typeof rawText === "string" ? rawText : "";
    if (!text) return [];

    try {
      const json = JSON.parse(text);
      const jsonEvents = Array.isArray(json?.events) ? json.events : [];
      if (jsonEvents.length) return jsonEvents;
    } catch {
      // try XML fallback below
    }

    const xmlEvents = parseTimedtextXml(text);
    if (xmlEvents.length) return xmlEvents;

    const trimmed = text.trim();
    const looksStructured =
      trimmed.startsWith("{") ||
      trimmed.startsWith("[") ||
      trimmed.startsWith("<");
    if (!looksStructured) return [];

    consecutiveParseErrors += 1;
    postPayload({
      url: String(sourceUrl || ""),
      parseError: true,
      consecutiveParseErrors,
      receivedAt: Date.now(),
    });
    return [];
  }

  function decodeToMs(value, unit) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return NaN;
    if (unit === "sec") return Math.max(0, Math.floor(numeric * 1000));
    return Math.max(0, Math.floor(numeric));
  }

  function parseTimedtextXml(rawText) {
    let doc;
    try {
      doc = new DOMParser().parseFromString(rawText, "text/xml");
    } catch {
      return [];
    }

    if (!doc || doc.querySelector("parsererror")) return [];

    const nodes = Array.from(doc.querySelectorAll("p, text"));
    if (!nodes.length) return [];

    const events = [];
    for (const node of nodes) {
      const hasMsAttrs = node.hasAttribute("t") || node.hasAttribute("d");
      const startMs = hasMsAttrs
        ? decodeToMs(node.getAttribute("t"), "ms")
        : decodeToMs(node.getAttribute("start"), "sec");
      const durationMs = hasMsAttrs
        ? decodeToMs(node.getAttribute("d"), "ms")
        : decodeToMs(node.getAttribute("dur"), "sec");

      if (!Number.isFinite(startMs)) continue;
      if (!Number.isFinite(durationMs) || durationMs <= 0) continue;

      const segNodes = Array.from(node.querySelectorAll("s"));
      const segs = [];
      if (segNodes.length) {
        for (const segNode of segNodes) {
          const utf8 = String(segNode.textContent || "").trim();
          if (!utf8) continue;
          const tOffsetMs = decodeToMs(segNode.getAttribute("t"), "ms");
          segs.push({
            utf8,
            ...(Number.isFinite(tOffsetMs) ? { tOffsetMs } : {}),
          });
        }
      } else {
        const utf8 = String(node.textContent || "").trim();
        if (utf8) {
          segs.push({ utf8, tOffsetMs: 0 });
        }
      }

      if (!segs.length) continue;
      events.push({
        tStartMs: startMs,
        dDurationMs: durationMs,
        segs,
      });
    }

    return events;
  }

  function installFetchHook() {
    const originalFetch = globalThis.fetch;
    if (typeof originalFetch !== "function") return;

    globalThis.fetch = async function patchedFetch(input, init) {
      const response = await originalFetch.apply(this, [input, init]);
      try {
        const target = typeof input === "string" ? input : input?.url;
        const urlObj = toURL(target);
        if (!isTimedTextURL(urlObj)) return response;
        if (!response?.ok) return response;

        const clone = response.clone();
        const body = await clone.text();
        processTimedText(urlObj, body);
      } catch {
        // no-op
      }
      return response;
    };
  }

  function installXHRHook() {
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function patchedOpen(method, url, ...rest) {
      this.__naranhiYtHookURL = url;
      return originalOpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function patchedSend(...args) {
      this.addEventListener(
        "load",
        function onLoad() {
          try {
            const rawUrl = this.responseURL || this.__naranhiYtHookURL;
            const urlObj = toURL(rawUrl);
            if (!isTimedTextURL(urlObj)) return;

            if (this.responseType && this.responseType !== "" && this.responseType !== "text") {
              return;
            }

            const body = typeof this.responseText === "string" ? this.responseText : "";
            processTimedText(urlObj, body);
          } catch {
            // no-op
          }
        },
        { once: true }
      );

      return originalSend.apply(this, args);
    };
  }

  installFetchHook();
  installXHRHook();
})();
