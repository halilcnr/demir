/**
 * Custom error classes for provider scraping.
 * Used to differentiate between retryable and non-retryable failures.
 */

/** Anti-bot / access denied (HTTP 403) — do NOT retry */
export class ProviderBlockedError extends Error {
  public readonly statusCode = 403;
  public readonly retryable = false;
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
  public readonly retryable = true;
  constructor(
    public readonly retailerSlug: string,
    public readonly statusCode: number,
    public readonly url: string,
  ) {
    super(`[${retailerSlug}] server error (HTTP ${statusCode}) — ${url}`);
    this.name = 'RetryableProviderError';
  }
}

/** Network / timeout / DNS failure — retryable */
export class RetryableNetworkError extends Error {
  public readonly retryable = true;
  constructor(
    public readonly retailerSlug: string,
    public readonly url: string,
    public readonly reason: string,
  ) {
    super(`[${retailerSlug}] network error (${reason}) — ${url}`);
    this.name = 'RetryableNetworkError';
  }
}

/** Rate limited (HTTP 429) — retryable with long backoff */
export class RateLimitedError extends Error {
  public readonly statusCode = 429;
  public readonly retryable = true;
  constructor(
    public readonly retailerSlug: string,
    public readonly url: string,
    public readonly retryAfterMs?: number,
  ) {
    super(`[${retailerSlug}] rate limited (HTTP 429) — ${url}`);
    this.name = 'RateLimitedError';
  }
}

/** Product page not found (HTTP 404) — listing should be marked invalid */
export class ListingNotFoundError extends Error {
  public readonly statusCode = 404;
  public readonly retryable = false;
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
  public readonly retryable = false;
  constructor(
    public readonly retailerSlug: string,
    public readonly url: string,
    public readonly detail?: string,
  ) {
    super(`[${retailerSlug}] parse failed — ${url}${detail ? ': ' + detail : ''}`);
    this.name = 'ParseError';
  }
}

/** URL is clearly invalid (search URL, empty, etc.) */
export class InvalidListingError extends Error {
  public readonly retryable = false;
  constructor(
    public readonly retailerSlug: string,
    public readonly url: string,
    reason?: string,
  ) {
    super(`[${retailerSlug}] invalid listing — ${url}${reason ? ': ' + reason : ''}`);
    this.name = 'InvalidListingError';
  }
}

/** All scraping strategies exhausted for a listing */
export class StrategyExhaustedError extends Error {
  public readonly retryable = false;
  constructor(
    public readonly retailerSlug: string,
    public readonly url: string,
    public readonly attemptedStrategies: string[],
    public readonly failures: { strategy: string; error: string }[],
  ) {
    super(
      `[${retailerSlug}] all ${attemptedStrategies.length} strategies failed — ${url}`,
    );
    this.name = 'StrategyExhaustedError';
  }
}
