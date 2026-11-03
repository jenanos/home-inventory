# ADR 0002: Dynamisk klientregistrering som dokumentert fallback

- Status: Akseptert
- Dato: 2026-08-03
- Omfang: Fase 3 i `docs/plans/mcp-server-implementasjonsplan.md`
- Endrer: ADR 0001, avsnittet «OAuth discovery og klientregistrering»

## Kontekst

ADR 0001 valgte OAuth Client ID Metadata Documents (CIMD) som eneste
registreringsmekanisme, med et krav om at valget skulle verifiseres mot de
faktiske målklientene før fase 3. Implementasjonsplanen sier i tillegg at
løsningen «ikke skal ha to registreringsmåter uten et konkret
kompatibilitetsbehov».

MCP-spesifikasjon `2025-11-25` er tydelig på prioriteringen, men ikke på
tilgjengeligheten:

- autorisasjonsservere og klienter **SHOULD** støtte CIMD
- de **MAY** støtte RFC 7591 dynamisk klientregistrering, som spesifikasjonen
  beskriver som bakoverkompatibilitet
- klienter som støtter begge, skal prøve CIMD først og falle tilbake til DCR
  dersom serveren annonserer `registration_endpoint`

Verifikasjonen ADR 0001 forutsatte lot seg ikke gjennomføre: den krever en
kjørende server på et offentlig domene og en reell klient. CIMD er den nyeste
av de to mekanismene, og en server som kun tilbyr CIMD vil være utilgjengelig
for enhver klient som ennå ikke har implementert den — uten noen vei rundt for
brukeren.

## Beslutning

Serveren annonserer og implementerer **begge** mekanismene:

- `client_id_metadata_document_supported: true`
- `registration_endpoint: <issuer>/api/oauth/register`

CIMD er fortsatt førstevalget, og prioriteringsrekkefølgen i spesifikasjonen
gjør at en klient som støtter CIMD aldri kommer til å bruke DCR. DCR er en
dokumentert fallback, ikke en likestilt mekanisme.

Fordi registreringsendepunktet er åpent, er det avgrenset på hver akse som
betyr noe:

| Grense                     | Verdi                                              |
| -------------------------- | -------------------------------------------------- |
| Rate limit                 | 5 registreringer per time per IP                   |
| Aktive DCR-klienter totalt | 25                                                 |
| Request-størrelse          | 16 KiB                                             |
| Redirect-URI-er            | maks 5, kun HTTPS eller `http` mot `127.0.0.1`/`[::1]` |
| Klientnavn                 | maks 200 tegn                                      |
| Ubrukt registrering        | utløper etter 30 dager og ryddes bort              |

En DCR-klient-ID er bevisst **ikke** URL-formet (`mcp-dcr-<tilfeldig>`), slik
at den aldri kan forveksles med et CIMD-dokument og hentes over nettverket.
Ingen klienthemmelighet utstedes; alle klienter er offentlige og bruker
`token_endpoint_auth_method=none` med PKCE S256.

En registrering blir permanent først når den faktisk tas i bruk: ved første
godkjente samtykke settes `lastUsedAt`, og utløpsfristen fjernes.

## Konsekvenser

- Enhver MCP-klient som følger spesifikasjonen kan koble til, uavhengig av om
  den har rukket å implementere CIMD.
- Registreringsendepunktet er en ny, åpen flate. Grensene over er en del av
  kontrakten og skal ikke løsnes uten en ny beslutning.
- Kolonnen `McpOAuthClient.expiresAt` har ulik betydning per
  registreringskilde: for `DYNAMIC` er den fristen for å ta registreringen i
  bruk, for `CLIENT_ID_METADATA` er den cache-fristen for det hentede
  metadatadokumentet. Dette er kommentert i `client-registry.ts`.
- Når produksjonsklienten er valgt og verifisert, bør det vurderes å skru av
  `registration_endpoint` igjen. Det krever bare at metadata slutter å
  annonsere endepunktet, og er en ren konfigurasjonsendring i en ny ADR.

## SSRF-hensyn for CIMD

Serveren henter en URL en ukjent klient har oppgitt. Følgende gjelder for den
hentingen:

- kun `https`, med en sti-komponent og standard port
- IP-litteraler og DNS-oppslag kontrolleres mot private, loopback-,
  link-local-, CGNAT- og multicast-områder før forespørselen sendes
- omdirigeringer følges ikke (`redirect: "error"`), fordi et svar kunne pekt
  ut av den godkjente verten
- 5 sekunders timeout og 16 KiB maks svarstørrelse
- `client_id` i dokumentet må være identisk med URL-en det ble hentet fra

Kontrollen skjer før hentingen, så en angriper med svært kort DNS-TTL er ikke
fullstendig utelukket. Den dekker det realistiske tilfellet: en `client_id`
som peker på et internt navn eller en intern adresse.

## Samtykke og scopes

- Samtykkesiden viser klientnavn, verts- og stidelen av redirect-URI-en, og en
  norsk forklaring per scope — ikke bare scope-navnet.
- En klient som kun har loopback-redirect får en eksplisitt advarsel, i tråd
  med spesifikasjonens merknad om at loopback-URL-er kan etterlignes lokalt.
- Avkrysningsboksene er forhåndsvalgt med nøyaktig det klienten ba om. Sender
  klienten ingen `scope`, forhåndsvelges bare lesetilgang.
- Nytt samtykke **erstatter** scope-settet på grantet i stedet for å legge til.
  Det gjør den siste samtykkeskjermen til hele sannheten om hva klienten kan
  gjøre, og lar en fornying aldri gi mer enn brukeren sist godkjente.
- Ved fornying utstedes access token med grantets *gjeldende* scopes, slik at
  et innsnevret samtykke får effekt ved neste refresh.

## Tokenlivsløp

- Access token er en HS256-JWT med `iss`, `sub`, `aud`, `scope`, `client_id`,
  `jti`, `iat` og `exp`. Algoritmen er en konstant i verifikasjonskoden og
  leses aldri fra tokenets header.
- Refresh tokens er opake, lagres kun som HMAC-hash, og roteres ved hver bruk.
  Gjenbruk av et konsumert token tilbakekaller hele familien.
- Autorisasjonskoder konsumeres atomisk. En gjenbrukt kode tilbakekaller
  refresh-tokenene til grantet, i tråd med OAuth 2.1 punkt 7.5.
- Access tokens tilbakekalles ikke enkeltvis. Revokering stopper fornying
  umiddelbart, mens et allerede utstedt access token lever til `exp`. Skal det
  endres, kreves en denylist eller introspeksjon, og det er en egen beslutning.
