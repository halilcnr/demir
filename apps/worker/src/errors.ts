/**
 * Custom error classes for provider scraping.
 * Used to differentiate between retryable and non-retryable failures.
 */

/** Anti-bot / access denied (HTTP 403) */
export class ProviderBlockedError extends Error {
  public readonly statusCode = 403;
  constructor(
    public readonly retailerSlug: string,
    public readonly url: string,
  ) {
    super(`[${retailerSlug}] provider blocked (HTTP 403) — ${url}`);
    this.name = 'ProviderBlockedError';
  }
}

/** Server error (5xx) — retryable */
export class RetryableProviderError extends Error {
  constructor(
    public readonly retailerSlug: string,
    public readonly statusCode: number,
    public readonly url: string,
  ) {
    super(`[${retailerSlug}] server error (HTTP ${statusCode}) — ${url}`);
    this.name = 'RetryableProviderError';
  }
}

/** Product page not found (HTTP 404) — listing should be marked invalid */
export class ListingNotFoundError extends Error {
  public readonly statusCode = 404;
  constructor(
    public readonly retailerSlug: string,
    public readonly url: string,
  ) {
    super(`[${retailerSlug}] listing not found (HTTP 404) — ${url}`);
    this.name = 'ListingNotFoundError';
  }
}

/** HTML returned but selectors didn't match — possible site redesign */
export class ParseError extends Error {
  constructor(
    public readonly retailerSlug: string,
    public readonly url: string,
    detail?: string,
  ) {
    super(`[${retailerSlug}] parse failed — ${url}${detail ? ': ' + detail : ''}`);
    this.name = 'ParseError';
  }
}
