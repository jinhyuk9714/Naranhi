// @vitest-environment jsdom
import React, { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { MESSAGE_TYPES } from '@naranhi/core';

const mockUseSettings = vi.fn();

vi.mock('../../hooks/useSettings', () => ({
  useSettings: () => mockUseSettings(),
}));

vi.mock('@naranhi/ui', () => ({
  Toggle: ({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) => (
    <button data-testid="toggle" data-checked={checked ? '1' : '0'} disabled={disabled} onClick={onChange} />
  ),
  Select: () => null,
}));

import App from './App';

describe('popup youtube subtitle toggle sync', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

    container = document.createElement('div');
    document.body.innerHTML = '';
    document.body.appendChild(container);
    root = createRoot(container);

    mockUseSettings.mockReturnValue({
      settings: { engine: 'deepl', targetLang: 'KO' },
      loading: false,
      updateSettings: vi.fn(),
    });

    (globalThis as any).chrome = {
      tabs: {
        query: vi.fn(async () => [{ id: 101, url: 'https://www.youtube.com/watch?v=abc123' }]),
        sendMessage: vi
          .fn()
          .mockResolvedValueOnce({ ok: true, data: { enabled: false } }) // GET_PAGE_STATE
          .mockResolvedValueOnce({ ok: true, data: { enabled: true } }) // GET_YT_SUBTITLE_STATE
          .mockResolvedValueOnce({ ok: true, data: { enabled: false } }), // TOGGLE_YT_SUBTITLE
        onActivated: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
      runtime: {
        onMessage: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
        openOptionsPage: vi.fn(),
      },
      sidePanel: {
        open: vi.fn(),
      },
      windows: {
        WINDOW_ID_CURRENT: -2,
      },
    };
  });

  it('syncs initial ON state on watch page and applies toggled OFF response', async () => {
    await act(async () => {
      root.render(<App />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    const toggles = Array.from(container.querySelectorAll('[data-testid="toggle"]')) as HTMLButtonElement[];
    expect(toggles).toHaveLength(2);

    const ytToggle = toggles[1];
    expect(ytToggle.dataset.checked).toBe('1');

    await act(async () => {
      ytToggle.click();
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect((globalThis as any).chrome.tabs.sendMessage).toHaveBeenNthCalledWith(3, 101, {
      type: MESSAGE_TYPES.TOGGLE_YT_SUBTITLE,
    });
    expect(ytToggle.dataset.checked).toBe('0');
  });
});
