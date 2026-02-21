import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PORT = 8790;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const PROXY_DIR = fileURLToPath(new URL('..', import.meta.url));

let proc: ChildProcessWithoutNullStreams;

async function waitForReady(timeoutMs = 8000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const resp = await fetch(`${BASE_URL}/health`);
      if (resp.status === 200) return;
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error('proxy server did not become ready in time');
}

beforeAll(async () => {
  proc = spawn('pnpm', ['exec', 'tsx', 'src/server.ts'], {
    cwd: PROXY_DIR,
    env: {
      ...process.env,
      PORT: String(PORT),
      DEEPL_AUTH_KEY: 'dummy-key-for-tests',
      ALLOWED_ORIGINS: '*',
    },
    stdio: 'pipe',
  });

  await waitForReady();
});

afterAll(() => {
  if (proc && !proc.killed) {
    proc.kill('SIGTERM');
  }
});

describe('/health', () => {
  it('returns 200 ok text when proxy is running', async () => {
    const resp = await fetch(`${BASE_URL}/health`);
    const body = await resp.text();

    expect(resp.status).toBe(200);
    expect(body).toBe('ok');
  });
});
