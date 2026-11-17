# ADR 0013: Tilbudsovervåking av varer på innkjøpslistene

- Status: Akseptert
- Dato: 2026-11-17
- Bygger på: [ADR 0005](0005-generelle-innkjop-og-mcp.md)

## Kontekst

Mye av det som står på innkjøpslistene (hvitevarer, verktøy, møbler) kjøpes
helst på tilbud. Husholdningen vil kunne markere slike varer og få vite når de
er på et godt tilbud, uten å sjekke butikkene selv.

Appen har ingen tilgang til butikkenes kampanjer, og vi vil ikke bygge og
vedlikeholde skraping av nettbutikker. En assistent som er koblet til
MCP-serveren og har nettsøk, kan derimot finne tilbudene, enten når brukeren
spør, eller i en planlagt jobb. Meal Planner løste det samme for dagligvarer på
denne måten.

## Beslutninger

### Overvåking er en egenskap ved varen

`ShoppingItem` har fått `dealWatch`, `dealWatchNote` (hva som er et godt
tilbud: merke, modell, størrelse), `dealTargetPrice` og `dealCheckedAt`. En vare
på listen er allerede «det vi vil kjøpe», så det trengs ingen egen
overvåkingsliste slik Meal Planner har. Overvåkingen følger varen hvis den
flyttes, og forsvinner hvis den slettes.

### Ett tilbud per vare, i egen tabell

`ShoppingItemDeal` holder det beste tilbudet som er funnet: butikk, produkt,
tilbudspris, ordinær pris, vilkår (`priceNote`), lenke og periode. Et nytt
tilbud erstatter det gamle. Prisene er tall i NOK, som resten av appen; en
prosentkampanje meldes inn som prisen etter rabatt.

En rapport skriver bare til `ShoppingItemDeal` og `dealCheckedAt`, aldri til
varens egne felt eller `updatedAt` (det siste med rå SQL). En jobb som går i
bakgrunnen gjør dermed ikke `expectedUpdatedAt` utdatert for noen som redigerer
varen samtidig.

### Hva som er et aktuelt tilbud

Et tilbud er aktuelt til og med siste dag (`validTo`) i norsk tid. Uten
sluttdato er det aktuelt i sju dager etter at det sist ble meldt inn. Et tilbud
som ikke har startet ennå, er også aktuelt: det er nyttig å vite om på forhånd.
Tilbud på varer som er kjøpt eller hoppet over, vises ikke.

Utløpte tilbud filtreres bort ved lesing i stedet for å slettes, så lesing
aldri skriver. De blir liggende til neste rapport for varen erstatter eller
fjerner dem, eller til varen slettes.

### MCP-verktøy

| Verktøy | Type | Merknad |
| ------- | ---- | ------- |
| `list-shopping-deals` | les | «Er noe på tilbud nå?» Aktuelle tilbud på varer som gjenstår, det som går ut først, først |
| `list-deal-watch-items` | les | Utgangspunktet for en tilbudssjekk: overvåkede varer med notat, målpris, planlagt pris, alternativer og lagret tilbud. Minst nylig sjekket først |
| `set-deal-watch` | oppdater | Slår overvåking av og på for 1–100 varer, med notat og målpris |
| `report-shopping-deals` | oppdater | Resultatet av en sjekk for 1–100 varer: beste tilbud, eller `null` når det ikke finnes noe, som fjerner et gammelt tilbud |

Alle går gjennom listens synlighetsregel, så en annens private liste er
`NOT_FOUND`, og skriveverktøyene er alt eller ingenting. `report-shopping-deals`
hopper over tilbud som allerede er utløpt i stedet for å avvise hele kallet, så
én feil i en planlagt jobb ikke stopper resten. Varens felles form i
`get-shopping-list` og `search-shopping-items` har fått `dealWatch`.

Serveren sender også prompten `tilbudsjakt`, som beskriver hele sjekken. Den
registreres bare for tokens med `shopping:write`. Skriving krever som før at
`HOME_OVERVIEW_MCP_WRITE_DOMAINS` inneholder `shopping`.

### Visning i appen

- «Tilbud nå» øverst på Innkjøp, på Oversikt og på den enkelte listen, med pris,
  ordinær pris, rabatt, butikk, periode, lenke og om prisen er under målprisen.
  Seksjonen vises bare når det finnes aktuelle tilbud.
- Varekortet viser tilbudet, eller «Følges» når varen overvåkes uten tilbud.
- Redigeringsarket har en egen del for overvåking, med notat, målpris, når varen
  sist ble sjekket, og knapp for å fjerne tilbudet.

## Planlagt sjekk

Opprett en planlagt oppgave i Claude eller ChatGPT med Home Overview koblet til
og nettsøk slått på, for eksempel:

> Hver mandag og torsdag kl. 07: Bruk Home Overview og prompten tilbudsjakt.
> Hent varene med list-deal-watch-items, søk etter gjeldende tilbud hos Elkjøp,
> Power, Komplett, Jula, Clas Ohlson, Biltema, Obs Bygg, Maxbo og Prisjakt, og
> meld inn resultatet for hver vare med report-shopping-deals. Ta bare med
> tilbud som er tydelig under vanlig pris eller under målprisen, og oppsummer
> kort hva du fant.

## Konsekvenser

- Tilbudene er aldri ferskere enn siste sjekk. `dealCheckedAt` vises i appen og
  i `list-deal-watch-items`, så det er synlig når en vare sist ble sjekket.
- Kvaliteten avhenger av assistenten. Verktøybeskrivelsene ber den bare melde
  inn priser og datoer den har lest på en side, aldri gjette.
- Ingen tilbudshistorikk: et nytt tilbud erstatter det forrige.
