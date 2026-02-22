import { MESSAGE_TYPES, normalizeText } from '@naranhi/core';
import { makeTranslationError, normalizeTranslationError } from '../../lib/error-helpers';

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
    if (!translatedText) throw makeTranslationError('UNKNOWN', 'No translation returned', true);

    await input.sendMessage(input.tabId, {
      type: MESSAGE_TYPES.SHOW_TOOLTIP,
      translatedText,
    });
  } catch (err) {
    const normalized = normalizeTranslationError(err);
    await input.sendMessage(input.tabId, {
      type: MESSAGE_TYPES.SHOW_BANNER,
      message: normalized.message,
      retryable: normalized.retryable,
    });
  }
}
