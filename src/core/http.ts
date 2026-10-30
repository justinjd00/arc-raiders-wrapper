import { VERSION } from '../version';
import { ArcRaidersError, type ArcRaidersErrorCode } from './errors';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type QueryValue = string | number | boolean | null | undefined;
export type Query = Record<string, QueryValue>;

export interface RetryOptions {
  /** Extra attempts after the first one. Default 2. */
  retries: number;
  /** Base delay for exponential backoff in ms. Default 300. */
  minDelay: number;
  /** Upper bound for a single wait in ms, also caps `Retry-After`. Default 8000. */
  maxDelay: number;
}

export interface RequestEvent {
  url: string;
  attempt: number;
}

export interface ResponseEvent extends RequestEvent {
  status: number;
  durationMs: number;
}

export interface RetryEvent extends RequestEvent {
  error: ArcRaidersError;
  delayMs: number;
}

/** Observability hooks, handy for logging and metrics. */
export interface Hooks {
  onRequest?: (event: RequestEvent) => void;
  onResponse?: (event: ResponseEvent) => void;
  onRetry?: (event: RetryEvent) => void;
}

export interface HttpClientOptions {
  baseURL?: string;
  /** Per attempt timeout in ms. Default 15000. */
  timeout?: number;
  /** Retry policy, or `false` to disable retries. */
  retry?: Partial<RetryOptions> | false;
  /** Custom fetch, e.g. for proxies, tests or the Playwright transport. */
  fetch?: FetchLike;
  headers?: Record<string, string>;
  /**
   * User-Agent sent from server runtimes. Some generic agents (like Python's
   * urllib) get blocked by Cloudflare, an identifiable one does not.
   * Browsers ignore this. Pass `false` to send none.
   */
  userAgent?: string | false;
  hooks?: Hooks;
}

export interface RequestOptions {
  query?: Query;
  signal?: AbortSignal;
  /** Overrides the client timeout for this call. */
  timeout?: number;
}

export const DEFAULT_USER_AGENT = `arc-raiders-api/${VERSION} (+https://github.com/justinjd00/arc-raiders-wrapper)`;

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const isBrowser = typeof (globalThis as { document?: unknown }).document !== 'undefined';

export class HttpClient {
  readonly baseURL: string;
  private readonly timeout: number;
  private readonly retry: RetryOptions | false;
  private readonly fetchImpl: FetchLike;
  private readonly headers: Record<string, string>;
  private readonly hooks: Hooks;
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(options: HttpClientOptions = {}) {
    this.baseURL = (options.baseURL ?? '').replace(/\/+$/, '');
    this.timeout = options.timeout ?? 15_000;
    this.retry =
      options.retry === false
        ? false
        : { retries: 2, minDelay: 300, maxDelay: 8_000, ...options.retry };
    this.fetchImpl = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.hooks = options.hooks ?? {};

    const ua = options.userAgent === undefined ? DEFAULT_USER_AGENT : options.userAgent;
    this.headers = {
      Accept: 'application/json',
      ...(ua && !isBrowser ? { 'User-Agent': ua } : {}),
      ...options.headers,
    };
  }

  buildUrl(path: string, query?: Query): string {
    const base = /^https?:\/\//i.test(path) ? path : `${this.baseURL}/${path.replace(/^\/+/, '')}`;
    const url = new URL(base);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  /**
   * GET a JSON document. Concurrent calls for the same URL share one request
   * (unless they pass their own `signal`, since aborting must stay per caller).
   */
  getJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const url = this.buildUrl(path, options.query);
    if (options.signal) return this.execute<T>(url, options);

    const existing = this.inflight.get(url);
    if (existing) return existing as Promise<T>;

    const promise = this.execute<T>(url, options).finally(() => this.inflight.delete(url));
    this.inflight.set(url, promise);
    return promise;
  }

  private async execute<T>(url: string, options: RequestOptions): Promise<T> {
    const maxAttempts = this.retry ? this.retry.retries + 1 : 1;
    let attempt = 0;

    for (;;) {
      attempt++;
      try {
        return await this.attempt<T>(url, options, attempt);
      } catch (raw) {
        const error =
          raw instanceof ArcRaidersError
            ? raw
            : new ArcRaidersError(`Request to ${url} failed`, {
                code: 'NETWORK_ERROR',
                url,
                retryable: true,
                attempts: attempt,
                cause: raw,
              });

        const delay = this.retry ? this.retryDelay(error, attempt) : undefined;
        if (!error.retryable || attempt >= maxAttempts || delay === undefined) {
          throw withAttempts(error, attempt);
        }

        this.hooks.onRetry?.({ url, attempt, error, delayMs: delay });
        await sleep(delay, options.signal);
      }
    }
  }

