import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { AlertTriangle, ShieldCheck } from "lucide-react"

import { auth } from "@/lib/auth"
import { mcpConfig } from "@/lib/mcp/config"
import {
  CONSENT_COOKIE_NAME,
  deriveConsentCsrfToken,
} from "@/lib/mcp/oauth/authorization"
import { OAUTH_ENDPOINT_PATHS } from "@/lib/mcp/oauth/metadata"
import { createOAuthTokenRepository } from "@/lib/mcp/oauth/repository"
import { hashOpaqueToken } from "@/lib/mcp/oauth/token-hash"
import {
  isMcpScope,
  MCP_SCOPE_DESCRIPTIONS,
  type McpScope,
} from "@/lib/mcp/oauth/scopes"
import { isLoopbackRedirectUri } from "@/lib/mcp/oauth/redirect-uri"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Button } from "@workspace/ui/components/button"
import { Label } from "@workspace/ui/components/label"
import { Separator } from "@workspace/ui/components/separator"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const metadata = {
  title: "Godkjenn tilkobling",
  robots: { index: false, follow: false },
}

function ConsentProblem({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {children}
        </CardContent>
      </Card>
    </div>
  )
}

export default async function ConsentPage() {
  if (!mcpConfig.enabled) {
    return (
      <ConsentProblem title="Tilkoblinger er ikke aktivert">
        MCP-tilkoblinger er ikke konfigurert på denne serveren.
      </ConsentProblem>
    )
  }

  const session = await auth()
  if (!session?.user?.id) {
    redirect(
      `/login?callbackUrl=${encodeURIComponent(OAUTH_ENDPOINT_PATHS.consent)}`
    )
  }

  const consentToken = (await cookies()).get(CONSENT_COOKIE_NAME)?.value
  if (!consentToken) {
    return (
      <ConsentProblem title="Forespørselen mangler">
        Vi fant ingen aktiv tilkoblingsforespørsel. Start tilkoblingen på nytt
        fra klienten din.
      </ConsentProblem>
    )
  }

  const repository = createOAuthTokenRepository(mcpConfig)
  const request = await repository.findPendingAuthorizationRequest(consentToken)

  // Binding the request to the signed-in user means a leaked cookie cannot be
  // approved from someone else's session.
  if (!request || request.userId !== session.user.id) {
    return (
      <ConsentProblem title="Forespørselen er utløpt">
        Tilkoblingsforespørselen er utløpt eller allerede behandlet. Start
        tilkoblingen på nytt fra klienten din.
      </ConsentProblem>
    )
  }

  const csrfToken = deriveConsentCsrfToken(
    hashOpaqueToken(consentToken, mcpConfig.signingSecret),
    mcpConfig.signingSecret
  )
  const requestedScopes = request.requestedScopes.filter(isMcpScope)
  const redirectUrl = new URL(request.redirectUri)
  const isLoopbackClient = isLoopbackRedirectUri(redirectUrl)

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-muted-foreground" />
            Godkjenn tilkobling
          </CardTitle>
          <CardDescription>
            <strong className="font-medium text-foreground">
              {request.client.name}
            </strong>{" "}
            ber om tilgang til Hjemoversikt på vegne av deg
            {session.user.email ? ` (${session.user.email})` : ""}.
          </CardDescription>
        </CardHeader>

        <form method="post" action={OAUTH_ENDPOINT_PATHS.decision}>
          <input type="hidden" name="csrf" value={csrfToken} />

          <CardContent className="space-y-5">
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <div className="text-muted-foreground">Svar sendes til</div>
              <div className="mt-0.5 font-mono text-xs break-all text-foreground">
                {redirectUrl.host}
                {redirectUrl.pathname}
              </div>
              {isLoopbackClient && (
                <p className="mt-2 flex gap-2 text-xs text-muted-foreground">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    Klienten kjører på din egen maskin. Enhver app på maskinen
                    kan oppgi seg for å være denne klienten, så godkjenn bare
                    hvis du nettopp startet tilkoblingen selv.
                  </span>
                </p>
              )}
            </div>

            <Separator />

            <fieldset className="space-y-3">
              <legend className="mb-3 text-sm font-medium">
                Velg hva klienten skal få lov til
              </legend>

              {requestedScopes.map((scope: McpScope) => (
                <div key={scope} className="flex items-start gap-3">
                  {/* Native input on purpose: the consent form must submit the
                      selected scopes without depending on hydration. */}
                  <input
                    type="checkbox"
                    id={`scope-${scope}`}
                    name="scope"
                    value={scope}
                    defaultChecked
                    className="mt-1 size-4 shrink-0 accent-primary"
                  />
                  <div className="grid gap-1 leading-snug">
                    <Label
                      htmlFor={`scope-${scope}`}
                      className="cursor-pointer text-sm font-medium"
                    >
                      {MCP_SCOPE_DESCRIPTIONS[scope].title}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {MCP_SCOPE_DESCRIPTIONS[scope].description}
                    </p>
                  </div>
                </div>
              ))}
            </fieldset>

            <p className="text-xs text-muted-foreground">
              Klienten får aldri tilgang til administrasjon, medlemmer eller
              delingslenker. Du kan når som helst trekke tilbake tilgangen under
              Innstillinger.
            </p>
          </CardContent>

          <CardFooter className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="submit"
              name="decision"
              value="deny"
              variant="outline"
              className="w-full sm:w-auto"
            >
              Avvis
            </Button>
            <Button
              type="submit"
              name="decision"
              value="approve"
              className="w-full sm:w-auto"
            >
              Godkjenn tilgang
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
