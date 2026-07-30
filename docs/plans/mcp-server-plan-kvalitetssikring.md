# Kvalitetssikring: MCP-server-implementasjonsplan

Dato: 2026-07-30
Gjelder: `docs/plans/mcp-server-implementasjonsplan.md`

## 1. Samlet vurdering

Planen er solid på det den handler mest om: OAuth-flyt, tokenlivsløp,
scope-håndheving, husstandsisolasjon og verktøydesign. Sikkerhetsavsnittene er
konkrete og kravsformulerte, ikke ønskelister, og avgrensningene i kapittel 1 er
riktige — ingen delingslenker, ingen administratoroperasjoner, ingen full
erstatning.

Svakheten er ikke i sikkerhetsmodellen, men i møtet med koden som finnes i dag.
Planen beskriver hva som skal bygges, men undervurderer tilstanden den bygger
oppå på fire punkter: testinfrastrukturen, budsjettberegningen,
serialiseringsformatet for penger, og et knippe udefinerte datamodell-kontrakter.
Fasene ser derfor mindre ut enn de er, og flere akseptansekriterier er ikke
gjennomførbare med dagens oppsett.

Alle funn nedenfor er verifisert mot kodebasen. Ingen av dem er feil *i* planen —
det er utelatelser og antakelser som bør avklares før Fase 0 avsluttes.

## 2. Høy konsekvens

### H1 — Testrammeverket finnes, men ingenting kjører det

Planen forutsetter gjennomgående «grønne tester» i akseptansekriteriene, og
kapittel 19 krever at «automatiske tester ... passerer».

Faktisk tilstand:

- Vitest **er** konfigurert: `vitest` 4.1.5 i `apps/web/package.json`, med
  `"test": "vitest run"`.
- Det finnes fire testfiler: `apps/web/middleware.test.ts`,
  `apps/web/lib/dashboard-stats.test.ts`,
  `apps/web/lib/shopping-list-access.test.ts`,
  `apps/web/lib/shopping-list-pricing.test.ts`.
- Men: `turbo.json` har **ingen** `test`-task, rot-`package.json` har **ingen**
  `test`-script, og `.github/workflows/build-push.yml` kjører **bare** docker
  build — ingen lint, ingen typecheck, ingen tester.

Konsekvens: «grønne tester» er ikke håndhevbart, og en regresjon i for eksempel
`isPublicPathname` (som §4.3 eksplisitt vil beskytte med tester) vil ikke bli
fanget av noe.

Foreslått endring: Fase 0 får en eksplisitt oppgave om å legge til `test` i
`turbo.json`, et `test`-script i rot-`package.json`, og et CI-steg som kjører
lint, typecheck og test. Merk også at `CLAUDE.md` sier «No test framework is
configured yet» — det er utdatert og bør rettes samtidig.

### H2 — Integrasjonstestene i §14.2 har ingen kjøremiljø

§14.2 krever samtidighetstester mot PostgreSQL: engangskonsum av
autorisasjonskoder, atomisk refresh-rotasjon, reuse-deteksjon, migrasjon mot
database med eksisterende data. Fase 2s akseptansekriterium er «samtidighetstester
beviser engangskonsum».

Faktisk tilstand: `docker-compose.yml` har én enkelt dev-database (postgres:16,
port 5435). Det finnes ingen testdatabase-service, ingen `globalSetup` i vitest,
og `packages/db` har ikke noe `test`-script i det hele tatt.

Foreslått endring: planen må spesifisere hvor disse testene bor (`packages/db` vs
`apps/web`), at de kjører mot en separat database eller et separat schema, hvordan
migrasjoner påføres før kjøring, og at CI trenger en `services: postgres`-blokk.
Uten dette er Fase 2 ikke avsluttbar etter sine egne kriterier.

### H3 — Budsjettberegningen ligger i en klientkomponent, i to divergerende utgaver

