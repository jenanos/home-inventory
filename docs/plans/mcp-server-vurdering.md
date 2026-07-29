# Vurdering: MCP-server for Home Overview

Dato: 2026-07-29

Denne vurderingen svarer på tre spørsmål:

1. Hvordan er MCP-serveren i `meal-planner` bygget, inkludert autentisering?
2. Bør Home Overview ha noe tilsvarende — og vil det faktisk være kurant å
   jobbe med appen gjennom MCP?
3. Bør de to appene dele én MCP-server, eller ha hver sin?

**Kort konklusjon:**

- **Ja, MCP passer godt for Home Overview.** Dagens LLM-import er enveis og
  manuell (kopier prompt → lim inn i chat → kopier JSON → lim inn i appen).
  MCP gir tosidig tilgang: modellen kan _lese_ eksisterende data før den
  foreslår endringer. Det er akkurat det budsjett- og innkjøpsarbeidet trenger.
- **Egen MCP for Home Overview — ikke en delt server.** De to appene har
  separate databaser, separate brukertabeller og to forskjellige
  auth-biblioteker. En felles server må da bygge en identitetsbro mellom to
  brukerregistre, og verktøylisten blir ~60 verktøy i én connector. Kostnaden
  er høyere enn gevinsten.
- **Men ikke kopier arkitekturen fra `meal-planner`.** Meal Planner har en
  egen HTTP-API (Fastify + tRPC), så en sidecar-container er riktig der. Home
  Overview er en Next.js-monolitt med Server Actions og _ingen_ HTTP-API.
  Anbefalingen er å legge MCP-endepunktet **inne i Next.js-appen** på
  `https://home.jenanos.xyz/api/mcp`. Det gir null endringer i
  `hetzner-infra` bortsett fra én ny secret.

---

## 1. Hvordan meal-planner-MCP-en er satt opp

### 1.1 Topologi

```
ChatGPT / Claude
      │  HTTPS (OAuth 2.1 bearer)
      ▼
meals-mcp.jenanos.xyz  ──►  Caddy  ──►  meals-mcp:5050   (Express, egen container)
                                              │
                                              │  tRPC over HTTP
                                              │  x-api-key: <MCP_API_KEY>
                                              │  x-mcp-on-behalf-of: <userId>
                                              ▼
                                        meals-api:4000    (Fastify + better-auth)
                                              │
                                              ▼
                                        meals-postgres
```

Relevante filer i `meal-planner`:

| Fil | Innhold |
| --- | --- |
| `apps/mcp-server/src/index.ts` (1215 linjer) | Express-app, ~28 MCP-verktøy, host-allowlist, bearer-validering |
| `apps/mcp-server/src/oauth/routes.ts` (577) | Hele OAuth 2.1-autorisasjonsserveren |
| `apps/mcp-server/src/oauth/db.ts` (256) | Lagring av OAuth-tilstand — **in-memory** |
| `apps/mcp-server/src/oauth/jwt.ts` (86) | HS256-signering/verifisering av access tokens |
| `apps/mcp-server/src/oauth/pkce.ts` (25) | PKCE S256-verifisering |
| `apps/mcp-server/src/oauth/session.ts` (50) | Slår opp better-auth-sesjon via `meals-api` |
| `apps/server/src/index.ts:261-286` | Godtar `x-api-key` + `x-mcp-on-behalf-of` og bygger tRPC-kontekst |

### 1.2 Autentiseringskjeden

MCP-serveren er sin **egen OAuth 2.1-autorisasjonsserver**, men delegerer
brukerinnlogging til better-auth i web-appen:

1. **Discovery** — klienten henter
   `/.well-known/oauth-authorization-server` (RFC 8414) og
   `/.well-known/oauth-protected-resource` (RFC 9728). Det finnes også en
   redirect fra `/mcp/.well-known/oauth-protected-resource`, fordi noen
   klienter prober under `/mcp`.
