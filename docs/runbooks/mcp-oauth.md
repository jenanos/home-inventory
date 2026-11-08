# Runbook: MCP OAuth i drift

Gjelder fase 3 og 4 i `docs/plans/mcp-server-implementasjonsplan.md`. For
migrasjon og rollback av databaseskjemaet, se `mcp-oauth-migration.md`.

## Konfigurasjon

| Variabel                                      | Påkrevd | Merknad                                          |
| --------------------------------------------- | ------- | ------------------------------------------------ |
| `HOME_OVERVIEW_MCP_OAUTH_SIGNING_SECRET`      | ja      | Minst 32 tegn, generert uavhengig av `AUTH_SECRET` |
| `HOME_OVERVIEW_MCP_ISSUER`                    | ja      | Origin uten avsluttende skråstrek, f.eks. `https://home.jenanos.xyz` |
| `HOME_OVERVIEW_MCP_ENABLED`                   | nei     | Nødbryter. `false` eller `0` slår av MCP og OAuth |
| `HOME_OVERVIEW_MCP_ACCESS_TOKEN_TTL_SECONDS`  | nei     | 900–3600, standard 1800                          |
| `HOME_OVERVIEW_MCP_REFRESH_TOKEN_TTL_SECONDS` | nei     | Maks 2592000 (30 dager), standard 30 dager       |
| `HOME_OVERVIEW_MCP_CLOCK_SKEW_SECONDS`        | nei     | 0–60, standard 30                                |
| `HOME_OVERVIEW_MCP_WRITE_DOMAINS`             | nei     | Domener som tar imot skriving: `shopping,budget,maintenance,garden` eller `all` (`maintenance` dekker prosjekter, se ADR 0006). Standard: ingen |

Generer signeringssecreten med:

```bash
openssl rand -hex 32
```

Konfigurasjonen leses **én gang ved oppstart**. Endres en variabel, må
containeren gjenskapes fra oppdatert compose-konfigurasjon; en ren
image-oppdatering er ikke nok.

Mangler eller er konfigurasjonen ugyldig, svarer alle MCP- og OAuth-ruter
`503` mens resten av Hjemoversikt fungerer normalt.

## Deaktivere og aktivere MCP

Sett `HOME_OVERVIEW_MCP_ENABLED=false` og gjenskap containeren. Da svarer både
`/api/mcp`, `/api/oauth/*` og discovery-rutene `503`; webappen er upåvirket.
Aktiver igjen ved å fjerne variabelen eller sette den til `true`.

Bare `false` og `0` slår av. Enhver annen verdi lar MCP være på, slik at en
skrivefeil ikke kan ta ned tjenesten stille.

Nødbryteren revokerer ingenting. Klienter, grants og refresh tokens overlever,
og et allerede utstedt access token blir ikke ugyldig — det får bare `503` på
hvert kall. Skal tilgang faktisk trekkes tilbake, se «Revokere tilgang».

Å fjerne `HOME_OVERVIEW_MCP_OAUTH_SIGNING_SECRET` gir samme `503`, men er en
dårligere nødbryter: den forveksles lett med en secret-rotasjon, og ved
gjenoppretting må man huske nøyaktig samme verdi.

## Teste discovery og en forventet 401

```bash
BASE=https://home.jenanos.xyz

# Protected Resource Metadata (RFC 9728), begge lokasjonene
curl -s "$BASE/.well-known/oauth-protected-resource" | jq
curl -s "$BASE/.well-known/oauth-protected-resource/api/mcp" | jq

# Authorization Server Metadata (RFC 8414)
curl -s "$BASE/.well-known/oauth-authorization-server" | jq
```

Kontroller at:

- `resource` er nøyaktig `$BASE/api/mcp`
- `authorization_servers` inneholder `$BASE`
- `code_challenge_methods_supported` er `["S256"]` — uten dette nekter
  spesifikasjonskonforme klienter å fortsette
- `token_endpoint_auth_methods_supported` er `["none"]`
- `client_id_metadata_document_supported` er `true`
- ingenting annonseres som ikke er implementert

