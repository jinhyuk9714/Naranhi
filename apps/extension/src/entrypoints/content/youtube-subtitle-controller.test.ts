import { describe, expect, it } from 'vitest';
import { createYouTubeSubtitleController } from './youtube-subtitle-controller';

type FakeButton = {
  disabled?: boolean;
  click: () => void;
  getAttribute: (name: string) => string | null;
  classList: { contains: (token: string) => boolean };
};

function createFakeCaptionButton(options: { pressed?: boolean; disabled?: boolean } = {}): FakeButton {
  let pressed = Boolean(options.pressed);
  const disabled = Boolean(options.disabled);

  return {
    disabled,
    click: () => {
      if (!disabled) pressed = !pressed;
    },
    getAttribute: (name: string) => {
      if (name === 'aria-pressed') return pressed ? 'true' : 'false';
      if (name === 'aria-disabled') return disabled ? 'true' : 'false';
      return null;
    },
    classList: {
      contains: (token: string) => token === 'ytp-button-active' && pressed,
    },
  };
}

describe('youtube-subtitle-controller', () => {
  it('returns NOT_WATCH_PAGE when active tab is not a watch page', async () => {
    const controller = createYouTubeSubtitleController({
      isWatchPage: () => false,
      findCaptionButton: () => null,
    });

    const state = controller.getState();
    const toggled = await controller.toggle();

    expect(state.ok).toBe(false);
    expect(state).toMatchObject({ error: { code: 'NOT_WATCH_PAGE' } });
    expect(toggled.ok).toBe(false);
    expect(toggled).toMatchObject({ error: { code: 'NOT_WATCH_PAGE' } });
  });

  it('returns NO_CAPTIONS when subtitle button does not exist', async () => {
    const controller = createYouTubeSubtitleController({
      isWatchPage: () => true,
      findCaptionButton: () => null,
    });

    const state = controller.getState();
    const toggled = await controller.toggle();

    expect(state).toMatchObject({ ok: false, error: { code: 'NO_CAPTIONS' } });
    expect(toggled).toMatchObject({ ok: false, error: { code: 'NO_CAPTIONS' } });
  });

  it('toggles subtitle state when caption button is available', async () => {
    const button = createFakeCaptionButton({ pressed: false });
    const controller = createYouTubeSubtitleController({
      isWatchPage: () => true,
      findCaptionButton: () => button,
    });

    const before = controller.getState();
    const toggled = await controller.toggle();
    const after = controller.getState();

    expect(before).toMatchObject({ ok: true, data: { enabled: false } });
    expect(toggled).toMatchObject({ ok: true, data: { enabled: true } });
    expect(after).toMatchObject({ ok: true, data: { enabled: true } });
  });

  it('returns CAPTION_PERMISSION_DENIED when caption button is disabled', async () => {
    const button = createFakeCaptionButton({ pressed: false, disabled: true });
    const controller = createYouTubeSubtitleController({
      isWatchPage: () => true,
      findCaptionButton: () => button,
    });

    const state = controller.getState();
    const toggled = await controller.toggle();

    expect(state).toMatchObject({ ok: false, error: { code: 'CAPTION_PERMISSION_DENIED' } });
    expect(toggled).toMatchObject({ ok: false, error: { code: 'CAPTION_PERMISSION_DENIED' } });
  });
});
