import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const {
  injectStyles,
  injectTranslation,
  showBanner,
  removeAllTranslations,
  findTranslatableBlocks,
  assignBlockIds,
  detectPrimaryContainer,
} = vi.hoisted(() => ({
  injectStyles: vi.fn(),
  injectTranslation: vi.fn(),
  showBanner: vi.fn(),
  removeAllTranslations: vi.fn(),
  findTranslatableBlocks: vi.fn(() => []),
  assignBlockIds: vi.fn(() => []),
  detectPrimaryContainer: vi.fn(() => document.body),
}));

vi.mock('./dom-injector', () => ({
  injectStyles,
  findTranslatableBlocks,
  assignBlockIds,
  injectTranslation,
  removeAllTranslations,
  showBanner,
}));

vi.mock('./content-detector', () => ({
  detectPrimaryContainer,
}));

import { PageTranslator } from './translator';

describe('PageTranslator reliability', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('document', { body: {} } as any);
    injectStyles.mockReset();
    injectTranslation.mockReset();
    showBanner.mockReset();
    removeAllTranslations.mockReset();
    findTranslatableBlocks.mockReset().mockReturnValue([]);
    assignBlockIds.mockReset().mockReturnValue([]);
    detectPrimaryContainer.mockReset().mockReturnValue({} as HTMLElement);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
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

  it('translates only intersecting blocks and progresses on later intersections', async () => {
    const observed: Element[] = [];
    let onIntersect: ((entries: Array<{ isIntersecting: boolean; target: Element }>) => void) | null =
      null;

    class MockIntersectionObserver {
      constructor(cb: (entries: Array<{ isIntersecting: boolean; target: Element }>) => void) {
        onIntersect = cb;
      }
      observe(target: Element) {
        observed.push(target);
      }
      disconnect() {}
    }

    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver as any);

    const e1 = {
      innerText: 'First block text that is definitely longer than twenty chars',
      textContent: 'First block text that is definitely longer than twenty chars',
      getAttribute: vi.fn((name: string) => (name === 'data-naranhi-id' ? 'b1' : null)),
    } as unknown as HTMLElement;
    const e2 = {
      innerText: 'Second block text that is definitely longer than twenty chars',
      textContent: 'Second block text that is definitely longer than twenty chars',
      getAttribute: vi.fn((name: string) => (name === 'data-naranhi-id' ? 'b2' : null)),
    } as unknown as HTMLElement;

    findTranslatableBlocks.mockReturnValue([e1, e2]);
    assignBlockIds.mockReturnValue([
      { id: 'b1', text: e1.innerText, el: e1 },
      { id: 'b2', text: e2.innerText, el: e2 },
    ]);

    const sendMessage = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        data: { runId: 'run-test', translations: [{ id: 'b1', text: '첫번째' }] },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: { runId: 'run-test', translations: [{ id: 'b2', text: '두번째' }] },
      });

    (globalThis as any).chrome = {
      storage: {
        sync: {
          get: vi.fn(async () => ({
            visibleOnly: true,
            batchFlushMs: 120,
            visibleRootMargin: '350px 0px 600px 0px',
            extractionMode: 'readability',
          })),
        },
      },
      runtime: {
        sendMessage,
      },
    };

    const translator = new PageTranslator();
    await translator.enable();

    expect(observed).toHaveLength(2);

    onIntersect?.([{ isIntersecting: true, target: e1 }]);
    await vi.advanceTimersByTimeAsync(130);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0][0].items).toEqual([{ id: 'b1', text: e1.innerText }]);

    onIntersect?.([{ isIntersecting: true, target: e2 }]);
    await vi.advanceTimersByTimeAsync(130);

    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage.mock.calls[1][0].items).toEqual([{ id: 'b2', text: e2.innerText }]);
  });

  it('falls back to queued batches when IntersectionObserver is unavailable', async () => {
    vi.stubGlobal('IntersectionObserver', undefined as any);

    const e1 = {
      innerText: 'Fallback block one text that is definitely longer than twenty chars',
      textContent: 'Fallback block one text that is definitely longer than twenty chars',
      getAttribute: vi.fn(() => 'b1'),
    } as unknown as HTMLElement;
    const e2 = {
      innerText: 'Fallback block two text that is definitely longer than twenty chars',
      textContent: 'Fallback block two text that is definitely longer than twenty chars',
      getAttribute: vi.fn(() => 'b2'),
    } as unknown as HTMLElement;

    findTranslatableBlocks.mockReturnValue([e1, e2]);
    assignBlockIds.mockReturnValue([
      { id: 'b1', text: e1.innerText, el: e1 },
      { id: 'b2', text: e2.innerText, el: e2 },
    ]);

    const sendMessage = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        runId: 'run-fallback',
        translations: [
          { id: 'b1', text: '첫번째' },
          { id: 'b2', text: '두번째' },
        ],
      },
    });

    (globalThis as any).chrome = {
      storage: {
        sync: {
          get: vi.fn(async () => ({
            visibleOnly: true,
            batchFlushMs: 120,
            visibleRootMargin: '350px 0px 600px 0px',
            extractionMode: 'readability',
          })),
        },
      },
      runtime: {
        sendMessage,
      },
    };

    const translator = new PageTranslator();
    await translator.enable();
    await vi.advanceTimersByTimeAsync(130);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0][0].items).toEqual([
      { id: 'b1', text: e1.innerText },
      { id: 'b2', text: e2.innerText },
    ]);
  });
});
