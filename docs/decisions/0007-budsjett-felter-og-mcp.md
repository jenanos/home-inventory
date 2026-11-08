# ADR 0007: Flere budsjettfelter, bedre formler og MCP i stedet for LLM-import

- Status: Akseptert
- Dato: 2026-11-08
- Bygger på: [ADR 0004](0004-mcp-write-tools.md), [ADR 0005](0005-generelle-innkjop-og-mcp.md), [ADR 0006](0006-prosjekter-i-stedet-for-vedlikehold.md)

## Kontekst

Budsjettsiden hadde en LLM-import der brukeren kopierte en prompt til en
chat-assistent og limte JSON-svaret tilbake, med en egen erstatningsmodus for å
rydde. Innkjøp og prosjekter har allerede gått over til MCP (ADR 0005 og 0006),
og budsjettet hadde MCP-verktøy for å lese, opprette og endre, men ikke for å
slette eller legge inn mange poster på en gang.

Budsjettet var også grunt: alle poster var månedlige, sparing ble ført som
kostnad, og en assistent hadde lite å fylle inn utover navn og beløp. Lånene
viste dessuten renter og avdrag som snitt over hele løpetiden.

## Beslutninger

### LLM-importen for budsjett er fjernet

Siden `/budsjett/llm-import`, `lib/application/budget/import.ts` og Server
Actions `bulkImportBudget`, `bulkImportBudgetWithDuplicates`,
`findExistingBudgetItems` og `replaceBudget` er slettet, med testene sine.
LLM-importen for hage er ikke berørt.

### Nye felter

Migreringen `20261108200000_extend_budget_fields` legger til følgende. Ingen
eksisterende verdier endres.

| Rad | Felt | Bruk |
| --- | ---- | ---- |
| Post | `amount` + `frequency` | `monthlyAmount` heter nå `amount`; `frequency` (`WEEKLY`, `MONTHLY`, `QUARTERLY`, `SEMIANNUAL`, `YEARLY`) er `MONTHLY` for alle eksisterende poster |
| Post | type `SAVINGS` | Penger som settes av. Trekkes fra disponibelt, men telles ikke som kostnad |
| Post | `provider`, `paymentDay`, `renewalDate`, `notes` | Leverandør, trekkdag (1–31), bindingstid og notat |
| Medlem | `netMonthlyIncome`, `notes` | Faktisk utbetaling fra lønnsslippen. Brukes i stedet for brutto × (1 − skatt) når den er satt |
| Lån | lånetype `STUDENT`, `CAR`, `CONSUMER` | I tillegg til `MORTGAGE` og `OTHER` |
| Lån | `fixedRateUntil`, `notes` | Når fastrenteperioden slutter |
| Reise | `otherPerTrip`, `notes` | Parkering, overnatting o.l. Gjelder alle transporttyper |
| Budsjett | `propertyValue` | Boligverdi, gir belåningsgrad |

Eksisterende poster som heter «Sparing» eller «Buffer» og er ført som kostnad,
blir ikke flyttet automatisk; det er en vurdering brukeren (eller assistenten)
gjør.

### Felles definisjon av valgfrie felter

`lib/application/budget/fields.ts` beskriver de valgfrie feltene: etikett,
forklaring, hvilke rader de gjelder (for eksempel bindingstid bare for
kostnader, fastrente bare for boliglån) og om et tomt felt er et hull. Notater
er aldri et hull.

- Siden viser utfylte detaljer under hver rad og, når «Vis tomme felter» er på,
  tomme felter som små knapper som åpner skjemaet. Valget lagres per nettleser
  i `localStorage`; det er en visningspreferanse, ikke husstandsdata.
- MCP returnerer de samme tomme feltene som `missingFields` på hver rad i
  `get-budget-details`, og på budsjettet selv (`propertyValue` når det finnes
  boliglån). Serverinstruksjonene ber assistenten fylle dem fra det brukeren
  sier eller viser, aldri gjette.

Skjemaene samler de valgfrie feltene under «Flere detaljer», som er åpen når
noe allerede er fylt ut.

### Formler

Alle formler ligger fortsatt i `lib/application/budget/calculations.ts` og
brukes av siden, dashbordet og MCP.

- **Frekvens:** månedsbeløp = `amount` × antall ganger per år / 12.
- **Lån:** renter og avdrag regnes fra dagens restgjeld og snittes over de neste
  tolv månedene (eller resten av løpetiden). Før ble de snittet over hele
  løpetiden, som for et langt boliglån undervurderte rentene og dermed
  rentefradraget kraftig. Annuitetslån har samme totale betaling som før;
  serielån får dagens (høyere) betaling. Per lån rapporteres også betalingen
  denne måneden og gjenstående renter.
- **Sparing:** disponibelt = inntekt − kostnader − sparing + fradrag.
- **Nøkkeltall:** sparegrad = (sparing + avdrag) / inntekt; gjeldsgrad = total
  gjeld / brutto årslønn (bankene går normalt maks til 5×); belåningsgrad =
  boliglån / boligverdi. Et nøkkeltall uten grunnlag er `null`.

Standardkategoriene opprettes nå bare sammen med selve budsjettet. Før kom de
tilbake ved neste sidevisning hvis husstanden hadde slettet alle kategorier og
poster.

### Full MCP-flate for budsjett

| Verktøy | Type | Merknad |
| ------- | ---- | ------- |
| `get-budget-summary` | les | Nye totaler (`savings`, `savingsIncludingPrincipal`, `totalDebt`, `mortgageDebt`) og `keyFigures` |
| `get-budget-details` | les | Nye felter, beregnede beløp per rad og `missingFields` |
| `add-budget-entries` | opprett | 1–100 poster, alt eller ingenting. `categoryName` finner eller oppretter kategorien; navn som finnes i samme kategori hoppes over og rapporteres |
| `delete-budget-entry`, `delete-budget-category`, `delete-budget-member`, `delete-budget-loan`, `delete-budget-trip` | slett | Med `dryRun` og oppsummering før og etter, som andre budsjettskriv. Poster i en slettet kategori blir ukategoriserte |
| `update-budget-settings` | oppdater | Erstatter `set-tax-deduction-percent`; tar også `propertyValue` |

Opprett- og oppdateringsverktøyene tar de nye feltene. Inndata for poster er nå
`amount` og `frequency` i stedet for `monthlyAmount`, og utdata har både
`amount` og et beregnet `monthlyAmount`. Det er brytende endringer, men som i
ADR 0005 og 0006 leser klientene skjemaet ved hver tilkobling. Serverversjonen
er `0.8.0`.

### Sletting er tillatt for budsjettrader

Erstatningsmodusen i LLM-importen var den eneste måten å rydde budsjettet fra en
assistent. Som for innkjøp og prosjekter er sletting nå egne verktøy med
`destructiveHint: true` og `idempotentHint: false`, og
`write-tools.test.ts` låser listen. Til forskjell fra de andre domenene tar
budsjettets sletteverktøy `dryRun`, slik at assistenten kan vise effekten på
disponibelt beløp før den sletter. Slettingene i webappen går gjennom de samme
tjenestene og ber nå om bekreftelse for alle radtyper, ikke bare kategorier.

Hele budsjettet kan fortsatt ikke erstattes i ett kall fra MCP.
