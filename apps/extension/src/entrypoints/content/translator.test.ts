import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  injectStyles,
  injectTranslation,
  showBanner,
  removeAllTranslations,
} = vi.hoisted(() => ({
  injectStyles: vi.fn(),
  injectTranslation: vi.fn(),
  showBanner: vi.fn(),
  removeAllTranslations: vi.fn(),
}));

vi.mock('./dom-injector', () => ({
  injectStyles,
  findTranslatableBlocks: vi.fn(() => []),
  assignBlockIds: vi.fn(() => []),
  injectTranslation,
  removeAllTranslations,
  showBanner,
}));

vi.mock('./content-detector', () => ({
  detectPrimaryContainer: vi.fn(() => null),
}));

import { PageTranslator } from './translator';

describe('PageTranslator reliability', () => {
  beforeEach(() => {
    injectStyles.mockReset();
    injectTranslation.mockReset();
    showBanner.mockReset();
    removeAllTranslations.mockReset();
  });

  it('shows retryable banner when translation fails', async () => {
    (globalThis as any).chrome = {
      runtime: {
        sendMessage: vi.fn(async () => ({
          ok: false,
          error: { message: 'Too many requests', retryable: true },
        })),
      },
    };

    const translator = new PageTranslator() as any;
    translator.state.enabled = true;
    translator.state.activeRunId = 'run-test';

    await translator.translateBatch([{ id: 'b1', text: 'hello world this is long enough' }]);

    expect(showBanner).toHaveBeenCalledTimes(1);
    expect(showBanner).toHaveBeenCalledWith('Too many requests', true, expect.any(Function));
  });

  it('does not inject stale translation response after disable', async () => {
    let resolveMessage: ((value: unknown) => void) | null = null;
    (globalThis as any).chrome = {
      runtime: {
        sendMessage: vi.fn(
          () =>
            new Promise((resolve) => {
              resolveMessage = resolve;
            }),
        ),
      },
    };

    const translator = new PageTranslator() as any;
    translator.state.enabled = true;
    translator.state.activeRunId = 'run-stale';

    const pending = translator.translateBatch([{ id: 'b1', text: 'hello world this is long enough' }]);
    translator.disable();

    resolveMessage?.({
      ok: true,
      data: { runId: 'run-stale', translations: [{ id: 'b1', text: '번역' }] },
    });

    await pending;

    expect(injectTranslation).not.toHaveBeenCalled();
    expect(showBanner).not.toHaveBeenCalled();
  });

  it('keeps toggle rollback stable when enable is invalidated mid-flight', async () => {
    let resolveSettings: ((value: unknown) => void) | null = null;
    (globalThis as any).chrome = {
      storage: {
        sync: {
          get: vi.fn(
            () =>
              new Promise((resolve) => {
                resolveSettings = resolve;
              }),
          ),
        },
      },
      runtime: {
        sendMessage: vi.fn(),
      },
    };

    const translator = new PageTranslator();
    const enabling = translator.enable();

    translator.disable();
    resolveSettings?.({});

    await expect(enabling).resolves.toBe(false);
    expect(translator.isEnabled()).toBe(false);
    expect(injectStyles).not.toHaveBeenCalled();
  });
});
