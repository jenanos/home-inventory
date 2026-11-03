import { z } from "zod"

import { MCP_DOMAINS, type McpDomain } from "./constants"

const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 30 * 60
const DEFAULT_REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60
const DEFAULT_CLOCK_SKEW_SECONDS = 30

const environmentSchema = z.object({
  HOME_OVERVIEW_MCP_OAUTH_SIGNING_SECRET: z.string().min(32),
  HOME_OVERVIEW_MCP_ISSUER: z
    .string()
    .url()
    .transform((value, context) => {
      const issuer = new URL(value)
      const isCanonicalOrigin =
        !issuer.username &&
        !issuer.password &&
        !issuer.search &&
        !issuer.hash &&
        (issuer.pathname === "/" || issuer.pathname === "")

      if (!isCanonicalOrigin || value.endsWith("/")) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Issuer must be an origin without a trailing slash",
        })
        return z.NEVER
      }

      if (
        issuer.protocol !== "https:" &&
        !(
          issuer.protocol === "http:" &&
          (issuer.hostname === "127.0.0.1" || issuer.hostname === "[::1]")
        )
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Issuer must use HTTPS, except for IP-literal loopback",
        })
        return z.NEVER
      }

      return value
    }),
  HOME_OVERVIEW_MCP_ACCESS_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(15 * 60)
    .max(60 * 60)
    .default(DEFAULT_ACCESS_TOKEN_TTL_SECONDS),
  HOME_OVERVIEW_MCP_REFRESH_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .max(DEFAULT_REFRESH_TOKEN_TTL_SECONDS)
    .default(DEFAULT_REFRESH_TOKEN_TTL_SECONDS),
  /**
   * Which domains accept writes, as a comma-separated list such as
   * `shopping,garden`, or `all`. Unset or empty means none: the deploy order in
   * plan chapter 16 turns writes on one domain at a time, after the read-only
   * surface has been observed. An unknown name makes the whole configuration
   * invalid, so a typo is loud instead of silently leaving a domain off.
   */
  HOME_OVERVIEW_MCP_WRITE_DOMAINS: z
    .string()
    .optional()
    .transform((value, context): McpDomain[] => {
      const names = (value ?? "")
        .split(",")
        .map((name) => name.trim().toLowerCase())
        .filter(Boolean)

      if (names.length === 1 && names[0] === "all") {
        return [...MCP_DOMAINS]
      }

      const domains: McpDomain[] = []
      for (const name of names) {
        const domain = MCP_DOMAINS.find((candidate) => candidate === name)
        if (!domain) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Unknown MCP write domain: ${name}`,
          })
          return z.NEVER
        }
        if (!domains.includes(domain)) domains.push(domain)
      }

      return MCP_DOMAINS.filter((domain) => domains.includes(domain))
    }),
  HOME_OVERVIEW_MCP_CLOCK_SKEW_SECONDS: z.coerce
    .number()
    .int()
    .min(0)
    .max(60)
    .default(DEFAULT_CLOCK_SKEW_SECONDS),
})

type McpEnvironment = Record<string, string | undefined>

export type McpConfig =
  | {
      enabled: true
      issuer: string
      resource: string
      signingSecret: string
      accessTokenTtlSeconds: number
      refreshTokenTtlSeconds: number
      clockSkewSeconds: number
      /** Domains whose `*:write` scope is advertised, granted and honoured. */
      writeDomains: McpDomain[]
    }
  | {
      enabled: false
      reason: "missing-or-invalid-configuration"
      issues: string[]
    }
  | {
      enabled: false
      reason: "disabled-by-operator"
    }

/**
 * The emergency switch from chapter 11 point 18. Setting it turns off MCP and
 * the whole OAuth surface — every one of those routes reads this config — while
 * the rest of Home Overview keeps serving. Anything other than the two
 * documented off-values leaves MCP enabled, so a typo cannot silently disable
 * the server.
 */
function isDisabledByOperator(environment: McpEnvironment) {
  const value = environment.HOME_OVERVIEW_MCP_ENABLED?.trim().toLowerCase()
  return value === "false" || value === "0"
}

export function loadMcpConfig(
  environment: McpEnvironment = process.env
): McpConfig {
  if (isDisabledByOperator(environment)) {
    return { enabled: false, reason: "disabled-by-operator" }
  }

  const result = environmentSchema.safeParse(environment)

  if (!result.success) {
    return {
      enabled: false,
      reason: "missing-or-invalid-configuration",
      issues: result.error.issues.map((issue) => issue.path.join(".")),
    }
  }

  return {
    enabled: true,
    issuer: result.data.HOME_OVERVIEW_MCP_ISSUER,
    resource: `${result.data.HOME_OVERVIEW_MCP_ISSUER}/api/mcp`,
    signingSecret: result.data.HOME_OVERVIEW_MCP_OAUTH_SIGNING_SECRET,
    accessTokenTtlSeconds:
      result.data.HOME_OVERVIEW_MCP_ACCESS_TOKEN_TTL_SECONDS,
    refreshTokenTtlSeconds:
      result.data.HOME_OVERVIEW_MCP_REFRESH_TOKEN_TTL_SECONDS,
    clockSkewSeconds: result.data.HOME_OVERVIEW_MCP_CLOCK_SKEW_SECONDS,
    writeDomains: result.data.HOME_OVERVIEW_MCP_WRITE_DOMAINS,
  }
}

// Evaluated once when the server module is loaded. Missing configuration keeps
// the rest of Home Overview available and makes only MCP/OAuth unavailable.
export const mcpConfig = loadMcpConfig()

export function createMcpUnavailableResponse() {
  return Response.json(
    {
      error: "service_unavailable",
      error_description: "MCP/OAuth is not configured on this server.",
    },
    {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": "60",
      },
    }
  )
}