2. **Dynamic Client Registration** (RFC 7591) — `POST /oauth/register`.
   Uautentisert, som spesifikasjonen krever, men med tak: maks 10 redirect-URI-er,
   maks 2000 tegn per URI, maks 1000 registrerte klienter (LRU-eviction),
   og kun `https://` (eller `http://localhost`). Dette er det som gjør at
   ChatGPT kan koble seg til uten at man limer inn en client_id manuelt.
3. **Authorize** — `GET /oauth/authorize`, kun `response_type=code` og PKCE
   `S256`. `redirect_uri` må matche eksakt mot en registrert URI.
4. **Sesjonssjekk** — serveren videresender `Cookie`-headeren til
   `meals-api /auth/get-session`. Er det ingen gyldig sesjon, redirectes
   brukeren til `https://meals.jenanos.xyz/login?callbackUrl=…`.
   **Dette er grunnen til at `BETTER_AUTH_COOKIE_DOMAIN=.jenanos.xyz` er satt**
   — cookien må deles på tvers av `meals.` og `meals-mcp.`-subdomenene.
5. **Samtykke** — fordi registrering er åpen, vises en eksplisitt
   samtykkeside før koden utstedes. Uten den kunne hvem som helst som fikk
   registrert en klient hente en autorisasjonskode for en innlogget bruker via
   én preparert lenke. Samtykket bindes til sesjonen ved innsending
   (CSRF-beskyttelse), og request-tokenet er engangsbruk — også ved avslag.
   Godkjenninger huskes per bruker+klient så lenge prosessen lever.
6. **Token** — `POST /oauth/token`. `authorization_code` verifiserer PKCE og
   returnerer en HS256-JWT (1t) + et opakt refresh token (30d). Refresh
   roterer tokenet atomisk, så en gjenbrukt refresh token avvises.
7. **Verktøykall** — `POST /mcp` med `Authorization: Bearer <jwt>`. Ved
   manglende/ugyldig token returneres 401 med
   `WWW-Authenticate: Bearer resource_metadata="…"`, som er signalet MCP-klienter
   bruker for å starte OAuth-flyten.
8. **Identitet videre til API-et** — `claims.sub` (bruker-ID-en) brukes til å
   lage en tRPC-klient per forespørsel, som sender `x-mcp-on-behalf-of`.
   `meals-api` slår opp brukerens husstand fra `HouseholdMember` — samme vei
   som en vanlig nettleser-sesjon.

### 1.3 Detaljer som er verdt å ta med videre

Ting implementasjonen gjør riktig og som bør gjenbrukes:

- **En tRPC-klient per forespørsel.** Kommentaren i `index.ts:88-93` forklarer
  hvorfor: `httpBatchLink` slår sammen kall i samme tick til én HTTP-request med
  én `headers()`-evaluering. En delt klient på modulnivå kunne latt to samtidige
  brukere få kallene sine slått sammen under én `x-mcp-on-behalf-of`.
- **`Cache-Control: no-store`** på alle autorisasjonssvar.
- **Host-allowlist** (`MCP_ALLOWED_HOSTS`) som DNS-rebinding-beskyttelse, med
  korrekt håndtering av IPv6-klammer og portløse oppføringer.
- **Egen body-parser** i stedet for SDK-ens `createMcpExpressApp` — SDK-helperen
  monterer sin egen parser, som kolliderer med den `/oauth/token` trenger.
- **Verktøy-annotasjoner** (`readOnlyHint`, `destructiveHint`, `idempotentHint`)
  på hvert verktøy.
- **Sammensatte verktøy** som `smart-add-extra-shopping-item` og
  `bulk-update-missing-ingredient-categories` — de slår sammen «slå opp» +
  «skriv» i ett kall, med duplikatsjekk. Det sparer mange rundturer og er
  antakelig den viktigste grunnen til at serveren oppleves som god i praksis.

Ting som bør gjøres **annerledes** i Home Overview:

