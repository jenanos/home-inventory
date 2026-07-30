# Implementasjonsplan: MCP-server for Home Overview

Dato: 2026-07-29. Revidert 2026-07-30 etter kvalitetssikring mot kodebasen;
funnene er innarbeidet i kapitlene under, særlig 3.2, 3.4, 7, 10.2, 10.4 og 14.0.

## 1. Mål og avgrensning

Målet er å gjøre data og arbeidsflyter i Home Overview tilgjengelige for
MCP-klienter på en sikker, forutsigbar og vedlikeholdbar måte. Serveren skal
kjøre i den eksisterende Next.js-applikasjonen og eksponeres på:

```text
https://home.jenanos.xyz/api/mcp
```

Planen dekker:

- MCP-transport og protokollhåndtering
- OAuth-basert autentisering og samtykke
- isolasjon mellom brukere, husstander og private handlelister
- et felles tjenestelag for webgrensesnittet og MCP
- verktøykontrakter for innkjøp, budsjett, vedlikehold og hage
- databasemodeller for persistent OAuth-tilstand
- forarbeidet i eksisterende kode som MCP er avhengig av: kjørbare tester,
  delt budsjettberegning og autorisasjon i oppslaget (se 3.4)
- testing, observabilitet, utrulling og drift
- en oppdeling i leveranser som kan implementeres og gjennomgås hver for seg

Dette er **ikke** et mål for første versjon:

- å eksponere administratorfunksjoner, medlemsadministrasjon eller offentlige
  delingslenker
- å la MCP-klienter erstatte hele datasett
- å hente produktdata, priser eller planteinformasjon fra internett
- å bygge semantisk søk, embeddings eller en vektordatabase
- å støtte flere aktive husstander per bruker uten at resten av appen først
  får et eksplisitt konsept for valg av aktiv husstand
- å lage en separat MCP-container eller et separat domene

## 2. Anbefalt løsning

MCP implementeres som en del av `apps/web`, men domenelogikken skal ikke ligge
direkte i Route Handleren:

```text
MCP-klient
    │ HTTPS + OAuth access token
    ▼
Caddy / home.jenanos.xyz
    │
    ▼
Next.js Route Handlers
    ├── /api/mcp
    ├── /api/oauth/*
    └── /.well-known/*
           │
           ├── OAuth-lag (token, scopes, samtykke og klienter)
           ├── MCP-lag (transport, verktøyregister og presentasjon)
           └── applikasjonstjenester (autorisasjon og domenelogikk)
                         │
                         ▼
                     Prisma/PostgreSQL
```

Det viktige skillet er:

1. **Route Handleren** håndterer HTTP, OAuth bearer-token og MCP-protokollen.
2. **Verktøyadapteren** validerer verktøyinput, sjekker scope og oversetter
   mellom MCP-kontrakter og applikasjonstjenester.
3. **Applikasjonstjenestene** håndhever husstands- og ressursautorisasjon og
   utfører transaksjoner. De kjenner ikke til MCP, cookies eller React.
4. **Server Actions** blir tynne adaptere som henter nettleserkontekst, kaller
   de samme applikasjonstjenestene og revaliderer relevante sider.

Denne inndelingen hindrer at MCP blir en alternativ, mindre sikker vei direkte
til databasen.

## 3. Forutsetninger og beslutninger før implementasjon

### 3.1 Må avklares i en teknisk spike

Før datamodeller og mange verktøy bygges, gjennomføres en liten spike som
avklarer følgende:

1. **SDK og Next.js-adapter.** Velg en vedlikeholdt MCP TypeScript-SDK og
   eventuelt en App Router-adapter som støtter den MCP-protokollversjonen
   klientene faktisk bruker. Lås eksakte versjoner i lockfilen.
2. **Streamable HTTP i Next.js.** Verifiser `initialize`, `tools/list`,
   `tools/call` og `ping` gjennom en Route Handler i Node-runtime.
3. **Stateless eller stateful transport.** Start med stateless Streamable HTTP
   hvis klientkompatibiliteten tillater det. Stateful sesjoner innføres bare
   dersom en støttet klient krever serverutstedte sesjons-ID-er, resumability
   eller serverinitierte meldinger.
4. **Responsmodus.** Verifiser om JSON-responser er tilstrekkelig, og at SSE
   ikke er nødvendig for det første verktøysettet.
5. **OAuth-klientkompatibilitet.** Test discovery, Protected Resource Metadata,
   PKCE, `resource`-parameter og klientregistrering mot minst én reell
   målklient. Ikke anta at alle klienter tolker discovery-lokasjoner likt.
6. **Runtime.** MCP- og OAuth-rutene skal eksplisitt bruke Node-runtime, ikke
   Edge-runtime, fordi Prisma og kryptografien skal være den samme som ellers
   på serveren. Konkret regel, slik at den er sjekkbar i review: hver ny rute
   eksporterer `export const runtime = "nodejs"`. Ingen slik eksport finnes i
   koden i dag — eneste API-rute er `app/api/auth/[...nextauth]/route.ts` — så
   dette er en ny konvensjon, ikke en videreføring.

Spiken kan bruke ett ufarlig verktøy, for eksempel `get-server-info`, og en
midlertidig utviklingstoken som kun er tilgjengelig lokalt. Midlertidig auth
skal aldri kunne aktiveres i et produksjonsbygg.

**Beslutningsport:** Hvis den valgte adapteren ikke håndterer standard
Streamable HTTP korrekt i Next.js, skal teamet sammenligne en liten direkte
JSON-RPC-implementasjon med en annen adapter. En separat tjeneste er siste
utvei, ikke automatisk neste steg.

### 3.2 Produktforutsetninger

- Før MCP aktiveres, skal databasen håndheve maksimalt ett aktivt
  husstandsmedlemskap per bruker. `HouseholdMember` har i dag sammensatt
  primærnøkkel `@@id([userId, householdId])` og ingen egen `id`-kolonne, så en
  unik constraint på `userId` alene er mulig — men den gjør modellen de facto
  1:1 med `User`, som er en produktbeslutning og bør kommenteres i schemaet.
  Migrasjonen skal først finne og stoppe på eksisterende duplikater. Siden
  Prisma-migrasjoner er ren SQL, må dette skrives som en eksplisitt guard
  (`DO $$ ... RAISE EXCEPTION ... $$`) før `CREATE UNIQUE INDEX`; ellers blir
  migrasjonen enten uten guard eller manuell. Deretter skal invitasjonsflyten
  avvise medlemskap i en ny husstand. Hvis produktet senere skal støtte flere
  husstander, må det i stedet innføres et eksplisitt, servervalidert valg av
  aktiv husstand før MCP kan bruke denne modellen.
- **Sletting av bruker må avklares før fase 4.** Migrasjonen
  `20260427141000_add_private_shopping_lists` legger på en check-constraint som
  Prisma ikke modellerer, og som derfor er usynlig i `schema.prisma`:

  ```sql
  CHECK (NOT "isPrivate" OR "createdById" IS NOT NULL)
  ```

  Fremmednøkkelen er `ON DELETE SET NULL`, men constrainten blokkerer den
  nullingen for private lister. Konsekvensen er at `deleteUser`
  (`apps/web/lib/actions/admin.ts:56`, et bart `db.user.delete`) **feiler i dag**
  for enhver bruker som har opprettet minst én privat liste. En eierløs privat
  liste er dermed en uoppnåelig tilstand — invarianten er god — men
  brukersletting er blokkert. Produktbeslutningen som mangler: ved sletting av en
  bruker skal deres private lister (a) slettes, (b) overføres til et annet
  husstandsmedlem, eller (c) gjøres offentlige. Valget må tas, `deleteUser` må
  håndtere det i samme transaksjon, og schemaet bør få en kommentar om
  constrainten. Dette er uavhengig av MCP-arbeidet, men blokkerer
  negativtesten i 14.2 om at slettet bruker mister tilgang.
- Språket i verktøynavn og feltnavn er engelsk. Beskrivelser, feilmeldinger og
  brukerrettet samtykke kan være norsk.
- Beløp bruker NOK som standard, siden datamodellen ikke har valutafelt. MCP
  skal ikke late som om flere valutaer støttes.
