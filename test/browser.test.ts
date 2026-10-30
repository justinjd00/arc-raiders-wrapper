import { describe, expect, it, vi } from 'vitest';
import {
  createBrowserClient,
  createPlaywrightTransport,
  type PlaywrightLike,
} from '../src/browser';
import { fixtures } from './helpers';

function fakePlaywright() {
  const goto = vi.fn(async (_url: string, _opts?: unknown) => undefined);
  const close = vi.fn(async () => undefined);
  const evaluated: string[] = [];
  const page = {
    goto,
    // Pretend to run the in-page fetch and return its serialized result.
    evaluate: vi.fn(async (_fn: unknown, url: string) => {
      evaluated.push(url);
      const body = url.includes('/arcs')
        ? {
            data: fixtures.arcs,
            pagination: {
              page: 1,
              limit: 100,
              total: 3,
              totalPages: 1,
              hasNextPage: false,
              hasPrevPage: false,
            },
          }
        : { error: 'nope' };
      return {
        status: url.includes('/arcs') ? 200 : 404,
        statusText: '',
        headers: [['content-type', 'application/json']] as Array<[string, string]>,
        body: JSON.stringify(body),
      };
    }),
  };
  const launch = vi.fn(async () => ({
    newContext: async () => ({ newPage: async () => page }),
    close,
  }));
  const pw = {
    chromium: { launch },
    firefox: { launch },
    webkit: { launch },
  } as unknown as PlaywrightLike;
  return { pw, launch, goto, close, evaluated };
}

describe('browser transport', () => {
  it('warms up on metaforge.app and fetches inside the page', async () => {
    const { pw, goto, evaluated } = fakePlaywright();
    const transport = await createPlaywrightTransport({ playwright: pw });
    const res = await transport.fetch(
      'https://metaforge.app/api/arc-raiders/arcs?page=1&limit=100'
    );
    expect(goto.mock.calls[0]![0]).toBe('https://metaforge.app/arc-raiders');
    expect(evaluated).toEqual(['https://metaforge.app/api/arc-raiders/arcs?page=1&limit=100']);
    expect(res.status).toBe(200);
    expect((await res.json()).data).toHaveLength(3);
  });

  it('starts the browser lazily, reuses it and closes it', async () => {
    const { pw, launch, close, evaluated } = fakePlaywright();
    const client = createBrowserClient({ playwright: pw, cache: false });
    expect(launch).not.toHaveBeenCalled();

    await client.arcs.all();
    await client.arcs.all();
    expect(launch).toHaveBeenCalledTimes(1);
    // Correct URL, the v1 client lost the /api/arc-raiders prefix.
    expect(evaluated[0]).toBe('https://metaforge.app/api/arc-raiders/arcs?page=1&limit=100');

    await expect(client.quests.get('x')).resolves.toBeUndefined();
    await client.close();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('explains how to install Playwright when it is missing', async () => {
    const client = createBrowserClient({ cache: false, retry: false });
    await expect(client.init()).rejects.toThrow(/npm install playwright/);
  });
});
