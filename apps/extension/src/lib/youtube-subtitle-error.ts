interface YtSubtitleErrorLike {
  code?: string;
  message?: string;
}

export function resolveYtSubtitleErrorMessage(error: unknown): string {
  const code =
    error && typeof error === 'object' && 'code' in error ? String((error as YtSubtitleErrorLike).code || '') : '';
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as YtSubtitleErrorLike).message || '')
      : String((error as Error)?.message || '');

  if (code === 'NO_CAPTIONS') return 'No captions detected on this video.';
  if (code === 'CAPTION_PERMISSION_DENIED') {
    return 'Captions are unavailable on this video due to permission or region restrictions.';
  }
  if (code === 'NOT_WATCH_PAGE') return 'Open a YouTube watch page to use subtitle translation.';

  const lowered = message.toLowerCase();
  if (lowered.includes('receiving end does not exist')) {
    return 'Could not connect to the YouTube tab. Reload the video page and try again.';
  }

  return message || 'Unable to toggle YouTube subtitles right now.';
}