- Datoer sendes som ISO 8601. Kalenderdatoer som forfallsdato bør være
  `YYYY-MM-DD`; tidspunkter skal være UTC med `Z`. Merk at `dueDate` på
  `ShoppingItem`, `MaintenanceTask` og `TaskProgressEntry` alle er `DateTime`,
  ikke `date`. Eksisterende kode gjør `new Date("YYYY-MM-DD")`, som gir midnatt
  **UTC**, og leser tilbake med `formatDateToIsoDate`. Med Europe/Oslo (UTC+1/+2)
  kan en dato ellers skifte dag mellom skriving og visning, så
  konverteringsregelen skal fastsettes eksplisitt, og `formatDateToIsoDate` er
  normativ leseside.
- Desimaltall serialiseres uten Prisma-spesifikke typer. **Lagrede** pengebeløp
  returneres som desimalstrenger direkte fra `Decimal`, for å unngå binær
  avrunding. For **beregnede** aggregater gjelder ikke dette uten videre: all
  aggregering skjer i JS-`number` i dag (`toNumber(...)` i
  `app/(app)/budsjett/page.tsx` og `Number(value)` i `lib/dashboard-stats.ts`),
  altså forlater `Decimal` domenet før noe summeres. Kravet om desimalstrenger og
  kravet i 10.2 om «samme avrunding som UI-et» kan derfor ikke oppfylles
  samtidig uten en beslutning. Velg én: dokumenter aggregatene som
  float-derivert med definert avrunding, eller flytt beregningen til `Decimal`
  som en egen, større oppgave. Uten valget vil MCP og UI vise ulike tall i
  randtilfeller.

### 3.3 Driftsforutsetninger

Før produksjonsaktivering må følgende finnes:

- `HOME_OVERVIEW_MCP_OAUTH_SIGNING_SECRET`, generert uavhengig av Auth.js-
  secreten
- en eksplisitt issuer, normalt `https://home.jenanos.xyz`, uten avsluttende
  skråstrek
- dokumenterte levetider for access token og refresh token
- HTTPS hele veien fra klient til Caddy
- sikkerhetskopi av PostgreSQL som inkluderer de nye OAuth-tabellene
- en bekreftet måte å gjenskape containeren med nye miljøvariabler
- klokkesynkronisering på verten; tokenvalidering er avhengig av korrekt tid

Mangler MCP-konfigurasjon, skal de nye rutene svare kontrollert med `503`, mens
resten av Home Overview starter og fungerer normalt.

Det finnes ingen konfigurasjonsmodul i dag: hele kodebasen har tre
`process.env`-oppslag (`ADMIN_EMAIL`, `EMAIL_FROM`, `RESEND_API_KEY`), uten
validering. Konfigurasjonen får derfor en egen modul, for eksempel
`apps/web/lib/mcp/config.ts`, som valideres én gang ved oppstart og ikke per
forespørsel. `503`-oppførselen leses fra den samme modulen.

### 3.4 Utgangspunktet i dagens kodebase

Følgende er verifisert mot koden og påvirker flere av fasene. Det står samlet her
fordi flere punkter ellers ville blitt oppdaget først under implementasjon.

- **Testoppsettet finnes, men kjøres ikke automatisk.** Vitest 4.1.5 er
  konfigurert i `apps/web` med `"test": "vitest run"`, og det finnes fire
  testfiler: `middleware.test.ts`, `lib/dashboard-stats.test.ts`,
  `lib/shopping-list-access.test.ts`, `lib/shopping-list-pricing.test.ts`. Men
  `turbo.json` har ingen `test`-task, rot-`package.json` ingen `test`-script, og
  `.github/workflows/build-push.yml` kjører bare docker build — ingen lint, ingen
  typecheck, ingen tester. Uten at dette rettes i fase 0 er «grønne tester» i
  akseptansekriteriene ikke håndhevbart. `CLAUDE.md` sier feilaktig at det ikke
  finnes noe testrammeverk, og rettes samtidig.
- **Det finnes ingen testdatabase.** `docker-compose.yml` har bare
  dev-databasen (postgres:16 på port 5435), og `packages/db` har ikke noe
  test-script. Se 14.2 for hva integrasjonstestene trenger.
- **Autorisasjon skjer som check-then-act.** Mønsteret
  `findUnique({ where: { id } })` → separat eierskapssjekk →
  `update({ where: { id } })` finnes i minst 13 funksjoner (`budget.ts` 6,
  `shopping-list.ts` 3, `plant.ts` 2, `admin.ts` 1, `share-link.ts` 1) av totalt
  66 eksporterte server actions fordelt på 11 filer. Se kapittel 7; omfanget
  fordeler seg over fasene 1, 5, 6 og 7.
- **Husstanden slås opp med uordnet `findFirst` også i webflyten.**
  `getUserHousehold()` (`apps/web/lib/session.ts:15`) gjør nettopp det kapittel 7
  forbyr for MCP, og `requireHousehold()` kaller i tillegg `redirect()` fra
  `next/navigation`. Begge må endres i fase 1, ellers får web og MCP forskjellig
  regel for samme tilstand.
- **Budsjettberegningen er ikke delt, og finnes i to divergerende utgaver.**
  Se 10.2.
- **Duplikat-import-flyter finnes allerede** for innkjøp, vedlikehold og
  budsjett. Se 10.4 — de er utgangspunkt for verktøykontraktene, ikke noe som
  skal vurderes til slutt.
- **Ingen rate limiting og ingen `Cache-Control`-headere finnes.** Søk etter
  `rateLimit` og `Cache-Control` i `apps/web` gir null treff. Kapittel 11 punkt
  12–13 er derfor ny infrastruktur, ikke tilpasning av noe eksisterende.
- **Auth.js er en pinnet beta.** `next-auth 5.0.0-beta.30`, med `@auth/core`
  pinnet til `0.41.1` i `pnpm.overrides` og en TODO i `lib/auth.ts` om
  oppgradering til stabil v5. Samtykkeflyten i 5.1 er avhengig av `auth()`, så en
  senere oppgradering er en reell risiko for OAuth-flyten og bør dekkes av
  fase 3-testene.
- **Produksjonsoppsettet ligger utenfor dette repoet.** `docker-compose.yml` her
  er bare dev-databasen; Caddy- og prod-compose-konfigurasjon finnes et annet
  sted. Kapittel 16 og 17 kan derfor ikke etterprøves i denne kodebasen, og må
  verifiseres mot den faktiske serverkonfigurasjonen.

## 4. Protokoll- og HTTP-flate

### 4.1 MCP-endepunkt

`POST /api/mcp` er hovedendepunktet. Det skal:

- kreve `Authorization: Bearer <token>`
- validere tokenets signatur, issuer, audience/resource, utløpstid og scopes
- utlede brukeridentiteten utelukkende fra tokenets `sub`
- støtte MCP-metodene som SDK-en krever, minst `initialize`, `ping`,
  `tools/list` og `tools/call`
- returnere JSON-RPC-feil for protokollfeil og verktøyresultat med `isError`
  for forventede domenefeil
- sette `Cache-Control: no-store`
- begrense request-størrelse og avvise ukjente content types

Uautentiserte forespørsler skal returnere `401` med en korrekt
`WWW-Authenticate`-header som peker til Protected Resource Metadata. Token med
for svakt scope skal gi `403` og angi nødvendig scope uten å lekke data.

Hvis valgt transport bruker `GET` eller `DELETE` for sesjon eller SSE, skal
disse metodene implementeres i samme route og ha identisk autentisering.
Metoder som ikke støttes, skal avvises eksplisitt.

### 4.2 Discovery og OAuth-ruter

Den endelige listen skal følge MCP Authorization-spesifikasjonen og de
tilhørende OAuth-RFC-ene som SDK-versjonen støtter. Forventet flate er:

| Rute                                            | Formål                                                            |
| ----------------------------------------------- | ----------------------------------------------------------------- |
| `/.well-known/oauth-protected-resource`         | Metadata om `/api/mcp` og støttede scopes                         |
| `/.well-known/oauth-protected-resource/api/mcp` | Ressursspesifikk metadata dersom målklientene forventer RFC-stien |
| `/.well-known/oauth-authorization-server`       | Metadata for autorisasjonsserveren                                |
| `POST /api/oauth/register`                      | Dynamisk klientregistrering når det kreves av målklientene        |
| `GET /api/oauth/authorize`                      | Validering, innlogging og samtykke                                |
| `POST /api/oauth/authorize/decision`            | Godkjenn eller avvis engangsforespørsel                           |
| `POST /api/oauth/token`                         | Kodeutveksling og refresh-token-rotasjon                          |
| `POST /api/oauth/revoke`                        | Revokering av refresh token eller klienttilgang                   |

