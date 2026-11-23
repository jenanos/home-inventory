# ADR 0015: Hendelser med gaveønsker på innkjøpslister

- Status: Akseptert
- Dato: 2026-11-23
- Bygger på: [ADR 0004](0004-mcp-write-tools.md), [ADR 0005](0005-generelle-innkjop-og-mcp.md), [ADR 0006](0006-prosjekter-i-stedet-for-vedlikehold.md)

## Kontekst

Husstanden vil ha oversikt over bursdager og andre datoer i familien, og over
gavene som skal kjøpes til dem. Gaver er innkjøp: de har pris, lenker,
alternativer og kan følges på tilbud, alt det innkjøpslistene allerede kan.

## Beslutninger

### En hendelse lagrer dagen, måneden og eventuelt året

`CalendarEvent` har `month`, `day` og et valgfritt `year`, i stedet for en
dato. En bursdag gjentas hvert år (`YEARLY`) og kan legges inn uten fødselsår;
da vises ikke alderen. En hendelse som skjer én gang (`NONE`) må ha år. Typen
er `BIRTHDAY`, `ANNIVERSARY`, `HOLIDAY` eller `OTHER`; for en bursdag er
tittelen personens navn.

Neste forekomst og alder regnes ut i `lib/application/events/dates.ts`, som
ikke bruker databasen og derfor også kan brukes i klientkomponenter. «I dag»
er dagen i Europe/Oslo. 29. februar faller på 28. februar i år som ikke er
skuddår. En husstand har titalls hendelser, så sortering etter neste
forekomst skjer i applikasjonslaget, ikke i SQL.

Databasen sjekker at måned og dag er innenfor gyldige områder og at en
engangshendelse har år. Skrivetjenesten sjekker i tillegg at datoen finnes,
og ved delvis oppdatering valideres raden slik den blir lagret, inne i
transaksjonen.

### Gaveønsker er varer på en innkjøpsliste koblet til hendelsen

`ShoppingList.eventId` kobler en liste til en hendelse, med samme regler som
`projectId` (ADR 0006): samme husstand, og når hendelsen slettes, blir listen
stående uten kobling. Gaveønskene vises dermed også under Innkjøp, kan krysses
av som kjøpt og har alternativer og tilbudsovervåking.

Hendelsen viser bare lister brukeren kan se. En privat gaveliste holder en
overraskelse skjult for resten av husstanden. Legger et annet medlem til et
ønske, havner det på en ny liste for vedkommende i stedet for på den skjulte.

`addGiftWishes` legger ønsker på hendelsens første synlige gaveliste, og lager
listen («Gaver til <navn>») når hendelsen ikke har noen. Navn som allerede
står på listen, hoppes over, som i `add-shopping-items`.

### MCP

Nytt domene `events` med scopene `events:read` og `events:write`.

| Verktøy | Scope | Merknad |
| ------- | ----- | ------- |
| `list-events` | `events:read` | Uten periode: alle, sortert etter neste forekomst. Med `withinDays` eller `from`/`to` (maks to år): én rad per forekomst |
| `get-event` | `events:read` | Med gavelistene og ønskene, pris og status |
| `create-event` | `events:write` | `date` som `YYYY-MM-DD`, eller `--MM-DD` når året er ukjent |
| `update-event` | `events:write` | |
| `delete-event` | `events:write` | Gavelistene blir stående |
| `add-gift-wishes` | `shopping:write` | Krever også `events:read`. Gaveønsker er varer, så skrivingen hører til innkjøp |

`create-shopping-list`, `update-shopping-list` og `list-shopping-lists` har
fått `eventId`. Serverversjonen er `0.14.0`.

Skriving må slås på med `events` i `HOME_OVERVIEW_MCP_WRITE_DOMAINS` (eller
`all`). Eksisterende tilkoblinger har ikke de nye scopene; brukeren må koble
til på nytt for å gi dem.
