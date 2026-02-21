import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PORT = 8791;
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

describe('/translate structured error mapping', () => {
  it('returns BAD_REQUEST for unsupported method', async () => {
    const resp = await fetch(`${BASE_URL}/translate`, { method: 'GET' });
    expect(resp.status).toBe(405);

    const body = (await resp.json()) as any;
    expect(body.error).toMatchObject({
      code: 'BAD_REQUEST',
      retryable: false,
    });
  });

  it('returns BAD_REQUEST for invalid content-type', async () => {
    const resp = await fetch(`${BASE_URL}/translate`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'hello',
    });

    expect(resp.status).toBe(415);
    const body = (await resp.json()) as any;
    expect(body.error).toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Content-Type must be application/json',
      retryable: false,
    });
  });

  it('returns BAD_REQUEST for invalid payload schema', async () => {
    const resp = await fetch(`${BASE_URL}/translate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ items: [{ id: '1', text: 'hello' }] }),
    });

    expect(resp.status).toBe(400);
    const body = (await resp.json()) as any;
    expect(body.error.code).toBe('BAD_REQUEST');
    expect(typeof body.error.message).toBe('string');
    expect(body.error.retryable).toBe(false);
  });
});
