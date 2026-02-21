import { MESSAGE_TYPES, normalizeText } from '@naranhi/core';
import type { TranslationError } from '@naranhi/core';

interface SelectionTranslateInput {
  selectionText: string;
  tabId?: number;
  translateOne: (text: string) => Promise<string>;
  sendMessage: (tabId: number, message: unknown) => Promise<void>;
}

export async function handleSelectionTranslateRequest(input: SelectionTranslateInput): Promise<void> {
  const selectionText = normalizeText(input.selectionText || '');
  if (!selectionText || !input.tabId) return;

  try {
    const translatedText = await input.translateOne(selectionText);
    if (!translatedText) throw makeError('UNKNOWN', 'No translation returned', true);

    await input.sendMessage(input.tabId, {
      type: MESSAGE_TYPES.SHOW_TOOLTIP,
      translatedText,
    });
  } catch (err) {
    const normalized = normalizeError(err);
    await input.sendMessage(input.tabId, {
      type: MESSAGE_TYPES.SHOW_BANNER,
      message: normalized.message,
      retryable: normalized.retryable,
    });
  }
}

function makeError(code: string, message: string, retryable: boolean, statusCode?: number): TranslationError {
  return { code, message, retryable, ...(statusCode ? { statusCode } : {}) };
}

function normalizeError(err: unknown): TranslationError {
  if (err && typeof err === 'object' && 'code' in err && 'message' in err) {
    return err as TranslationError;
  }
  return makeError('UNKNOWN', (err as Error)?.message || 'Unknown error', false);
}
