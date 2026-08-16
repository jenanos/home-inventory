# ADR 0003: MCP fase 4 – autentisert lesetilgang og verktøykontrakter

- Status: Akseptert
- Dato: 2026-08-03
- Omfang: Fase 4 i `docs/plans/mcp-server-implementasjonsplan.md`
- Bygger på: [ADR 0001](0001-mcp-phase-0-contracts.md),
  [ADR 0002](0002-mcp-dynamic-client-registration.md)

## Kontekst

Fase 0–3 ga transport, OAuth-datamodell og en fullstendig autorisasjonsflyt.
`/api/mcp` kjørte fortsatt på fase 0-spiken, som aldri kunne aktiveres i
produksjon. Fase 4 kobler bearer-validering til transporten og publiserer det
første verktøysettet: kun lesing, i alle fire domener.

Dette er den anbefalte første produksjonsmilepælen. Kontraktene under er derfor
det klientene faktisk vil se, og de skal modnes her før noe skriveverktøy
innføres.

## Beslutninger

### Autentisering erstatter spiken fullstendig

`lib/mcp/spike-auth.ts` er slettet, sammen med `HOME_OVERVIEW_MCP_SPIKE_TOKEN`.
Det finnes ikke lenger noen alternativ autentiseringsvei inn i MCP.

Hver forespørsel til `/api/mcp`:

1. valideres som HS256-JWT mot `iss`, `aud` (den kanoniske ressursen), `exp`,
   `iat` og en låst algoritme
2. slår opp `sub` på nytt og bygger `ApplicationContext` gjennom
   `getApplicationContext`
3. avvises med `403` dersom brukeren er slettet, står uten husstand eller har
   flere husstandsmedlemskap

Punkt 2 er bevisst en spørring per forespørsel og ikke en cache. Det er det som
gjør at fjerning fra husstanden får effekt umiddelbart, selv om access tokenet
formelt er gyldig i inntil 30 minutter til.

`401` bærer `WWW-Authenticate` med `resource_metadata` som peker på
`/.well-known/oauth-protected-resource/api/mcp`, slik at en klient som aldri har
sett serveren finner autorisasjonsserveren fra svaret alene. Alle avvisningsgrunner
gir samme melding utad; grunnen logges.

### Scope håndheves to steder, uavhengig av hverandre

`tools/list` viser bare verktøy tokenet har scope til — implementert ved at
verktøyet registreres og deretter deaktiveres. I tillegg starter hvert
verktøykall med sin egen scope-sjekk i `defineTool`. Filtreringen er
brukervennlighet; sjekken i kallet er sikkerheten. Testene kaller
`tool.invoke(...)` direkte nettopp for å bevise at den andre ikke avhenger av
den første.

`*:write` gir lesetilgang til samme domene (ADR 0001). Utvidelsen skjer én gang,
når sesjonen bygges, så ingen verktøy trenger å kjenne regelen.

### Verktøyflaten

Nivå 0 og 1 fra planens kapittel 10, ti verktøy:

| Verktøy                    | Scope              |
| -------------------------- | ------------------ |
| `get-server-info`          | (gyldig token)     |
| `list-shopping-lists`      | `shopping:read`    |
| `get-shopping-list`        | `shopping:read`    |
| `list-shopping-categories` | `shopping:read`    |
| `get-budget-summary`       | `budget:read`      |
| `get-budget-details`       | `budget:read`      |
| `list-maintenance-tasks`   | `maintenance:read` |
| `get-maintenance-task`     | `maintenance:read` |
| `list-plants`              | `garden:read`      |
| `get-plant`                | `garden:read`      |

Alle er annotert `readOnlyHint: true`, `destructiveHint: false`,
`idempotentHint: true`, `openWorldHint: false`, og alle har både input- og
output-schema. Ingen skriveverktøy finnes; `replaceShoppingItems` og
`replaceBudget` er dermed strukturelt unåbare, ikke bare uregistrerte.

