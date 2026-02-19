import http from "http";
import fs from "fs";
import path from "path";
import { URL } from "url";
import { fileURLToPath } from "url";
import {
  MAX_BODY_BYTES,
  buildDeepLBody,
  buildRequestCacheKey,
  isJsonContentType,
  mapDeepLError,
  mapErrorToResponse,
  normalizeTranslatePayload,
  proxyError,
  resolveAllowedOrigin,
} from "./translateUtils.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

loadDotEnv();

function json(res, statusCode, obj, headers = {}) {
  const body = JSON.stringify(obj);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    ...headers,
  });
  res.end(body);
}

function text(res, statusCode, body, headers = {}) {
  res.writeHead(statusCode, {
    "content-type": "text/plain; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    ...headers,
  });
  res.end(body);
}

function getEnv(name, fallback = undefined) {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}

function loadDotEnv() {
  const candidates = [path.resolve(process.cwd(), ".env"), path.resolve(__dirname, ".env")];
  const envPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!envPath) return;

  const raw = fs.readFileSync(envPath, "utf-8");
  for (const lineRaw of raw.split(/\r?\n/)) {
    const line = lineRaw.trim();
    if (!line || line.startsWith("#")) continue;

    const eqIdx = line.indexOf("=");
    if (eqIdx <= 0) continue;

    const key = line.slice(0, eqIdx).trim();
    if (!key || process.env[key] !== undefined) continue;

    let value = line.slice(eqIdx + 1).trim();
    const quoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (quoted) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

const AUTH_KEY = getEnv("DEEPL_AUTH_KEY");
const API_BASE = getEnv("DEEPL_API_BASE", "https://api-free.deepl.com");
const PORT = parseInt(getEnv("PORT", "8787"), 10);
const ALLOWED_ORIGINS = getEnv("ALLOWED_ORIGINS", "local"); // "local", "*", or comma-separated allowlist
const CACHE_TTL_MS = parseInt(getEnv("CACHE_TTL_MS", "86400000"), 10);
const ENABLE_AI_SPLITTER = String(getEnv("ENABLE_AI_SPLITTER", "false")).toLowerCase() === "true";
const AI_SPLITTER_PROVIDER = String(getEnv("AI_SPLITTER_PROVIDER", "openai")).trim().toLowerCase();
const AI_SPLITTER_API_KEY = getEnv("AI_SPLITTER_API_KEY", "");
const AI_SPLITTER_MODEL = getEnv("AI_SPLITTER_MODEL", "gpt-4o-mini");
const AI_SPLITTER_BASE_URL = String(getEnv("AI_SPLITTER_BASE_URL", "https://api.openai.com")).replace(/\/$/, "");
const AI_SPLITTER_TIMEOUT_MS = Math.max(500, parseInt(getEnv("AI_SPLITTER_TIMEOUT_MS", "5000"), 10) || 5000);
const SEGMENT_MAX_CHUNKS = 12;
const SEGMENT_MAX_CHARS_PER_CHUNK = 4000;

if (!AUTH_KEY) {
  console.error("Missing DEEPL_AUTH_KEY. Set env var or use .env.example as reference.");
  process.exit(1);
}

const cache = new Map(); // key -> { ts, value }

function allowOrigin(origin) {
  return resolveAllowedOrigin(origin, ALLOWED_ORIGINS);
}

function ensureJsonRequest(req) {
  const contentType = req.headers["content-type"];
  if (!isJsonContentType(contentType)) {
    throw proxyError("BAD_REQUEST", "Content-Type must be application/json", 415, false);
  }
}

async function readJson(req) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) {
      throw proxyError("BAD_REQUEST", "Request body too large", 413, false);
    }
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf-8");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    throw proxyError("BAD_REQUEST", "Invalid JSON body", 400, false);
  }
}

