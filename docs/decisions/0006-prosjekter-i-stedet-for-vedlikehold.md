# ADR 0006: Prosjekter i stedet for vedlikehold, og MCP i stedet for LLM-import

- Status: Akseptert
- Dato: 2026-11-08
- Bygger på: [ADR 0004](0004-mcp-write-tools.md), [ADR 0005](0005-generelle-innkjop-og-mcp.md)

## Kontekst

Vedlikeholdssiden ble laget da huset ble overtatt, for å følge opp punkter fra
tilstandsrapporten. Hver oppgave hadde leverandører med tilbud, og siden hadde
en LLM-import der brukeren kopierte en prompt til en chat-assistent og limte
JSON-svaret tilbake.

Nå brukes siden til mer enn vedlikehold: oppussing, forbedringer og ting
husstanden gjør selv. Mange av dem trenger ingen leverandør, men gjerne en
innkjøpsliste. Og MCP-serveren lar en assistent lese og endre data direkte, så
kopier-og-lim-flyten er overflødig, slik den ble for innkjøp i ADR 0005.

## Beslutninger

### Vedlikeholdsoppgaver blir prosjekter

Migreringen `20261108170000_generalize_maintenance_to_projects` gir tabeller,
kolonner, constraints og statusenum nytt navn på stedet, så alle data beholdes:

| Før | Etter |
| --- | ----- |
| `MaintenanceTask` | `Project` |
| `TaskVendor` (`taskId`) | `ProjectVendor` (`projectId`) |
| `TaskProgressEntry` (`taskId`) | `ProjectStep` (`projectId`) |
| enum `TaskStatus` | enum `ProjectStatus` (samme verdier) |

Nye felter på `Project`:

- `type` (`ProjectType`): `MAINTENANCE`, `REPAIR`, `RENOVATION`,
  `IMPROVEMENT`, `OTHER`. Eksisterende rader blir `MAINTENANCE`; nye
  prosjekter får `OTHER` hvis ingenting er valgt.
- `execution` (`ProjectExecution`, valgfri): hvem gjør jobben — `SELF`,
  `VENDOR` eller `MIXED`, `null` når det ikke er bestemt. Eksisterende rader
  med leverandører blir `VENDOR`, resten `null`.

Leverandørdelen på prosjektsiden vises ikke for `SELF`-prosjekter uten
leverandører. Ellers er leverandører uendret.

Siden heter nå `/prosjekter`. `/vedlikehold` og `/vedlikehold/:id` sender
permanent videre, så gamle bokmerker virker.

### Innkjøpslister kan høre til et prosjekt

`ShoppingList.projectId` er en valgfri fremmednøkkel med `onDelete: SetNull`:
å slette et prosjekt beholder listene, men kobler dem fra. Koblingen er på
listenivå fordi behovet er «en liste for innkjøp til prosjektet»; varer flyttes
mellom lister med verktøyene som finnes.

Prosjektet må være i samme husstand. Det sjekkes i `createShoppingList` og
`updateShoppingList` i samme transaksjon som skrivingen, og et prosjekt fra en
annen husstand avvises som en ukjent ID. Prosjektsiden og `get-project` viser
bare lister brukeren selv kan se, så en privat liste lekker ikke via prosjektet.

Prosjektsiden kan opprette en ny liste for prosjektet, koble til en eksisterende
og koble fra. Listesiden viser hvilket prosjekt listen hører til.

### LLM-importen for vedlikehold er fjernet

Siden `/vedlikehold/llm-import`, `lib/application/maintenance/import.ts` og
Server Actions `bulkImportMaintenanceTasks`,
`bulkImportMaintenanceTasksWithDuplicates`, `findExistingMaintenanceTasks` og
`replaceMaintenanceTasks` er slettet, med testene sine.

Det importen gjorde i ett steg — et prosjekt med steg og leverandører — gjør
`create-project` nå i ett alles-eller-ingenting-kall.

### Full MCP-flate for prosjekter

| Verktøy | Type | Merknad |
| ------- | ---- | ------- |
| `list-projects` | les | Filter på status, `activeOnly`, type, utførelse, prioritet, frist og fritekst |
| `get-project` | les | Med steg, leverandører og synlige innkjøpslister med antall og summer |
| `create-project` | opprett | Valgfritt med `steps` (maks 100) og `vendors` (maks 20) |
| `update-project` | oppdater | |
| `delete-project` | slett | Sletter steg og leverandører; listene beholdes |
| `add-project-step` | opprett | |
| `update-project-step` | oppdater | `completed` er en sluttilstand, ikke en bryter |
| `reorder-project-steps` | oppdater | Full rekkefølge; ID-ene må være nøyaktig prosjektets steg |
| `delete-project-step` | slett | |
| `add-project-vendor` | opprett | |
| `update-project-vendor` | oppdater | |
| `set-selected-project-vendor` | oppdater | |
| `delete-project-vendor` | slett | |

`create-shopping-list` og `update-shopping-list` tar `projectId` (`null`
kobler fra), `list-shopping-lists` kan filtrere på det, og listeresultatene
viser det.

De gamle navnene (`list-maintenance-tasks`, `create-maintenance-task`,
`add-task-vendor`, `add-progress-entry` osv.) er borte. Det er en brytende
endring, men som i ADR 0005 leser klientene skjemaet ved hver tilkobling.
Serverversjonen er `0.7.0`.

### Sletting er tillatt for prosjekter, steg og leverandører

Erstatningsmodusen i LLM-importen var den eneste måten å rydde bort feil fra en
assistent. Som for innkjøp i ADR 0005 er sletting nå egne verktøy med
`destructiveHint: true` og `idempotentHint: false`. Verktøybeskrivelsene og
serverinstruksjonene ber assistenten foretrekke `COMPLETED`/`ON_HOLD` og
bekrefte med brukeren før den sletter. `write-tools.test.ts` låser listen.

### Scopet beholder navnet `maintenance`

OAuth-scopene heter fortsatt `maintenance:read` og `maintenance:write`, og
domenet i `HOME_OVERVIEW_MCP_WRITE_DOMAINS` heter fortsatt `maintenance`.
Scopene ligger lagret i godkjente tilganger, og et ukjent domenenavn i
miljøvariabelen gjør hele MCP-konfigurasjonen ugyldig. Å bytte navn ville
krevd datamigrering av tilganger og samtidig endring på serveren for en rent
kosmetisk gevinst. Samtykkeskjermen viser «Se prosjekter» og «Endre
prosjekter», så brukeren ser det riktige navnet.

Revisjonsloggen bruker de nye ressurstypene `project`, `project_step` og
`project_vendor`. Eldre rader beholder `maintenance_task` osv.
