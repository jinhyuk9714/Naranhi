import type { TranslationError } from '@naranhi/core';

export function makeTranslationError(
  code: string,
  message: string,
  retryable: boolean,
  statusCode?: number,
): TranslationError {
  return { code, message, retryable, ...(statusCode ? { statusCode } : {}) };
}

export function normalizeTranslationError(err: unknown): TranslationError {
  if (err && typeof err === 'object' && 'code' in err && 'message' in err) {
    return err as TranslationError;
  }
  return makeTranslationError('UNKNOWN', (err as Error)?.message || 'Unknown error', false);
}