§10.2 krever at `get-budget-summary` «skal bruke samme beregningsfunksjoner og
avrunding som UI-et», og Fase 6 krever «én beregningsimplementasjon i UI og MCP».

Faktisk tilstand — det finnes to uavhengige implementasjoner, og ingen av dem er
gjenbrukbar som den står:

1. `apps/web/app/(app)/budsjett/budget-view.tsx` er `"use client"` og beregner
   nettoinntekt, lånerente/-avdrag/-gebyr, reisekostnader, rentefradrag og
   disponibelt beløp i en `useMemo` (ca. linje 161–230).
2. `apps/web/lib/dashboard-stats.ts:93` `calculateBudgetStats()` beregner et
   *annet* sett: `totalGrossIncome`, `totalNetIncome`, `totalLoanPayments`,
   `totalExpenses`, `totalDeductions` — **uten reiser, uten rentefradrag**, og
   uten «disponibelt beløp» i det hele tatt.
3. Bare `calculateLoanMonthlyAmounts` (`apps/web/lib/budget-loan.ts`) er faktisk
   delt mellom de to.

Feltene planen lister for `get-budget-summary` (nettoinntekt, utgifter, fradrag,
lånekostnad, disponibelt beløp) matcher dermed *ingen* eksisterende funksjon
fullstendig. «Sentraliser budsjettberegninger» i Fase 1 er altså ikke en flytting,
men en sammenslåing av to formler pluss et uttrekk fra en klientkomponent.

Foreslått endring: gjør dette til en navngitt oppgave i Fase 1, med (a) eksplisitt
beslutning om hvilken formel som er normativ, og (b) en karakteriseringstest som
låser dagens tall fra `budget-view.tsx` **før** flyttingen. Ellers risikerer man å
oppdage avviket først når MCP og UI viser ulike beløp.

### H4 — Pengeformat: desimalstrenger vs. float-beregning

§3.2 anbefaler at «pengebeløp bør returneres som desimalstrenger for å unngå binær
avrunding», samtidig som §10.2 krever samme avrunding som UI-et.

Faktisk tilstand: all aggregering skjer i JS-`number` i dag.
`apps/web/app/(app)/budsjett/page.tsx` konverterer med `toNumber(...)` før
beregning, og `dashboard-stats.ts` har sin egen `toNumber(value) => Number(value)`.
Prisma-`Decimal` forlater altså domenet før noe summeres.

De to kravene kan derfor ikke oppfylles samtidig uten en beslutning. Foreslått
formulering i planen: **lagrede** beløp serialiseres som desimalstrenger direkte
fra `Decimal`, mens **beregnede** aggregater dokumenteres som float-derivert med
definert avrunding — eller beregningen flyttes til `Decimal`, som er en betydelig
større endring og i så fall bør ha egen oppgave.

### H5 — `Budget` er valgfri per husstand, og verktøyene mangler definert oppførsel

`Household.budget` er `Budget?` i schemaet, og `ensureBudget()`
(`apps/web/lib/actions/budget.ts:203`) oppretter raden med `upsert` når webflyten
trenger den. `calculateBudgetStats` returnerer i dag `{ hasBudget: false }` når
budsjettet ikke finnes.

Planen sier ikke hva `get-budget-summary` skal gjøre for en husstand uten
budsjett — `NOT_FOUND`, tom oppsummering, eller `hasBudget: false` — og heller ikke
om `upsert-budget-*` implisitt får opprette budsjettraden. Dette er en
kontraktbeslutning som hører i planen, ikke i implementasjonen.

### H6 — Private lister uten eier er usynlige for alle

`ShoppingList.createdById` er nullbar med `onDelete: SetNull`.
`getVisibleShoppingListsWhere` (`apps/web/lib/shopping-list-access.ts`) filtrerer
med `OR: [{ isPrivate: false }, { createdById: userId }]`, så en privat liste der
oppretteren er slettet blir utilgjengelig for **alle**.
`canManageShoppingListPrivacy` har allerede en særregel for `createdById === null`,
så tilstanden er kjent i koden, men ikke i planen.

