import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ArcRaidersError,
  DEFAULT_USER_AGENT,
  HttpClient,
  isArcRaidersError,
  parseRetryAfter,
} from '../src';
import { json } from './helpers';

const base = 'https://example.test/api';

function client(fetch: (url: string, init?: RequestInit) => Promise<Response>, opts = {}) {
  return new HttpClient({
    baseURL: base,
    fetch,
    retry: { retries: 2, minDelay: 0, maxDelay: 100 },
    ...opts,
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('buildUrl', () => {
  const http = new HttpClient({ baseURL: `${base}/` });

  it('joins base and path without double slashes', () => {
    expect(http.buildUrl('/arc-raiders/items')).toBe(`${base}/arc-raiders/items`);
    expect(http.buildUrl('arc-raiders/items')).toBe(`${base}/arc-raiders/items`);
  });

  it('keeps the base path (the v1 browser client dropped it)', () => {
    expect(
      new HttpClient({ baseURL: 'https://metaforge.app/api' }).buildUrl('/game-map-data')
    ).toBe('https://metaforge.app/api/game-map-data');
  });

  it('skips empty query values', () => {
    const url = http.buildUrl('/x', { a: 1, b: undefined, c: null, d: '', e: false });
    expect(url).toBe(`${base}/x?a=1&e=false`);
  });

  it('passes absolute URLs through', () => {
    expect(http.buildUrl('https://other.test/y', { q: 'a b' })).toBe('https://other.test/y?q=a+b');
  });
});

describe('getJson', () => {
  it('sends Accept and an identifiable User-Agent', async () => {
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => json({ ok: true }));
    await client(fetch).getJson('/x');
    const headers = fetch.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers.Accept).toBe('application/json');
    expect(headers['User-Agent']).toBe(DEFAULT_USER_AGENT);
  });

  it('can disable or override the User-Agent', async () => {
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => json({}));
    await client(fetch, { userAgent: false }).getJson('/x');
    await client(fetch, { userAgent: 'my-bot/1.0' }).getJson('/y');
    expect(
      (fetch.mock.calls[0]![1]!.headers as Record<string, string>)['User-Agent']
    ).toBeUndefined();
    expect((fetch.mock.calls[1]![1]!.headers as Record<string, string>)['User-Agent']).toBe(
      'my-bot/1.0'
    );
  });

  it('retries transient errors and reports them via onRetry', async () => {
    const onRetry = vi.fn();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('busy', { status: 503 }))
      .mockRejectedValueOnce(new TypeError('socket hang up'))
      .mockResolvedValueOnce(json({ value: 42 }));
    await expect(client(fetch, { hooks: { onRetry } }).getJson('/x')).resolves.toEqual({
      value: 42,
    });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(onRetry.mock.calls.map(([e]) => e.error.code)).toEqual(['HTTP_ERROR', 'NETWORK_ERROR']);
  });

  it('gives up after the configured retries with the attempt count', async () => {
    const fetch = vi.fn(async () => new Response('down', { status: 502 }));
    const error = await client(fetch)
      .getJson('/x')
      .catch((e: unknown) => e);
    expect(isArcRaidersError(error)).toBe(true);
    expect(error).toMatchObject({ code: 'HTTP_ERROR', status: 502, attempts: 3, retryable: true });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('does not retry 404 and exposes the server message', async () => {
    const fetch = vi.fn(async () => json({ error: 'Quest not found' }, { status: 404 }));
    const error = await client(fetch)
      .getJson('/x')
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'NOT_FOUND', status: 404, attempts: 1 });
    expect((error as Error).message).toContain('Quest not found');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('honors Retry-After on 429', async () => {
    const onRetry = vi.fn();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('slow down', { status: 429, headers: { 'retry-after': '0.05' } })
      )
      .mockResolvedValueOnce(json({ ok: 1 }));
    await client(fetch, { hooks: { onRetry } }).getJson('/x');
    expect(onRetry.mock.calls[0]![0].delayMs).toBe(50);
  });

  it('fails fast when Retry-After is longer than maxDelay', async () => {
    const fetch = vi.fn(
      async () => new Response('', { status: 429, headers: { 'retry-after': '120' } })
    );
    await expect(client(fetch).getJson('/x')).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      attempts: 1,
    });
  });

  it('recognizes Cloudflare blocks', async () => {
    const fetch = vi.fn(
      async () =>
        new Response('<html>Just a moment...</html>', {
          status: 403,
          headers: { 'cf-ray': 'abc', server: 'cloudflare' },
        })
    );
    const error = await client(fetch)
      .getJson('/x')
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'BLOCKED', status: 403 });
    expect((error as Error).message).toMatch(/browser/);
  });

  it('flags non JSON success bodies', async () => {
    const fetch = vi.fn(async () => new Response('<html></html>', { status: 200 }));
    await expect(client(fetch).getJson('/x')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('times out slow requests', async () => {
    const fetch = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_, reject) =>
          init!.signal!.addEventListener('abort', () => reject(new Error('aborted')))
        )
    );
    await expect(client(fetch, { timeout: 20, retry: false }).getJson('/x')).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
  });

  it('respects caller aborts and does not retry them', async () => {
    const controller = new AbortController();
    const fetch = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_, reject) =>
          init!.signal!.addEventListener('abort', () => reject(new Error('aborted')))
        )
    );
    const promise = client(fetch).getJson('/x', { signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toMatchObject({ code: 'ABORTED' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('shares one request between concurrent identical calls', async () => {
    let resolve!: (r: Response) => void;
    const fetch = vi.fn(() => new Promise<Response>((r) => (resolve = r)));
    const http = client(fetch);
    const a = http.getJson('/same', { query: { p: 1 } });
    const b = http.getJson('/same', { query: { p: 1 } });
    resolve(json({ n: 1 }));
    await expect(Promise.all([a, b])).resolves.toEqual([{ n: 1 }, { n: 1 }]);
    expect(fetch).toHaveBeenCalledTimes(1);

    // Once settled, the next call goes out again.
    const c = http.getJson('/same', { query: { p: 1 } });
    resolve(json({ n: 2 }));
    await expect(c).resolves.toEqual({ n: 2 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('calls onRequest and onResponse', async () => {
    const onRequest = vi.fn();
    const onResponse = vi.fn();
    await client(
      vi.fn(async () => json({})),
      { hooks: { onRequest, onResponse } }
    ).getJson('/x');
    expect(onRequest).toHaveBeenCalledWith({ url: `${base}/x`, attempt: 1 });
    expect(onResponse.mock.calls[0]![0]).toMatchObject({ status: 200, attempt: 1 });
  });
});

describe('errors', () => {
  it('isArcRaidersError also accepts look-alikes from another bundle', () => {
    const foreign = Object.assign(new Error('x'), { name: 'ArcRaidersError', code: 'TIMEOUT' });
    expect(isArcRaidersError(foreign)).toBe(true);
    expect(isArcRaidersError(new Error('x'))).toBe(false);
    expect(new ArcRaidersError('x', { code: 'HTTP_ERROR', url: '' })).toBeInstanceOf(Error);
  });

  it('parses Retry-After seconds and dates', () => {
    expect(parseRetryAfter('2')).toBe(2000);
    expect(parseRetryAfter(null)).toBeUndefined();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    expect(parseRetryAfter('Thu, 01 Jan 2026 00:00:05 GMT')).toBe(5000);
  });
});
