/**
 * Fixed-window rate limiting held in the Node process.
 *
 * This is deliberately the smallest thing that works for a single replica, as
 * allowed by chapter 11 of the implementation plan. Before Home Overview runs
 * more than one replica, this must move to a shared store — otherwise the
 * effective limit multiplies by the number of replicas.
 */

export type RateLimitRule = {
  limit: number
  windowMs: number
}

export type RateLimitResult = {
  allowed: boolean
  remaining: number
  retryAfterSeconds: number
}

type Window = {
  count: number
  resetAt: number
}

const windows = new Map<string, Window>()

// Bounds memory if a caller sprays unique keys. Entries are short-lived, so
// dropping the whole map on overflow only resets counters.
const MAX_TRACKED_KEYS = 10_000

export const OAUTH_RATE_LIMITS = {
  register: { limit: 5, windowMs: 60 * 60 * 1000 },
  authorize: { limit: 30, windowMs: 5 * 60 * 1000 },
  decision: { limit: 30, windowMs: 5 * 60 * 1000 },
  token: { limit: 60, windowMs: 5 * 60 * 1000 },
  revoke: { limit: 30, windowMs: 5 * 60 * 1000 },
} as const satisfies Record<string, RateLimitRule>

export type OAuthRateLimitBucket = keyof typeof OAUTH_RATE_LIMITS

/**
 * `/api/mcp` is limited twice. The address limit blunts unauthenticated
 * probing, and the token limit stops one authorized client from monopolising
 * the process even when it comes from many addresses.
 */
export const MCP_RATE_LIMITS = {
  mcpAddress: { limit: 240, windowMs: 60 * 1000 },
  mcpToken: { limit: 120, windowMs: 60 * 1000 },
} as const satisfies Record<string, RateLimitRule>

export type McpRateLimitBucket = keyof typeof MCP_RATE_LIMITS

export function enforceMcpRateLimit(
  bucket: McpRateLimitBucket,
  key: string,
  now = Date.now()
): RateLimitResult {
  return consumeRateLimit(`${bucket}:${key}`, MCP_RATE_LIMITS[bucket], now)
}

export function consumeRateLimit(
  key: string,
  rule: RateLimitRule,
  now = Date.now()
): RateLimitResult {
  const existing = windows.get(key)

  if (!existing || existing.resetAt <= now) {
    if (windows.size >= MAX_TRACKED_KEYS) {
      windows.clear()
    }

    windows.set(key, { count: 1, resetAt: now + rule.windowMs })
    return {
      allowed: true,
      remaining: rule.limit - 1,
      retryAfterSeconds: 0,
    }
  }

  existing.count += 1
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((existing.resetAt - now) / 1000)
  )

  if (existing.count > rule.limit) {
    return { allowed: false, remaining: 0, retryAfterSeconds }
  }

  return {
    allowed: true,
    remaining: rule.limit - existing.count,
    retryAfterSeconds,
  }
}

export function enforceOAuthRateLimit(
  bucket: OAuthRateLimitBucket,
  clientKey: string,
  now = Date.now()
): RateLimitResult {
  return consumeRateLimit(
    `${bucket}:${clientKey}`,
    OAUTH_RATE_LIMITS[bucket],
    now
  )
}

/**
 * Caddy terminates TLS and sets `x-forwarded-for`. Only the left-most entry is
 * used, and it is treated as an opaque bucket key rather than a trusted
 * identity — a spoofed value can only widen the attacker's own limit, never
 * another caller's.
 */
export function rateLimitKeyFromRequest(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim()
    if (first) {
      return first
    }
  }

  return request.headers.get("x-real-ip")?.trim() || "unknown"
}

export function rateLimitedResponse(result: RateLimitResult) {
  return Response.json(
    {
      error: "temporarily_unavailable",
      error_description: "For mange forespørsler. Prøv igjen om litt.",
    },
    {
      status: 429,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": String(result.retryAfterSeconds),
      },
    }
  )
}

/** Test seam: the module-level window map is process-global by design. */
export function resetRateLimitsForTesting() {
  windows.clear()
}