Samtidig sier §6 at «alle relasjoner til `User` skal slettes eller revokeres ved
sletting av brukeren». Det stemmer ikke for denne relasjonen — den er `SetNull`
ved design.

Foreslått endring: presiser i §6 at kravet gjelder de nye OAuth-tabellene, ikke
eksisterende app-relasjoner, og definer i §7 hva MCP gjør med foreldreløse private
lister (sannsynligvis: samme «ikke funnet» som ellers).

### H7 — Kontekstoppslaget returnerer fulle `User`-rader

`getUserHousehold()` (`apps/web/lib/session.ts:15`) gjør
`include: { household: { include: { members: { include: { user: true } } } } }` —
altså hele `User`-raden for alle husstandsmedlemmer, inkludert `email`, `isAdmin`
og `image`.

§9.1 sier at interne felt aldri returneres, men hvis `ApplicationContext`-oppbygging
eller lese-tjenestene gjenbruker denne spørringen, ligger persondata allerede i
objektgrafen. Det samme gjelder `ShoppingItem.assignedTo` (bruker-relasjon) og
`BudgetMember.name` (personnavn i sensitiv kontekst).

Foreslått endring: planen bør kreve (i) en egen, minimal kontekstspørring for MCP
som bare henter `userId`, `householdId` og eventuelt `role`, og (ii) hvitelistet
projeksjon av alle brukerfelt i verktøysvar — ikke bare et forbud mot å returnere
Prisma-objekter.

## 3. Middels konsekvens

### M1 — `requireHousehold()` har allerede `findFirst`-problemet, og kaller `redirect()`

§7 punkt 4 forbyr at husstanden avgjøres «med et uordnet `findFirst`». Det er
nøyaktig det `getUserHousehold()` gjør i dag (`apps/web/lib/session.ts:15`).
Planen bør si eksplisitt at denne endres til å feile lukket i samme fase (Fase 1),
ellers får web og MCP forskjellig regel for samme tilstand.

I tillegg: `requireHousehold()` kaller `redirect()` fra `next/navigation`. §8.1
lister `next/headers`, `next/cache`, MCP-SDK og React som forbudte imports i
`application` — **`next/navigation` mangler i listen**. Uten det kan en
`NEXT_REDIRECT`-throw bobles ut gjennom MCP-ruten som en uforståelig feil.

### M2 — Omfanget av check-then-act-refaktoreringen er større enn planen antyder

§7 er riktig i at `update({ where: { id } })` etterfulgt av separat eierskapssjekk
ikke holder. Mønsteret finnes i minst 13 funksjoner: `budget.ts` (6),
`shopping-list.ts` (3), `plant.ts` (2), `admin.ts` (1), `share-link.ts` (1). Se
for eksempel `upsertBudgetMember` (`lib/actions/budget.ts:237`), som gjør
`findUnique({ where: { id } })`, sammenligner `budgetId`, og deretter oppdaterer
på `id` alene.

Totalt finnes 66 eksporterte server actions fordelt på 11 filer. Fasene 1, 5, 6 og
7 må hver konvertere sin del av disse. Planen bør tallfeste dette, ellers ser
fasene mindre ut enn de er.

### M3 — Eksisterende LLM-importflyter er allerede halve verktøyflaten

Fase 8 sier «evaluer om manuelle LLM-importflyter fortsatt skal beholdes». Men de
flytene inneholder allerede mønstre planen foreslår å bygge fra grunnen av:

- `bulkImportMaintenanceTasks`, `findExistingMaintenanceTasks` (duplikatdeteksjon
  på lowercased tittel), `applyTaskUpdates`, `bulkImportMaintenanceTasksWithDuplicates`
  i `lib/actions/maintenance-task.ts`
- `bulkImportBudget`, `bulkImportBudgetWithDuplicates`, `findExistingBudgetItems`
  i `lib/actions/budget.ts`
- `formatDateToIsoDate` som normativ leseside for datoer