async function deeplTranslate(normalizedPayload) {
  const body = buildDeepLBody(normalizedPayload);
  const resp = await fetch(`${API_BASE}/v2/translate`, {
    method: "POST",
    headers: {
      "authorization": `DeepL-Auth-Key ${AUTH_KEY}`,
      "content-type": "application/json",
      "user-agent": "NaranhiProxy/0.1",
    },
    body: JSON.stringify(body),
  });

  const data = await resp.json().catch(() => null);
  if (!resp.ok) {
    const mapped = mapDeepLError(resp.status, data?.message || data?.error);
    throw proxyError(
      mapped.code,
      data?.message || data?.error || `DeepL error ${resp.status}`,
      mapped.statusCode,
      mapped.retryable
    );
  }
  return data;
}

function normalizeSegmentPayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw proxyError("BAD_REQUEST", "Missing or invalid JSON body", 400, false);
  }

  const lang = String(payload.lang || "en").trim().toLowerCase() || "en";
  const chunksRaw = Array.isArray(payload.chunks) ? payload.chunks : [];
  if (!chunksRaw.length) {
    throw proxyError("BAD_REQUEST", "Missing chunks", 400, false);
  }
  if (chunksRaw.length > SEGMENT_MAX_CHUNKS) {
    throw proxyError("BAD_REQUEST", "Too many chunks", 400, false);
  }

  const chunks = chunksRaw
    .map((chunk, index) => ({
      id: String(chunk?.id ?? index),
      text: String(chunk?.text || "").replace(/\s+/g, " ").trim(),
    }))
    .filter((chunk) => chunk.id && chunk.text);

  if (!chunks.length) {
    throw proxyError("BAD_REQUEST", "Empty chunks", 400, false);
  }

  for (const chunk of chunks) {
    if (chunk.text.length > SEGMENT_MAX_CHARS_PER_CHUNK) {
      throw proxyError("BAD_REQUEST", "Chunk text too large", 400, false);
    }
  }

  const hints = payload.hints && typeof payload.hints === "object" ? payload.hints : {};
  return { lang, chunks, hints };
}

function heuristicSegmentText(text) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const punctuated = normalized.split(/(?<=[.!?。！？])\s+/u).map((item) => item.trim()).filter(Boolean);
  if (punctuated.length > 1) return punctuated;

  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length <= 14) return [normalized];

  const out = [];
  for (let i = 0; i < words.length; i += 12) {
    out.push(words.slice(i, i + 12).join(" "));
  }
  return out.filter(Boolean);
}

