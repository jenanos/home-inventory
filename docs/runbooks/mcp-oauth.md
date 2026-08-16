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

Fase 4 er **read-only**. Ingen verktøy kan endre data, og `tools/list` skal aldri
inneholde et verktøy som ikke starter med `list-` eller `get-`.

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

`McpOAuthTokenRepository.cleanupExpiredRows(deleteFinalizedBefore)` sletter
utløpte authorization requests og codes, ferdigbrukte refresh tokens etter
karantenetiden, og klientregistreringer som aldri ble tatt i bruk.

Jobben er idempotent og ikke nødvendig for korrekthet — kun for plassbruk.
Utløpte rader kan aldri brukes, fordi hvert oppslag filtrerer på `expiresAt`.

## Diagnostisere feil klokke, issuer eller audience

| Symptom                                                | Sannsynlig årsak                                                     |
| ------------------------------------------------------ | -------------------------------------------------------------------- |
| Klienten får `invalid_request` på authorize med `resource` | `HOME_OVERVIEW_MCP_ISSUER` matcher ikke domenet klienten kaller       |
| Access token avvises som `expired` rett etter utstedelse | Verten har feil klokke; sammenlign `date -u` på server og klient      |
| Access token avvises som `audience-mismatch`            | Issuer ble endret etter at tokenet ble utstedt                        |
| `invalid_client` ved authorize                          | Klienten er tilbakekalt, eller DCR-registreringen utløp uten å bli brukt |
| `invalid_client` for en CIMD-klient                     | Metadatadokumentet er utilgjengelig, ikke JSON, eller `client_id` matcher ikke URL-en |
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
`McpOAuthAuthorizationRequest` og `McpOAuthAuthorizationCode` må være med i
databasebackupen. Verifiser en restore med:

```sql
SELECT COUNT(*) FROM "McpOAuthClient";
SELECT COUNT(*) FROM "McpOAuthGrant" WHERE "revokedAt" IS NULL;
```

Restore av en backup som er eldre enn en secret-rotasjon gir refresh tokens som
ikke lenger kan hashes tilbake. De er da uleselige og må ryddes med SQL-en i
rotasjonsavsnittet.
