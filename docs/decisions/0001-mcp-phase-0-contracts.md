# ADR 0001: MCP fase 0 – protokoll og kontrakter

- Status: Akseptert
- Dato: 2026-07-30
- Omfang: Fase 0 i `docs/plans/mcp-server-implementasjonsplan.md`

## Kontekst

Home Overview skal tilby en ekstern MCP-server i den eksisterende Next.js-
applikasjonen. Før OAuth-tabeller og domenetjenester innføres må transporten
bevises, versjoner låses og de åpne kontraktvalgene i implementasjonsplanen
avgjøres.

Denne beslutningen gjelder første, stabile protokollgenerasjon. Valgene
kontrolleres på nytt før OAuth-fasen og før første produksjonsaktivering.

## Beslutninger

### SDK, protokoll og adapter

- `@modelcontextprotocol/sdk` er låst til nøyaktig versjon `1.29.0`.
  _Oppgradert til `1.32.2` i [ADR 0004](0004-mcp-write-tools.md); fortsatt
  eksakt låst og samme protokollversjon._
- Zod er låst til `3.25.76`, som er støttet av SDK-en og allerede brukes i
  monorepoet.
- MCP-protokollversjon `2025-11-25` er målversjonen. Det er siste stabile
  versjon som SDK 1.29.0 annonserer. Release candidate `2026-07-28` og SDK 2.x
  tas ikke inn før de er stabile.
- Next.js Route Handler bruker SDK-ens
  `WebStandardStreamableHTTPServerTransport` direkte. Ingen Express- eller
  App Router-adapter legges mellom Next.js og SDK-en.
- Alle MCP- og senere OAuth-ruter skal eksportere
  `export const runtime = "nodejs"`.

Referanser:

- <https://modelcontextprotocol.io/specification/2025-11-25/basic/transports>
- <https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization>
- <https://github.com/modelcontextprotocol/typescript-sdk>

### Transport

Første versjon er stateless Streamable HTTP:

- ett `POST /api/mcp`-endepunkt
- ingen `Mcp-Session-Id`
- JSON-responsmodus, uten SSE
- `GET` og `DELETE` autentiseres og svarer deretter `405 Method Not Allowed`
- `Cache-Control: no-store` settes på alle svar

Dette dekker `initialize`, `ping`, `tools/list` og `tools/call`. Stateful
sesjoner, resumability og serverinitierte meldinger innføres bare dersom en
valgt målklient dokumentert trenger dem.

Fase-0-klienten er MCP Inspector `2.0.0`, støttet av automatiske
protokolltester med SDK-kontrakten. Inspector-versjonen er verifisert mot det
lokale HTTP-endepunktet for både initialisering og kall av
`get-server-info`. OAuth-kompatibilitet testes på nytt med Inspector og minst
én produksjonsklient i fase 3.

### Midlertidig lokal autentisering

> **Erstattet av [ADR 0003](0003-mcp-read-only-tool-surface.md) (fase 4).**
> `HOME_OVERVIEW_MCP_SPIKE_TOKEN` og `lib/mcp/spike-auth.ts` er fjernet fra
> kodebasen. `/api/mcp` godtar nå kun OAuth bearer-tokens. Avsnittet under
> beskriver hvordan fase 0 ble kjørt, og er historikk.

Spiken kan bare aktiveres utenfor `NODE_ENV=production`, med en eksplisitt
`HOME_OVERVIEW_MCP_SPIKE_TOKEN`. Produksjonsmodus svarer alltid `503`, selv om
variabelen er satt. Dette er en midlertidig fase-0-mekanisme og erstattes
fullstendig av OAuth bearer-validering i fase 4.

### OAuth discovery og klientregistrering

Den kanoniske ressursen blir:

```text
https://home.jenanos.xyz/api/mcp
```

Følgende discovery-dokumenter skal implementeres:

- `/.well-known/oauth-protected-resource`
- `/.well-known/oauth-protected-resource/api/mcp`
- `/.well-known/oauth-authorization-server`

En `401` fra MCP-ruten skal peke eksplisitt på den ressursspesifikke Protected
Resource Metadata-URL-en. Authorization- og tokenforespørsler må binde
`resource` eksakt til den kanoniske ressursen.

OAuth Client ID Metadata Documents er førstevalget i tråd med stabil
MCP-spesifikasjon `2025-11-25`. Dynamisk klientregistrering (RFC 7591) blir
ikke annonsert eller implementert med mindre kompatibilitetstesten i fase 3
viser at en valgt målklient trenger fallbacken. Dermed driftes ikke to åpne
registreringsmekanismer uten et konkret behov.

