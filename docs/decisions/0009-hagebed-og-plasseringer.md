# ADR 0009: Bed som egen enhet, og én plante i flere bed

- Status: Akseptert
- Dato: 2026-11-09
- Bygger på: [ADR 0004](0004-mcp-write-tools.md), [ADR 0008](0008-hage-mcp-i-stedet-for-llm-import.md)

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
  `bed` (delstreng av bednavnet), `bedId` er nytt, og `query` søker i bednavn
  i stedet for plassering.
- `missingFields` rapporterer `placements` når planten ikke står i noe bed.
- Nye leseverktøy: `list-garden-beds` og `get-garden-bed`, med plantene i
  hvert bed.
- Nye skriveverktøy: `create-garden-bed`, `update-garden-bed` og
  `delete-garden-bed`. `create-plant`, `add-plants` og `update-plant` tar
  `placements`. I `add-plants` valideres alle bed før noe lagres.
- Serverinstruksjonene sier at samme plante i flere bed er én plante med flere
  plasseringer, ikke flere planter. `add-plants` med `onDuplicate: "create"`
  er bare for ulike planter med samme navn.

Sletting av bed tillates, i tråd med sletting av planter (ADR 0008). Å slette
et bed fjerner bare plasseringene. Beskrivelsen ber klienten bekrefte med
brukeren først. Serverversjonen er `0.10.0`.

### Web

- Planteskjemaet har en bedvelger med avkrysning og antall, og kan opprette nye
  bed direkte.
- `/hage` har et bedfilter (`?bed=<id>`, eller `?bed=uten` for planter uten
  bed).
- `/hage/bed` viser bedene med plantene sine, og der kan bed opprettes,
  endres og slettes.
