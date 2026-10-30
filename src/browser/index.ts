/**
 * Playwright transport. Only needed if MetaForge's Cloudflare protection
 * blocks plain HTTP from your environment. Requests run inside a real browser
 * tab on metaforge.app, so they look like normal page traffic.
 *
 *   npm install playwright && npx playwright install chromium
 */
import { ArcRaidersClient, type ArcRaidersClientOptions } from '../arc-raiders/client';
import type { FetchLike } from '../core/http';

interface PageLike {
  goto(url: string, options?: { waitUntil?: string; timeout?: number }): Promise<unknown>;
  evaluate<R, A>(fn: (arg: A) => R | Promise<R>, arg: A): Promise<R>;
}
interface ContextLike {
  newPage(): Promise<PageLike>;
}
interface BrowserLike {
  newContext(options?: Record<string, unknown>): Promise<ContextLike>;
  close(): Promise<void>;
}
interface BrowserTypeLike {
  launch(options?: Record<string, unknown>): Promise<BrowserLike>;
}
/** The parts of the `playwright` module we use. `playwright-core` works too. */
export type PlaywrightLike = Record<'chromium' | 'firefox' | 'webkit', BrowserTypeLike>;

export interface PlaywrightTransportOptions {
  browser?: 'chromium' | 'firefox' | 'webkit';
  headless?: boolean;
  /** Page opened first to pass the bot check. Default: the MetaForge ARC Raiders page. */
  warmupUrl?: string;
  /** Extra options for `browserType.launch()`. */
  launchOptions?: Record<string, unknown>;
  /** Bring your own Playwright module (e.g. `playwright-core`). */
  playwright?: PlaywrightLike;
}

export interface PlaywrightTransport {
  fetch: FetchLike;
  close(): Promise<void>;
}

interface Serialized {
  status: number;
  statusText: string;
  headers: Array<[string, string]>;
  body: string;
}

async function loadPlaywright(): Promise<PlaywrightLike> {
  const name = 'playwright';
  try {
    return (await import(/* @vite-ignore */ name)) as PlaywrightLike;
  } catch (cause) {
    throw new Error(
      'The browser transport needs Playwright. Install it with "npm install playwright" and "npx playwright install chromium".',
      { cause }
    );
  }
}

/** Starts a browser and returns a `fetch` that runs inside it. */
export async function createPlaywrightTransport(
  options: PlaywrightTransportOptions = {}
): Promise<PlaywrightTransport> {
  const pw = options.playwright ?? (await loadPlaywright());
  const browser = await pw[options.browser ?? 'chromium'].launch({
    headless: options.headless !== false,
    ...options.launchOptions,
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const page = await context.newPage();
    await page.goto(options.warmupUrl ?? 'https://metaforge.app/arc-raiders', {
      waitUntil: 'domcontentloaded',
    });

    const fetchInPage: FetchLike = async (url, init) => {
      const run = page.evaluate<Promise<Serialized>, string>(async (target) => {
        const res = await fetch(target, {
          headers: { Accept: 'application/json' },
          credentials: 'include',
        });
        const headers: Array<[string, string]> = [];
        res.headers.forEach((v, k) => headers.push([k, v]));
        return { status: res.status, statusText: res.statusText, headers, body: await res.text() };
      }, url);

      const signal = init?.signal;
      const result = signal
        ? await Promise.race([
            run,
            new Promise<never>((_, reject) => {
              if (signal.aborted) reject(signal.reason);
              signal.addEventListener('abort', () => reject(signal.reason), { once: true });
            }),
          ])
        : await run;

      return new Response(result.status === 204 ? null : result.body, {
        status: result.status,
        statusText: result.statusText,
        headers: result.headers,
      });
    };

    return { fetch: fetchInPage, close: () => browser.close() };
  } catch (error) {
    await browser.close();
    throw error;
  }
}

export interface BrowserClientOptions
  extends Omit<ArcRaidersClientOptions, 'fetch'>, PlaywrightTransportOptions {}

/**
 * An `ArcRaidersClient` whose requests go through Playwright. The browser is
 * started lazily on the first request (or by calling `init()`), so remember
 * to `close()` it.
 */
export class BrowserArcRaidersClient extends ArcRaidersClient {
  private transport?: Promise<PlaywrightTransport>;
  private readonly transportOptions: PlaywrightTransportOptions;

  constructor(options: BrowserClientOptions = {}) {
    const holder: { client?: BrowserArcRaidersClient } = {};
    super({
      ...options,
      // The browser sends its own User-Agent.
      userAgent: false,
      fetch: async (url, init) => (await holder.client!.init()).fetch(url, init),
    });
    holder.client = this;
    this.transportOptions = options;
  }

  /** Starts the browser. Safe to call more than once. */
  init(): Promise<PlaywrightTransport> {
    this.transport ??= createPlaywrightTransport(this.transportOptions).catch((error: unknown) => {
      this.transport = undefined;
      throw error;
    });
    return this.transport;
  }

  async close(): Promise<void> {
    const transport = this.transport;
    this.transport = undefined;
    if (transport) await (await transport).close();
  }
}

export function createBrowserClient(options?: BrowserClientOptions): BrowserArcRaidersClient {
  return new BrowserArcRaidersClient(options);
}
