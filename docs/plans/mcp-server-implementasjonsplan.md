# Implementasjonsplan: MCP-server for Home Overview

Dato: 2026-07-29

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
   på serveren.

Spiken kan bruke ett ufarlig verktøy, for eksempel `get-server-info`, og en
midlertidig utviklingstoken som kun er tilgjengelig lokalt. Midlertidig auth
skal aldri kunne aktiveres i et produksjonsbygg.

**Beslutningsport:** Hvis den valgte adapteren ikke håndterer standard
Streamable HTTP korrekt i Next.js, skal teamet sammenligne en liten direkte
JSON-RPC-implementasjon med en annen adapter. En separat tjeneste er siste
utvei, ikke automatisk neste steg.

### 3.2 Produktforutsetninger

- En autorisert bruker er fortsatt medlem av maksimalt én aktiv husstand, slik
  dagens `getUserHousehold` forutsetter.
- Språket i verktøynavn og feltnavn er engelsk. Beskrivelser, feilmeldinger og
  brukerrettet samtykke kan være norsk.
- Beløp bruker NOK som standard, siden datamodellen ikke har valutafelt. MCP
  skal ikke late som om flere valutaer støttes.
- Datoer sendes som ISO 8601. Kalenderdatoer som forfallsdato bør være
  `YYYY-MM-DD`; tidspunkter skal være UTC med `Z`.
- Desimaltall serialiseres uten Prisma-spesifikke typer. Pengebeløp bør
  returneres som desimalstrenger for å unngå binær avrunding, med mindre en
  dokumentert felles kontrakt velger heltall i øre.

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
- `/api/oauth`
- `/.well-known`

«Offentlig» betyr her bare at middleware slipper forespørselen frem. Hver rute
skal fortsatt utføre sin egen fullstendige autentisering. Det må finnes tester
som hindrer en senere middleware-endring i å gjøre discovery eller tokenflyten
utilgjengelig.

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
- et snevert utviklingsunntak for loopback-adresser
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
klientens aktive tokens. Alle relasjoner til `User` skal slettes eller
revokeres ved sletting av brukeren. Autorisasjonskodekonsum og refresh-rotasjon
skal utføres i transaksjoner som tåler to samtidige forespørsler.

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
4. bruk medlemskapets `householdId`; aldri aksepter `householdId` fra
   verktøyinput

Dette gjør at fjerning fra en husstand får effekt selv om et access token
fortsatt er gyldig. Manglende medlemskap skal gi en autorisasjonsfeil, ikke
automatisk onboarding eller redirect.

For hver ID-basert operasjon skal tjenestelaget hente eller mutere med både
ressurs-ID og riktig eiergrense. En `update({ where: { id } })` etterfulgt av
en separat eierskapssjekk er ikke godt nok; autorisasjonen må være del av
oppslaget/transaksjonen. Barneressurser skal avgrenses via forelderen:

- handleelement → synlig handleliste → husstand og bruker
- produktalternativ → handleelement → synlig handleliste
- leverandør/fremdrift → vedlikeholdsoppgave → husstand
- budsjettpost/lån/reise/medlem → budsjett → husstand
- plante → husstand

Private handlelister er synlige bare for oppretteren. Dette gjelder også
søk, tellinger, dashboardlignende oppsummeringer og feilmeldinger. En bruker
uten tilgang bør normalt få samme «ikke funnet»-respons som for en ukjent ID.

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
`next/cache`, MCP-SDK-en eller React.

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
  aldri.
- Oppdateringsverktøy skiller mellom «felt ikke oppgitt» og «sett felt til
  null».
- Resultatlister har stabil sortering og paginering med en konservativ
  standardgrense og maksimalgrense.
- Fritekstsøk skal ha lengdegrenser og definerte felt det søker i.
- Bulkverktøy skal ha lav maksgrense, transaksjonell semantikk og resultat per
  element dersom delvis suksess tillates.

### 9.2 Idempotens og samtidighet

Verktøy skal uttrykke ønsket sluttilstand:

- `set-shopping-item-status(status: "PURCHASED")`, ikke «toggle purchased»
- `set-selected-vendor(vendorId | null)`, ikke «toggle selected»
- `set-progress-entry-completed(completed: true)`, ikke «toggle completed»

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

Sletting av enkeltelementer kan innføres ett domene av gangen. Følgende skal
fortsatt ikke eksponeres:

- sletting av bruker, husstand eller medlem
- oppretting/deaktivering av offentlig delingslenke
- administratoroperasjoner
- full `replace` av lister, budsjett, vedlikeholdsoppgaver eller planter
- endring av egen adminstatus eller OAuth-konfigurasjon

## 11. Sikkerhetstiltak

Følgende er krav, ikke senere forbedringsforslag:

1. PKCE med S256 og eksakt redirect-URI-match.
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

### 14.1 Enhetstester

