import { describe, expect, it, vi } from 'vitest';
import { MESSAGE_TYPES } from '@naranhi/core';
import { handleSelectionTranslateRequest } from './selection-translate';

describe('handleSelectionTranslateRequest', () => {
  it('sends tooltip with translated text on success', async () => {
    const sendMessage = vi.fn(async () => {});
    const translateOne = vi.fn(async () => '안녕하세요');

    await handleSelectionTranslateRequest({
      selectionText: '  hello world  ',
      tabId: 123,
      translateOne,
      sendMessage,
    });

    expect(translateOne).toHaveBeenCalledWith('hello world');
    expect(sendMessage).toHaveBeenCalledWith(123, {
      type: MESSAGE_TYPES.SHOW_TOOLTIP,
      translatedText: '안녕하세요',
    });
  });

  it('sends retryable banner when translation fails with typed error', async () => {
    const sendMessage = vi.fn(async () => {});
    const translateOne = vi.fn(async () => {
      throw { code: 'RATE_LIMIT', message: 'Too many requests', retryable: true };
    });

    await handleSelectionTranslateRequest({
      selectionText: 'hello',
      tabId: 321,
      translateOne,
      sendMessage,
    });

    expect(sendMessage).toHaveBeenCalledWith(321, {
      type: MESSAGE_TYPES.SHOW_BANNER,
      message: 'Too many requests',
      retryable: true,
    });
  });

  it('does nothing for empty selection or missing tab id', async () => {
    const sendMessage = vi.fn(async () => {});
    const translateOne = vi.fn(async () => 'noop');

    await handleSelectionTranslateRequest({
      selectionText: '   ',
      tabId: 123,
      translateOne,
      sendMessage,
    });

    await handleSelectionTranslateRequest({
      selectionText: 'hello',
      tabId: undefined,
      translateOne,
      sendMessage,
    });

    expect(translateOne).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