- **OAuth-tilstanden ligger i minnet.** `oauth/db.ts` sier det rett ut:
  registreringer og refresh tokens går tapt ved restart. Watchtower puller nye
  images hvert 5. minutt, så hver deploy tvinger reautorisering av alle
  tilkoblede klienter. Prisma-skjemaet i `meal-planner` har allerede
  `OAuthClient`, `OAuthAuthorizationCode` og `OAuthRefreshToken`-modellene
  liggende **ubrukt** (`packages/database/prisma/schema.prisma:128-181`) — de
  ble laget for dette og så byttet ut med in-memory for å slippe
  `@repo/database`-avhengigheten i MCP-appen. I Home Overview er Prisma
  allerede i prosessen, så persistering koster nesten ingenting. Gjør det fra
  dag én.
- **Ingen revokering.** Det finnes ikke noe `/oauth/revoke` (RFC 7009) eller
  UI for å se/koble fra tilkoblede klienter. Verdt å legge til når budsjettdata
  er eksponert.
- **Ingen scopes i praksis.** `scope: "mcp"` annonseres, men brukes ikke til
  noe. For Home Overview, som har private lister og budsjett, bør man i det
  minste skille lese/skrive.

---

## 2. Passer MCP for Home Overview?

### 2.1 Hva vi har i dag

`apps/web/components/llm-import-page.tsx` + fire `llm-import`-sider
(`lists/[id]`, `vedlikehold`, `hage`, `budsjett`) implementerer denne flyten:

1. Appen genererer en prompt → du kopierer den
2. Du limer inn i ChatGPT/Claude og sparrer
3. Du kopierer JSON-svaret tilbake
4. Appen parser, kjører duplikatsjekk (`findExistingShoppingItems`,
   `findExistingBudgetItems`, `findExistingMaintenanceTasks`,
   `findExistingPlants`) og viser forhåndsvisning
5. Du importerer (`bulkImport*WithDuplicates` eller `replace*`)

Dette fungerer, men har tre begrensninger som MCP fjerner direkte:

- **Modellen ser ikke eksisterende data.** Den vet ikke hva som allerede står i
  budsjettet eller på listene. Derfor finnes hele duplikat-maskineriet på
  appsiden — det kompenserer for at LLM-en er blind. Med MCP kan modellen kalle
  `list-budget-entries` først og foreslå _endringer_, ikke bare nye rader.
- **Alt-eller-ingenting.** Flyten er bygget for import av bolker. «Fjern
  strømstøtte-linja og øk matbudsjettet med 500» passer dårlig.
- **Fem manuelle steg per iterasjon.** Å sparre frem og tilbake betyr å
  gjenta hele runden.

### 2.2 Hvor godt egner domenet seg?

Godt. Konkrete arbeidsflyter som blir mulige:

| Område | Eksempel |
| --- | --- |
| Innkjøp | «Legg oppvaskmaskin på Kjøkken-lista, prioritet høy, ca 8000 kr, og finn tre alternativer» — `ProductAlternative`-modellen er allerede der |
| Innkjøp | «Hva står som PENDING på alle lister med forfall før september?» |
| Budsjett | «Gå gjennom faste kostnader og si hva jeg kan kutte» — krever lesetilgang, som import-flyten ikke har |
| Budsjett | «Legg inn nytt billån: 350 000, 6,4 %, 60 mnd, annuitet» → `upsertBudgetLoan` |
| Budsjett | «Hva blir månedlig overskudd hvis jeg øker avdragene med 2000?» |
| Vedlikehold | «Legg til fremdriftspunkter på maling av fasade og sett frister» |
| Vedlikehold | «Hvilke oppgaver har leverandørtilbud, men ingen valgt leverandør?» |
| Hage | «Hvilke planter trenger vann oftere enn ukentlig og står i full sol?» |

Sammenlignet med Meal Planner er nytten **høyere**, ikke lavere: budsjett er
tallarbeid der en modell er nyttig, og datamengden per husstand er liten nok
til at hele budsjettet får plass i én kontekst.