§10.4 foreslår `add-shopping-items` «med duplikatforhåndsvisning og begrenset
batch» — det mønsteret finnes altså i produksjon for to andre domener. Planen bør
referere til disse som utgangspunkt for verktøykontraktene i stedet for å behandle
dem som noe som skal evalueres helt til slutt.

Merk samtidig en konflikt: `bulkImportMaintenanceTasks` faller stille tilbake til
`MEDIUM` ved ukjent `priority` (`priority.toUpperCase()` mot et `Set`), mens §9.1
krever eksplisitt validering av enumverdier. Planen bør si hvilken oppførsel som
gjelder etter uttrekket.

### M4 — `replaceBudget()` finnes og må eksplisitt holdes utenfor MCP-tjenestelaget

`lib/actions/budget.ts:711`. §10.4 forbyr «full `replace` av ... budsjett» ✓, men
Fase 6 trekker write-services ut av nettopp denne filen. Planen bør si at
`replaceBudget` beholdes som ren action og ikke flyttes til `application/budget`,
eller at tjenestefunksjonen den bygger på aldri registreres i verktøyregisteret.
Ellers er forbudet avhengig av at ingen registrerer den ved en feil.

### M5 — Eksisterende bulk-actions har ingen størrelsesgrense

`bulkImportMaintenanceTasks` mapper `input.tasks` direkte inn i `db.$transaction(...)`
uten lengdesjekk; det samme gjelder `bulkImportBudget`. §9.1 og §11 punkt 11 krever
grenser på liste- og pagineringsinput.

Poenget for planen: grensen må ligge i **tjenestelaget**, ikke bare i
MCP-adapteren. Ligger den bare i adapteren, gjelder den ikke for webflyten, og de
to lagene får ulik kontrakt for samme operasjon.

### M6 — `dueDate` er `DateTime`, og tidssonekonverteringen er udefinert

`ShoppingItem.dueDate`, `MaintenanceTask.dueDate` og `TaskProgressEntry.dueDate` er
alle `DateTime?`. Eksisterende kode gjør `new Date(task.dueDate)` fra en
`YYYY-MM-DD`-streng (`maintenance-task.ts:371`, `:607`), som gir midnatt **UTC**,
og leser tilbake med `formatDateToIsoDate`.

§3.2 sier at kalenderdatoer «bør være `YYYY-MM-DD`», men ikke hvilken tidssone
konverteringen bruker. Med Europe/Oslo (UTC+1/+2) kan en dato skifte dag mellom
skriving og visning. Planen bør fastsette konverteringsregelen eksplisitt og peke
på `formatDateToIsoDate` som normativ leseside.

### M7 — «Migrasjonen som stopper på duplikater» må spesifiseres som SQL

§3.2 krever at migrasjonen «først finner og stopper på eksisterende duplikater»
før unik constraint på `userId`.

`HouseholdMember` har sammensatt primærnøkkel `@@id([userId, householdId])` og
ingen egen `id`-kolonne. En unik constraint på `userId` alene er mulig, men
Prisma-migrasjoner er ren SQL — en «stopp ved duplikater»-oppførsel krever en
eksplisitt guard (for eksempel `DO $$ ... RAISE EXCEPTION ... $$`) før
`CREATE UNIQUE INDEX`. Uten det blir migrasjonen enten uten guard eller manuell.

Verdt å notere i samme avsnitt: unik `userId` gjør `HouseholdMember` de facto 1:1
med `User`, som er en produktbeslutning og ikke bare en teknisk constraint.

## 4. Mindre presiseringer

- **L1 — ingen konfigurasjonsmodul finnes.** Hele kodebasen har tre
  `process.env`-oppslag (`ADMIN_EMAIL`, `EMAIL_FROM`, `RESEND_API_KEY`), uten
  validering. §3.3s «mangler MCP-konfigurasjon → `503`» trenger et sted å bo;
  planen bør navngi en modul (f.eks. `apps/web/lib/mcp/config.ts`) og kreve at den
  valideres én gang ved oppstart, ikke per forespørsel.
