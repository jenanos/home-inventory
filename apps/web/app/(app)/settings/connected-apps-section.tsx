"use client"

import { useState, useTransition } from "react"
import { Loader2, Plug, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { revokeConnectedApp } from "@/lib/actions/mcp-oauth"
import { isMcpScope, MCP_SCOPE_DESCRIPTIONS } from "@/lib/mcp/oauth/scopes"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Separator } from "@workspace/ui/components/separator"

export interface ConnectedAppView {
  grantId: string
  clientName: string
  scopes: string[]
  connectedAt: string
  lastUsedAt: string | null
  recentChanges: Array<{
    id: string
    toolName: string
    result: "saved" | "preview" | "rejected"
    createdAt: string
  }>
}

function scopeLabel(scope: string) {
  return isMcpScope(scope) ? MCP_SCOPE_DESCRIPTIONS[scope].title : scope
}

export function ConnectedAppsSection({ apps }: { apps: ConnectedAppView[] }) {
  const [isPending, startTransition] = useTransition()
  const [pendingGrantId, setPendingGrantId] = useState<string | null>(null)

  function handleRevoke(grantId: string, clientName: string) {
    if (
      !window.confirm(
        `Trekk tilbake tilgangen for «${clientName}»? Klienten kan ikke fornye tilgangen og må godkjennes på nytt. Et allerede utstedt tilgangstoken virker til det utløper.`
      )
    ) {
      return
    }

    setPendingGrantId(grantId)
    startTransition(async () => {
      try {
        await revokeConnectedApp(grantId)
        toast.success("Tilgangen ble trukket tilbake")
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Kunne ikke trekke tilbake tilgangen"
        )
      } finally {
        setPendingGrantId(null)
      }
    })
  }

  if (apps.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Ingen apper er koblet til kontoen din. En MCP-klient kan koble seg til
        via <span className="font-mono text-xs">/api/mcp</span> og må godkjennes
        av deg først.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {apps.map((app, index) => (
        <div key={app.grantId}>
          {index > 0 && <Separator className="mb-4" />}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-2">
              <div className="flex items-center gap-2">
                <Plug className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate font-medium">{app.clientName}</span>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {app.scopes.map((scope) => (
                  <Badge
                    key={scope}
                    variant="secondary"
                    className="font-normal"
                  >
                    {scopeLabel(scope)}
                  </Badge>
                ))}
              </div>

              <p className="text-xs text-muted-foreground">
                Koblet til {app.connectedAt}
                {app.lastUsedAt
                  ? ` · sist brukt ${app.lastUsedAt}`
                  : " · ikke brukt ennå"}
              </p>

              {app.recentChanges.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    Siste endringer
                  </p>
                  <ul className="space-y-0.5 text-xs text-muted-foreground">
                    {app.recentChanges.map((change) => (
                      <li key={change.id} className="flex flex-wrap gap-x-2">
                        <span className="font-mono">{change.toolName}</span>
                        <span>{change.createdAt}</span>
                        {change.result === "preview" && (
                          <span>forhåndsvisning</span>
                        )}
                        {change.result === "rejected" && (
                          <span className="text-destructive">avvist</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => handleRevoke(app.grantId, app.clientName)}
              disabled={isPending}
              className="shrink-0"
            >
              {isPending && pendingGrantId === app.grantId ? (
                <Loader2 className="animate-spin" data-icon="inline-start" />
              ) : (
                <Trash2 data-icon="inline-start" />
              )}
              Trekk tilbake
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}