### Scopes

Scopes fra implementasjonsplanen beholdes. Et `*:write`-scope gir også
lesetilgang til samme domene. `tools/list` filtrerer etter effektivt scope,
mens `tools/call` alltid håndhever scope uavhengig av filtreringen.

### Verktøykontrakter og feil

- Verktøynavn og feltnavn er engelske og bruker `verb-noun`.
- Resultater inneholder både `structuredContent` og kort tekstinnhold.
- Forventede domenefeil returneres som verktøyresultat med `isError`.
- Protokoll-, parse- og ukjent-verktøyfeil returneres som JSON-RPC-feil.
- Applikasjonslaget får stabile feilkoder:
  `NOT_FOUND`, `VALIDATION_ERROR`, `CONFLICT`, `FORBIDDEN`,
  `SCOPE_REQUIRED`, `RATE_LIMITED` og `INTERNAL_ERROR`.
- Uventede feil får en korrelasjons-ID; databasefeil, stack traces og intern
  input returneres aldri.

### Dato og tid

- Kalenderdatoer bruker `YYYY-MM-DD`.
- Ved skriving til dagens `DateTime`-felter tolkes kalenderdatoen som
  `YYYY-MM-DDT00:00:00.000Z`.
- Ved lesing er eksisterende `formatDateToIsoDate` normativ og returnerer
  UTC-datodelen.
- Tidspunkter bruker ISO 8601 UTC med `Z`.

Dette bevarer dagens semantikk og hindrer at Europe/Oslo eller sommertid
flytter kalenderdatoen. Fase 1 legger konverteringen i en delt
serialiseringsmodul med tester rundt sommertid.

### Penger og budsjett

- Valuta er alltid `NOK` inntil datamodellen eventuelt får et valutafelt.
- Lagrede `Decimal`-verdier serialiseres direkte som desimalstrenger.
- Beregnede aggregater er uttrykkelig float-deriverte. Fase 1 beholder dagens
  JS-`number`-beregninger og serialiserer MCP-aggregater avrundet til to
  desimaler med en fast desimalstreng. En overgang til Decimal-aritmetikk er
  en separat, større endring.
- Beregningen i `budget-view.tsx` er normativ fordi den er den komplette
  brukerrettede beregningen. Før den flyttes, låses dagens resultater i en
  karakteriseringstest. `dashboard-stats.ts` bygges deretter på samme
  beregningskjerne.
- En husstand uten `Budget` får et veldefinert svar med
  `hasBudget: false` og `currency: "NOK"`, ikke `NOT_FOUND`. Senere
  skriveoperasjoner kan opprette raden gjennom eksisterende
  `ensureBudget`-semantikk.

## Test- og utviklingsoppsett

`pnpm test` kjører Vitest gjennom Turbo. CI kjører migrasjoner mot en separat
PostgreSQL-database før lint, typecheck og test.

Lokalt startes og migreres testdatabasen slik:

```bash
pnpm db:test:prepare
```

Den bruker port `5436` og `home_overview_test`, adskilt fra utviklingsdatabasen
på port `5435`.

Spiken kjøres lokalt slik:

```bash
export HOME_OVERVIEW_MCP_SPIKE_TOKEN="$(openssl rand -hex 32)"
pnpm dev
```

Samme token oppgis som bearer-token i MCP Inspector mot:

```text
http://localhost:3000/api/mcp
```

Et ikke-interaktivt kall kan gjøres med:

```bash
npx -y @modelcontextprotocol/inspector@2.0.0 \
  --cli http://127.0.0.1:3000/api/mcp \
  --transport http \
  --method tools/call \
  --tool-name get-server-info \
  --header "Authorization: Bearer $HOME_OVERVIEW_MCP_SPIKE_TOKEN"
```

## Konsekvenser og videre arbeid

- Fase 0 kan validere protokollen uten OAuth- eller domenedata.
- Ingen MCP-funksjon kan aktiveres i produksjon ennå.
- Fase 1 kan bygges uavhengig rundt `ApplicationContext`, typede feil,
  serialisering og read services.
- Før fase 3 må Client ID Metadata Documents verifiseres mot de faktisk valgte
  produksjonsklientene. Ved dokumentert inkompatibilitet kan DCR besluttes som
  en avgrenset fallback i en ny ADR.
