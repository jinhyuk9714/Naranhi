type ProxyErrorKind = 'invalid_url' | 'http_error' | 'timeout' | 'proxy_not_running' | 'address_error';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export function resolveProxyConnectionErrorMessage(input: {
  proxyUrl: string;
  status?: number;
  error?: unknown;
}): string {
  const { proxyUrl, status, error } = input;

  if (!isValidHttpUrl(proxyUrl)) {
    return `Proxy URL looks invalid: ${proxyUrl}. Example: http://localhost:8787`;
  }

  const kind = classifyProxyError({ proxyUrl, status, error });

  if (kind === 'http_error') {
    return `Proxy responded with HTTP ${status}. Check /health route and proxy logs. URL: ${proxyUrl}`;
  }

  if (kind === 'timeout') {
    return `Connection timed out while reaching ${proxyUrl}. Proxy may be down or blocked.`;
  }

  if (kind === 'proxy_not_running') {
    return `Could not reach local proxy at ${proxyUrl}. Is apps/proxy running on that port?`;
  }

  if (kind === 'address_error') {
    return `Could not reach ${proxyUrl}. Verify host/port and network accessibility.`;
  }

  return `Failed to reach proxy at ${proxyUrl}.`;
}

function classifyProxyError(input: { proxyUrl: string; status?: number; error?: unknown }): ProxyErrorKind {
  const { proxyUrl, status, error } = input;

  if (typeof status === 'number') return 'http_error';

  if (error instanceof DOMException && error.name === 'AbortError') return 'timeout';

  const host = tryGetHost(proxyUrl);
  if (host && LOCAL_HOSTS.has(host)) return 'proxy_not_running';

  if (host) return 'address_error';

  return 'invalid_url';
}

function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function tryGetHost(value: string): string | null {
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}