Et uautentisert MCP-kall skal gi `401` med en `WWW-Authenticate`-header som
peker på Protected Resource Metadata:

```bash
curl -si -X POST "$BASE/api/mcp" \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"ping"}' | head -20
```

Forventet:

```text
HTTP/2 401
cache-control: no-store
www-authenticate: Bearer realm="home-overview-mcp", resource_metadata="https://home.jenanos.xyz/.well-known/oauth-protected-resource/api/mcp", error="invalid_token", ...
```

`resource_metadata` må peke på den ressursspesifikke lokasjonen. Uten den må en
klient gjette hvor autorisasjonsserveren er.

Alle avvisningsgrunner — manglende, forfalsket, utløpt eller feil audience —
gir samme melding. Den faktiske grunnen står i loggen som `reason`.

## Kontrollere MCP-flaten med et gyldig token

Med et access token fra en fullført autorisasjonsflyt:

```bash
TOKEN=<access-token>

# Hvilke verktøy tokenet ser, gitt sine scopes
curl -s -X POST "$BASE/api/mcp" \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  | jq '.result.tools[].name'

# Diagnose uten å røre husstandsdata
curl -s -X POST "$BASE/api/mcp" \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get-server-info","arguments":{}}}' \
  | jq '.result.structuredContent'
```

`get-server-info` svarer med serverversjon, protokollversjon, `grantedScopes` og
`availableDomains`. Det er det raskeste svaret på «hvorfor ser ikke klienten
budsjettverktøyene» — mangler `budget:read` i `grantedScopes`, må brukeren
godkjenne scopet på nytt.

`tools/list` viser bare skriveverktøy for domener der tokenet har `*:write`
**og** domenet er slått på i `HOME_OVERVIEW_MCP_WRITE_DOMAINS`.
`get-server-info` svarer med `writableDomains`, som er det raskeste svaret på
«hvorfor kan ikke klienten endre noe».

## Slå på skriving

Skriving er av til den slås på, ett domene av gangen (planens kapittel 16):

1. Kjør read-only en periode og følg med på `mcp.request`-loggen.
2. Sett `HOME_OVERVIEW_MCP_WRITE_DOMAINS=garden` (lavest risiko) og gjenskap
   containeren.
3. Kontroller at discovery nå annonserer `garden:write`:

   ```bash
   curl -s "$BASE/.well-known/oauth-protected-resource/api/mcp" | jq .scopes_supported
   ```

4. Godkjenn klienten på nytt med det nye scopet, test en endring, og sjekk at den
   havner i revisjonsloggen (under).
5. Legg til neste domene: `garden,maintenance`, deretter `shopping`, og
   `budget` sist — budsjettet er de mest sensitive dataene.

Å fjerne et domene fra listen virker umiddelbart for alle tokens, også de som
ble godkjent mens det var på. Grants røres ikke, så å slå det på igjen krever
ikke nytt samtykke. Et ukjent domenenavn gjør konfigurasjonen ugyldig og gir
`503` — sjekk stavemåten hvis MCP plutselig er nede etter en endring.

## Revisjonslogg for endringer

Hvert skriveforsøk som passerte scope-sjekken gir én rad i `McpAuditEvent`. Raden
har ingen input og ingen data, bare hvem, hvilken klient, hvilket verktøy,
hvilken ressurs og utfallet:

```sql
-- Siste endringer i en husstand
SELECT a."createdAt", u.email, a."clientId", a."toolName",
       a."resourceType", a."resourceId", a.outcome, a."correlationId"
FROM "McpAuditEvent" a
JOIN "User" u ON u.id = a."userId"
WHERE a."householdId" = '<household-id>'
ORDER BY a."createdAt" DESC
LIMIT 50;

-- Avviste skriveforsøk siste døgn per klient og utfall
SELECT "clientId", outcome, COUNT(*)
FROM "McpAuditEvent"
WHERE outcome <> 'success' AND "createdAt" > now() - interval '1 day'
GROUP BY 1, 2 ORDER BY 3 DESC;
```