  private async attempt<T>(url: string, options: RequestOptions, attempt: number): Promise<T> {
    if (options.signal?.aborted) {
      throw new ArcRaidersError('Request aborted', {
        code: 'ABORTED',
        url,
        cause: options.signal.reason,
      });
    }

    const timeoutMs = options.timeout ?? this.timeout;
    const timeoutController = new AbortController();
    const timer = setTimeout(() => timeoutController.abort(), timeoutMs);
    const signal = anySignal([options.signal, timeoutController.signal]);
    const startedAt = Date.now();

    this.hooks.onRequest?.({ url, attempt });

    let response: Response;
    try {
      response = await this.fetchImpl(url, { method: 'GET', headers: this.headers, signal });
    } catch (cause) {
      clearTimeout(timer);
      if (options.signal?.aborted) {
        throw new ArcRaidersError('Request aborted', { code: 'ABORTED', url, cause });
      }
      if (timeoutController.signal.aborted) {
        throw new ArcRaidersError(`Request timed out after ${timeoutMs}ms`, {
          code: 'TIMEOUT',
          url,
          retryable: true,
          cause,
        });
      }
      throw new ArcRaidersError(`Network error while requesting ${url}`, {
        code: 'NETWORK_ERROR',
        url,
        retryable: true,
        cause,
      });
    }

    try {
      const text = await response.text();
      this.hooks.onResponse?.({
        url,
        attempt,
        status: response.status,
        durationMs: Date.now() - startedAt,
      });

      const body = parseJson(text);

      if (!response.ok) {
        throw httpError(url, response, body, text);
      }
      if (body === undefined) {
        throw new ArcRaidersError('Expected a JSON response', {
          code: 'INVALID_RESPONSE',
          url,
          status: response.status,
          body: text.slice(0, 500),
        });
      }
      return body as T;
    } finally {
      clearTimeout(timer);
    }
  }

  private retryDelay(error: ArcRaidersError, attempt: number): number | undefined {
    if (!this.retry) return undefined;
    const { minDelay, maxDelay } = this.retry;

    const retryAfter = (error as ArcRaidersError & { retryAfterMs?: number }).retryAfterMs;
    if (retryAfter !== undefined) {
      // Waiting longer than the caller allows makes no sense, give up instead.
      return retryAfter <= maxDelay ? retryAfter : undefined;
    }

    const exp = Math.min(maxDelay, minDelay * 2 ** (attempt - 1));
    // "Equal jitter": half fixed, half random, avoids thundering herds.
    return Math.round(exp / 2 + Math.random() * (exp / 2));
  }
}

function httpError(url: string, response: Response, body: unknown, text: string): ArcRaidersError {
  const status = response.status;
  const serverMessage =
    body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
      ? body.error
      : undefined;

  const isCloudflare =
    status === 403 &&
    (response.headers.has('cf-ray') ||
      /cloudflare/i.test(response.headers.get('server') ?? '') ||
      /<html/i.test(text));

  let code: ArcRaidersErrorCode = 'HTTP_ERROR';
  let message = `MetaForge API responded with ${status}${serverMessage ? `: ${serverMessage}` : ''}`;

  if (status === 404) code = 'NOT_FOUND';
  if (status === 429) code = 'RATE_LIMITED';
  if (isCloudflare) {
    code = 'BLOCKED';
    message =
      'Blocked by Cloudflare (403). Use an identifiable userAgent or the Playwright transport from "@justinjd00/arc-raiders-api/browser".';
  }

  const error = new ArcRaidersError(message, {
    code,
    url,
    status,
    body: body ?? text.slice(0, 500),
    retryable: RETRYABLE_STATUS.has(status),
  });

  const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));
  if (retryAfterMs !== undefined) {
    Object.defineProperty(error, 'retryAfterMs', { value: retryAfterMs, enumerable: false });
  }
  return error;
}

function withAttempts(error: ArcRaidersError, attempts: number): ArcRaidersError {
  if (error.attempts === attempts) return error;
  const copy = new ArcRaidersError(error.message, {
    code: error.code,
    url: error.url,
    status: error.status,
    body: error.body,
    retryable: error.retryable,
    attempts,
    cause: error.cause,
  });
  copy.stack = error.stack;
  return copy;
}

function parseJson(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return undefined;
}

function anySignal(signals: Array<AbortSignal | undefined>): AbortSignal {
  const list = signals.filter((s): s is AbortSignal => s !== undefined);
  if (list.length === 1) return list[0]!;
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(list);

  const controller = new AbortController();
  for (const signal of list) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(
        new ArcRaidersError('Request aborted', { code: 'ABORTED', url: '', cause: signal.reason })
      );
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(
        new ArcRaidersError('Request aborted', { code: 'ABORTED', url: '', cause: signal?.reason })
      );
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
