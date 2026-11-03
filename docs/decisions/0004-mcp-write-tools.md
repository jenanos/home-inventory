# ADR 0004: MCP fase 5–8 – skriveverktøy, revisjon og utrulling

- Status: Akseptert
- Dato: 2026-11-03
- Omfang: Fase 5–8 i `docs/plans/mcp-server-implementasjonsplan.md`
- Bygger på: [ADR 0001](0001-mcp-phase-0-contracts.md),
  [ADR 0003](0003-mcp-read-only-tool-surface.md)

## Kontekst

Fase 4 ga en read-only MCP-server. Resten av planen handler om å la klienter
endre husstandsdata gjennom samme tjenestelag som webappen, uten at MCP blir en
mindre sikker vei inn i databasen.

Planen ble skrevet i juli 2026. Ved gjennomgang mot koden i november viste den
seg å være riktig i retning, men den undervurderte hvor mye av eksisterende
mutasjonskode som hadde reelle tilgangsfeil, og den foreslo noe maskineri
(preview-ID-er, idempotensnøkler, en lang liste enkeltverktøy) som ikke trengs.
Avvikene fra planen står samlet nederst.

## Beslutninger

### Skrivetjenester med autorisasjon i selve spørringen

Hvert domene har `lib/application/<domene>/write.ts`. Tjenestene tar en
`ApplicationContext` og validerer alt selv — tekstlengder, beløp, intervaller,
URL-er og enumverdier — fordi Server Actions er offentlige endepunkter der
TypeScript-typene ikke er noen garanti.

Eierskap er en del av `where` i selve skrivingen, ikke en sjekk før den:

```ts
db.plant.update({ where: { id, householdId: context.householdId }, data })
db.taskVendor.update({ where: { id, task: { householdId } }, data })
db.shoppingItem.update({
  where: { id, list: getVisibleShoppingListsWhere(householdId, userId) },
  data,
})
```

`scopedWrite` i `lib/application/mutations.ts` oversetter Prismas `P2025` til
`NOT_FOUND`. Ukjent ID, ressurs i en annen husstand og en annen brukers private
liste gir derfor samme svar. Referanser til andre ressurser (kategori, alternativ,
leverandør, budsjettkategori) valideres mot samme grense før de lagres.

Webappens Server Actions er nå tynne adaptere: de henter konteksten med
`requireHousehold()`, kaller tjenesten og revaliderer sider. Web og MCP har
dermed én kontrakt per operasjon.

### Tilgangsfeil funnet og rettet underveis

Gjennomgangen fant feil i eksisterende kode som var verre enn det
check-then-act-mønsteret planen pekte på:

| Sted | Feil |
| ---- | ---- |
| `bulkImportShoppingItemsWithDuplicates` | `updates[].id` ble oppdatert uten å sjekke liste eller husstand |
| `bulkImportBudgetWithDuplicates` | medlems-, låne-, reise- og post-ID-er ble oppdatert uten å sjekke budsjett — andre husstanders budsjett kunne endres |
| `reorderAlternatives`, `setPreferredAlternative` | alternativ-ID-er ble ikke sjekket mot varen |
| `product-alternative.ts` generelt | sjekket bare husstand, ikke privatliste-regelen |
| `updateShoppingItem` | nullstilte `purchasedAt` når status ikke var oppgitt |
| `updateProgressEntry` | satte ny `completedAt` ved hvert kall med `completed: true` |
| `createShoppingItem`, `updateShoppingItem`, LLM-import | `categoryId`, `assignedToId` og `categoryMap` ble ikke sjekket mot husstanden |
| Duplikatimport for innkjøp og vedlikehold | nye rader og oppdateringer kjørte i hver sin transaksjon, så en feilet oppdatering etterlot halve importen |
| Budsjettimport og `replaceBudget` | feilet med «Budget not found» for en husstand uten budsjett |
| `createProgressEntry` | nye punkter fikk `sortOrder` 0 i stedet for å havne sist |
| `deleteUser` | feilet for alle som eide en privat liste (se under) |

Alle er rettet i tjenestelaget og dekket av integrasjonstester mot PostgreSQL.

### Verktøyflaten

Skriveverktøyene ligger i `lib/mcp/tools/<domene>-write.ts` og bruker
`defineWriteTool`. Hvert verktøy returnerer den lagrede ressursen i samme
hvitelistede form som leseverktøyene, ikke `{ ok: true }`.

Annotasjoner:

- `create-*`/`add-*`: `destructiveHint: false`, `idempotentHint: false`
- `update-*`/`set-*`: `destructiveHint: true` (de overskriver verdier, så
  klienten kan be om bekreftelse) og `idempotentHint: true` (de setter en
  eksplisitt sluttilstand)

Alle oppdateringer tar valgfri `expectedUpdatedAt`. Er ressursen endret siden
klienten leste den, svarer tjenesten `CONFLICT` i stedet for å overskrive.

28 skriveverktøy, låst av `write-tools.test.ts`:

| Domene | Verktøy |
| ------ | ------- |
| Innkjøp | `create-shopping-list`, `update-shopping-list`, `add-shopping-items`, `update-shopping-item`, `set-shopping-item-status`, `add-product-alternative`, `update-product-alternative`, `set-preferred-alternative` |
| Budsjett | `create-`/`update-budget-entry`, `-category`, `-member`, `-loan`, `-trip`, og `set-tax-deduction-percent` |
| Vedlikehold | `create-maintenance-task`, `update-maintenance-task`, `add-task-vendor`, `update-task-vendor`, `set-selected-vendor`, `add-progress-entry`, `update-progress-entry` |
| Hage | `create-plant`, `update-plant` |

Domenespesifikke valg:

- **Innkjøp.** `add-shopping-items` tar 1–100 varer og oppdager duplikater uten
  hensyn til store og små bokstaver, både mot listen og innad i kallet.
  `onDuplicate` er `skip` som standard, og hoppede varer rapporteres med ID-en
  til den eksisterende varen. `set-shopping-item-status` er transaksjonell: er én
  vare usynlig, endres ingen. `purchasedAt` settes bare ved overgang til
  `PURCHASED`. Personvern og deling er holdt utenfor MCP: `update-shopping-list`
  kan ikke endre `isPrivate`, fordi å gjøre en liste offentlig eksponerer den for
  husstanden, og `assignedTo` er verken lesbart eller skrivbart.
- **Budsjett.** Hvert verktøy tar `dryRun`. Endringen kjøres i en transaksjon,
  sammendraget beregnes på nytt med samme beregning som webappen, og ved
  `dryRun: true` rulles alt tilbake. Svaret har alltid `summaryBefore` og
  `summaryAfter` i samme form som `get-budget-summary`. Revisjonsloggen skiller
  en forhåndsvisning (`dry_run`) fra en lagret endring (`success`). Mangler
  husstanden et budsjett, opprettes det med standardkategorier ved første
  ekte skriving, men ikke ved en dry run.
- **Vedlikehold.** `set-selected-vendor` tar `vendorId` eller `null` og er
  transaksjonell. `update-progress-entry` tar `completed` som sluttilstand;
  `completedAt` settes bare ved første fullføring og beholdes ved gjentak.
- **Hage.** Vanning og beskjæring registreres med `update-plant`
  (`lastWateredAt`, `lastPrunedAt`). Det trengs ikke egne verktøy.

Alle leseverktøy returnerer nå `updatedAt` også for barnerader (alternativer,
leverandører, fremdriftspunkter og budsjettrader). Uten det kunne ikke en klient
bruke `expectedUpdatedAt` etter en lesing.

### LLM-importflytene i webappen

Duplikatimporten for de fire domenene er flyttet til
`lib/application/<domene>/import.ts`, og alle oppdateringer er avgrenset til
husstanden (for innkjøp: den synlige listen). Én fremmed ID stopper hele
importen, og ny-opprettelse og oppdateringer kjører i samme transaksjon.

Tolkningen av innlimt tekst er fortsatt tolerant der den alltid har vært det,
og det er et bevisst valg: forhåndsvisningen i UI-et viser brukeren hva som blir
lagret, og én dårlig verdi skal ikke stoppe en import av femti varer. For
vedlikehold normaliserer parseren prioritet før forhåndsvisningen, så serveren
avviser nå ukjente prioriteter i stedet for å falle tilbake til `MEDIUM`.
MCP-verktøyene og enkeltoperasjonene på web er alltid strenge.

### Ingen sletteverktøy, ingen full erstatning

Første skriveversjon har ingen `delete-*`-verktøy. Innkjøp har statusen
`SKIPPED` for «ikke lenger aktuelt», og de andre domenene har ennå ikke vist et
behov. Sletting vurderes per domene når bruken viser at det trengs (plan 9.3).

Full erstatning er strukturelt unåbar: `replaceShoppingItems`, `replaceBudget`,
`replaceMaintenanceTasks` og `replacePlants` ligger igjen som Server Actions
utenfor `lib/application/`. Planen nevnte bare de to første; de to siste er
like destruktive. `write-tools.test.ts` feiler hvis et verktøy med `replace`,
`delete`, `share`, `admin` eller `household` i navnet registreres.

### Felles grenser

- Maks 100 elementer per batch, håndhevet i tjenestelaget for både web og MCP
  (`MAX_BATCH_SIZE`). Det gjelder også LLM-importflytene i webappen.
- URL-er må være absolutte `http(s)`. Enkeltoperasjoner avviser en ugyldig URL
  med `VALIDATION_ERROR` i stedet for å forkaste den stille. LLM-importen
  beholder den tolerante oppførselen (`lenientUrl`), fordi én dårlig URL i
  innlimt tekst ikke skal stoppe hele importen.
- Ukjente enumverdier avvises i tjenestelaget. Ingen stille fallback.

### Revisjonslogg

Tabellen `McpAuditEvent` får én rad per skriveforsøk som passerte scope-sjekken:
tidspunkt, bruker, husstand, klient, verktøy, ressurstype og -ID, utfall,
korrelasjons-ID og varighet. Den inneholder aldri input, før/etter-kopier eller
fritekst.