`correlationId` er den samme som i `mcp.request`-loggen, så en rad kan følges
til logglinjen. Brukeren ser selv de fem siste endringene per klient under
Innstillinger → «Tilkoblede apper».

Rader eldre enn 180 dager slettes automatisk. Står det
`"event":"mcp.audit_failed"` i loggen, ble en endring utført uten at den ble
revidert. Det skal undersøkes.

### Når en klient har gjort en uønsket endring

1. Finn radene i revisjonsloggen. `resourceType` og `resourceId` sier hva som ble
   endret.
2. Trekk tilbake klientens tilgang, eller slå av domenet med
   `HOME_OVERVIEW_MCP_WRITE_DOMAINS` hvis det gjelder flere klienter.
3. Rett dataene i webappen. Revisjonsloggen har bevisst ingen før-kopi; trengs
   den gamle verdien, må den hentes fra databasebackupen.

## Se aktive klienter og grants uten å lese tokens

```sql
-- Registrerte klienter
SELECT id, name, "registrationSource", status, "createdAt", "lastUsedAt", "expiresAt"
FROM "McpOAuthClient"
ORDER BY "createdAt" DESC;

-- Aktive grants per bruker
SELECT g.id, u.email, c.name AS client, g.scopes, g."createdAt", g."lastUsedAt"
FROM "McpOAuthGrant" g
JOIN "User" u ON u.id = g."userId"
JOIN "McpOAuthClient" c ON c.id = g."clientId"
WHERE g."revokedAt" IS NULL
ORDER BY g."createdAt" DESC;

-- Antall levende refresh tokens per grant
SELECT "grantId", COUNT(*) FROM "McpOAuthRefreshToken"
WHERE "revokedAt" IS NULL AND "consumedAt" IS NULL AND "expiresAt" > now()
GROUP BY "grantId";
```

Ingen av disse spørringene returnerer en tokenverdi. Kolonnene `codeHash`,
`tokenHash` og `requestTokenHash` inneholder kun HMAC-hasher.

## Revokere tilgang

**Normalveien:** brukeren går til Innstillinger → «Tilkoblede apper» og trykker
«Trekk tilbake». Det stopper fornying umiddelbart.

**En klient, administrativt:**

```sql
UPDATE "McpOAuthGrant" SET "revokedAt" = now()
WHERE "clientId" = '<client-id>' AND "revokedAt" IS NULL;

UPDATE "McpOAuthRefreshToken" SET "revokedAt" = now()
WHERE "grantId" IN (SELECT id FROM "McpOAuthGrant" WHERE "clientId" = '<client-id>')
  AND "revokedAt" IS NULL;
```

**Alle klienter:**

```sql
UPDATE "McpOAuthRefreshToken" SET "revokedAt" = now() WHERE "revokedAt" IS NULL;
UPDATE "McpOAuthGrant" SET "revokedAt" = now() WHERE "revokedAt" IS NULL;
UPDATE "McpOAuthClient" SET status = 'REVOKED', "revokedAt" = now() WHERE status = 'ACTIVE';
```

**Klienten selv** kan bruke RFC 7009-endepunktet:

```bash
curl -s -X POST "$BASE/api/oauth/revoke" \
  -H 'content-type: application/x-www-form-urlencoded' \
  -d "token=<refresh-token>&token_type_hint=refresh_token"
```

Endepunktet svarer alltid `200`, også for et ukjent token. Det er RFC-adferd og
hindrer at noen kan bruke det til å avgjøre om et token er gyldig.

**Viktig:** revokering stopper *fornying*. Et allerede utstedt access token er
en selvstendig JWT og lever til `exp` — maksimalt
`HOME_OVERVIEW_MCP_ACCESS_TOKEN_TTL_SECONDS`. Trengs umiddelbar effekt, roter
signeringssecreten.

## Rotere signeringssecreten

Secreten brukes til tre ting: signering av access tokens, HMAC-hashing av
opake tokens, og CSRF-tokenet på samtykkesiden. Rotasjon invaliderer derfor
**alt** samtidig.

