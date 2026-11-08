# ADR 0005: Generelle innkjøp og MCP i stedet for LLM-import

- Status: Akseptert
- Dato: 2026-11-08
- Bygger på: [ADR 0004](0004-mcp-write-tools.md)

## Kontekst

Innkjøpsdelen ble laget før en husovertakelse. Varene hadde en «fase» knyttet
til flyttingen (`BEFORE_MOVE`, `FIRST_WEEK`, `CAN_WAIT`, `NO_RUSH`), og
listesiden hadde en LLM-import der brukeren kopierte en prompt til en
chat-assistent og limte JSON-svaret tilbake.

Nå er huset overtatt. Innflyttingsfasene gir ikke mening lenger, og MCP-serveren
lar en assistent lese og endre listene direkte. Det gjør kopier-og-lim-flyten
overflødig.

## Beslutninger

### Fase blir tidshorisont

`Phase` er erstattet av `Timeframe` og kolonnen `phase` heter nå `timeframe`.
Migreringen `20261108120000_generalize_shopping_timeframe` gir enumtypen og
verdiene nytt navn på stedet, så eksisterende data beholdes:

| Før | Etter | Visning |
| --- | ----- | ------- |
| `BEFORE_MOVE` | `NOW` | Snarest |
| `FIRST_WEEK` | `SOON` | Snart |
| `CAN_WAIT` | `LATER` | Kan vente |
| `NO_RUSH` | `SOMEDAY` | Ingen hast |

Prioritet sier hvor viktig noe er, tidshorisont når det trengs, og `dueDate`
brukes bare for en reell frist. Etikettene ligger i `lib/shopping-timeframe.ts`
og brukes av listesiden, dashbordet og delte lister. URL-filteret på listesiden
heter `timeframe`.

MCP-kontrakten endres tilsvarende: `phase` er erstattet av `timeframe` i både
input og output. Det er en brytende endring, men klientene leser skjemaet ved
hver tilkobling, og det finnes ingen lagrede integrasjoner mot feltet.

### LLM-importen for innkjøp er fjernet

Siden `/lists/[id]/llm-import`, `lib/application/shopping/import.ts` og
Server Actions `bulkCreateShoppingItems`, `findExistingShoppingItems`,
`bulkImportShoppingItemsWithDuplicates` og `replaceShoppingItems` er slettet.
Det samme gjelder integrasjonstestene for dem.

LLM-importen for budsjett, vedlikehold og hage er ikke berørt.

Veiledningen som sto i prompten (én vare per behov, konkrete produkter som
alternativer, rene URL-er, priser i NOK) ligger nå i MCP-serverens
`instructions` og i verktøybeskrivelsene, så assistenten får den uten at
brukeren limer inn noe.

### Utvidet MCP-flate for innkjøp

Målet er at alt man gjør med en innkjøpsliste i det daglige kan gjøres fra en
assistent. Nye verktøy:

| Verktøy | Type | Merknad |
| ------- | ---- | ------- |
| `search-shopping-items` | les | Søk på tvers av synlige lister etter tekst, liste, status, prioritet, tidshorisont og kategori |
| `move-shopping-items` | oppdater | Flytter varer med alternativer til en annen synlig liste. Står varen allerede der, blir den stående |
| `reorder-product-alternatives` | oppdater | Full rekkefølge; ID-ene må være nøyaktig varens alternativer |
| `delete-product-alternative` | slett | Returnerer varen med gjenværende alternativer |
| `delete-shopping-items` | slett | 1–100 varer, alt eller ingenting |
| `create-shopping-category` | opprett | Ikon er en av ikonene appen kan tegne |

I tillegg kan `imageUrl` nå leses og skrives på varer og alternativer.
LLM-importen fylte ut produktbilder; uten feltet ville MCP vært et
tilbakeskritt. URL-en valideres som absolutt `http(s)` og hentes aldri av
serveren.

Kategoritjenestene er flyttet fra `lib/actions/category.ts` til
`lib/application/shopping/write.ts`, slik at web og MCP deler validering og
husstandsgrense.

### Sletting er tillatt for varer og alternativer

ADR 0004 holdt sletting utenfor MCP til bruken viste et behov. Det behovet er
nå her: LLM-importen hadde en erstatningsmodus som var den eneste måten å rydde
bort feil og duplikater på fra en assistent. `SKIPPED` er fortsatt anbefalt for
«ikke lenger aktuelt», og både verktøybeskrivelsen og serverinstruksjonene ber
assistenten bekrefte med brukeren før den sletter.

Sletteverktøy har `destructiveHint: true` og `idempotentHint: false`, fordi et
gjentatt kall svarer `NOT_FOUND`. `write-tools.test.ts` låser hvilke
sletteverktøy som finnes, så et nytt krever en ny beslutning.

Fortsatt utenfor MCP: sletting av hele lister, kategorier og alt i andre
domener; endring av om en liste er privat; delingslenker; `assignedTo`.

### Bryteren for skrivedomener står ved lag

Skriving via MCP må fortsatt slås på med
`HOME_OVERVIEW_MCP_WRITE_DOMAINS=shopping` (eller `all`). Uten det er de nye
verktøyene, som de gamle, bare synlige for lesing.
