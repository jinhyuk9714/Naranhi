import { describe, expect, it } from 'vitest';
import { resolveYtSubtitleErrorMessage } from './youtube-subtitle-error';

describe('resolveYtSubtitleErrorMessage', () => {
  it('maps known caption errors to clear user messages', () => {
    expect(resolveYtSubtitleErrorMessage({ code: 'NO_CAPTIONS' })).toBe('No captions detected on this video.');
    expect(resolveYtSubtitleErrorMessage({ code: 'CAPTION_PERMISSION_DENIED' })).toContain('permission');
    expect(resolveYtSubtitleErrorMessage({ code: 'NOT_WATCH_PAGE' })).toContain('watch page');
  });

  it('maps runtime connection failure to reload guidance', () => {
    const msg = resolveYtSubtitleErrorMessage(new Error('Could not establish connection. Receiving end does not exist.'));
    expect(msg).toContain('Reload');
  });

  it('falls back to generic message', () => {
    expect(resolveYtSubtitleErrorMessage({})).toBe('Unable to toggle YouTube subtitles right now.');
  });
});