Discovery skal annonsere nøyaktig de funksjonene som er implementert. Det skal
ikke annonseres implicit flow, client credentials, `plain` PKCE eller scopes
som ikke håndheves.

`resource` skal være den kanoniske MCP-URL-en. Autorisasjonskode, access token
og refresh token bindes til denne ressursen slik at tokenet ikke kan brukes
som bearer-token for en annen tjeneste.

### 4.3 Middleware

Dagens middleware sender alle ikke-offentlige forespørsler uten Auth.js-cookie
til `/login`. MCP-klienter bruker bearer-token og har ingen slik cookie.
Følgende stier må derfor klassifiseres som offentlige på middleware-nivå:

- `/api/mcp`
- `/api/oauth/`
- `/.well-known`

Dagens `isPublicPathname` matcher med `startsWith`, så prefikset skrives med
avsluttende skråstrek (`/api/oauth/`) eller med eksakt matching — ellers slipper
også en sti som `/api/oauthfoo` gjennom. `matcher`-konfigurasjonen ekskluderer i
dag bare `_next/static`, `_next/image` og `favicon.ico`, så både `/api/mcp` og
`/.well-known` går faktisk gjennom middleware; tilføyelsen er nødvendig.

«Offentlig» betyr her bare at middleware slipper forespørselen frem. Hver rute
skal fortsatt utføre sin egen fullstendige autentisering. Det må finnes tester
som hindrer en senere middleware-endring i å gjøre discovery eller tokenflyten
utilgjengelig; de hører i eksisterende `apps/web/middleware.test.ts`, som allerede
dekker `isPublicPathname`.

## 5. Autentisering, samtykke og tokenlivsløp

### 5.1 Autorisasjonsflyt

1. Klienten oppdager Protected Resource Metadata fra en `401`-respons eller
   well-known-ruten.
2. Klienten finner autorisasjonsserveren og registrerer seg dersom nødvendig.
3. Klienten starter authorization code flow med PKCE S256, `state`, eksakt
   redirect-URI, ønskede scopes og korrekt `resource`.
4. Autorisasjonsruten bruker `auth()` til å identifisere brukeren. Uinnlogget
   bruker sendes til `/login` med en sikkert validert callback-URL på samme
   origin.
5. En innlogget bruker ser klientnavn, forespurte rettigheter og hvilken type
   data som blir tilgjengelig. Godkjenning skjer via en CSRF-beskyttet,
   kortlevd engangsforespørsel.
6. Serveren utsteder en kortlevd autorisasjonskode. Bare en hash lagres.
7. Tokenendepunktet konsumerer koden atomisk, validerer PKCE og utsteder et
   kortlevd access token og et roterende refresh token.
8. Ved refresh konsumeres gammelt refresh token atomisk. Gjenbruk av et
   tidligere token skal kunne oppdages og bør tilbakekalle hele tokenfamilien.
9. Revokering eller fjerning under «Tilkoblede apper» stopper videre refresh.

### 5.2 Scopes

Scopes bør være domenespesifikke slik at en klient ikke trenger budsjettinnsyn
for å administrere en handleliste:

| Scope               | Tilgang                                                 |
| ------------------- | ------------------------------------------------------- |
| `shopping:read`     | Lister, synlige elementer, kategorier og alternativer   |
| `shopping:write`    | Opprette og endre innkjøpsdata                          |
| `budget:read`       | Budsjett, inntekter, kostnader, lån og beregnede summer |
| `budget:write`      | Opprette, endre og slette budsjettdata                  |
| `maintenance:read`  | Vedlikeholdsoppgaver, leverandører og fremdrift         |
| `maintenance:write` | Endre vedlikeholdsdata                                  |
| `garden:read`       | Planter og stellinformasjon                             |
| `garden:write`      | Opprette og endre planter                               |

Regler:

- Et `*:write`-scope skal også kunne lese samme domene, eller serveren skal
  konsekvent kreve både read og write. Velg én regel og test den.
- Standard samtykke bør være minste nødvendige tilgang, ikke automatisk alle
  scopes.
- Klienten kan aldri få flere scopes ved refresh enn opprinnelig godkjent.
- `tools/list` bør filtrere bort verktøy klienten ikke har scope til. I tillegg
  må `tools/call` alltid håndheve scope; filtrering alene er ikke sikkerhet.
- Nye scopes skal kreve nytt samtykke.

### 5.3 Access token

Access token kan være en signert JWT fordi autorisasjonsserver og ressursserver
kjører i samme applikasjon. Krav til claims:

- `iss`: konfigurert public issuer
- `sub`: intern bruker-ID
- `aud`: den kanoniske MCP-resource-URL-en
- `scope`: faktisk godkjente scopes
- `client_id`: klienten tokenet er utstedt til
- `iat`, `exp` og unik `jti`

Anbefalt levetid er 15–60 minutter. Klokkeskjevhet skal være liten og
eksplisitt. Algoritmen skal låses i verifikasjonskoden; den skal aldri velges
fra en uklarert tokenheader.

Refresh tokens skal være kryptografisk tilfeldige, opake og bare lagres som
hash. De bør leve i maksimalt 30 dager og ha både absolutt utløp og informasjon
om siste bruk.

### 5.4 Klientregistrering og redirect-URI-er

Hvis åpen dynamisk klientregistrering beholdes, må den ha:

- eksakt validering av redirect-URI, med HTTPS som hovedregel
- et snevert produksjonsunntak for native klienters loopback-redirect etter
  RFC 8252: `http` tillates bare med IP-literalene `127.0.0.1` eller `[::1]`;
  skjema, IP, sti og query må matche registrert URI eksakt, mens porten i
  authorize-forespørselen kan være en vilkårlig tilgjengelig port. `localhost`,
  andre private IP-adresser og HTTP-redirects utenfor loopback skal avvises
- grenser på antall URI-er, total request-størrelse og tekstlengder
- rate limiting per IP og en samlet grense på aktive klienter
- ingen fjerning av gamle klienter kun basert på LRU dersom det også gjør
  gyldige refresh tokens umulige å administrere
- HTML-escaping av klientnavn og URI på samtykkesiden
- en oppryddingsjobb for utløpte, aldri brukte registreringer

Klient-ID-metadata-dokumenter kan være et bedre alternativ for enkelte
moderne klienter. Dette avgjøres i spiken basert på gjeldende MCP-spesifikasjon
og faktisk klientstøtte. Implementasjonen skal ikke ha to registreringsmåter
uten et konkret kompatibilitetsbehov.

## 6. Datamodell for OAuth

De eksakte navnene kan tilpasses Prisma-konvensjonene, men følgende konsepter
må persisteres:

### `McpOAuthClient`

- `id` / `clientId`
- navn og registrerte redirect-URI-er
- tillatte grant- og response-typer
- opprettet, sist brukt og eventuelt utløper
- registreringskilde og status/revokeringstidspunkt

### `McpOAuthAuthorizationRequest`

- hash av engangstoken for samtykkesiden
- klient, redirect-URI, PKCE challenge og metode
- forespurte scopes, resource, state og utløp
- bruker-ID etter at innlogget sesjon er kontrollert
- konsumert/godkjent/avvist tidspunkt

### `McpOAuthAuthorizationCode`

- hash av kode
- klient, bruker, redirect-URI, scopes og resource
- PKCE challenge
- kort utløp og `consumedAt`

### `McpOAuthGrant`

- bruker + klient
- godkjente scopes
- opprettet, sist brukt og revokert
- unik begrensning som gjør aktiv grant entydig

### `McpOAuthRefreshToken`

- hash av token, grant og tokenfamilie
- opprettet, utløper, konsumert og revokert
- referanse til erstattende token for rotasjon/reuse-deteksjon

Indekser må dekke hashuppslag, utløpsopprydding, brukerens aktive grants og
klientens aktive tokens. Alle relasjoner **fra disse nye tabellene** til `User`
skal slettes eller revokeres ved sletting av brukeren. Kravet gjelder ikke
eksisterende app-relasjoner: `ShoppingList.createdBy` er bevisst `SetNull`, og
brukersletting har sin egen uavklarte sak (se 3.2). Autorisasjonskodekonsum og
refresh-rotasjon skal utføres i transaksjoner som tåler to samtidige
forespørsler.

