import { describe, expect, it } from 'vitest';
import { resolveProxyConnectionErrorMessage } from './proxy-connection-error';

describe('resolveProxyConnectionErrorMessage', () => {
  it('returns invalid URL guidance', () => {
    const msg = resolveProxyConnectionErrorMessage({ proxyUrl: 'localhost:8787' });
    expect(msg).toContain('invalid');
    expect(msg).toContain('http://localhost:8787');
  });

  it('returns HTTP failure guidance', () => {
    const msg = resolveProxyConnectionErrorMessage({ proxyUrl: 'http://localhost:8787', status: 503 });
    expect(msg).toContain('HTTP 503');
  });

  it('returns timeout guidance', () => {
    const msg = resolveProxyConnectionErrorMessage({
      proxyUrl: 'http://localhost:8787',
      error: new DOMException('Aborted', 'AbortError'),
    });
    expect(msg).toContain('timed out');
  });

  it('returns local proxy-not-running guidance', () => {
    const msg = resolveProxyConnectionErrorMessage({
      proxyUrl: 'http://localhost:8787',
      error: new Error('Failed to fetch'),
    });
    expect(msg).toContain('local proxy');
  });

  it('returns remote address guidance', () => {
    const msg = resolveProxyConnectionErrorMessage({
      proxyUrl: 'https://proxy.example.com',
      error: new Error('Failed to fetch'),
    });
    expect(msg).toContain('Verify host/port');
  });
});
