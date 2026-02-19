import crypto from "crypto";

export const MAX_BODY_BYTES = 65536;
const EXTENSION_ORIGIN_PREFIXES = ["chrome-extension://", "edge-extension://", "moz-extension://"];

const ALLOWED_OPTIONS = new Set([
  "formality",
  "split_sentences",
  "tag_handling",
  "tag_handling_version",
  "preserve_formatting",
  "context",
  "model_type",
]);

const ALLOWED_SPLIT_SENTENCES = new Set(["0", "1", "nonewlines"]);
const ALLOWED_TAG_HANDLING = new Set(["html", "xml"]);
const ALLOWED_TAG_HANDLING_VERSION = new Set(["v2"]);
const ALLOWED_MODEL_TYPES = new Set([
  "latency_optimized",
  "quality_optimized",
  "prefer_quality_optimized",
]);
const MAX_CONTEXT_CHARS = 2000;

export function proxyError(code, message, statusCode, retryable = false) {
  const err = new Error(message);
  err.code = code;
  err.statusCode = statusCode;
  err.retryable = Boolean(retryable);
  return err;
}

export function normalizeText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function normalizeOptionValue(key, value) {
  if (value === undefined || value === null) return undefined;

  switch (key) {
    case "formality": {
      const normalized = String(value).trim().toLowerCase();
      return normalized || undefined;
    }
    case "split_sentences": {
      const normalized = String(value).trim().toLowerCase();
      if (!normalized) return undefined;
      return ALLOWED_SPLIT_SENTENCES.has(normalized) ? normalized : undefined;
    }
    case "tag_handling": {
      const normalized = String(value).trim().toLowerCase();
      if (!normalized) return undefined;
      return ALLOWED_TAG_HANDLING.has(normalized) ? normalized : undefined;
    }
    case "tag_handling_version": {
      const normalized = String(value).trim().toLowerCase();
      if (!normalized) return undefined;
      return ALLOWED_TAG_HANDLING_VERSION.has(normalized) ? normalized : undefined;
    }
    case "preserve_formatting":
      return Boolean(value);
    case "context": {
      const normalized = normalizeText(value);
      if (!normalized) return undefined;
      return normalized.slice(0, MAX_CONTEXT_CHARS);
    }
    case "model_type": {
      const normalized = String(value).trim().toLowerCase();
      if (!normalized) return undefined;
      return ALLOWED_MODEL_TYPES.has(normalized) ? normalized : undefined;
    }
    default:
      return undefined;
  }
}

function normalizeOptions(input) {
  if (!input || typeof input !== "object") return {};
  const out = {};
  for (const key of Object.keys(input).sort()) {
    if (!ALLOWED_OPTIONS.has(key)) continue;
    const normalized = normalizeOptionValue(key, input[key]);
    if (normalized === undefined) continue;
    out[key] = normalized;
  }
  return out;
}

export function normalizeTranslatePayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw proxyError("BAD_REQUEST", "Missing or invalid JSON body", 400, false);
  }

  const targetLang = String(payload.target_lang || "").trim().toUpperCase();
  if (!targetLang) {
    throw proxyError("BAD_REQUEST", "Missing target_lang", 400, false);
  }

  let items = [];
  if (Array.isArray(payload.items)) {
    items = payload.items;
  } else if (Array.isArray(payload.text)) {
    items = payload.text.map((text, idx) => ({ id: String(idx), text }));
  } else if (typeof payload.text === "string") {
    items = [{ id: "0", text: payload.text }];
  }

  const normalizedItems = items
    .map((item, idx) => ({
      id: String(item?.id ?? idx),
      text: normalizeText(item?.text || ""),
    }))
    .filter((item) => item.id && item.text);

  if (!normalizedItems.length) {
    throw proxyError("BAD_REQUEST", "Missing translate items", 400, false);
  }

  return {
    items: normalizedItems,
    target_lang: targetLang,
    source_lang: String(payload.source_lang || "").trim().toUpperCase(),
    options: normalizeOptions(payload.options),
  };
}

export function buildDeepLBody(normalizedPayload) {
  const body = {
    text: normalizedPayload.items.map((item) => item.text),
    target_lang: normalizedPayload.target_lang,
  };

  if (normalizedPayload.source_lang) body.source_lang = normalizedPayload.source_lang;
  if (Object.keys(normalizedPayload.options).length) Object.assign(body, normalizedPayload.options);
  return body;
}

export function buildRequestCacheKey(normalizedPayload, apiBase) {
  return hashKey({
    apiBase,
    text: normalizedPayload.items.map((item) => item.text),
    target_lang: normalizedPayload.target_lang,
    source_lang: normalizedPayload.source_lang,
    options: normalizedPayload.options,
  });
}

export function hashKey(value) {
  const h = crypto.createHash("sha256");
  h.update(JSON.stringify(value));
  return h.digest("hex");
}

export function mapDeepLError(statusCode, fallbackMessage) {
  if (statusCode === 400) {
    return { code: "BAD_REQUEST", retryable: false, statusCode };
  }
  if (statusCode === 401 || statusCode === 403) {
    return { code: "DEEPL_AUTH", retryable: false, statusCode };
  }
  if (statusCode === 429) {
    return { code: "DEEPL_RATE_LIMIT", retryable: true, statusCode };
  }
  if (statusCode === 456) {
    return { code: "DEEPL_QUOTA", retryable: false, statusCode };
  }
  if (statusCode >= 500) {
    return { code: "UNKNOWN", retryable: true, statusCode };
  }
  return { code: "UNKNOWN", retryable: false, statusCode, message: fallbackMessage };
}

export function mapErrorToResponse(err) {
  if (err?.code && err?.statusCode) {
    return {
      statusCode: err.statusCode,
      error: {
        code: err.code,
        message: err.message,
        retryable: Boolean(err.retryable),
      },
    };
  }

  return {
    statusCode: 500,
    error: {
      code: "UNKNOWN",
      message: err?.message || "Unknown error",
      retryable: false,
    },
  };
}

export function isJsonContentType(value) {
  const text = String(value || "").trim().toLowerCase();
  return text === "application/json" || text.startsWith("application/json;");
}

function isTrustedLocalOrigin(origin) {
  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }

  const href = parsed.href;
  if (EXTENSION_ORIGIN_PREFIXES.some((prefix) => href.startsWith(prefix))) {
    return true;
  }

  const host = parsed.hostname;
  const isLocalHost = host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
  return isLocalHost && (parsed.protocol === "http:" || parsed.protocol === "https:");
}

function matchOriginPattern(origin, pattern) {
  if (!pattern) return false;
  const token = String(pattern).trim();
  if (!token) return false;
  if (token === "local") return isTrustedLocalOrigin(origin);
  if (token.endsWith("*")) return origin.startsWith(token.slice(0, -1));
  return origin === token;
}

export function resolveAllowedOrigin(origin, allowedOriginsRaw) {
  if (!origin) return null;

  const raw = String(allowedOriginsRaw || "local").trim();
  if (!raw || raw === "local") {
    return isTrustedLocalOrigin(origin) ? origin : null;
  }
  if (raw === "*") {
    return "*";
  }

  const patterns = raw.split(",").map((part) => part.trim()).filter(Boolean);
  if (!patterns.length) {
    return isTrustedLocalOrigin(origin) ? origin : null;
  }

  return patterns.some((pattern) => matchOriginPattern(origin, pattern)) ? origin : null;
}
