import { describe, expect, it } from 'vitest';
import { InflightTranslations } from './inflight';

describe('InflightTranslations', () => {
  it('shares one pending promise for duplicated key requests', async () => {
    const inflight = new InflightTranslations<string>();
    inflight.claim(['k1']);

    const waitA = inflight.wait('k1');
    const waitB = inflight.wait('k1');

    expect(waitA).toBeTruthy();
    expect(waitA).toBe(waitB);

    inflight.resolve('k1', '번역');

    await expect(waitA).resolves.toBe('번역');
    expect(inflight.wait('k1')).toBeNull();
  });

  it('rejects all claimed keys on upstream failure', async () => {
    const inflight = new InflightTranslations<string>();
    const claimed = inflight.claim(['k1', 'k2']);

    const p1 = inflight.wait('k1');
    const p2 = inflight.wait('k2');
    const error = new Error('upstream failed');

    inflight.rejectAll(claimed, error);

    await expect(p1).rejects.toThrow('upstream failed');
    await expect(p2).rejects.toThrow('upstream failed');
    expect(inflight.wait('k1')).toBeNull();
    expect(inflight.wait('k2')).toBeNull();
  });
});
