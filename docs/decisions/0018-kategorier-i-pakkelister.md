# ADR 0018: Kategorier på ting i pakkelister

- Status: Akseptert
- Dato: 2026-11-28
- Bygger på: [ADR 0016](0016-pakkelister-og-pakker.md), [ADR 0017](0017-maler-personpakker-og-underlister.md)

## Kontekst

Listesiden viser tingene sortert etter pakkene de kom fra. Pakkene er satt
sammen etter når ting brukes («Treningstøy», «Hytta»), ikke etter hva de er,
så sokker kan stå i tre pakker og toalettsaker spredt utover. Ved pakking er
det ofte lettere å gå gjennom listen etter kategori: alle klærne, så
toalettsakene, så elektronikken.

## Beslutninger

### Fast sett med kategorier

`PackingCategory` er et enum, ikke en tabell husstanden vedlikeholder:

| Verdi         | På siden                     |
| ------------- | ---------------------------- |
| `CLOTHING`    | Klær og sko                  |
| `TOILETRIES`  | Toalettsaker                 |
| `HEALTH`      | Medisiner og førstehjelp     |
| `ELECTRONICS` | Elektronikk                  |
| `DOCUMENTS`   | Dokumenter, penger og nøkler |
| `KIDS`        | Barn og baby                 |
| `FOOD`        | Mat og drikke                |
| `OUTDOOR`     | Tur og sport                 |
| `HOME`        | Hjem og hytte                |
| `LEISURE`     | Underholdning                |
| `OTHER`       | Annet                        |

Rekkefølgen er rekkefølgen på siden. Et fast sett gjør gjetting, MCP og
sortering enkle og stabile; trengs en ny kategori, er det en migrering. Blir
det et reelt behov for egne kategorier, kan enumet senere erstattes av en
tabell med disse som startverdier.

### Alle ting har en kategori

`PackingItem.category` og `PackingBundleItem.category` er påkrevd, med `OTHER`
som standard i databasen.

- En ting kopiert fra en pakke får pakketingens kategori, også ved kopiering
  av lister og når maler synkes (`syncBundleToTemplates` kopierer kategorien
  sammen med navn, notat og antall).
- En ny ting uten kategori får en gjetning: `guessPackingCategory` i
  `lib/application/packing/categories.ts` ser på navnet, så på pakkens navn
  (for pakketing) eller underlistens navn (for ting i en underliste), og gir
  ellers `OTHER`.
- En eksisterende ting beholder kategorien når den endres uten kategori, også
  når den får nytt navn. En pakketing som sendes uten kategori i
  `update-packing-bundle`, beholder sin.

### Gjetting på nøkkelord

`CATEGORY_KEYWORDS` er en liste med nøkkelord per kategori, sjekket i en fast
rekkefølge der første treff vinner. Rekkefølgen setter de smale kategoriene
først, så «Sengetøy» blir hjem og «Truseinnlegg» toalettsaker før klesregelen
ser «tøy» og «truse». Et nøkkelord treffer hvor som helst i navnet
(sammensatte ord: «ullsokker»), eller med `^`/`$` bare i starten/slutten av
et ord («pass» skal ikke treffe «kompass»).

Mønstrene er vanlige regulære uttrykk som JavaScript og PostgreSQL leser likt
(ingen `\b`, ingen lookaround), så migreringen ble generert fra den samme
tabellen og gir de samme svarene.

### Migreringen

`20261128120000_packing_categories` legger til kolonnene og setter første
kategori:

1. Pakketing etter eget navn, ellers pakkens navn («Rød pose» i
   «Toalettsaker» blir toalettsaker).
2. Ting koblet til en pakketing får pakketingens kategori, så liste og pakke
   er enige.
3. Andre ting etter eget navn, ellers pakkens navn, ellers underlistens navn.

Det som ikke gjenkjennes, blir `OTHER` og rettes via MCP.

### En kategori følger pakketingen

Endres kategorien på en pakketing (på nettsiden, med `update-packing-bundle`
eller `set-packing-categories`), får listetingene kopiert fra den samme
kategori, men bare de som fortsatt hadde pakketingens gamle kategori. En
kategori satt for hånd på en liste står.

Det gjelder alle listetyper, også fullførte turer. Det er et bevisst unntak
fra ADR 0016/0017, der endringer i en pakke aldri skriver om turer: en
kategori sorterer bare listen, og endrer ikke hva som er pakket.

### Listesiden

«Vis etter» har valgene Pakker (som før) og Kategorier. I kategorivisningen
er det én seksjon per kategori i fast rekkefølge, tingene sortert etter navn,
med pakken eller underlisten tingen kom fra i liten tekst. Personfilteret og
«Skjul pakket» virker som før. Valget huskes i nettleseren
(`localStorage`), ikke på brukeren.

Kategori kan endres i «Rediger ting» og, for pakketing, under
innstillingsknappen i pakkeskjemaet, der også antall per varighet ligger. En
ny pakketing får gjettet kategori med en gang, så den kan rettes før lagring.

### MCP

- `category` på ting i `get-packing-list` og på pakketing i
  `list-packing-bundles`/`get-packing-bundle`, og som valgfritt felt der ting
  og pakketing opprettes eller endres. `get-packing-list` kan filtrere på
  `category`.
- `list-packing-categories`: kategoriene med norsk navn, forklaring og antall
  ting på lister og i pakker.
- `list-packing-item-names`: hvert navn én gang per kategori, med antall og
  hvilke pakker det står i. Filtrer på `OTHER` for å finne det som ikke ble
  gjenkjent.
- `set-packing-categories`: setter kategori i bulk, alt eller ingenting, på
  navn (alle ting med navnet, på alle lister og i alle pakker), på pakketing
  (med kopiene, som over) eller på enkeltting. Id-er brukes etter navn, så en
  enkeltting kan være et unntak. Navn som ikke finnes, rapporteres i
  `unmatchedNames`.

Serverversjonen er `0.16.0`.
