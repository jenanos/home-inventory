# ADR 0008: Full MCP-støtte for hagen i stedet for LLM-import

- Status: Akseptert
- Dato: 2026-11-09
- Bygger på: [ADR 0004](0004-mcp-write-tools.md), [ADR 0005](0005-generelle-innkjop-og-mcp.md), [ADR 0006](0006-prosjekter-i-stedet-for-vedlikehold.md), [ADR 0007](0007-budsjett-felter-og-mcp.md)

## Kontekst

Hagesiden var det siste området med LLM-import: brukeren kopierte en prompt til
en chat-assistent, limte JSON-svaret tilbake, valgte felt for felt hva som
skulle oppdateres på planter som fantes fra før, og kunne erstatte hele hagen.
En egen «sparring»-prompt la alle plantene inn i samtalen som kontekst.

MCP hadde allerede `list-plants`, `get-plant`, `create-plant` og
`update-plant`, men ikke det importen ble brukt til: legge inn mange planter
på én gang, rydde bort feil, se hele hagen i ett kall og vite hvilke felter som
mangler. Vanning og beskjæring måtte føres med `update-plant` én plante om
gangen.

## Beslutninger

### LLM-importen for hage er fjernet

Siden `/hage/llm-import` og Server Actions `bulkCreatePlants`,
`bulkImportPlantsWithDuplicates`, `findExistingPlants` og `replacePlants` er
slettet. Med dem forsvinner de delte importkomponentene
`components/llm-import-page.tsx` og `components/duplicate-field-diff.tsx`,
som bare hagen brukte etter ADR 0005–0007, og `lenientUrl` i
`lib/application/mutations.ts`, som stille forkastet ugyldige URL-er fra limt
inn tekst. Nå er det ingen LLM-import igjen i appen, og ingen
erstatt-alt-operasjon for noe domene.

Hva importen gjorde, og hva som gjør det nå:

| Import | MCP |
| ------ | --- |
| Lim inn mange planter | `add-plants` (1–100, alt eller ingenting) |
| Duplikater: velg felter som skal oppdateres | `add-plants` hopper over navn som finnes og returnerer `existingPlantId`; assistenten oppdaterer med `update-plant` |
| Erstatt hele hagen | `delete-plant` og `add-plants`, med bekreftelse fra brukeren |
| Sparring med alle planter som kontekst | `list-plants` med `includeDetails` |

### Manglende felter

`lib/application/garden/fields.ts` definerer hvilke tomme felter som er et
hull: art, plantetype, livssyklus, plassering, sol- og vannbehov,
stellinstruksjoner, jordtype, herdighetssone, blomstringstid (ikke for
grønnsaker) og beskjæringstid (bare for trær, busker, stauder og
klatreplanter). Fritekst som notater, skadedyr og lenker er aldri et hull,
heller ikke datoene husstanden fører selv. `isToxic` er en boolsk verdi med
`false` som standard, så et ukjent svar kan ikke skilles fra «ikke giftig», og
den rapporteres ikke.

Alle plantekort og listerader i MCP har `missingFields`. Serverinstruksjonene
ber assistenten fylle dem fra det brukeren sier eller en pålitelig kilde, og
utelate det den er usikker på, slik importprompten gjorde. I motsetning til
budsjettet (ADR 0007) viser ikke webappen tomme felter; hagekortene er små, og
skjemaet viser allerede alle feltene.

### Full MCP-flate for hagen

| Verktøy | Type | Merknad |
| ------- | ---- | ------- |
| `list-plants` | les | Nye filtre `query` (navn, art eller plassering), `lifecycle`, `wateringMethod`, `isToxic` og `notWateredSince`. Radene har `lastPrunedAt` og `missingFields`. `includeDetails` gir hele plantekort, maks 25 per side |
| `get-plant` | les | Med `missingFields` |
| `create-plant` | opprett | Oppretter alltid, også ved likt navn |
| `add-plants` | opprett | 1–100 planter. Navn som finnes i hagen eller tidligere i kallet hoppes over, uten hensyn til store og små bokstaver; `onDuplicate: "create"` legger dem til likevel, for eksempel samme plante i to bed |
| `update-plant` | oppdater | Uendret |
| `record-plant-care` | oppdater | Vanning og/eller beskjæring for 1–100 planter, nå eller på et gitt tidspunkt (ikke i fremtiden). En nyere dato beholdes, så et gjentatt kall eller en eldre hendelse flytter aldri datoen bakover. Alle ID-ene må høre til husstanden, ellers endres ingenting |
| `delete-plant` | slett | |

Skriveverktøyene returnerer det samme plantekortet som `get-plant`, med
`missingFields`, så assistenten ser hva som gjenstår etter hver lagring.
Serverinstruksjonene har fått en egen hagedel med enumverdiene og hva de betyr,
som importprompten forklarte. Serverversjonen er `0.9.0`. Ingen eksisterende
verktøy er fjernet; utdataene har bare fått nye felter.

Webappen bruker den samme tjenesten for «Vannet i dag» og «Beskåret i dag» i
menyen på plantekortet, og kortet viser når planten sist ble vannet og
beskåret.

### Sletting er tillatt for planter

Erstatningsmodusen var den eneste måten å rydde bort planter fra en assistent.
Som for de andre domenene er sletting nå et eget verktøy med
`destructiveHint: true` og `idempotentHint: false`. Beskrivelsen og
serverinstruksjonene begrenser det til feil, duplikater og planter som er
borte, og ber assistenten bekrefte med brukeren først. `write-tools.test.ts`
låser listen.

Hele hagen kan fortsatt ikke erstattes i ett kall fra MCP.