Ikke lagre access tokens. Authorization codes, refresh tokens,
samtykke-engangstokens og eventuelle client secrets skal aldri lagres i
klartekst. En migrasjon må kunne rulles ut uten å påvirke eksisterende
applikasjonsdata.

## 7. Applikasjonskontekst og autorisasjon

Alle applikasjonstjenester skal motta en serverkonstruert kontekst, for
eksempel:

```ts
type ApplicationContext = {
  userId: string
  householdId: string
}
```

Konteksten bygges slik for MCP:

1. valider access token
2. slå opp at `sub` fortsatt er en aktiv bruker
3. slå opp brukerens medlemskap ved hver forespørsel, eller bruk en svært
   kortlevd kontrollert cache
4. krev nøyaktig ett medlemskap og bruk dets `householdId`; null eller flere
   medlemskap skal feile lukket og aldri avgjøres med et uordnet `findFirst`
5. aldri aksepter `householdId` fra verktøyinput

Kontekstoppslaget skal være en **egen, minimal spørring** som bare henter
`userId`, `householdId` og eventuelt `role`. Det er ikke nok å gjenbruke
`getUserHousehold()`: den gjør i dag
`include: { household: { include: { members: { include: { user: true } } } } }`,
altså hele `User`-raden for alle husstandsmedlemmer — inkludert `email`,
`isAdmin` og `image`. Gjenbruk av den spørringen legger persondata i objektgrafen
før noe verktøy har bestemt seg for å utelate dem.

Merk også at `getUserHousehold()` bruker `findFirst` uten sortering, altså
nøyaktig mønsteret punkt 4 forbyr, og at `requireHousehold()` kaller `redirect()`.
Begge endres i fase 1 slik at webflyten og MCP håndhever samme regel.

Dette gjør at fjerning fra en husstand får effekt selv om et access token
fortsatt er gyldig. Manglende medlemskap skal gi en autorisasjonsfeil, ikke
automatisk onboarding eller redirect.

For hver ID-basert operasjon skal tjenestelaget hente eller mutere med både
ressurs-ID og riktig eiergrense. En `update({ where: { id } })` etterfulgt av
en separat eierskapssjekk er ikke godt nok; autorisasjonen må være del av
oppslaget/transaksjonen.

Dette er ikke en teoretisk innvending: mønsteret finnes i minst 13 eksisterende
funksjoner (se 3.4), for eksempel `upsertBudgetMember`
(`lib/actions/budget.ts:237`), som slår opp med `findUnique({ where: { id } })`,
sammenligner `budgetId`, og deretter oppdaterer på `id` alene. Konverteringen
fordeler seg over fasene 1, 5, 6 og 7, og er en større del av dem enn
oppgavelistene alene antyder.

Barneressurser skal avgrenses via forelderen:

- handleelement → synlig handleliste → husstand og bruker
- produktalternativ → handleelement → synlig handleliste
- leverandør/fremdrift → vedlikeholdsoppgave → husstand
- budsjettpost/lån/reise/medlem → budsjett → husstand
- plante → husstand

Private handlelister er synlige bare for oppretteren. Dette gjelder også
søk, tellinger, dashboardlignende oppsummeringer og feilmeldinger. En bruker
uten tilgang bør normalt få samme «ikke funnet»-respons som for en ukjent ID.
Regelen finnes allerede som `getVisibleShoppingListsWhere` og
`isShoppingListAccessible` i `apps/web/lib/shopping-list-access.ts`, med tester —
tjenestelaget skal bruke disse, ikke reimplementere filteret.

En privat liste kan ikke være eierløs; check-constrainten beskrevet i 3.2 gjør
den tilstanden uoppnåelig. Verktøyene trenger derfor ingen særregel for
`createdById = null` på private lister, men brukersletting må avklares før
fase 4.

## 8. Felles tjenestelag

### 8.1 Foreslått struktur

En mulig struktur er:

```text
apps/web/lib/application/
├── context.ts
├── errors.ts
├── serialization.ts
├── shopping/
├── budget/
├── maintenance/
└── garden/

apps/web/lib/mcp/
├── auth/
├── server.ts
├── registry.ts
├── result.ts
└── tools/
```

Det er viktigere å holde avhengighetsretningen ren enn å følge akkurat disse
mappenavnene. `application` skal ikke importere fra `next/headers`,
`next/cache`, `next/navigation`, MCP-SDK-en eller React. `next/navigation` er
med i listen fordi `requireHousehold()` i dag kaller `redirect()`: en
`NEXT_REDIRECT`-throw fra tjenestelaget vil boble ut gjennom MCP-ruten som en
uforståelig feil i stedet for en autorisasjonsfeil.

### 8.2 Gradvis refaktorering

Ikke flytt alle Server Actions i én stor endring. For hvert domene:

1. skriv karakteriseringstester for eksisterende regler
2. trekk ut inputtype og applikasjonstjeneste
3. la eksisterende action hente `requireHousehold()` og kalle tjenesten
4. behold `revalidatePath()` kun i action-adapteren
5. legg til MCP-adapter etter at webflyten fortsatt virker

Tjenestelaget bør eie:

- validering av domeneregler og enumverdier
- tilgangskontroll
- transaksjonsgrenser
- duplikat- og entydighetsregler
- beregninger og normalisering
- stabile, typede feil

Adapterne bør eie:

- parsing av MCP-/forminput
- cookie- eller tokenkontekst
- scopekontroll
- presentasjon av resultat og feilmeldinger
- Next.js-revalidering

## 9. Prinsipper for verktøydesign

### 9.1 Generelle kontrakter

- Verktøynavn bruker `verb-noun`, for eksempel `list-shopping-lists`.
- Input og output har eksplisitte JSON Schema/Zod-skjemaer. Ingen `any`.
- Hvert verktøy har en kort beskrivelse av når det skal og ikke skal brukes.
- Verktøy annoteres med korrekte `readOnlyHint`, `destructiveHint`,
  `idempotentHint` og `openWorldHint` der SDK-en støtter dem.
- Skriveverktøy returnerer den oppdaterte ressursen og en kort menneskelesbar
  oppsummering, ikke bare `{ ok: true }`.
- Resultater bruker både maskinlesbart `structuredContent` og kort tekstlig
  `content`, med samsvar mellom de to.
- Hemmelige eller interne felt, Prisma-objekter og stack traces returneres
  aldri. Brukerfelt skal i tillegg være **hvitelistet per verktøy**, ikke bare
  filtrert for hemmeligheter: `ShoppingItem.assignedTo` og `BudgetMember.name`
  er persondata, og kontekstspørringen i kapittel 7 er allerede en kjent kilde
  til utilsiktet `User`-eksponering.
- Oppdateringsverktøy skiller mellom «felt ikke oppgitt» og «sett felt til
  null».
- Resultatlister har stabil sortering og paginering med en konservativ
  standardgrense og maksimalgrense.
- Fritekstsøk skal ha lengdegrenser og definerte felt det søker i.
- Bulkverktøy skal ha lav maksgrense, transaksjonell semantikk og resultat per
  element dersom delvis suksess tillates. Grensen skal ligge i **tjenestelaget**,
  ikke bare i MCP-adapteren: `bulkCreateShoppingItems`,
  `bulkImportMaintenanceTasks` og `bulkImportBudget` mapper i dag input rett inn i
  `db.$transaction(...)` uten lengdesjekk, og ligger grensen bare i adapteren
  gjelder den ikke for webflyten — da får de to lagene ulik kontrakt for samme
  operasjon.
- Enumverdier valideres eksplisitt og avvises ved ukjent verdi. Merk at
  eksisterende `bulkImportMaintenanceTasks` faller stille tilbake til `MEDIUM`
  ved ukjent `priority`; den oppførselen skal ikke videreføres i tjenestelaget
  uten at det er et bevisst valg.

### 9.2 Idempotens og samtidighet

Verktøy skal uttrykke ønsket sluttilstand:

- `set-shopping-item-status(status: "PURCHASED")`, ikke «toggle purchased»
- `set-selected-vendor(vendorId | null)`, ikke «toggle selected»
- `set-progress-entry-completed(completed: true)`, ikke «toggle completed»

Det første punktet er konkret: `toggleItemPurchased`
(`lib/actions/shopping-item.ts:515`) finnes i dag og er nøyaktig den
ikke-idempotente formen som ikke skal eksponeres. Den kan beholdes som action for
webflyten, men tjenestelaget skal tilby sluttilstandsvarianten.