1. Generer en ny secret.
2. Oppdater miljøvariabelen og gjenskap containeren.
3. Rydd opp i rader som nå er uleselige, siden hashene ikke lenger matcher:

   ```sql
   DELETE FROM "McpOAuthAuthorizationRequest";
   DELETE FROM "McpOAuthAuthorizationCode";
   UPDATE "McpOAuthRefreshToken" SET "revokedAt" = now() WHERE "revokedAt" IS NULL;
   ```

4. Alle klienter må godkjennes på nytt av brukeren. Grants og
   klientregistreringer overlever, så klienten trenger ikke registrere seg på
   nytt.

## Rydde utløpte OAuth-data

Oppryddingen kjører automatisk i appen (`lib/mcp/cleanup.ts`, startet fra
`instrumentation.ts`): ett minutt etter oppstart og deretter hver sjette time.
Den sletter

- utløpte authorization requests og codes
- konsumerte og revokerte refresh tokens eldre enn én refresh-token-levetid
  (reuse-deteksjonen trenger dem fram til da)
- klientregistreringer som aldri ble tatt i bruk
- revisjonsrader eldre enn 180 dager

Hver kjøring gir én logglinje med `"event":"mcp.cleanup"` og antall slettede
rader. Mangler den over et døgn, eller står det `mcp.cleanup_failed`, kjører ikke
jobben. Jobben er idempotent og ikke nødvendig for korrekthet — kun for
plassbruk. Utløpte rader kan aldri brukes, fordi hvert oppslag filtrerer på
`expiresAt`. Med flere replikaer kjører den i hver av dem; det er bortkastet,
men trygt.

## Diagnostisere feil klokke, issuer eller audience

| Symptom                                                | Sannsynlig årsak                                                     |
| ------------------------------------------------------ | -------------------------------------------------------------------- |
| Klienten får `invalid_request` på authorize med `resource` | `HOME_OVERVIEW_MCP_ISSUER` matcher ikke domenet klienten kaller       |
| Access token avvises som `expired` rett etter utstedelse | Verten har feil klokke; sammenlign `date -u` på server og klient      |
| Access token avvises som `audience-mismatch`            | Issuer ble endret etter at tokenet ble utstedt                        |
| `invalid_client` ved authorize                          | Klienten er tilbakekalt, eller DCR-registreringen utløp uten å bli brukt |
| `invalid_client` for en CIMD-klient                     | Metadatadokumentet er utilgjengelig, ikke JSON, eller `client_id` matcher ikke URL-en |
| `invalid_client` med «utsteder ikke klienthemmeligheter» | Klienten tilbyr ingen metode serveren støtter. Bare `none` (PKCE) støttes; når dokumentet har `token_endpoint_auth_methods_supported` (som ChatGPT), holder det at `none` står der |
| «Forespørselen ble avvist» (`invalid_request`) på `/api/oauth/authorize/decision` | Se `consent decision refused` i loggen: `origin-mismatch:null` betyr at samtykkesiden sendes med `Referrer-Policy: no-referrer` (skal være `same-origin`); `csrf-mismatch` betyr at samtykkesiden og innsendingen så ulike tilkoblingsforespørsler (f.eks. to faner) |
| Etter «Koble til» blir du stående på samtykkesiden, og neste klikk gir «Vi fant ingen aktiv tilkoblingsforespørsel» | Nettleseren blokkerte redirecten til klienten. Sjekk at `Content-Security-Policy` på `/oauth/consent` ikke har `form-action`; loggen viser `consent granted` fulgt av `no-consent-cookie`, og koden i `McpOAuthAuthorizationCode` blir aldri brukt |
| Discovery gir `503`                                     | MCP-konfigurasjonen mangler eller er ugyldig, eller `HOME_OVERVIEW_MCP_ENABLED` er av |
| `/api/mcp` gir `403` med `FORBIDDEN`                    | Tokenets bruker er slettet, står uten husstand, eller har flere husstandsmedlemskap |
| Et verktøy mangler i `tools/list`                       | Tokenet har ikke scopet; sjekk `grantedScopes` fra `get-server-info`  |