- Korrelasjons-ID-en er den samme som i `mcp.request`-loggen og
  `X-Correlation-Id`, så en rad kan følges til logglinjen.
- En feilet revisjonsskriving logges, men feiler ikke verktøykallet: mutasjonen
  er allerede committet, og å svare med feil ville vært feil informasjon.
- Radene slettes etter 180 dager, og kaskaderer med bruker og husstand.
- Brukeren ser de fem siste endringene per klient under Innstillinger →
  «Tilkoblede apper».

Lesekall revideres ikke. De er allerede dekket av forespørselsloggen.

### Skrivedomener slås på ett om gangen

`HOME_OVERVIEW_MCP_WRITE_DOMAINS` styrer hvilke domener som tar imot skriving,
som en kommaseparert liste (`shopping,garden`) eller `all`. **Standard er
ingen.** Planens deployrekkefølge (kapittel 16 punkt 5–6) forutsetter at
skriving aktiveres ett domene av gangen; uten en bryter ville alle
skriveverktøy blitt tilgjengelige i samme øyeblikk som koden ble deployet.

Bryteren håndheves tre steder:

1. Discovery annonserer bare tilgjengelige scopes i `scopes_supported`.
2. Authorize dropper write-scopes som ikke tilbys, i stedet for å avvise hele
   forespørselen (RFC 6749 3.3 tillater å gi mindre enn det som ble bedt om).
3. MCP-ruten fjerner dem fra hvert token ved bruk. Å slå av et domene virker
   dermed umiddelbart, også for grants som ble godkjent mens det var på. En
   godkjent `*:write` beholder lesetilgangen den impliserer.

Et ukjent domenenavn gjør konfigurasjonen ugyldig (`503`), slik at en skrivefeil
merkes i stedet for å la et domene stå av i det stille. `get-server-info`
rapporterer `writableDomains`.

### Brukersletting

`deleteUser` feilet for alle som eide en privat handleliste. Grunnen er at
check-constrainten `NOT "isPrivate" OR "createdById" IS NOT NULL` kolliderer med
`ON DELETE SET NULL`. Beslutning: **den slettede brukerens private lister
slettes sammen med brukeren**, i én transaksjon (`lib/application/users/delete.ts`).
Ingen andre kan se dem, så å overføre dem eller gjøre dem offentlige ville begge
eksponert data brukeren valgte å holde privat. Felles lister beholdes uten
oppretter. Administratoren får beskjed i bekreftelsesdialogen.

### Opprydding

`cleanupExpiredRows` fantes fra fase 2, men ble aldri kalt. Den kjøres nå fra
Next.js `instrumentation.ts`: ett minutt etter oppstart og deretter hver sjette
time, sammen med sletting av gamle revisjonsrader. Konsumerte refresh tokens
beholdes i en hel refresh-token-levetid, fordi reuse-deteksjonen trenger raden
for å kjenne igjen et gjenbrukt token. Jobben er bare for plassbruk; alle utløp
håndheves også ved lesing.

### SDK og protokoll

Nyeste `@modelcontextprotocol/sdk` 1.x (1.32.2 per 2026-11-03) annonserer
fortsatt `2025-11-25` som siste protokollversjon. Protokollvalget i ADR 0001
står derfor ved lag.

SDK-en er oppgradert fra 1.29.0 til 1.32.2, fortsatt eksakt låst. Typesjekk,
alle tester og produksjonsbygg passerer uendret. SDK 2.x og protokollversjonen
etter `2025-11-25` tas inn når de er stabile og en målklient bruker dem.

## Avvik fra implementasjonsplanen

| Plan | Valgt | Hvorfor |
| ---- | ----- | ------- |
| `preview-budget-changes` + `apply-budget-changes` med preview-ID | `dryRun` på hvert budsjettverktøy | Samme kode kjører i en transaksjon som rulles tilbake, så forhåndsvisningen kan ikke avvike fra den ekte skrivingen, og ingen preview-tilstand må lagres eller utløpe |
| `upsert-*` for budsjett | separate `create-*` og `update-*` | Planen tvilte selv: en utelatt ID skal aldri gi et duplikat |
| `add-shopping-item` + senere `add-shopping-items` | bare `add-shopping-items` (1–100) | Ett verktøy med duplikathåndtering dekker begge |
| `set-shopping-item-status` for én vare | tar en liste med vare-ID-er | «Merk disse som kjøpt» er det vanlige tilfellet; kallet er transaksjonelt |
| `set-progress-entry-completed` | `completed` i `update-progress-entry` | Feltet er allerede en eksplisitt sluttilstand |
| Valgfri idempotensnøkkel for create | ikke innført | Ingen målklient er observert å gjenta kall etter timeout; vurderes ved behov |
| Konvertere check-then-act i 13 funksjoner | alle mutasjoner er flyttet til tjenester med eierskap i `where` | Konverteringen ble gjort der koden uansett ble flyttet, i stedet for som egen opprydding |
| Fase 8: last- og misbrukstest, dashboards | ikke gjort i koden | Krever produksjonsmiljøet; står som driftsoppgaver i runbooken |