For risikable mutasjoner bør klienten kunne sende ressursens `updatedAt` som
`expectedUpdatedAt`. Serveren avviser da et gammelt kall i stedet for å
overskrive en nyere endring. For `create`- og bulkoperasjoner bør en valgfri
idempotency key vurderes dersom målklientene faktisk retryer kall etter timeout.

### 9.3 Sletting og bekreftelse

Første produksjonsversjon kan utelate alle delete-verktøy. Når de innføres:

- merk dem destruktive
- returner tydelig hvilken ressurs som ble slettet
- krev en eksplisitt bekreftelsesverdi for operasjoner med stor konsekvens
- aldri tilby «slett/erstatt alt» som MCP-verktøy
- vurder forhåndsvisningsverktøy for sammensatte endringer

En tekstparameter som bare sier `confirm: true` er ikke sterk sikkerhet alene.
Den viktigste beskyttelsen er små, presise verktøy, korrekt scope,
klientsamtykke og støtte for klientens egen bekreftelsesdialog.

### 9.4 Feilmodell

Definer stabile feilkoder, for eksempel:

- `NOT_FOUND`
- `VALIDATION_ERROR`
- `CONFLICT`
- `FORBIDDEN`
- `SCOPE_REQUIRED`
- `RATE_LIMITED`
- `INTERNAL_ERROR`

Forventede feil skal gi en handlingsrettet, men ikke sensitiv melding. En
databasefeil logges med korrelasjons-ID og presenteres som en generell feil.
Ukjent ressurs og utilgjengelig privat ressurs skal ikke kunne skilles.

## 10. Foreslått verktøyflate

Verktøyene innføres i nivåer. Listen er målbildet, ikke én enkelt leveranse.

### 10.1 Nivå 0: diagnose

| Verktøy           | Scope            | Merknad                                                                  |
| ----------------- | ---------------- | ------------------------------------------------------------------------ |
| `get-server-info` | autorisert token | Protokoll-/serverversjon, tilgjengelige domener og tid; ingen persondata |

Verktøyet beholdes bare dersom det gir driftsverdi utover `initialize`.

### 10.2 Nivå 1: lesing

#### Innkjøp

| Verktøy                    | Input                             | Resultat                                               |
| -------------------------- | --------------------------------- | ------------------------------------------------------ |
| `list-shopping-lists`      | paginering, valgfritt navn        | Kun lister brukeren kan se, med summer per status      |
| `get-shopping-list`        | `listId`, item-filter, paginering | Liste, elementer, kategorier og eventuelt alternativer |
| `list-shopping-categories` | valgfritt navn                    | Husstandens kategorier                                 |

`get-shopping-list` bør kunne utelate alternativer som standard for å holde
responsen liten. Detaljer kan hentes med et eget `get-shopping-item` hvis
responsstørrelsen viser seg å være et problem.

#### Budsjett

| Verktøy              | Input                   | Resultat                                                          |
| -------------------- | ----------------------- | ----------------------------------------------------------------- |
| `get-budget-summary` | ingen                   | Nettoinntekt, utgifter, fradrag, lånekostnad og disponibelt beløp |
| `get-budget-details` | seksjoner og paginering | Medlemmer, lån, reiser, kategorier og poster                      |

Oppsummeringen skal bruke samme beregningsfunksjoner og avrunding som UI-et.
Detaljer og oppsummering splittes for å unngå at hele budsjettet sendes for
ethvert spørsmål.

**Det finnes ingen slik delt funksjon i dag, og dette er planens største tekniske
usikkerhet.** Beregningen finnes i to uavhengige utgaver:

1. `apps/web/app/(app)/budsjett/budget-view.tsx` er `"use client"` og beregner
   nettoinntekt, lånerente/-avdrag/-gebyr, reisekostnader, rentefradrag og
   disponibelt beløp i en `useMemo` (ca. linje 161–230).
2. `apps/web/lib/dashboard-stats.ts:93` `calculateBudgetStats()` beregner et
   annet sett — `totalGrossIncome`, `totalNetIncome`, `totalLoanPayments`,
   `totalExpenses`, `totalDeductions` — **uten reiser, uten rentefradrag**, og
   uten disponibelt beløp.

Bare `calculateLoanMonthlyAmounts` (`apps/web/lib/budget-loan.ts`) er faktisk
delt. Feltene listet over matcher dermed ingen eksisterende funksjon fullstendig,
og «sentraliser budsjettberegninger» i fase 1 er ikke en flytting, men en
sammenslåing av to formler pluss et uttrekk fra en klientkomponent.

Rekkefølgen må være: (a) beslutt hvilken formel som er normativ, (b) skriv en
karakteriseringstest som låser dagens tall fra `budget-view.tsx`, (c) flytt
beregningen til en ren modul under `application/budget`, (d) la både
`budget-view.tsx`, `dashboard-stats.ts` og MCP bruke den. Uten (b) oppdages
avviket først når MCP og UI viser ulike beløp.

`Budget` er dessuten valgfri per husstand (`Household.budget` er `Budget?`), og
`ensureBudget()` (`lib/actions/budget.ts:203`) oppretter raden når webflyten
trenger den. Kontrakten må derfor fastsettes eksplisitt: for en husstand uten
budsjett returnerer `get-budget-summary` et tomt, veldefinert svar med et
`hasBudget: false`-lignende felt — ikke `NOT_FOUND`, siden husstanden finnes — og
skriveverktøyene i nivå 2 får opprette budsjettraden implisitt via samme
`ensureBudget`-semantikk. Alternativet (krev at budsjettet opprettes i webappen
først) er også akseptabelt, men valget skal stå her og ikke tas under
implementasjon.

#### Vedlikehold

| Verktøy                  | Input                                | Resultat                              |
| ------------------------ | ------------------------------------ | ------------------------------------- |
| `list-maintenance-tasks` | status, prioritet, frist, paginering | Kompakt oppgaveliste                  |
| `get-maintenance-task`   | `taskId`                             | Oppgave med leverandører og fremdrift |

#### Hage

| Verktøy       | Input                                        | Resultat                    |
| ------------- | -------------------------------------------- | --------------------------- |
| `list-plants` | type, plassering, vann-/solbehov, paginering | Kompakte planteopplysninger |
| `get-plant`   | `plantId`                                    | Fullt plantekort            |

### 10.3 Nivå 2: trygge og idempotente mutasjoner

| Domene      | Verktøy                                                                                                                                                                                             |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Innkjøp     | `create-shopping-list`, `add-shopping-item`, `update-shopping-item`, `set-shopping-item-status`, `add-product-alternative`, `update-product-alternative`, `set-preferred-alternative`               |
| Budsjett    | `upsert-budget-entry`, `upsert-budget-member`, `upsert-budget-loan`, `upsert-budget-trip`, `upsert-budget-category`, `set-tax-deduction-percent`                                                    |
| Vedlikehold | `create-maintenance-task`, `update-maintenance-task`, `add-task-vendor`, `update-task-vendor`, `set-selected-vendor`, `add-progress-entry`, `update-progress-entry`, `set-progress-entry-completed` |
| Hage        | `create-plant`, `update-plant`                                                                                                                                                                      |

Det bør vurderes om `upsert-*` er tydelig nok. Hvis utelatt ID kan opprette
duplikater, er separate `create-*` og `update-*` tryggere for en modell.

### 10.4 Nivå 3: sammensatte og destruktive operasjoner

Aktuelle sammensatte verktøy etter at enkelverktøyene er observert i bruk:

- `add-shopping-items` med duplikatforhåndsvisning og begrenset batch
- `preview-budget-changes` som beregner effekt uten å lagre
- `apply-budget-changes` bundet til en kortlevd preview-ID eller
  revisjonsverdi

**`add-shopping-items` er ikke et nytt mønster.** Duplikat-import med
forhåndsvisning kjører allerede i produksjon for alle tre domener, som de manuelle
LLM-importflytene:

- innkjøp: `bulkCreateShoppingItems` (`lib/actions/shopping-item.ts:188`),
  `findExistingShoppingItems` (`:334`),
  `bulkImportShoppingItemsWithDuplicates` (`:398`), med forhåndsvisningen koblet
  opp i `app/(app)/lists/[id]/llm-import-page-client.tsx`