Klokkesynkronisering er en forutsetning. Tillatt skjevhet er
`HOME_OVERVIEW_MCP_CLOCK_SKEW_SECONDS`, maks 60 sekunder.

## Kontrollere at Caddy ikke cacher OAuth-responser

Alle token-, authorize-, decision- og revoke-svar settes med
`Cache-Control: no-store`. Discovery-dokumentene er offentlige og settes med
`public, max-age=300`.

```bash
curl -sI "$BASE/api/oauth/token" -X POST \
  -H 'content-type: application/x-www-form-urlencoded' -d 'grant_type=x' \
  | grep -i cache-control
```

Forventet: `no-store`. Er den borte, legger et mellomledd på egen caching, og
det må rettes i Caddy-konfigurasjonen — som ligger utenfor dette repoet.

## Rate limiting

Grensene holdes i Node-prosessen og forutsetter **én replika**:

| Endepunkt         | Grense              |
| ----------------- | ------------------- |
| `/api/oauth/register` | 5 per time per IP   |
| `/api/oauth/authorize` | 30 per 5 min per IP |
| `/api/oauth/authorize/decision` | 30 per 5 min per IP |
| `/api/oauth/token` | 60 per 5 min per IP |
| `/api/oauth/revoke` | 30 per 5 min per IP |
| `/api/mcp` | 240 per min per IP **og** 120 per min per bruker |

Nøkkelen kommer fra `x-forwarded-for`, som Caddy setter. Skal Hjemoversikt
skaleres til flere replikaer, må limiteren flyttes til et delt lager først —
ellers ganges den effektive grensen med antall replikaer.

`/api/mcp` teller to ganger: adressegrensen sjekkes før autentisering og demper
probing, brukergrensen etterpå og hindrer at én klient legger beslag på
prosessen. Et `429` har `Retry-After` i sekunder.

## Lese MCP-loggen

Hvert kall gir én JSON-linje med `"event":"mcp.request"`:

```json
{
  "event": "mcp.request",
  "correlationId": "…",
  "method": "tools/call",
  "toolName": "get-budget-summary",
  "outcome": "ok",
  "status": 200,
  "durationMs": 34,
  "responseBytes": 812,
  "clientId": "mcp-dcr-…",
  "userId": "…"
}
```

`outcome` er én av `ok`, `tool_error`, `unauthenticated`, `forbidden`,
`rate_limited`, `bad_request` eller `unavailable`. Ved avvisning står årsaken i
`reason` — for eksempel `expired`, `audience-mismatch`, `invalid-signature`
eller `FORBIDDEN`.

Samme `correlationId` returneres til klienten som `X-Correlation-Id`, så en
brukerrapport kan slås opp direkte. En intern feil returnerer også ID-en i
feilmeldingen, mens detaljene bare finnes i loggen.

Loggen inneholder aldri bearer tokens, verktøyargumenter eller verktøyresultater.
Ser du husstandsdata i loggen, er det en feil som skal rettes, ikke støy.

Nyttige spørsmål å følge med på: `unauthenticated`-rate (klienter med utløpt
token som ikke fornyer), `forbidden`-rate (brukere som er ute av husstanden),
`rate_limited`-rate, og `responseBytes` per verktøy — et svar som vokser er
første tegn på at et `limit` bør ned.

## Ved mistanke om tokenlekkasje

1. Deaktiver MCP (`HOME_OVERVIEW_MCP_ENABLED=false`, gjenskap containeren).
2. Revoker alle grants og refresh tokens med SQL-en over.
3. Roter signeringssecreten.
4. Sjekk loggen for `refresh token reuse detected` og
   `authorization code replay detected` — begge er sterke signaler om at et
   token har vært på avveie.
5. Aktiver først etter verifikasjon, og be brukeren godkjenne klientene på
   nytt.

## Backup og restore

