# ADR 0012: Omfang på prosjekter, «på vent» som egen visning og innflyttingsperiode

- Status: Akseptert
- Dato: 2026-11-12
- Bygger på: [ADR 0005](0005-generelle-innkjop-og-mcp.md), [ADR 0006](0006-prosjekter-i-stedet-for-vedlikehold.md)

## Kontekst

Tallene for innkjøp og prosjekter var én stor sum og én fremdriftslinje. Det
ble for grovt:

- Gjenstående innkjøp blandet det som haster med det som ikke haster i det
  hele tatt.
- Gjennomførte innkjøp hadde ingen tidsdimensjon, selv om de store kjøpene
  ble gjort rundt innflyttingen og bør kunne ses for seg.
- Prosjektsiden blandet løpende vedlikehold (rense takrenner) med større
  byggtekniske jobber (drenering, asfaltering) i både liste og sum.
- `ON_HOLD` fantes, men prosjekter på vent sto i «Aktive», ble ikke vist i
  oppsummeringen, og «Sett på vent» manglet for prosjekter som ikke var
  startet. Inaktive prosjekter ble derfor markert som fullført.

## Beslutninger

### `Project.scale` (omfang)

Ny enum `ProjectScale` med `ROUTINE` («Løpende vedlikehold») og `MAJOR`
(«Større prosjekt»), standard `ROUTINE`. Den er uavhengig av `type`: å legge
nytt tak er vedlikehold, men stort.

Migreringen `20261112120000_add_project_scale_and_move_in_period` setter
`MAJOR` på eksisterende `RENOVATION`/`IMPROVEMENT` og alt estimert til
50 000 kr eller mer. Det er en engangsgjetning som husstanden retter i
skjemaet.

Prosjektsiden har filteret «Omfang» (`?omfang=lopende|storre`). Uten filter
vises begge under hver sin overskrift, og oppsummeringen viser gjenstående
per omfang. Nye prosjekter får omfanget siden er filtrert på.

MCP: `scale` i output, som filter på `list-projects` og som valgfri input på
`create-project` og `update-project`. Serverversjon `0.12.0`.

### «På vent» er ikke aktivt

«Aktive» betyr nå `NOT_STARTED` og `IN_PROGRESS` (`isActiveProject` i
`lib/dashboard-stats.ts`). `ON_HOLD` har egen visning (`?vis=pa-vent`), egen
sum merket «ikke medregnet», og telles ikke som forfalt eller høyt prioritert.
«Sett på vent» kan brukes fra alle statuser unntatt fullført.

MCP-filteret `activeOnly` beholder sin betydning (alt unntatt `COMPLETED`) for
ikke å bryte klienter; beskrivelsen sier at `ON_HOLD` er med.

### Tallene

Prosjekter: gjenstår (aktive), fullført og på vent som egne summer; gjenstår
per prioritet og per omfang; antall uten estimat vises ved siden av summene.

Innkjøp: kjøpt, gjenstår og «haster» (snarest + snart). Gjenstående kan deles
på tidshorisont, prioritet og kategori. Gjennomførte vises før og etter
innflytting, siste 30 dager, per måned (siste 12) og per kategori.

Prisen på en vare er nå overalt det foretrukne alternativets pris, ellers
varens eget estimat, som på listesiden. Dashbordet brukte tidligere omvendt
rekkefølge.

### `Household.moveInPeriodEndsOn`

En dato (`@db.Date`) for siste dag i innflyttingsperioden, satt under
Innstillinger. Kjøp til og med den dagen (norsk tid) telles som innflytting.
Uten dato vises ingen deling. Én dato er nok fordi alt kjøpt før innflyttingen
også hører til innflyttingen.

Månedsgrafen viser én serie og markerer innflyttingsmånedene med et merket
bånd i stedet for en egen farge. De fire fargepalettene skiller ikke to serier
godt nok i alle moduser.