- PKCE S256, redirect-URI- og resource-validering
- hashing, JWT-claims, utløp og algoritmelås
- scopes og verktøyfiltrering
- serialisering av `Decimal`, datoer, enums og nullverdier
- beregninger i budsjettoppsummeringen
- inputgrenser, paginering og feilmapping
- private liste-regler og alle eierskapsgrenser

### 14.2 Integrasjonstester mot PostgreSQL

- authorization code kan konsumeres nøyaktig én gang ved samtidighet
- refresh token roteres atomisk, og reuse tilbakekaller forventet familie
- grant-revokering stopper refresh
- slettet bruker eller fjernet husstandsmedlem mister tilgang
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

**Akseptansekriterier**

- MCP-inspektør kan initialisere og kalle ett lokalt diagnoseverktøy
- arkitekturbeslutningene er skrevet ned
- ingen midlertidig produksjonsauth finnes i deploybar kode

### Fase 1 – applikasjonstjenester for lesing

**Oppgaver**

- innfør `ApplicationContext` og typede applikasjonsfeil
- trekk ut read services for innkjøp, budsjett, vedlikehold og hage
- sentraliser serialisering og budsjettberegninger
- behold eksisterende Server Actions/queries som adaptere

**Akseptansekriterier**

- eksisterende webfunksjonalitet er uendret
- enhetstester dekker husstandsisolasjon og private lister
- read services kan kalles uten cookies eller Next.js-kontekst

### Fase 2 – persistent OAuth-datamodell

**Oppgaver**

- legg til Prisma-modeller og migrasjon
- implementer hash- og tokenrepository
- implementer transaksjonelt kodekonsum og refresh-rotasjon
- implementer opprydding av utløpte rader

**Akseptansekriterier**

- samtidighetstester beviser engangskonsum
- ingen hemmelige tokenverdier lagres i klartekst
- migrasjon og rollback-prosedyre er dokumentert

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
- legg til strukturert logging uten sensitive data

**Akseptansekriterier**

- alle fire domener kan leses med respektive scope
- kryssbruker- og privatliste-testene passerer
- token for ett domene kan ikke lese et annet
- faktisk målklient kan koble til etter deploy

Dette er første anbefalte produksjonsmilepæl. MCP kan stå read-only en periode
for å samle erfaring med verktøybeskrivelser, responsstørrelse og klientadferd.

### Fase 5 – mutasjonstjenester og innkjøpsverktøy

**Oppgaver**

- trekk ut write services for lister, elementer og alternativer
- gjør status- og foretrukket-alternativ-operasjoner idempotente
- legg til write-verktøy, concurrency-sjekk og revisjonshendelser
- test duplikater, retries og child-resource-autorisasjon

**Akseptansekriterier**

- web og MCP bruker samme domenelogikk
- read-only token kan ikke mutere
- retry av idempotente kall gir samme sluttilstand

### Fase 6 – budsjettmutasjoner

**Oppgaver**

- trekk ut write services for poster, kategorier, medlemmer, lån og reiser
- gjenbruk én beregningsimplementasjon i UI og MCP
- legg til preview for sammensatte budsjettendringer før eventuell apply
- utvid revisjon og sikkerhetstester for sensitive data

**Akseptansekriterier**

- lagrede og beregnede tall samsvarer med webgrensesnittet
- stale `updatedAt` avvises der optimistic concurrency brukes
- ingen full erstatning eller husstandsendring er eksponert

### Fase 7 – vedlikehold og hage

**Oppgaver**

- trekk ut de resterende write services
- implementer eksplisitte sluttilstander for leverandør og fremdrift
- legg til create/update for planter og vedlikeholdsoppgaver

**Akseptansekriterier**

- alle barneressurser er husstandsavgrenset gjennom forelder
- verktøyannotasjoner og schemas er kontrakttestet

### Fase 8 – hardening og videre drift

**Oppgaver**

- last-/misbrukstest av registrering, token og de tyngste verktøyene
- dashboards/alarmer og dokumentert hendelseshåndtering
- secret-rotasjonsprosedyre og restore-test
- vurder destruktive verktøy basert på faktisk behov
- evaluer om manuelle LLM-importflyter fortsatt skal beholdes

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
- kjør lint, typecheck, tester og produksjonsbygg

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
- mutasjoner er presise, observerbare og idempotente der det er mulig
- administrator-, medlems-, delings- og full-erstatningsoperasjoner ikke er
  eksponert
- revokering, nødbryter, backup/restore, secret-rotasjon og rollback er
  dokumentert og testet
- lint, typecheck, automatiske tester og produksjonsbygg passerer

Den anbefalte milepælen før dette er en **read-only produksjonsversjon** etter
fase 4. Den gir reell nytte, tester hele sikkerhets- og protokollkjeden og lar
verktøykontraktene modnes før klienter får endre husstands- og budsjettdata.
