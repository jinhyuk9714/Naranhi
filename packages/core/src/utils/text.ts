import { SENTENCE_BOUNDARY, LIMITS } from '../constants';

/**
 * Normalize whitespace: collapse multiple spaces/newlines to single space, trim.
 */
export function normalizeText(text: string | undefined | null): string {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function normalizeOptionValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => normalizeOptionValue(item));
  if (!value || typeof value !== 'object') return value;

  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    out[key] = normalizeOptionValue((value as Record<string, unknown>)[key]);
  }
  return out;
}

export function normalizeOptions(options: unknown): Record<string, unknown> {
  if (!options || typeof options !== 'object') return {};
  return normalizeOptionValue(options) as Record<string, unknown>;
}

export function buildCacheKeyMaterial(params: {
  text: string;
  sourceLang: string;
  targetLang: string;
  options?: unknown;
}): string {
  return JSON.stringify({
    text: normalizeText(params.text),
    sourceLang: params.sourceLang || '',
    targetLang: params.targetLang || '',
    options: normalizeOptions(params.options),
  });
}

export async function sha256Hex(input: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Missing WebCrypto subtle API');
  }
  const bytes = new TextEncoder().encode(String(input));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
}

function splitOversizedSentence(text: string, maxChars: number, out: string[]): void {
  for (let idx = 0; idx < text.length; idx += maxChars) {
    out.push(text.slice(idx, idx + maxChars));
  }
}

export function splitTextByLimit(
  text: string,
  maxChars: number = LIMITS.MAX_CHARS_PER_ITEM,
): string[] {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  if (normalized.length <= maxChars) return [normalized];

  const sentences = normalized.split(SENTENCE_BOUNDARY).filter(Boolean);
  if (!sentences.length) {
    const chunks: string[] = [];
    splitOversizedSentence(normalized, maxChars, chunks);
    return chunks;
  }

  const out: string[] = [];
  let current = '';

  for (const sentenceRaw of sentences) {
    const sentence = normalizeText(sentenceRaw);
    if (!sentence) continue;

    if (sentence.length > maxChars) {
      if (current) {
        out.push(current);
        current = '';
      }
      splitOversizedSentence(sentence, maxChars, out);
      continue;
    }

    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length > maxChars) {
      out.push(current);
      current = sentence;
      continue;
    }
    current = candidate;
  }

  if (current) out.push(current);
  return out.filter(Boolean);
}
