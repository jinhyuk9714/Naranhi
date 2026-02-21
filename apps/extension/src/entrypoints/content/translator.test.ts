import { describe, it, expect, vi, beforeEach } from 'vitest';

const { showBanner } = vi.hoisted(() => ({
  showBanner: vi.fn(),
}));

vi.mock('./dom-injector', () => ({
  injectStyles: vi.fn(),
  findTranslatableBlocks: vi.fn(() => []),
  assignBlockIds: vi.fn(() => []),
  injectTranslation: vi.fn(),
  removeAllTranslations: vi.fn(),
  showBanner,
}));

vi.mock('./content-detector', () => ({
  detectPrimaryContainer: vi.fn(() => null),
}));

import { PageTranslator } from './translator';

describe('PageTranslator error recovery', () => {
  beforeEach(() => {
    showBanner.mockReset();
    (globalThis as any).chrome = {
      runtime: {
        sendMessage: vi.fn(async () => ({
          ok: false,
          error: { message: 'Too many requests', retryable: true },
        })),
      },
    };
  });

  it('shows retryable banner when translation fails', async () => {
    const translator = new PageTranslator() as any;
    translator.state.activeRunId = 'run-test';

    await translator.translateBatch([{ id: 'b1', text: 'hello world this is long enough' }]);

    expect(showBanner).toHaveBeenCalledTimes(1);
    expect(showBanner).toHaveBeenCalledWith('Too many requests', true, expect.any(Function));
  });
});