### 2.3 Hva som er «ikke helt kurant»

Ærlige forbehold:

- **Server Actions kan ikke gjenbrukes som de er.** Alle actions starter med
  `requireHousehold()` (som leser cookies via `next/headers`) og avslutter med
  `revalidatePath()`. Begge er bundet til en HTTP-request fra nettleseren. Et
  MCP-kall har ingen cookie og ingen side å revalidere. Derfor trengs et
  **service-lag** som tar `{ userId, householdId }` eksplisitt, og som både
  Server Actions og MCP-verktøy kaller. Det er ~4200 linjer actions totalt,
  men MCP trenger bare en delmengde i starten — refaktoreringen kan gjøres
  gradvis, område for område.
- **Prisma `Decimal` må serialiseres.** `estimatedPrice`, `monthlyAmount`,
  `principalAmount` osv. er `Decimal`. De må konverteres til `number` (eller
  string) før de går ut som JSON — akkurat som `createShoppingItem` allerede
  gjør på returverdien.
- **Private lister må respekteres.** `getVisibleShoppingListsWhere` og
  `isShoppingListAccessible` (`lib/shopping-list-access.ts`) må inn i
  MCP-laget også. En privat liste skal ikke bli synlig bare fordi tilgangen går
  via MCP.
- **Admin-operasjoner bør ikke eksponeres.** `lib/actions/admin.ts`
  (`deleteUser`, `deleteHousehold`), `household.ts` (`removeMember`) og
  `share-link.ts` (`createShareLink` — lager offentlig delingslenke) hører ikke
  hjemme i et MCP-verktøysett.
- **`replace*`-actionene er farlige.** `replaceBudget`, `replacePlants`,
  `replaceShoppingItems`, `replaceMaintenanceTasks` sletter alt og skriver på
  nytt. Enten hold dem utenfor MCP, eller merk dem `destructiveHint: true` og
  krev at kallet inneholder en eksplisitt bekreftelse.
- **Kvalitet på verktøybeskrivelser avgjør resultatet.** Meal Planner-serveren
  har lange, norske beskrivelser med eksplisitte advarsler (se `update-recipe`:
  «VIKTIG: Hvis du oppgir 'ingredients', erstatter det HELE ingredienslisten»).
  Den innsatsen må gjentas her.

Ingen av disse er blokkerende. De er arbeid, ikke risiko.

---

## 3. Delt MCP-server eller egen?

### 3.1 Anbefaling: egen

**Argumentene mot en delt server:**

1. **To brukerregistre.** Meal Planner har better-auth med sin egen `User`-tabell
   i `meals-postgres`. Home Overview har Auth.js/NextAuth v5 med
   `PrismaAdapter` og sin egen `User`-tabell i `home-overview-postgres`.
   Samme person har **to forskjellige bruker-ID-er**. En delt MCP-server måtte
   autentisere mot én av dem og så mappe til den andre — realistisk sett på
   e-post. Da bygger man en identitetsbro mellom to systemer, og en
   e-postendring eller en feilmapping gir tilgang til feil husstands data.
   Det er den dyreste og mest sikkerhetskritiske delen av hele oppgaven, og den
   forsvinner helt hvis serverne holdes adskilt.
2. **Verktøymengde.** Meal Planner eksponerer allerede ~28 verktøy. Home
   Overview vil naturlig lande på 25–35 (innkjøp, alternativer, kategorier,
   vedlikehold, leverandører, fremdrift, budsjett med medlemmer/lån/reiser/
   poster, planter). ~60 verktøy i én connector gjør verktøyvalget merkbart
   dårligere og spiser kontekst i _hver_ forespørsel. Både Claude og ChatGPT
   håndterer to separate connectorer bedre enn én stor.
3. **Blast radius.** Én server som når begge databasene betyr at en feil deploy
   eller et kompromittert token gir tilgang til alt. To servere med hver sin
   `DATABASE_URL` holder domenene adskilt.