- vedlikehold: `bulkImportMaintenanceTasks`, `findExistingMaintenanceTasks`
  (duplikatdeteksjon på lowercased tittel), `applyTaskUpdates`,
  `bulkImportMaintenanceTasksWithDuplicates` i `lib/actions/maintenance-task.ts`
- budsjett: `bulkImportBudget`, `bulkImportBudgetWithDuplicates`,
  `findExistingBudgetItems` i `lib/actions/budget.ts`

**Innkjøpsflyten er det primære uttrekksmålet** for dette verktøyet, ikke
budsjett- eller vedlikeholdsvarianten: den har allerede den listespesifikke
autorisasjonen (privatliste-regelen via `getVisibleShoppingListsWhere`) og
oppdateringssemantikken som de to andre domenene mangler. Å modellere verktøyet
etter en av de andre variantene risikerer å duplisere oppførsel og miste
privatliste-sjekken. Det som faktisk mangler i den eksisterende flyten er
batch-grensen (se 9.1).

Sletting av enkeltelementer kan innføres ett domene av gangen. Følgende skal
fortsatt ikke eksponeres:

- sletting av bruker, husstand eller medlem
- oppretting/deaktivering av offentlig delingslenke
- administratoroperasjoner
- full `replace` av lister, budsjett, vedlikeholdsoppgaver eller planter
- endring av egen adminstatus eller OAuth-konfigurasjon

To eksisterende funksjoner treffer forbudet mot full `replace` direkte:
`replaceShoppingItems` (`lib/actions/shopping-item.ts:251`) og `replaceBudget`
(`lib/actions/budget.ts:711`). Fase 5 og 6 trekker write-services ut av nettopp
disse to filene, så forbudet må håndheves strukturelt: begge beholdes som rene
server actions og flyttes **ikke** til `application/`, alternativt eksponeres
tjenestefunksjonen de bygger på aldri i verktøyregisteret. Ellers hviler forbudet
bare på at ingen registrerer dem ved en feil.

## 11. Sikkerhetstiltak

Følgende er krav, ikke senere forbedringsforslag:

1. PKCE med S256 og eksakt redirect-URI-match, bortsett fra det dokumenterte
   portunntaket for native klienters loopback-IP.
2. `state` round-trippes uendret, mens samtykkeskontekst lagres server-side.
3. Kortlevde og atomisk konsumerte autorisasjonskoder.
4. Rotasjon, hashing og reuse-deteksjon for refresh tokens.
5. Eksplisitt samtykke og CSRF-beskyttelse.
6. Scopekontroll både ved opplisting og kjøring av verktøy.
7. Validering av `iss`, `aud`, `exp`, signaturalgoritme og `client_id`.
8. Husstanden utledes server-side fra tokenbrukeren.
9. Ressurseierskap sjekkes i hvert tjenestekall, også for barneressurser.
10. Privatlistedata filtreres i alle spørringer og aggregater.
11. Body-, streng-, liste- og pagineringsgrenser på alle eksterne input.
12. Rate limiting på registrering, authorize, token, revoke og MCP-kall.
13. `Cache-Control: no-store` på token-, authorize- og MCP-responser.
14. Sensitive headers, tokens, authorization codes og privat innhold fjernes
    fra logger.
15. CSP, escaping og frame-beskyttelse på samtykkesiden.
16. Ingen cross-origin browser-tilgang med bred CORS-policy. Tillatte HTTP-
    origins legges bare til ved et dokumentert klientbehov.
17. SSRF-relevante URL-felt behandles som data. Serveren skal ikke automatisk
    hente brukeroppgitte produkt-, bilde-, leverandør- eller kilde-URL-er.
18. MCP kan deaktiveres med et kontrollert feature flag/nødbryter uten å slå
    av webappen.

Rate limiting i én Node-prosess kan i første omgang bruke en liten database-
eller prosesslokal mekanisme fordi det kjøres én replika. Før skalering til
flere replikaer må limiteren og eventuell transporttilstand flyttes til et
delt lager.

## 12. Personvern og revisjon

Budsjettdata er mer sensitive enn resten av domenet. Samtykkesiden skal derfor
beskrive scopes forståelig, ikke bare vise tekniske scope-navn.

Det anbefales en liten revisjonslogg for **mutasjoner**, med:

- tidspunkt, bruker, klient-ID og verktøynavn
- berørt ressurstype og ID
- resultat (`success`, `validation_error`, `forbidden`, `internal_error`)
- korrelasjons-ID og varighet

Revisjonsloggen bør ikke inneholde hele inputen eller før/etter-kopier av
budsjett, fritekst og tokens. Definer oppbevaringstid og en oppryddingsjobb før
loggen aktiveres. Lesekall kan måles aggregert uten å logge returnerte data.

Under Innstillinger skal brukeren etter hvert kunne se:

- tilkoblet klient og godkjente scopes
- første og siste bruk
- knapp for å tilbakekalle klientens tilgang

Revokering av en grant skal stoppe refresh umiddelbart. Access tokens kan leve
til kort utløp; dersom umiddelbar access-token-revokering kreves, trengs en
denylist eller stateful introspeksjon og dette må vurderes eksplisitt.

## 13. Observabilitet og drift

### 13.1 Strukturert logging og målinger

Logg som minimum:

- korrelasjons-ID, MCP-metode og eventuelt verktøynavn
- klient-ID og en pseudonymisert eller intern bruker-ID
- status, feilkode, responstid og responsstørrelse
- OAuth-hendelser som registrering, samtykke, refresh-reuse og revokering

Ikke logg bearer tokens, cookies, koder, PKCE verifier, refresh tokens,
verktøyresultat eller full verktøyinput.

Følg med på:

- feilrate og p95-varighet per verktøy
- 401/403/429-rate
- mislykkede token-refresh og detektert token-gjenbruk
- antall aktive grants, klienter og refresh tokens
- databasefeil og store svar

### 13.2 Opprydding

Lag en idempotent jobb eller administrativ funksjon som sletter:

- utløpte authorization requests og authorization codes
- konsumerte/revokerte refresh tokens etter en definert karantenetid
- ubrukte og utløpte klientregistreringer
- gamle revisjonshendelser

Jobben kan først kjøres ved containerstart og deretter periodisk i prosessen,
så lenge det dokumenteres at løsningen foreløpig har én replika. Den skal ikke
være nødvendig for korrekthet, bare for plassbruk.

## 14. Teststrategi

### 14.0 Kjøremiljø for tester

Dette må på plass i fase 0, før noen av testene under kan brukes som
akseptansekriterium.

Vitest er allerede konfigurert i `apps/web` (se 3.4), så enhetstestene har et
rammeverk å bygge på. Det som mangler er at noe faktisk kjører dem:

- `test` legges til som task i `turbo.json`
- `test`-script legges til i rot-`package.json`
- CI får et jobb-steg som kjører `pnpm lint`, `pnpm typecheck` og `pnpm test`;
  i dag bygger `.github/workflows/build-push.yml` bare docker-imaget
- `CLAUDE.md` rettes, den sier feilaktig at det ikke finnes noe testrammeverk

Integrasjonstestene i 14.2 trenger i tillegg en database, og det finnes ingen
testdatabase i dag. Planen forutsetter:

- en egen testdatabase eller et eget schema, ikke dev-databasen — enten som en
  ny service i `docker-compose.yml` eller via `DATABASE_URL`-override
- migrasjoner påført før kjøring (`prisma migrate deploy` mot testdatabasen), slik
  at testene også dekker at migrasjonene faktisk går
- en avklaring av hvor testene bor: `packages/db` har i dag ikke noe test-script,
  så enten opprettes det der, eller testene legges i `apps/web` med databasen som
  ekstern avhengighet
- en `services:`-blokk for postgres i CI-jobben, ellers kan samtidighetstestene
  bare kjøres lokalt

Uten dette er akseptansekriteriet i fase 2 («samtidighetstester beviser
engangskonsum») ikke oppnåelig, og «grønne tester» andre steder i planen er ikke
håndhevbart.

### 14.1 Enhetstester

- PKCE S256, redirect-URI- og resource-validering, inkludert tillatte dynamiske
  loopback-porter og avvisning av `localhost`, ikke-loopback-IP-er og avvik i
  sti eller query
- hashing, JWT-claims, utløp og algoritmelås
- scopes og verktøyfiltrering
- serialisering av `Decimal`, datoer, enums og nullverdier
- karakteriseringstest som låser dagens budsjett-tall fra `budget-view.tsx` før
  beregningen flyttes (se 10.2), og deretter beregningene i den samlede
  budsjettoppsummeringen
