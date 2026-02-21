export function isYouTubeWatchPageUrl(rawUrl: string): boolean {
  const text = String(rawUrl || '').trim();
  if (!text) return false;

  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    return false;
  }

  const host = parsed.hostname.toLowerCase();
  const isYoutubeHost = host === 'youtube.com' || host === 'www.youtube.com' || host.endsWith('.youtube.com');
  if (!isYoutubeHost) return false;

  if (parsed.pathname !== '/watch') return false;
  const videoId = parsed.searchParams.get('v');
  return Boolean(videoId && videoId.trim());
}