function parseSegmentResponseContent(content) {
  const raw = String(content || "").trim();
  if (!raw) return [];

  const tryParse = (input) => {
    try {
      return JSON.parse(input);
    } catch {
      return null;
    }
  };

  let parsed = tryParse(raw);
  if (!parsed) {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      parsed = tryParse(raw.slice(start, end + 1));
    }
  }
  if (!parsed || typeof parsed !== "object") return [];

  const sentences = Array.isArray(parsed.sentences) ? parsed.sentences : [];
  return sentences
    .map((value) => String(value || "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

async function segmentChunkWithOpenAI(chunk, lang, hints) {
  if (!AI_SPLITTER_API_KEY) {
    throw proxyError("AI_SPLITTER_CONFIG", "AI splitter provider is not configured", 500, false);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_SPLITTER_TIMEOUT_MS);

  try {
    const prompt = [
      "Split subtitle text into natural reading sentences.",
      "Return strict JSON only.",
      'Schema: {"sentences":["..."]}',
      "Do not translate. Preserve original language.",
      `Language hint: ${lang}`,
      `Mode hint: ${String(hints?.mode || "default")}`,
      `Text: ${chunk.text}`,
    ].join("\n");

    const resp = await fetch(`${AI_SPLITTER_BASE_URL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${AI_SPLITTER_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: AI_SPLITTER_MODEL,
        temperature: 0,
        messages: [
          {
            role: "system",
            content: "Return JSON only. No markdown.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
      signal: controller.signal,
    });

    const data = await resp.json().catch(() => null);
    if (!resp.ok) {
      const message = data?.error?.message || data?.message || `AI splitter error ${resp.status}`;
      throw proxyError("UNKNOWN", message, 502, true);
    }

    const content = data?.choices?.[0]?.message?.content;
    const parsed = parseSegmentResponseContent(content);
    if (!parsed.length) {
      throw proxyError("UNKNOWN", "AI splitter returned empty result", 502, true);
    }
    return parsed;
  } finally {
    clearTimeout(timer);
  }
}

async function segmentChunks(payload) {
  const useOpenAI = AI_SPLITTER_PROVIDER === "openai";
  const out = [];

  for (const chunk of payload.chunks) {
    let sentences = [];

    if (useOpenAI) {
      try {
        sentences = await segmentChunkWithOpenAI(chunk, payload.lang, payload.hints);
      } catch (err) {
        if (err?.code === "AI_SPLITTER_CONFIG") throw err;
        sentences = heuristicSegmentText(chunk.text);
      }
    } else {
      sentences = heuristicSegmentText(chunk.text);
    }

    out.push({
      id: chunk.id,
      sentences: sentences.length ? sentences : [chunk.text],
    });
  }

  return out;
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const origin = req.headers.origin;
  const allowed = allowOrigin(origin);
  const corsHeaders = allowed
    ? {
        "access-control-allow-origin": allowed,
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-headers": "content-type",
        ...(allowed === "*" ? {} : { vary: "Origin" }),
      }
    : {};

  // Preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders);
    return res.end();
  }

  if (u.pathname === "/health") {
    return text(res, 200, "ok", corsHeaders);
  }

  if (u.pathname === "/segment") {
    if (req.method !== "POST") {
      return json(
        res,
        405,
        { error: { code: "BAD_REQUEST", message: "Method not allowed", retryable: false } },
        corsHeaders
      );
    }

    if (!ENABLE_AI_SPLITTER) {
      return json(
        res,
        404,
        { error: { code: "FEATURE_DISABLED", message: "AI splitter is disabled", retryable: false } },
        corsHeaders
      );
    }

    try {
      ensureJsonRequest(req);
      const payload = await readJson(req);
      const normalizedPayload = normalizeSegmentPayload(payload);
      const segments = await segmentChunks(normalizedPayload);
      return json(
        res,
        200,
        {
          segments,
          meta: {
            provider: AI_SPLITTER_PROVIDER,
          },
        },
        corsHeaders
      );
    } catch (err) {
      const mapped = mapErrorToResponse(err);
      return json(res, mapped.statusCode, { error: mapped.error }, corsHeaders);
    }
  }

  if (u.pathname === "/translate") {
    if (req.method !== "POST") {
      return json(
        res,
        405,
        { error: { code: "BAD_REQUEST", message: "Method not allowed", retryable: false } },
        corsHeaders
      );
    }

    try {
      ensureJsonRequest(req);
      const payload = await readJson(req);
      if (!payload) throw proxyError("BAD_REQUEST", "Missing JSON body", 400, false);
      const normalizedPayload = normalizeTranslatePayload(payload);
      const key = buildRequestCacheKey(normalizedPayload, API_BASE);

      const now = Date.now();
      const cached = cache.get(key);
      let deeplData;
      let cacheState = "MISS";
      if (cached && now - cached.ts < CACHE_TTL_MS) {
        deeplData = cached.value;
        cacheState = "HIT";
      } else {
        deeplData = await deeplTranslate(normalizedPayload);
        cache.set(key, { ts: now, value: deeplData });
      }

      const translations = normalizedPayload.items.map((item, index) => ({
        id: item.id,
        text: deeplData?.translations?.[index]?.text || "",
        detected_source_language: deeplData?.translations?.[index]?.detected_source_language || "",
      }));

      return json(
        res,
        200,
        {
          translations,
          meta: {
            cache: cacheState,
            provider: "deepl",
          },
        },
        corsHeaders
      );
    } catch (err) {
      const mapped = mapErrorToResponse(err);
      return json(res, mapped.statusCode, { error: mapped.error }, corsHeaders);
    }
  }

  return json(
    res,
    404,
    { error: { code: "BAD_REQUEST", message: "Not found", retryable: false } },
    corsHeaders
  );
});

server.listen(PORT, () => {
  console.log(`Naranhi proxy listening on http://localhost:${PORT}`);
  console.log(`DeepL base: ${API_BASE}`);
  console.log(`AI splitter: ${ENABLE_AI_SPLITTER ? `enabled (${AI_SPLITTER_PROVIDER})` : "disabled"}`);
});
