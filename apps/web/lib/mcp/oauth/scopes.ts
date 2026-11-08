import { MCP_DOMAINS, type McpDomain } from "../constants"

export const MCP_SCOPES = [
  "shopping:read",
  "shopping:write",
  "budget:read",
  "budget:write",
  "maintenance:read",
  "maintenance:write",
  "garden:read",
  "garden:write",
] as const

export type McpScope = (typeof MCP_SCOPES)[number]

type ScopeDescription = {
  /** Short title shown as the consent list heading. */
  title: string
  /** Plain Norwegian, so consent is not just a technical scope name (see 12). */
  description: string
}

export const MCP_SCOPE_DESCRIPTIONS: Record<McpScope, ScopeDescription> = {
  "shopping:read": {
    title: "Se handlelister",
    description:
      "Lese handlelistene dine, varer, kategorier og produktalternativer. Private lister er kun synlige for deg.",
  },
  "shopping:write": {
    title: "Endre handlelister",
    description:
      "Opprette og endre handlelister, varer og produktalternativer. Inkluderer lesetilgang.",
  },
  "budget:read": {
    title: "Se budsjett",
    description:
      "Lese inntekter, utgifter, lån, reiser og beregnede summer. Dette er husstandens mest sensitive data.",
  },
  "budget:write": {
    title: "Endre budsjett",
    description:
      "Opprette og endre budsjettposter, medlemmer, lån og reiser. Inkluderer lesetilgang.",
  },
  // The scope keeps its original name so existing grants and the
  // `HOME_OVERVIEW_MCP_WRITE_DOMAINS` setting keep working (ADR 0006). It
  // covers projects of every kind, not only maintenance.
  "maintenance:read": {
    title: "Se prosjekter",
    description:
      "Lese prosjekter for hjemmet (vedlikehold, oppussing og annet), med steg, leverandører og tilknyttede innkjøpslister.",
  },
  "maintenance:write": {
    title: "Endre prosjekter",
    description:
      "Opprette, endre og slette prosjekter, steg og leverandører. Inkluderer lesetilgang.",
  },
  "garden:read": {
    title: "Se hage",
    description: "Lese planter, plassering og stellinformasjon.",
  },
  "garden:write": {
    title: "Endre hage",
    description:
      "Opprette og endre planter og stellinformasjon. Inkluderer lesetilgang.",
  },
}

const scopeSet: ReadonlySet<string> = new Set<string>(MCP_SCOPES)

export function isMcpScope(value: string): value is McpScope {
  return scopeSet.has(value)
}

/**
 * Parses an OAuth `scope` parameter. The separator is a single space per
 * RFC 6749, but clients occasionally send other whitespace, so any run of
 * whitespace is accepted. Unknown scopes are reported instead of ignored.
 */
export function parseScopeParameter(value: string | null | undefined): {
  scopes: McpScope[]
  unknown: string[]
} {
  const tokens = (value ?? "").split(/\s+/).filter(Boolean)
  const scopes: McpScope[] = []
  const unknown: string[] = []

  for (const token of tokens) {
    if (isMcpScope(token)) {
      if (!scopes.includes(token)) {
        scopes.push(token)
      }
    } else if (!unknown.includes(token)) {
      unknown.push(token)
    }
  }

  return { scopes: sortScopes(scopes), unknown }
}

export function formatScopeParameter(scopes: readonly McpScope[]): string {
  return sortScopes(scopes).join(" ")
}

/** Stable ordering so tokens, consent screens and tests never depend on input order. */
export function sortScopes(scopes: readonly McpScope[]): McpScope[] {
  return [...new Set(scopes)].sort(
    (a, b) => MCP_SCOPES.indexOf(a) - MCP_SCOPES.indexOf(b)
  )
}

/**
 * ADR 0001: a `*:write` scope also grants read access to the same domain.
 * Enforcement uses the effective set, so `tools/call` never needs to know the
 * rule.
 */
export function expandEffectiveScopes(scopes: readonly McpScope[]): McpScope[] {
  const effective = new Set<McpScope>(scopes)

  for (const scope of scopes) {
    const [domain, action] = scope.split(":")
    if (action === "write" && domain) {
      const readScope = `${domain}:read`
      if (isMcpScope(readScope)) {
        effective.add(readScope)
      }
    }
  }

  return sortScopes([...effective])
}

export function hasScope(
  granted: readonly McpScope[],
  required: McpScope
): boolean {
  return expandEffectiveScopes(granted).includes(required)
}

export function domainsForScopes(
  scopes: readonly McpScope[]
): (typeof MCP_DOMAINS)[number][] {
  const effective = expandEffectiveScopes(scopes)

  return MCP_DOMAINS.filter((domain) =>
    effective.some((scope) => scope.startsWith(`${domain}:`))
  )
}

/**
 * The scopes this deployment offers: every read scope, plus the write scope of
 * each domain the operator has switched on (`HOME_OVERVIEW_MCP_WRITE_DOMAINS`).
 */
export function enabledScopes(writeDomains: readonly McpDomain[]): McpScope[] {
  return MCP_SCOPES.filter((scope) => {
    const [domain, action] = scope.split(":")
    return (
      action === "read" ||
      writeDomains.some((writeDomain) => writeDomain === domain)
    )
  })
}

/**
 * Drops scopes the deployment does not currently offer. Applied to every
 * token on use, so switching a write domain off takes effect immediately for
 * grants that were approved while it was on.
 */
export function restrictToEnabledScopes(
  scopes: readonly McpScope[],
  writeDomains: readonly McpDomain[]
): McpScope[] {
  const allowed = enabledScopes(writeDomains)
  return scopes.filter((scope) => allowed.includes(scope))
}
