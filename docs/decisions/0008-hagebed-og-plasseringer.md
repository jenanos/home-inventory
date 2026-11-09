# ADR 0008: Bed som egen enhet, og én plante i flere bed

- Status: Akseptert
- Dato: 2026-11-09
- Bygger på: [ADR 0004](0004-mcp-write-tools.md)

## Kontekst

En plante hadde ett fritekstfelt, `location`. Står samme plante i to bed, måtte
den derfor lagres to ganger. I produksjon var 12 planterader egentlig 7 planter
fordelt på 3 bed, og radene var like i alle felt bortsett fra plasseringen.
Duplikatene gjør at stell, notater og (snart) bilder må vedlikeholdes flere
steder.

## Beslutninger

### Datamodell

- `GardenBed`: navn, beskrivelse, sol (`SunNeed`) og notater per husstand.
  Navnet er unikt per husstand. Databaseindeksen skiller store og små
  bokstaver, så tjenesten sjekker i tillegg uten hensyn til det. «Staudebed»
  og «staudebed» blir ikke to bed.
- `PlantPlacement`: én rad per plante og bed (`@@unique([plantId, bedId])`),
  med valgfritt antall (1–10 000) og notat.
- `Plant.location` er fjernet.

Å slette et bed sletter plasseringene, men aldri plantene. Å slette en plante
sletter plasseringene.

### Migrering av eksisterende data

`20261109120000_add_garden_beds`:

1. Hver distinkte, ikke-tomme `location` (trimmet) blir et bed i husstanden.
2. Planterader som er identiske i alle felt utenom `location`, id og
   tidsstempler, slås sammen til den eldste. Bare helt like rader slås sammen,
   så ingen verdi går tapt. Rader som skiller seg i ett felt, for eksempel et
   notat, forblir egne planter.
3. Hver opprinnelige rads plassering blir en plassering på planten som ble
   beholdt.

### Tjenester og skriving

`updatePlant` tar `placements` som *hele* settet av bed planten står i. Bed som
utelates, fjernes. Utelates feltet, røres ikke plasseringene. Plasseringene
skrives som nøstet skriving gjennom planten (`plant.update({ where: { id,
householdId }, data: { placements: … } })`), så eierskapsgrensen i `where`
dekker dem, og alt skjer i én setning. Bed-ID-ene valideres mot husstanden
først. Ukjent og fremmed bed gir samme `NOT_FOUND`. En endring i plasseringene
oppdaterer plantens `updatedAt`, så `expectedUpdatedAt` fanger også den.

### MCP

- `list-plants` og `get-plant` returnerer `placements: [{ bedId, bedName,
  quantity, notes }]` i stedet for `location`. Filteret `location` heter nå
  `bed` (delstreng av bednavnet), og `bedId` er nytt.
- Nye leseverktøy: `list-garden-beds` og `get-garden-bed`, med plantene i
  hvert bed.
- Nye skriveverktøy: `create-garden-bed`, `update-garden-bed`,
  `delete-garden-bed` og `delete-plant`. `create-plant` og `update-plant` tar
  `placements`.

Sletting av planter og bed tillates nå. ADR 0004 holdt sletting ute til bruken
viste et behov. Med plasseringer blir opprydding av duplikater, og av bed som
ikke finnes lenger, en vanlig oppgave for en assistent. Verktøybeskrivelsene ber
klienten bekrefte med brukeren først, som for prosjekter og budsjett.

### LLM-importen

Importformatet bruker `beds: string[]`. Det gamle `location`-feltet godtas
fortsatt og tolkes som ett bed. Bed opprettes ved navn ved behov og gjenbrukes
uten hensyn til store og små bokstaver. Ved duplikater kan brukeren velge å
legge planten til i nye bed. Eksisterende plasseringer fjernes aldri av en
import. Full erstatning (`replacePlants`) sletter plantene, men beholder bedene.
Importen er flyttet fra Server Actions til `lib/application/garden/import.ts`,
som for de andre domenene. `replacePlants` blir liggende i `lib/actions/`.
