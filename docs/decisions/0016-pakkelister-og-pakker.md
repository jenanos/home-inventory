# ADR 0016: Pakkelister med gjenbrukbare pakker

- Status: Akseptert
- Dato: 2026-11-23
- Bygger på: [ADR 0004](0004-mcp-write-tools.md)

## Kontekst

Husstanden pakker de samme tingene sammen igjen og igjen: treningstøy, vintertøy
til barna, pass og forsikring til utlandet. En pakkeliste per tur er nyttig,
men å skrive inn alt på nytt hver gang er det ikke.

## Beslutninger

### Liste, ting og pakker

- `PackingList` er én tur, med sesong (`SPRING`, `SUMMER`, `AUTUMN`,
  `WINTER`), varighet (`DAY`, `WEEKEND` 1–3 netter, `WEEK` 4–8 netter,
  `LONG`), om turen går til utlandet, og eventuelt avreisedato.
- `PackingItem` er en ting på listen med antall og om den er pakket.
- `PackingBundle` («pakke») er en gjenbrukbar gruppe ting som pakkes sammen,
  med `PackingBundleItem` for tingene. Navnet er unikt i husstanden uten hensyn
  til store og små bokstaver.

### En pakke kopieres inn i listen

Når en pakke legges til, kopieres tingene inn med `bundleId` som merkelapp.
Listen kan da krysses av og endres fritt, og senere endringer i pakken
skriver ikke om lister som allerede er pakket. Sletter man pakken, blir
tingene stående på listene uten merkelapp. `remove-packing-bundle-from-list`
fjerner tingene en pakke la til, eventuelt bare de som ikke er pakket.

Står samme ting i flere pakker (en ladekabel i både «Toalettsaker» og
«Treningstøy»), legges den inn én gang. Navn sammenlignes uten hensyn til
store og små bokstaver og ekstra mellomrom, og det som hoppes over, rapporteres.

### Vilkår og automatiske pakker

En pakke kan begrenses til sesonger, varigheter og utenlandsreiser. Tomme
lister betyr «alle». `autoAdd` legger pakken til hver ny liste den passer for,
for eksempel «Utenlandsreise» med pass på alle turer til utlandet. Regelen
ligger i `lib/application/packing/rules.ts` og brukes både av skrivetjenesten
og av skjemaet, som viser hvilke pakker som passer og krysser av de
automatiske. En pakke som er begrenset til noen sesonger, passer ikke en tur
uten sesong.

Webskjemaet sender de avkryssede pakkene eksplisitt (`applyAutoBundles:
false`), så det som er krysset av, er nøyaktig det som legges inn. MCP-klienter
får de automatiske pakkene som standard.

Filtrene på sesong og varighet finnes både for lister og pakker. For pakker
gir et filter også pakkene uten begrensning, siden de gjelder alltid.

### Personer

Familien pakker ofte for flere, og barna bruker ikke appen. `PackingPerson`
er et navn i husstanden («Ola», «Kari»), ikke en bruker, og deles av alle
pakkelistene. En ting kan tildeles én person (`PackingItem.personId`); uten
person er den felles. Slettes personen, blir tingene felles.

- Samme ting for to personer er to ting: duplikatsjekken bruker navn *og*
  person, så Olas og Karis votter er to rader.
- En pakke kan legges til én gang per person («Vintertøy barn» for hvert
  barn); `create-packing-list` tar `bundles: [{ bundleId, personId }]`.
  Automatiske pakker legges inn som felles.
- Listesiden filtrerer på person (Alle, Felles, hver person med hvor mye som
  er pakket), og det man legger til, går til personen man har valgt. En pakke
  kan fjernes for én person, og alt til én person kan krysses av samlet.
- Navn er unike i husstanden uten hensyn til store og små bokstaver.

### MCP

Nytt domene `packing` med scopene `packing:read` og `packing:write`:
`list-packing-lists`, `get-packing-list`, `list-packing-bundles`,
`get-packing-bundle`, `create-packing-list`, `update-packing-list`,
`duplicate-packing-list`, `delete-packing-list`, `add-packing-items`,
`update-packing-item`, `set-packing-items-packed`, `delete-packing-items`,
`add-packing-bundle-to-list`, `remove-packing-bundle-from-list`,
`create-packing-bundle`, `update-packing-bundle` (tingene sendes som hele
settet, slik plasseringer på planter gjør), `delete-packing-bundle`,
`list-packing-persons`, `create-packing-person`, `update-packing-person` og
`delete-packing-person`. Tingene har `personId`, og `get-packing-list`,
`list-packing-lists`, `set-packing-items-packed`,
`add-packing-bundle-to-list` og `remove-packing-bundle-from-list` tar
`personId`.

Sletting er tillatt for lister, ting, pakker og personer, og for å ta en
pakke ut av en liste. Beskrivelsene ber assistenten bekrefte med brukeren først.
`write-tools.test.ts` låser listen. Skriving må slås på med `packing` i
`HOME_OVERVIEW_MCP_WRITE_DOMAINS` (eller `all`).

## Hurtigpanelet

Med to nye sider er det ikke plass til alle i menyen nederst på mobilen.
Hver bruker velger opptil fire sider (`User.quickNavPages`) under
Innstillinger → Hurtigpanel, og «Mer» åpner et ark med alle sidene. Valget
lagres på brukeren, ikke i en cookie, så det gjelder på alle enhetene.
Ukjente sider i et lagret valg ignoreres, og et tomt valg gir standarden
Oversikt, Innkjøp, Prosjekter og Hendelser. Sidemenyen på større skjermer
viser alltid alle sidene.