4. **Arkitekturene peker i forskjellig retning.** Meal Planner _må_ ha en
   sidecar, fordi API-et er en egen tjeneste. Home Overview er best tjent med å
   ligge inne i Next.js-appen (se punkt 4). En delt server tvinger begge inn i
   sidecar-formen og gjør Home Overview-siden unødig komplisert.
5. **Lav domeneoverlapp.** Meal Planner = oppskrifter, ukesplan,
   dagligvarehandel. Home Overview = prosjekter, produkter, budsjett,
   vedlikehold, hage. De eneste to begrepene som ligner er «handleliste», og de
   betyr forskjellige ting (dagligvarer for uka vs. produktønskeliste med pris
   og alternativer).

**Argumentet for en delt server** er reelt, men mindre: OAuth-koden (~900
linjer) blir duplisert. Vurdering: implementasjonene divergerer uansett —
better-auth-oppslag over HTTP vs. NextAuth-sesjon i samme prosess, in-memory
vs. Prisma-lagring. Å pakke dette som en delt npm-pakke på tvers av to repoer
(publisering, versjonering, lockfile-oppdateringer i to repoer for hver
endring) koster mer enn det sparer på denne skalaen. Kopier og tilpass.

Verdt å merke: cross-app-arbeidsflyter går uansett fint med to connectorer.
Claude/ChatGPT ser begge samtidig, så «legg middagsingrediensene for uka inn
som en handleliste i Home Overview» fungerer — klienten orkestrerer, ikke
serveren.

### 3.2 Hva som *bør* deles

Ikke kode, men **konvensjoner**, dokumentert i begge repoene:

- Samme OAuth-endepunktsnavn (`/oauth/authorize`, `/oauth/token`,
  `/oauth/register`) og samme discovery-dokumenter.
- Samme sikkerhetskrav: PKCE S256 påkrevd, eksakt `redirect_uri`-match,
  eksplisitt samtykkeside ved DCR, roterende refresh tokens, `no-store`.
- Samme navnekonvensjon på verktøy (`verb-substantiv` på engelsk,
  beskrivelser på norsk).
- Samme feilformat: `{ ok: false, error: "<kontekst>: <melding>" }` som både
  `content[0].text` og `structuredContent`.

---

## 4. Anbefalt arkitektur for Home Overview

### 4.1 Alternativ A (anbefalt): MCP inne i Next.js-appen

```
ChatGPT / Claude
      │  HTTPS (OAuth 2.1 bearer)
      ▼
home.jenanos.xyz  ──►  Caddy  ──►  home-overview:3000
                                        ├── /api/mcp                 (MCP-endepunkt)
                                        ├── /api/oauth/*             (autorisasjonsserver)
                                        ├── /.well-known/*           (discovery)
                                        └── /login, /budsjett, …     (eksisterende app)
                                              │
                                              ▼
                                        home-overview-postgres
```

Hvorfor dette er riktig her:

- **Ingen HTTP-API finnes.** En sidecar måtte enten få en helt ny API-flate
  bygget for seg, eller snakke direkte med Postgres. Første er dobbeltarbeid,
  andre gir to prosesser som eier samme skjema.
- **Samme origin ⇒ ingen cookie-triksing.** `/api/oauth/authorize` og
  `/login` ligger på samme domene, så sesjonscookien er der allerede. Ingen
  `.jenanos.xyz`-parent-cookie, ingen `AUTH_TRUSTED_ORIGINS`-utvidelse.
  Dette er den største enkeltforenklingen mot meal-planner-oppsettet.
- **Ingen tjeneste-til-tjeneste-secret.** `MCP_API_KEY`/`x-mcp-on-behalf-of`
  finnes ikke — verktøyene kaller service-laget direkte med `userId`.
