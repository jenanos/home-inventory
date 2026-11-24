# ADR 0017: Maler, personpakker, antall etter varighet og underlister

- Status: Akseptert
- Dato: 2026-11-24
- Bygger på: [ADR 0016](0016-pakkelister-og-pakker.md)

## Kontekst

Etter at pakkelistene var tatt i bruk (mange av dem flyttet fra Microsoft
To-Do), kom fem ønsker:

1. Maler, aktive turer og historikk ble skilt med prefikser i navnet («Mal:»).
2. En pakke som hører til én person («Astrids toalettsaker») måtte tildeles
   henne for hånd hver gang.
3. Antall avhenger av turens lengde: tre boksere til en helgetur, syv til en
   uke.
4. Når en pakke endres, bør malene som bruker den kunne følge med, uten at
   tidligere turer skrives om.
5. Turspesifikke ting som hører sammen («Til bilen») trengte en gruppe uten å
   bli en gjenbrukbar pakke. Underpunkter (ting under ting) er ikke viktig og
   er ikke laget.

## Beslutninger

### Listetype

`PackingList.kind` er `TEMPLATE` (mal), `TRIP` (tur, standard) eller
`ARCHIVED` (fullført tur). Oversikten har faner for Turer, Maler og Historikk.

- En mal krysses ikke av og har ingen avreise. «Start tur fra malen» er
  `duplicate-packing-list` med `kind: TRIP` og turens navn, dato, sesong,
  varighet og utland.
- En tur kan lagres som mal og fullføres (`ARCHIVED`). En fullført tur kan
  gjenåpnes eller kopieres til en ny tur; en kopi av en fullført tur blir en
  tur.
- Migreringen gjør navn som «Mal: Hytta», «[Mal] Hytta», «Mal – Hytta» og
  «Hytta (mal)» til maler og «Historikk: …»/«Arkiv: …» til fullførte turer, og
  tar prefikset ut av navnet. Et ord som bare begynner på «mal» («Malaga»)
  røres ikke.

### Pakkens person

`PackingBundle.personId` sier hvem pakken er til. Når pakken legges til uten
at noen annen er valgt, går tingene til den personen, også når pakken legges
til automatisk. I tjenestene og MCP betyr `personId` utelatt «pakkens egen
person», `null` «felles» og en id «denne personen». På listesiden betyr
«Felles» i «pakk for»-valget at ingen er valgt, så pakkens person brukes.
Slettes personen, blir pakken felles.

### Antall etter varighet

`PackingBundleItem` har `quantity` og valgfritt eget antall per varighet
(`quantityDay`, `quantityWeekend`, `quantityWeek`, `quantityLong`). Regelen
`quantityForTrip` i `lib/application/packing/rules.ts` gir antallet for
varigheten, og ellers `quantity`. Et antall lik `quantity` lagres som tomt.
MCP bruker `quantityByDuration: { WEEKEND: 3, WEEK: 7 }`.

- Antallet settes når pakken kopieres inn i listen.
- Endres listens varighet, får pakketingene antallet for den nye varigheten,
  men bare de som fortsatt har antallet den gamle varigheten ga. Antall som er
  endret for hånd, og ting som er pakket, står som de er. Det samme gjelder når
  en mal startes som tur med en annen varighet.

### Maler følger pakkene

`PackingItem.bundleItemId` peker på tingen i pakken den ble kopiert fra.
Pakken lagres nå ting for ting (match på id, ellers navn), så koblingen
overlever en redigering; tidligere ble alle tingene slettet og laget på nytt.
Eksisterende ting ble koblet på navn i migreringen.

Hvilke pakker en liste har, og for hvem, lagres for seg i
`PackingListBundle`, ikke bare utledet av tingene. Ellers ville en pakke som
tømmes og synkes, miste malene sine for godt: tingene forsvinner, og dermed
koblingen. Raden lages når pakken legges til (også automatisk og ved
kopiering), og slettes når pakken fjernes fra listen. Migreringen lager rader
for lister fra før.

`syncBundleToTemplates` (`sync-packing-bundle-to-templates`, «Oppdater
maler») oppdaterer bare maler: nye ting legges til, navn, notat og antall (for
malens varighet) kopieres, og ting som er tatt ut av pakken, fjernes. Hver
persons kopi oppdateres for seg. Ting uten kobling matches på navn. Turer og
fullførte turer endres aldri. Etter at en pakke er lagret på nettsiden, tilbys
oppdateringen hvis malene bruker pakken; MCP-verktøyet har `dryRun`.

### Underlister

`PackingListGroup` er en navngitt underliste på én liste, og
`PackingItem.groupId` legger en ting i den. Navnet er unikt på listen uten
hensyn til store og små bokstaver. Underlister kopieres med listen. Sletting
tar med tingene, eller med `keepItems` bare underlisten. På listesiden vises
pakkene først, så underlistene (også tomme, med eget felt for å legge til) og
til slutt «Andre ting».

### MCP

Nye verktøy: `sync-packing-bundle-to-templates`, `create-packing-group`,
`update-packing-group` og `delete-packing-group` (sletting er en ny
beslutning, låst i `write-tools.test.ts`). `kind` på lister og filter,
`personId` på pakker, `quantityByDuration` og `id` på pakketing, `groupId` på
ting og `groups` på `create-packing-list`. Serverversjonen er `0.15.0`.