- **L2 — `/api/oauth` som offentlig prefiks matcher for bredt.**
  `isPublicPathname` bruker `startsWith`, så `/api/oauth` ville også slippe gjennom
  `/api/oauthfoo`. Bruk `/api/oauth/` eller eksakt matching. §4.3 krever tester for
  dette — de hører naturlig i eksisterende `apps/web/middleware.test.ts`.
- **L3 — cache-headere og rate limiting finnes ikke i dag.** Søk etter
  `Cache-Control` og `rateLimit` i `apps/web` gir null treff. §11 punkt 12–13 er
  altså ny infrastruktur, ikke tilpasning. Fase 3 nevner rate limiting for
  OAuth-endepunktene; Fase 4 bør gjenta at `/api/mcp` også dekkes.
- **L4 — runtime-erklæring.** Ingen `export const runtime` finnes noe sted i dag;
  eneste API-rute er `app/api/auth/[...nextauth]/route.ts`. §3.1 punkt 6 er riktig,
  men bør formuleres som en konkret, sjekkbar regel: «hver ny rute eksporterer
  `export const runtime = "nodejs"`».
- **L5 — Auth.js er beta og pinnet.** `next-auth 5.0.0-beta.30` med `@auth/core`
  pinnet til `0.41.1` i `pnpm.overrides`, og en TODO i `lib/auth.ts` om
  oppgradering til stabil v5. Samtykkeflyten (§5.1 punkt 4) er avhengig av `auth()`.
  Planen bør nevne dette som en risiko og la Fase 3-testene dekke flyten, slik at
  en senere oppgradering ikke stille bryter OAuth-samtykket.
- **L6 — produksjonsoppsettet kan ikke verifiseres herfra.** `docker-compose.yml` i
  repoet er bare dev-databasen; Caddy-konfigurasjon og prod-compose ligger utenfor.
  §16 og §17 er dermed ikke etterprøvbare i denne kodebasen — verdt en setning i
  planen om hvor den konfigurasjonen bor.

## 5. Det planen får riktig

Kontrollert mot schemaet og bekreftet:

- Ingen valutafelt finnes — §3.2s NOK-antakelse er korrekt.
- Middleware-beskrivelsen i §4.3 stemmer presist, og `matcher` fanger faktisk
  `/api/mcp` og `/.well-known`, så tilføyelsen er nødvendig.
- Barneressurs-hierarkiet i §7 stemmer: `Budget.householdId` er `@unique`, så
  budsjettbarn avgrenses korrekt via budsjett → husstand.
- SSRF-avsnittet (§11 punkt 17) peker på felt som faktisk finnes: `ShoppingItem.url`,
  `imageUrl`, `ProductAlternative.url`, `Plant.sourceUrl`, `imageUrl`,
  `TaskVendor.website`.
- Scope-tabellen dekker nøyaktig de fire domenene som finnes i schemaet.
- Avgrensningen mot `ShareLink`, `isAdmin` og medlemsadministrasjon er konsistent
  med hva som faktisk er eksponert i appen i dag.
- Advarselen mot `findFirst` og mot check-then-act er ikke teoretisk — begge
  mønstrene finnes i koden nå.

## 6. Anbefalt rekkefølge for oppfølging

1. Avklar H1 og H2 før Fase 0 lukkes — uten dem er ingen senere
   akseptansekriterier håndhevbare.
2. Avklar H3, H4 og H5 som kontraktbeslutninger i Fase 0, ikke i Fase 6.
   Budsjettformelen er den største tekniske usikkerheten i planen.
3. Ta H6, H7, M1 og M6 inn som presiseringer i kapittel 3, 6, 7 og 8.
4. Tallfest M2 i faseplanen, og legg M3–M5 inn som eksplisitte oppgaver i Fase 5
   og 6.
5. L1–L6 kan gå inn som redaksjonelle presiseringer uten å endre faseinndelingen.