- **Null infrastrukturendring.** Ingen ny container, intet nytt image, ingen
  ny Caddy-blokk, ingen ny DNS-record, ingen ny watchtower-oppføring. Kun én
  ny secret. Se `hetzner-infra/docs/plans/mcp-arkitektur-vurdering.md`.
- **Sesjonsoppslag er allerede tilgjengelig.** `auth()` fra `lib/auth.ts`
  fungerer i Route Handlers. NextAuth kjører med `PrismaAdapter`, altså
  database-sesjoner, så oppslaget er en `Session`-rad — samme sannhet som resten
  av appen bruker.

Ulemper, ærlig:

- MCP-kall deler event loop med UI-en. Irrelevant for en husstand med to
  brukere.
- Route Handlers får Web `Request`/`Response`, mens MCP-SDK-ens
  `StreamableHTTPServerTransport` er skrevet mot Node-ens `req`/`res`.
  `mcp-handler` (Vercels App Router-adapter) bygger bro over dette, og
  stateless JSON-modus er nok her. **Verifiser dette tidlig i oppgave 3** —
  hvis adapteren viser seg å være tungvint, er MCP-protokollflaten vi trenger
  liten (`initialize`, `tools/list`, `tools/call`, `ping`) og kan
  implementeres direkte som JSON-RPC over en Route Handler.