Tabellene `McpOAuthClient`, `McpOAuthGrant`, `McpOAuthRefreshToken`,
`McpOAuthAuthorizationRequest`, `McpOAuthAuthorizationCode` og
`McpAuditEvent` må være med i databasebackupen.

### Restore-test

Gjøres minst én gang før skriving slås på, og etter hver endring av
backupoppsettet:

1. Restore siste backup til en midlertidig database, aldri over produksjon:

   ```bash
   createdb home_overview_restore_test
   pg_restore --no-owner -d home_overview_restore_test <backupfil>
   ```

2. Kontroller at migrasjonene er komplette og at tabellene har innhold:

   ```bash
   DATABASE_URL=postgresql://…/home_overview_restore_test \
     pnpm --filter @workspace/db prisma migrate status
   ```

   ```sql
   SELECT COUNT(*) FROM "McpOAuthClient";
   SELECT COUNT(*) FROM "McpOAuthGrant" WHERE "revokedAt" IS NULL;
   SELECT MAX("createdAt") FROM "McpAuditEvent";
   SELECT COUNT(*) FROM "Household";
   ```

3. Noter dato og resultat, og slett testdatabasen.

| Dato | Backup | Resultat |
| ---- | ------ | -------- |
| 2026-11-03 | `20261103-home-overview-db-custom-backup` | Restore uten feil (17 migrasjoner). `20260730120000_add_mcp_oauth_models` og `20261103181712_add_mcp_audit_events` gikk rent på dataene. Produksjonsbygget kjørte mot kopien: alle sider rendret, web-actions og MCP-verktøy fungerte. |

Restore av en backup som er eldre enn en secret-rotasjon gir refresh tokens som
ikke lenger kan hashes tilbake. De er da uleselige og må ryddes med SQL-en i
rotasjonsavsnittet.

## Overvåking

Det finnes ingen dashboards ennå; loggen er JSON per linje og kan tas inn i det
verktøyet serveren ellers bruker. Disse signalene bør ha en alarm eller i det
minste en ukentlig titt:

| Signal | Kilde | Hva det betyr |
| ------ | ----- | ------------- |
| `refresh token reuse detected` | applikasjonslogg | Mulig lekket token. Følg «Ved mistanke om tokenlekkasje» |
| `authorization code replay detected` | applikasjonslogg | Samme |
| `mcp.audit_failed` | applikasjonslogg | En endring ble ikke revidert |
| `mcp.cleanup_failed`, eller ingen `mcp.cleanup` på et døgn | applikasjonslogg | Opprydding kjører ikke |
| Økning i `outcome: "rate_limited"` | `mcp.request` | Misbruk, eller en klient i løkke |
| Økning i `forbidden`/`not_found` i `McpAuditEvent` | database | En klient gjetter ID-er eller har gammel tilstand |
| `durationMs` p95 per `toolName` | `mcp.request` | Trege verktøy; første kandidat er store sider |

## Last- og misbrukstest

Kjørt 2026-11-03 mot produksjonsbygget lokalt på en restore av produksjonsdata:
registrering ga `429` fra og med sjette kall, `/api/mcp` ga `429` med
`Retry-After` ved grensen per bruker, de tyngste leseverktøyene svarte med
rundt 11 KB på under 50 ms, og 100 varer i `add-shopping-items` gikk på
190 ms innenfor request-grensen. Gjenta etter større endringer.

Rate limiteren er prosesslokal, så testen må gå mot én kjørende instans,
helst en kopi av produksjon:

1. `POST /api/oauth/register` over 5 ganger per time fra samme adresse → `429`.
2. `POST /api/mcp` med gyldig token i en løkke → `429` etter 120 kall per minutt,
   med `Retry-After`.
3. `get-shopping-list` og `get-budget-details` med `limit: 100` på den største
   husstanden: noter `responseBytes` og `durationMs`.
4. `add-shopping-items` med 100 varer: skal fullføre godt under
   request-grensen på 64 KiB, og 101 varer skal avvises med `VALIDATION_ERROR`.
