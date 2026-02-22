import { isYouTubeWatchPageUrl } from '../../lib/youtube-page';

interface CaptionButtonLike {
  click: () => void;
  getAttribute: (name: string) => string | null;
  classList?: {
    contains: (token: string) => boolean;
  };
  disabled?: boolean;
}

interface YtSubtitleError {
  code: string;
  message: string;
  retryable: boolean;
}

type YtSubtitleStateResponse =
  | { ok: true; data: { enabled: boolean } }
  | { ok: false; error: YtSubtitleError };

interface ControllerDeps {
  isWatchPage: () => boolean;
  findCaptionButton: () => CaptionButtonLike | null;
  delay: (ms: number) => Promise<void>;
}

const POLL_INTERVAL_MS = 50;
const STATE_CHANGE_TIMEOUT_MS = 1200;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function defaultIsWatchPage(): boolean {
  return isYouTubeWatchPageUrl(globalThis.location?.href || '');
}

function defaultFindCaptionButton(): CaptionButtonLike | null {
  const candidate =
    document.querySelector('.html5-video-player .ytp-subtitles-button') || document.querySelector('.ytp-subtitles-button');
  if (!candidate) return null;
  if (typeof (candidate as HTMLElement).click !== 'function') return null;
  return candidate as unknown as CaptionButtonLike;
}

function makeError(code: string, message: string, retryable: boolean = false): YtSubtitleStateResponse {
  return { ok: false, error: { code, message, retryable } };
}

function isCaptionButtonDisabled(button: CaptionButtonLike): boolean {
  if (button.disabled === true) return true;
  const ariaDisabled = String(button.getAttribute('aria-disabled') || '').toLowerCase();
  return ariaDisabled === 'true';
}

function isCaptionButtonPressed(button: CaptionButtonLike): boolean {
  const ariaPressed = String(button.getAttribute('aria-pressed') || '').toLowerCase();
  if (ariaPressed === 'true') return true;
  return Boolean(button.classList?.contains('ytp-button-active'));
}

async function waitForStateChange(
  button: CaptionButtonLike,
  before: boolean,
  deps: Pick<ControllerDeps, 'delay'>,
): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < STATE_CHANGE_TIMEOUT_MS) {
    await deps.delay(POLL_INTERVAL_MS);
    const after = isCaptionButtonPressed(button);
    if (after !== before) return after;
  }
  return isCaptionButtonPressed(button);
}

export function createYouTubeSubtitleController(override: Partial<ControllerDeps> = {}) {
  const deps: ControllerDeps = {
    isWatchPage: override.isWatchPage ?? defaultIsWatchPage,
    findCaptionButton: override.findCaptionButton ?? defaultFindCaptionButton,
    delay: override.delay ?? delay,
  };

  function getState(): YtSubtitleStateResponse {
    if (!deps.isWatchPage()) {
      return makeError('NOT_WATCH_PAGE', 'Open a YouTube watch page to use subtitle translation.');
    }

    const button = deps.findCaptionButton();
    if (!button) {
      return makeError('NO_CAPTIONS', 'No captions detected on this video.');
    }

    if (isCaptionButtonDisabled(button)) {
      return makeError(
        'CAPTION_PERMISSION_DENIED',
        'Captions are unavailable on this video due to permission or region restrictions.',
      );
    }

    return { ok: true, data: { enabled: isCaptionButtonPressed(button) } };
  }

  async function toggle(): Promise<YtSubtitleStateResponse> {
    if (!deps.isWatchPage()) {
      return makeError('NOT_WATCH_PAGE', 'Open a YouTube watch page to use subtitle translation.');
    }

    const button = deps.findCaptionButton();
    if (!button) {
      return makeError('NO_CAPTIONS', 'No captions detected on this video.');
    }

    if (isCaptionButtonDisabled(button)) {
      return makeError(
        'CAPTION_PERMISSION_DENIED',
        'Captions are unavailable on this video due to permission or region restrictions.',
      );
    }

    const before = isCaptionButtonPressed(button);
    button.click();
    const after = await waitForStateChange(button, before, deps);

    if (after === before) {
      return makeError('NO_CAPTIONS', 'No captions detected on this video.');
    }

    return { ok: true, data: { enabled: after } };
  }

  return {
    getState,
    toggle,
  };
}

export const __testing = {
  isCaptionButtonPressed,
  isCaptionButtonDisabled,
  waitForStateChange,
};
