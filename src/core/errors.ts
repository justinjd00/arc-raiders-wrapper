export type ArcRaidersErrorCode =
  /** Non 2xx response that is not covered by a more specific code. */
  | 'HTTP_ERROR'
  /** 404 from the API. */
  | 'NOT_FOUND'
  /** 429 after all retries were used up. */
  | 'RATE_LIMITED'
  /** 403 from Cloudflare's bot protection. */
  | 'BLOCKED'
  /** DNS, TLS, connection reset and similar. */
  | 'NETWORK_ERROR'
  /** The request took longer than `timeout`. */
  | 'TIMEOUT'
  /** The caller aborted via `signal`. */
  | 'ABORTED'
  /** The body was not the JSON shape we expected. */
  | 'INVALID_RESPONSE';

export interface ArcRaidersErrorInit {
  code: ArcRaidersErrorCode;
  url: string;
  status?: number;
  body?: unknown;
  retryable?: boolean;
  attempts?: number;
  cause?: unknown;
}

/** The only error type this library throws for request problems. */
export class ArcRaidersError extends Error {
  override readonly name = 'ArcRaidersError';
  readonly code: ArcRaidersErrorCode;
  readonly url: string;
  readonly status?: number;
  readonly body?: unknown;
  readonly retryable: boolean;
  /** How many attempts were made before giving up. */
  readonly attempts: number;

  constructor(message: string, init: ArcRaidersErrorInit) {
    super(message, init.cause !== undefined ? { cause: init.cause } : undefined);
    this.code = init.code;
    this.url = init.url;
    this.status = init.status;
    this.body = init.body;
    this.retryable = init.retryable ?? false;
    this.attempts = init.attempts ?? 1;
  }
}

/**
 * Type guard. Also recognizes errors from a second copy of this package
 * (e.g. ESM and CJS loaded side by side), where `instanceof` fails.
 */
export function isArcRaidersError(error: unknown): error is ArcRaidersError {
  return (
    error instanceof ArcRaidersError ||
    (error instanceof Error &&
      error.name === 'ArcRaidersError' &&
      typeof (error as ArcRaidersError).code === 'string')
  );
}
