import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"

import { sessionHasScope, type McpSession } from "./auth/session"

/**
 * Ready-made workflows a client can offer the user, or run from a scheduled
 * task. A prompt is only text: the tools it names still check their scopes.
 * Prompts whose tools this token cannot call are not registered.
 */
export function registerPrompts(server: McpServer, session: McpSession) {
  if (sessionHasScope(session, "shopping:write")) {
    registerDealHuntPrompt(server)
  }
}

export const DEFAULT_DEAL_STORES =
  "Elkjøp, Power, Komplett, Jula, Clas Ohlson, Biltema, Obs Bygg, Maxbo, Byggmax, Coop Obs, IKEA, Jysk og Prisjakt.no"

export function dealHuntPromptText(stores?: string) {
  return [
    "Sjekk om noe av det vi følger med på i Home Overview er på tilbud nå.",
    "1. Hent varene med list-deal-watch-items (bla videre med cursor til du har alle). Merk deg notatet, målprisen, den planlagte prisen og produktene vi vurderer for hver vare.",
    `2. Søk på nettet etter gjeldende tilbud og kampanjer på hver vare hos ${stores?.trim() || DEFAULT_DEAL_STORES}. Les av pris, ordinær pris og gyldighetsperiode på butikkens egen side eller en pristjeneste – ikke gjett.`,
    "3. Et tilbud er bare verdt å melde inn hvis det er tydelig under vanlig pris, eller på eller under målprisen, og passer med notatet (merke, modell, størrelse). Velg det beste når flere butikker har varen.",
    "4. Meld inn resultatet samlet med report-shopping-deals for hver vare du sjekket: det beste tilbudet, eller deal: null når du ikke fant noe godt tilbud (da fjernes et gammelt tilbud).",
    "5. Avslutt med en kort oppsummering: hvilke varer som er på tilbud, hvor og til hvilken pris, hvor mye det sparer, og hvilke som ikke hadde noe godt tilbud nå.",
    "Hvis ingen varer følges med på: si fra, og spør hvilke varer jeg vil følge med på (lagre dem med set-deal-watch) hvis jeg er til stede. Ellers avslutt uten å endre noe.",
  ].join("\n")
}

function registerDealHuntPrompt(server: McpServer) {
  server.registerPrompt(
    "tilbudsjakt",
    {
      title: "Sjekk tilbud på innkjøpslisten",
      description:
        "Sjekker butikkenes tilbud og kampanjer for varene husholdningen følger med på, og markerer de som er på tilbud. Egner seg som planlagt jobb.",
      argsSchema: {
        butikker: z
          .string()
          .max(500)
          .optional()
          .describe(
            "Butikkene som er aktuelle, f.eks. «Elkjøp, Power, Jula». Standard: de vanlige kjedene for hjem, elektronikk og bygg."
          ),
      },
    },
    ({ butikker }) => ({
      messages: [
        {
          role: "user",
          content: { type: "text", text: dealHuntPromptText(butikker) },
        },
      ],
    })
  )
}