- konvertering av `YYYY-MM-DD` til `DateTime` og tilbake, med et tilfelle rundt
  sommertid, siden feltene er `DateTime` og ikke `date` (se 3.2)
- inputgrenser, paginering og feilmapping
- private liste-regler og alle eierskapsgrenser

### 14.2 Integrasjonstester mot PostgreSQL

- authorization code kan konsumeres nøyaktig én gang ved samtidighet
- refresh token roteres atomisk, og reuse tilbakekaller forventet familie
- grant-revokering stopper refresh
- slettet bruker eller fjernet husstandsmedlem mister tilgang. Merk at
  brukersletting er blokkert i dag for brukere med private lister (se 3.2), så
  denne testen kan først skrives etter at den produktbeslutningen er tatt — og
  den skal da også dekke at `deleteUser` faktisk lykkes for en slik bruker
- kontekstoppslag feiler lukket dersom eldre data mot formodning gir flere
  medlemskap for samme bruker
- bruker A kan aldri lese eller endre bruker/husstand Bs ressurser ved å gjette
  ID-er
- husstandsmedlem kan ikke se en annen brukers private liste
- child-ID-er kan ikke brukes til å omgå foreldresjekken
- migrasjonen fungerer på en database med eksisterende data

### 14.3 Protokoll- og kontraktstester

- `initialize` for støttede og ikke-støttede protokollversjoner
- `tools/list` og `tools/call` med gyldig/ugyldig input
- korrekt JSON-RPC-ID og feilhåndtering
- `401` med Protected Resource Metadata-lenke
- discovery-dokumenter samsvarer med faktiske endepunkter
- read-only token ser ikke og kan ikke kalle skriveverktøy
- responsen validerer mot hvert verktøys output schema
- maksimal request- og responsstørrelse oppfører seg kontrollert

### 14.4 Ende-til-ende

Test lokalt med en MCP-inspektør og i staging/produksjon med minst én faktisk
målklient:

1. førstegangsregistrering og innlogging
2. godkjenning av bare ett read-scope
3. lesing av data og avvist skriveforsøk
4. utvidet samtykke til write
5. token refresh etter access-token-utløp
6. containerrestart uten at klienttilkoblingen forsvinner
7. revokering fra innstillinger og påfølgende avvist refresh
8. to samtidige brukere i forskjellige husstander

Produksjonstesten skal bruke ufarlige testdata og rydde dem opp etterpå.

## 15. Leveranseplan

Hver fase bør være en egen, gjennomgåbar endring med grønne tester. Faser kan
slås sammen bare når de fortsatt har et klart rollback-punkt.

### Fase 0 – kontrakter og spike

**Oppgaver**

- velg og lås SDK/adapter
- dokumenter støttet MCP-protokollversjon og målklienter
- bevis stateless Streamable HTTP i Next.js
- avklar discovery-stier, klientregistrering og `resource`
- definer feilformat, dato-/pengeformat og verktøynavngivning
- gjør testene kjørbare: `test`-task i `turbo.json`, `test`-script i
  rot-`package.json`, CI-steg for lint/typecheck/test, og rett `CLAUDE.md`
  (se 14.0)
- sett opp testdatabase og migrasjonspåføring for integrasjonstestene (14.0)
- ta de fire kontraktbeslutningene som ellers blir tatt under implementasjon:
  normativ budsjettformel (10.2), oppførsel når `Budget` mangler (10.2),
  pengeserialisering for beregnede aggregater (3.2), og
  dato-/tidssonekonvertering (3.2)

**Akseptansekriterier**

- MCP-inspektør kan initialisere og kalle ett lokalt diagnoseverktøy
- arkitekturbeslutningene er skrevet ned
- ingen midlertidig produksjonsauth finnes i deploybar kode
- `pnpm test` kjører de eksisterende testene lokalt og i CI, og CI feiler på en
  bevisst innført regresjon

### Fase 1 – applikasjonstjenester for lesing

**Oppgaver**

- innfør `ApplicationContext` og typede applikasjonsfeil
- erstatt `getUserHousehold()`s uordnede `findFirst` med et fail-lukket oppslag,
  og gjør `requireHousehold()` til en tynn adapter som oversetter
  autorisasjonsfeilen til `redirect()` — tjenestelaget skal ikke kalle
  `next/navigation` (se kapittel 7 og 8.1)
- innfør en egen minimal kontekstspørring i stedet for å gjenbruke
  `getUserHousehold()`s fulle `User`-graf (kapittel 7)
- trekk ut read services for innkjøp, budsjett, vedlikehold og hage, og gjenbruk
  `getVisibleShoppingListsWhere`/`isShoppingListAccessible` framfor å
  reimplementere privatliste-filteret
- **flytt budsjettberegningen ut av `budget-view.tsx`** og slå den sammen med
  `calculateBudgetStats` til én implementasjon, etter rekkefølgen i 10.2
  (karakteriseringstest før flytting)
- sentraliser serialisering av `Decimal`, datoer og enums
- behold eksisterende Server Actions/queries som adaptere

**Akseptansekriterier**

- eksisterende webfunksjonalitet er uendret
- budsjettallene i UI er bit-identiske med karakteriseringstesten fra før
  flyttingen, og `dashboard-stats` og budsjettsiden bruker nå samme funksjon
- enhetstester dekker husstandsisolasjon og private lister
- read services kan kalles uten cookies eller Next.js-kontekst, og
  `application/` importerer ikke `next/navigation`

### Fase 2 – persistent OAuth-datamodell

**Oppgaver**

- legg til Prisma-modeller og migrasjon
- legg til husstandsmedlemskaps-migrasjonen med SQL-guard mot duplikater (3.2)
- implementer hash- og tokenrepository
- implementer transaksjonelt kodekonsum og refresh-rotasjon
- implementer opprydding av utløpte rader
- legg til konfigurasjonsmodulen med validering ved oppstart og `503`-oppførsel
  (3.3)

**Akseptansekriterier**

- samtidighetstester beviser engangskonsum, kjørt mot testdatabasen fra 14.0
- ingen hemmelige tokenverdier lagres i klartekst
- migrasjon og rollback-prosedyre er dokumentert
- duplikat-guarden er verifisert mot en database som faktisk har duplikater

### Fase 3 – OAuth og samtykke

**Oppgaver**

- implementer discovery, authorize, token, registrering og revoke
- legg til samtykkeside med scopeforklaringer og CSRF-beskyttelse
- gjør OAuth/MCP-stier tilgjengelige gjennom middleware
- implementer «Tilkoblede apper» minimum som liste + revoke, eller tilby en
  dokumentert administrativ revokeringsvei frem til UI-et er klart
- rate-limit de eksterne endepunktene

**Akseptansekriterier**

- full authorization code + PKCE-flyt passerer integrasjonstest
- redirect-, resource- og scope-negative tester passerer
- restart beholder klient, grant og refresh-mulighet
- brukeren kan faktisk trekke tilbake tilgangen

### Fase 4 – autentisert MCP med read-only verktøy

**Oppgaver**

- koble bearer-validering til MCP-transporten
- registrer nivå 1-verktøy og output schemas
- legg til paginering, størrelsesgrenser og strukturerte resultater
- implementer scopefiltrert `tools/list`
- rate-limit også `/api/mcp`, ikke bare OAuth-endepunktene fra fase 3
- legg til strukturert logging uten sensitive data

**Akseptansekriterier**

- alle fire domener kan leses med respektive scope
- kryssbruker- og privatliste-testene passerer
- token for ett domene kan ikke lese et annet
- ingen verktøysvar inneholder brukerfelt som ikke er eksplisitt hvitelistet
- faktisk målklient kan koble til etter deploy

Dette er første anbefalte produksjonsmilepæl. MCP kan stå read-only en periode
for å samle erfaring med verktøybeskrivelser, responsstørrelse og klientadferd.

### Fase 5 – mutasjonstjenester og innkjøpsverktøy

**Oppgaver**

- trekk ut write services for lister, elementer og alternativer, og konverter
  check-then-act-mønsteret i `shopping-list.ts` (3 steder) til autorisasjon i
  oppslaget
- gjør status- og foretrukket-alternativ-operasjoner idempotente; `set-*` framfor
  eksisterende `toggleItemPurchased` (9.2)