- `CLAUDE.md` sier «Server Actions for mutations, not API routes (unless
  there's a specific reason)». MCP er en slik grunn — eksterne klienter kan
  ikke kalle Server Actions. Verdt en linje i `CLAUDE.md`.

### 4.2 Alternativ B (reserve): sidecar i samme monorepo

Hvis A viser seg upraktisk: legg til `apps/mcp-server` i _dette_ repoet, som
importerer `@workspace/db` og snakker direkte med `home-overview-postgres`.
Ingen ny API-flate trengs, og siden NextAuth bruker database-sesjoner kan
sidecaren validere sesjonscookien ved å slå opp `sessionToken` i
`Session`-tabellen — uten å gå via web-appen.

Kostnaden er infrastrukturen: nytt image, ny GHCR-workflow, ny compose-tjeneste,
ny Caddy-blokk, ny DNS-record, ny watchtower-oppføring, og — viktigst —
NextAuth må konfigureres til å sette cookien på `.jenanos.xyz` for at
`home-mcp.jenanos.xyz` skal se sesjonen. Det siste er en endring i
produksjonsautentisering for hele appen, gjort utelukkende for MCP-ens skyld.
Derfor er A å foretrekke.

### 4.3 Alternativ C (avvist): utvid meals-mcp

Se punkt 3.1. Krever identitetsbro mellom to brukerregistre og gir ~60 verktøy
i én connector.

---

## 5. Skisse til verktøyflate

Ikke uttømmende — start med lesetilgang overalt, skriv der gevinsten er størst
(innkjøp og budsjett).

### Innkjøp
| Verktøy | Type |
| --- | --- |
| `list-shopping-lists` | les |
| `get-shopping-list` (med items, kategorier, alternativer) | les |
| `create-shopping-list` | skriv |
| `add-shopping-item` | skriv |
| `update-shopping-item` | skriv, idempotent |
| `set-item-purchased` (eksplisitt `purchased: boolean`) | skriv, idempotent |
| `delete-shopping-item` | skriv, destruktiv |
| `smart-add-shopping-items` (bulk + duplikatsjekk, jf. `bulkImportShoppingItemsWithDuplicates`) | skriv |
| `list-categories` / `create-category` | les / skriv |
| `add-product-alternative`, `set-preferred-alternative` | skriv |

Merk `set-item-purchased`: den eksisterende actionen `toggleItemPurchased`
(`lib/actions/shopping-item.ts:533`) utleder motsatt status ved hvert kall og
er derfor **ikke** idempotent. Retter en MCP-klient et kall etter timeout, blir
elementet satt tilbake. MCP-verktøyet må ta ønsket tilstand som parameter, ikke
vippe. Samme regel gjelder `select-task-vendor` og
`complete-progress-entry`: eksponer måltilstanden, ikke en veksling.

### Budsjett
| Verktøy | Type |
| --- | --- |
| `get-budget` (medlemmer, lån, reiser, kategorier, poster, beregnet oversikt) | les |
| `upsert-budget-entry`, `delete-budget-entry` | skriv |
| `upsert-budget-member`, `upsert-budget-loan`, `upsert-budget-trip` | skriv |
| `upsert-budget-category` | skriv |
| `set-tax-deduction-percent` | skriv, idempotent |

`get-budget` bør returnere de avledede tallene (netto inntekt, månedlig
lånekostnad — `lib/budget-loan.ts` har allerede logikken), ikke bare rådata.
Da slipper modellen å regne selv, og svarene blir konsistente med UI-et.

### Vedlikehold
`list-maintenance-tasks`, `get-maintenance-task`, `create-maintenance-task`,
`update-maintenance-task`, `add-task-vendor`, `select-task-vendor`,
`add-progress-entry`, `complete-progress-entry`.

### Hage
`list-plants`, `get-plant`, `create-plant`, `update-plant`.

### Bevisst utelatt
Alt i `admin.ts`, `removeMember`, `createShareLink`/`deactivateShareLink`,
`deleteHousehold`, og alle `replace*`-actionene (eller bak eksplisitt
bekreftelsesparameter).

---

## 6. Foreslått rekkefølge

| # | Oppgave | Resultat |
| --- | --- | --- |
| 1 | **Service-lag** — flytt forretningslogikk ut av `lib/actions/*` til `lib/core/*` som tar `{ userId, householdId }`. Actions blir tynne wrappere som gjør `requireHousehold()` + `revalidatePath()`. Start med `shopping-item` og `budget`. | Delt logikk, ingen funksjonell endring |
| 2 | **OAuth-datamodell** — Prisma-modeller `OAuthClient`, `OAuthAuthorizationCode`, `OAuthRefreshToken`, `OAuthPendingApproval`, `OAuthApproval` + migrasjon. Bruk `meal-planner/packages/database/prisma/schema.prisma:128-181` som utgangspunkt. | Persistent OAuth-tilstand |
| 3 | **MCP-endepunkt (skjelett)** — `app/api/mcp/route.ts` med ett lese-verktøy og midlertidig statisk bearer bak env-flagg. Verifiser her at Next.js-transporten fungerer (se 4.1). | Bevis på at transporten holder |
| 4 | **OAuth-autorisasjonsserver** — `/.well-known/*`, `/api/oauth/register`, `/api/oauth/authorize`, `/api/oauth/authorize/decision`, `/api/oauth/token`, `/api/oauth/revoke`. Port fra `meal-planner/apps/mcp-server/src/oauth/`, men med Prisma-lagring, `auth()` i stedet for `getSessionFromCookie`, **reelle scopes** og **revokering** (se under). Fjern det statiske tokenet fra oppgave 3. | Fungerende OAuth |
| 5 | **Innkjøpsverktøy** | Første reelle bruksområde |
| 6 | **Budsjettverktøy** med avledede tall | Den viktigste gevinsten |
| 7 | **Vedlikehold + hage** | Full dekning |
| 8 | **«Tilkoblede apper»-side** under `/settings` — viser aktive klienter og lar deg koble dem fra. UI over revokeringen fra oppgave 4. | Oversikt |
| 9 | **Rydd i LLM-import** — behold `replace*`-flyten for store engangsimporter, vurder å avvikle resten. | Mindre å vedlikeholde |
| 10 | **Tilbakeport til meal-planner** (valgfritt) — persistent OAuth-lagring med de ubrukte tabellene, så deploys ikke lenger kobler fra klientene. | Færre reautoriseringer |

Oppgave 1–4 er infrastruktur og kan gjøres uten at noe blir synlig for
brukeren. Etter oppgave 5 er MCP-en faktisk nyttig.

### Scopes og revokering hører til oppgave 4, ikke senere

To ting må være ferdige *før* det første skriveverktøyet fra oppgave 5 rulles ut:

- **Scopes må utstedes og håndheves.** Meal Planner annonserer `scope: "mcp"`
  uten å bruke det til noe, så en ren port ville gitt enhver autorisert klient
  full skrivetilgang uansett hva samtykkesiden viste. Definer minst
  `home:read` og `home:write`: `/oauth/authorize` må validere forespurt scope
  og vise det på samtykkesiden, `/oauth/token` må legge det i JWT-en, og
  `tools/call` må sjekke at et skriveverktøy har `home:write` i tokenet.
  Uten håndhevelse i verktøylaget er scopet bare pynt.
- **Revokering må finnes.** Refresh tokens lever i 30 dager. Uten
  `/api/oauth/revoke` (RFC 7009) og en måte å slette lagrede tokens på, kan et
  tapt eller kompromittert token verken stoppes eller utløpes bort mens det
  fortsatt leser og endrer husstandsdata. Selve endepunktet er lite arbeid når
  tokenene allerede ligger i Postgres — det er kun UI-et som kan vente til
  oppgave 8. Nødbrems i mellomtiden: bytte av
  `HOME_OVERVIEW_MCP_OAUTH_SIGNING_SECRET` invaliderer alle access tokens
  umiddelbart, men *ikke* refresh tokens, som ligger opakt i databasen.

---

## 7. Sikkerhetspunkter som må være på plass

1. **PKCE S256 påkrevd** — avvis `plain` og manglende `code_challenge`.
2. **Eksakt `redirect_uri`-match** mot registrerte URI-er.
3. **Eksplisitt samtykkeside** siden DCR er åpen. Samtykket må bindes til den
   innloggede sesjonen ved innsending, og request-tokenet må være engangsbruk.
4. **Grenser på registrering** — antall klienter, antall og lengde på
   redirect-URI-er, lengde på klientnavn.
5. **Rotasjon av refresh tokens**, med atomisk konsum.
6. **`Cache-Control: no-store`** på alt under `/api/oauth`.
7. **Husstandsavgrensning i hvert eneste verktøy** — aldri stol på en
   `householdId` som kommer inn som verktøyparameter; utled den alltid fra
   `userId` i tokenet.
8. **Private lister** — bruk `getVisibleShoppingListsWhere` også her.
9. **HTML-escaping** på samtykkesiden (klientnavn er brukerkontrollert via DCR).
10. **Egen signeringssecret** — ikke gjenbruk `HOME_OVERVIEW_AUTH_SECRET` til
    JWT-signering.
11. **Scopes håndhevet i verktøylaget** — et skriveverktøy må avvise et token
    uten `home:write`. Å bare annonsere scopet i discovery er ikke nok.
12. **Revokering på plass før første skriveverktøy** — se oppgave 4.

---

## 8. Oppsummert svar

| Spørsmål | Svar |
| --- | --- |
| Bør Home Overview ha MCP? | Ja. Gevinsten er større enn for Meal Planner, fordi budsjett og innkjøp er akkurat den typen arbeid der lesetilgang mangler i dag. |
| Er det kurant å jobbe slik? | Ja, etter et service-lags-refaktor. Server Actions kan ikke gjenbrukes direkte, men logikken kan. |
| Samme MCP-server for begge apper? | Nei. To brukerregistre, to databaser, ~60 verktøy i én connector, og felles blast radius. Kostnaden ved duplisert OAuth-kode er lavere. |
| Bør den ligge i `hetzner-infra`-stacken som egen tjeneste? | Nei — den bør ligge inne i Next.js-appen. Da endres ingenting i compose/Caddy/DNS, kun én ny secret. |

Detaljene på infrastruktursiden ligger i
`hetzner-infra/docs/plans/mcp-arkitektur-vurdering.md`.
