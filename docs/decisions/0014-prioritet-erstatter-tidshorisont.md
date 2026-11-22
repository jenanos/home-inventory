# ADR 0014: Prioritet erstatter tidshorisont på innkjøp

- Status: Akseptert
- Dato: 2026-11-22
- Erstatter: delen «Fase blir tidshorisont» i [ADR 0005](0005-generelle-innkjop-og-mcp.md)

## Kontekst

En vare hadde både `priority` (Høy/Medium/Lav) og `timeframe` («Når»:
Snarest/Snart/Kan vente/Ingen hast). På tavlevisningen ga gruppering på
«Prioritet» og «Når» nesten de samme kolonnene: det som er viktig, trengs
snart, og det som kan vente, er lite viktig. Husstanden måtte holde to felt
i takt uten å få noe igjen for det, og en reell frist dekkes allerede av
`dueDate` («Frist»).

## Beslutning

`timeframe` og enumtypen `Timeframe` er fjernet. Prioritet er eneste felt for
hvor viktig og hvor presserende en vare er, og `dueDate` brukes for en reell
frist.

- Migreringen `20261122120000_drop_shopping_timeframe` dropper kolonnen og
  typen. Verdiene flyttes ikke over til prioritet: de to feltene fulgte
  hverandre allerede, og en automatisk omregning ville overskrevet
  prioriteter husstanden har satt selv.
- Tavla har ikke lenger grupperingen «Når». En lagret gruppering
  (`tidspunkt`) faller tilbake til standardgrupperingen.
- Skjemaene, filtrene (URL-parameteren `timeframe`), kortene, delte lister og
  innkjøpstallene viser ikke lenger tidshorisont. «Haster» i tallene er
  erstattet av «Høy prioritet», og fanen «Når» er fjernet.
- `lib/shopping-timeframe.ts` er slettet.

## MCP

`timeframe` er fjernet fra output (`shoppingItemSchema`), fra filteret på
`search-shopping-items` og fra input på `add-shopping-items` og
`update-shopping-item`. Serverinstruksjonene beskriver prioritet som både
viktighet og hast. Serverversjon `0.13.0`.

Inputskjemaene avviser ikke ukjente felt, så en klient som fortsatt sender
`timeframe`, får feltet ignorert i stedet for en feil.