- trekk ut duplikat-import-flyten fra `shopping-item.ts` som grunnlag for
  `add-shopping-items`, og legg batch-grensen i tjenestelaget (10.4, 9.1)
- hold `replaceShoppingItems` utenfor `application/` (10.4)
- legg til write-verktøy, concurrency-sjekk og revisjonshendelser
- test duplikater, retries og child-resource-autorisasjon

**Akseptansekriterier**

- web og MCP bruker samme domenelogikk
- read-only token kan ikke mutere
- retry av idempotente kall gir samme sluttilstand
- bulk-kall over maksgrensen avvises, også når de kommer fra webflyten
- `replaceShoppingItems` er ikke nåbar fra verktøyregisteret

### Fase 6 – budsjettmutasjoner

**Oppgaver**

- trekk ut write services for poster, kategorier, medlemmer, lån og reiser, og
  konverter check-then-act-mønsteret i `budget.ts` (6 steder) til autorisasjon i
  oppslaget
- bruk den samlede beregningsimplementasjonen fra fase 1 (den skal allerede være
  delt her, ikke lages nå)
- implementer den valgte oppførselen for husstander uten `Budget`-rad (10.2)
- legg til preview for sammensatte budsjettendringer før eventuell apply
- hold `replaceBudget` utenfor `application/` (10.4)
- utvid revisjon og sikkerhetstester for sensitive data

**Akseptansekriterier**

- lagrede og beregnede tall samsvarer med webgrensesnittet
- stale `updatedAt` avvises der optimistic concurrency brukes
- ingen full erstatning eller husstandsendring er eksponert
- `replaceBudget` er ikke nåbar fra verktøyregisteret
- `BudgetMember.name` returneres bare der det er eksplisitt del av kontrakten

### Fase 7 – vedlikehold og hage

**Oppgaver**

- trekk ut de resterende write services, og konverter check-then-act i `plant.ts`
  (2 steder) til autorisasjon i oppslaget
- implementer eksplisitte sluttilstander for leverandør og fremdrift
- legg til create/update for planter og vedlikeholdsoppgaver
- avklar enum-validering i vedlikeholdsimporten: eksisterende stille fallback til
  `MEDIUM` skal ikke videreføres uforandret (9.1)

**Akseptansekriterier**

- alle barneressurser er husstandsavgrenset gjennom forelder
- verktøyannotasjoner og schemas er kontrakttestet

### Fase 8 – hardening og videre drift

**Oppgaver**

- last-/misbrukstest av registrering, token og de tyngste verktøyene
- dashboards/alarmer og dokumentert hendelseshåndtering
- secret-rotasjonsprosedyre og restore-test
- vurder destruktive verktøy basert på faktisk behov
- evaluer om de manuelle LLM-importflytene fortsatt skal beholdes som eget
  UI. Merk at kontraktene deres allerede er gjenbrukt i fase 5–7 (10.4), så dette
  er et spørsmål om brukergrensesnittet, ikke om koden bak

**Akseptansekriterier**

- dokumentert runbook finnes
- tjenesten kan deaktiveres uten nedetid for webappen
- backup/restore og revokering er testet

## 16. Utrulling og rollback

### Før deploy

- generer separat signeringssecret
- sett issuer og TTL-er på serveren
- ta databasebackup
- kjør migrasjonen i staging eller en kopi av produksjonsdatabasen
- kontroller at discovery- og OAuth-ruter ikke fanges av login-middleware
- kjør lint, typecheck, tester og produksjonsbygg — forutsetter at fase 0 har gjort
  testene kjørbare (14.0)

Caddy- og prod-compose-konfigurasjonen ligger utenfor dette repoet, så punktene i
dette kapittelet og i kapittel 17 må verifiseres mot den faktiske
serverkonfigurasjonen og ikke antas ut fra `docker-compose.yml` her, som bare er
dev-databasen.

### Deployrekkefølge

1. Deploy databasemigrasjon og kode med MCP feature flag avslått.
2. Verifiser at webappen fungerer og at MCP-ruter gir kontrollert deaktivert
   respons.
3. Aktiver discovery/OAuth og test full tokenflyt.
4. Aktiver read-only MCP-verktøy.
5. Observer feil, responstider og datagrense-tester før write-scopes aktiveres.
6. Aktiver ett write-domene av gangen.

Ved den første endringen av containerens miljøvariabler må containeren
gjenskapes fra oppdatert compose-konfigurasjon; automatisk image-oppdatering
alene er ikke tilstrekkelig.

### Rollback

- Nødbryteren skal kunne deaktivere MCP- og OAuth-funksjonalitet uten å rulle
  tilbake resten av appen.
- En kode-rollback skal ikke kreve at OAuth-tabellene fjernes.
- Databaseutvidelser skal derfor være additive frem til løsningen er stabil.
- Ved mistanke om tokenlekkasje: deaktiver MCP, revoker grants/refresh tokens,
  roter signeringssecret og aktiver først etter verifikasjon.
- Rotasjon av secret invaliderer access tokens, men databasen må i tillegg
  revokere refresh tokens.

## 17. Runbook som må følge implementasjonen

Driftsdokumentasjonen bør svare på:

- hvordan man tester discovery og en forventet `401`
- hvordan man ser antall aktive klienter og grants uten å lese tokens
- hvordan én klient eller alle klienter revokeres
- hvordan signeringssecreten roteres
- hvordan MCP deaktiveres og aktiveres
- hvordan utløpte OAuth-data ryddes
- hvordan man diagnostiserer feil klokke, issuer eller audience
- hvordan man kontrollerer at Caddy ikke cacher OAuth/MCP-responser
- hvordan backup og restore av OAuth-tabellene verifiseres

## 18. Dokumentasjon og referansegrunnlag

Implementasjonen skal ved oppstart av hver protokollfase kontrolleres mot
gjeldende, offisiell dokumentasjon. Versjonene som faktisk implementeres skal
noteres i en arkitekturbeslutning og i serverens metadata.

- MCP Authorization:
  <https://modelcontextprotocol.io/specification/latest/basic/authorization>
- MCP Transports:
  <https://modelcontextprotocol.io/specification/latest/basic/transports>
- MCP Tools:
  <https://modelcontextprotocol.io/specification/latest/server/tools>
- OAuth 2.0 Authorization Server Metadata (RFC 8414):
  <https://www.rfc-editor.org/rfc/rfc8414>
- OAuth 2.0 Dynamic Client Registration (RFC 7591):
  <https://www.rfc-editor.org/rfc/rfc7591>
- OAuth 2.0 Resource Indicators (RFC 8707):
  <https://www.rfc-editor.org/rfc/rfc8707>
- OAuth 2.0 Protected Resource Metadata (RFC 9728):
  <https://www.rfc-editor.org/rfc/rfc9728>
- OAuth 2.0 Token Revocation (RFC 7009):
  <https://www.rfc-editor.org/rfc/rfc7009>

## 19. Samlet ferdigdefinisjon

MCP-serveren er ferdig for første fullverdige versjon når:

- den kjører på `/api/mcp` i den eksisterende applikasjonen
- en støttet ekstern klient kan oppdage, autorisere, refreshe og revokere
  tilgang uten manuell tokenkopiering
- OAuth-tilstand overlever containerrestart og ingen tokens lagres i klartekst
- scopes håndheves for hvert domene og hvert verktøy
- husstandsisolasjon og private lister er bevist med negative tester
- read-verktøy finnes for alle fire domener
- de valgte write-verktøyene bruker samme tjenestelag som webappen
- budsjettbeløp beregnes av én implementasjon som både UI, dashboard og MCP
  bruker, og tallene er verifisert mot karakteriseringstesten fra fase 1
- mutasjoner er presise, observerbare og idempotente der det er mulig
- administrator-, medlems-, delings- og full-erstatningsoperasjoner ikke er
  eksponert, og `replaceBudget`/`replaceShoppingItems` er ikke nåbare fra
  verktøyregisteret
- revokering, nødbryter, backup/restore, secret-rotasjon og rollback er
  dokumentert og testet
- lint, typecheck, automatiske tester og produksjonsbygg passerer

Den anbefalte milepælen før dette er en **read-only produksjonsversjon** etter
fase 4. Den gir reell nytte, tester hele sikkerhets- og protokollkjeden og lar
verktøykontraktene modnes før klienter får endre husstands- og budsjettdata.