### Felter er hvitelistet per verktøy, ikke filtrert

Verktøylaget mapper hver rad felt for felt. De paginerte lesetjenestene i
`lib/application/*/read.ts` velger allerede bare de kolonnene som er tillatt, og
er skilt fra de eksisterende nettleserspørringene som henter hele objektgrafen.

Konkrete utelatelser:

- `ShoppingItem.assignedTo` — en annen brukers `User`-rad; ingen lesekontrakt
  har behov for personen
- `ShoppingList.shareLinks` — deling er eksplisitt ikke eksponert
- `Household.members` — samme
- antall varer per kategori — en kategori spenner over alle listene i husstanden,
  så en telling ville lekket størrelsen på andres private lister

`BudgetMember.name` **er** med i `get-budget-details`, fordi navnet er det som
identifiserer inntektsraden. Det er et bevisst kontraktsvalg, ikke en glipp, og
navnet returneres ikke fra noe annet verktøy.

Testen `tools.test.ts` seeder rader med felter som ikke står på noen hviteliste
og feiler dersom en verdi dukker opp i et svar.

### Paginering

`limit` (standard 25, maks 100) og en opak `cursor`. Cursoren er base64url av en
offset, men holdes opak slik at en senere overgang til keyset-paginering ikke
bryter kontrakten. Hver paginert spørring sorterer med `id` som siste
sorteringsnøkkel, ellers ville samme offset kunne gi samme rad to ganger.

`limit` over maksgrensen avvises som `VALIDATION_ERROR` i stedet for å klippes
stille — en klient som ber om 500 rader skal få vite at den ikke fikk dem.

I `get-budget-details` er `entries` den eneste paginerte seksjonen. Medlemmer,
lån, reiser og kategorier er små per husstand.

### Enumverdier er skrevet ut i verktøykontrakten

Schemaene lister enumverdiene som literaler i stedet for å utlede dem fra Prisma
i runtime, slik at en schemaendring ikke stilltiende endrer en publisert
kontrakt. `shared.test.ts` sammenligner listene mot de genererte enumene og
feiler ved avvik, så drift blir en beslutning og ikke en produksjonsfeil.

### Rate limiting og nødbryter

`/api/mcp` har to grenser i samme prosesslokale limiter som OAuth-rutene: 240
kall per minutt per adresse og 120 per minutt per bruker. Adressegrensen demper
uautentisert probing; brukergrensen hindrer at én autorisert klient legger beslag
på prosessen.

`HOME_OVERVIEW_MCP_ENABLED=false` er nødbryteren fra kapittel 11 punkt 18. Den
slår av både MCP og OAuth med `503` uten å røre webappen, og uten å måtte fjerne
signeringssecreten. Bare `false` og `0` slår av; en skrivefeil kan ikke
deaktivere serveren ved et uhell.

### Logging

Hver forespørsel logges strukturert med korrelasjons-ID, JSON-RPC-metode,
verktøynavn, utfall, status, varighet, responsstørrelse, klient-ID og intern
bruker-ID. Korrelasjons-ID-en returneres også som `X-Correlation-Id`.

Body-en leses av ruten før den gis videre til transporten, både for å håndheve
den faktiske størrelsesgrensen — en `content-length`-header beviser ingenting —
og for å hente ut metode og verktøynavn. Verktøyargumenter og verktøyresultater
leses aldri.

## Konsekvenser og videre arbeid

- MCP kan aktiveres read-only i produksjon etter deployrekkefølgen i kapittel 16.
- Serverversjonen er `0.4.0`; `0.1.0-spike` er ute av kodebasen.
- Fase 5 arver `defineTool`, pagineringen og feilmodellen. Nye skriveverktøy
  trenger i tillegg `expectedUpdatedAt`-semantikk og revisjonshendelser.
- Kontrakttesten mot output-schema kjøres for hvert verktøy. Nye verktøy som
  legges til registeret blir automatisk dekket av den, av hvitelisttesten og av
  scope-testen.
