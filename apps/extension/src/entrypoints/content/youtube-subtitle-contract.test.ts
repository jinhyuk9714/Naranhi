import { describe, expect, it } from 'vitest';
import { createYouTubeSubtitleController } from './youtube-subtitle-controller';
import { resolveYtSubtitleErrorMessage } from '../../lib/youtube-subtitle-error';

type FakeButton = {
  disabled?: boolean;
  click: () => void;
  getAttribute: (name: string) => string | null;
  classList: { contains: (token: string) => boolean };
};

function createFakeCaptionButton(options: { pressed?: boolean; disabled?: boolean } = {}): FakeButton {
  const pressed = Boolean(options.pressed);
  const disabled = Boolean(options.disabled);

  return {
    disabled,
    click: () => undefined,
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

describe('youtube subtitle error contract', () => {
  it('uses NOT_WATCH_PAGE code with matching user guidance', async () => {
    const controller = createYouTubeSubtitleController({
      isWatchPage: () => false,
      findCaptionButton: () => null,
    });

    const result = await controller.toggle();
    expect(result).toMatchObject({ ok: false, error: { code: 'NOT_WATCH_PAGE' } });
    expect(resolveYtSubtitleErrorMessage((result as any).error)).toBe(
      'Open a YouTube watch page to use subtitle translation.',
    );
  });

  it('uses NO_CAPTIONS code with matching user guidance', async () => {
    const controller = createYouTubeSubtitleController({
      isWatchPage: () => true,
      findCaptionButton: () => null,
    });

    const result = await controller.toggle();
    expect(result).toMatchObject({ ok: false, error: { code: 'NO_CAPTIONS' } });
    expect(resolveYtSubtitleErrorMessage((result as any).error)).toBe('No captions detected on this video.');
  });

  it('uses CAPTION_PERMISSION_DENIED code with matching user guidance', async () => {
    const controller = createYouTubeSubtitleController({
      isWatchPage: () => true,
      findCaptionButton: () => createFakeCaptionButton({ disabled: true }),
    });

    const result = await controller.toggle();
    expect(result).toMatchObject({ ok: false, error: { code: 'CAPTION_PERMISSION_DENIED' } });
    expect(resolveYtSubtitleErrorMessage((result as any).error)).toBe(
      'Captions are unavailable on this video due to permission or region restrictions.',
    );
  });
});
