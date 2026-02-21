import { describe, expect, it } from 'vitest';
import { isYouTubeWatchPageUrl } from './youtube-page';

describe('isYouTubeWatchPageUrl', () => {
  it('accepts youtube watch pages with v query', () => {
    expect(isYouTubeWatchPageUrl('https://www.youtube.com/watch?v=abc123')).toBe(true);
    expect(isYouTubeWatchPageUrl('https://m.youtube.com/watch?v=abc123&t=20')).toBe(true);
  });

  it('rejects non-watch pages and missing video id', () => {
    expect(isYouTubeWatchPageUrl('https://www.youtube.com/')).toBe(false);
    expect(isYouTubeWatchPageUrl('https://www.youtube.com/results?search_query=test')).toBe(false);
    expect(isYouTubeWatchPageUrl('https://www.youtube.com/watch')).toBe(false);
    expect(isYouTubeWatchPageUrl('https://www.youtube.com/watch?v=')).toBe(false);
  });

  it('rejects non-youtube/invalid urls', () => {
    expect(isYouTubeWatchPageUrl('https://youtu.be/abc123')).toBe(false);
    expect(isYouTubeWatchPageUrl('https://example.com/watch?v=abc123')).toBe(false);
    expect(isYouTubeWatchPageUrl('not a url')).toBe(false);
  });
});
