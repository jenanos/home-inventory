# ADR 0011: Vedlegg via MCP – opplastingslenker, chat-filer og nedlasting fra nettet

- Status: Akseptert
- Dato: 2026-11-09
- Bygger på: [ADR 0004](0004-mcp-write-tools.md), [ADR 0010](0010-vedlegg-i-postgres.md)

## Kontekst

Brukeren vil kunne gi et bilde til Claude eller ChatGPT og be assistenten
knytte det til en plante eller et prosjekt. MCP-verktøy tar JSON-argumenter, og
klientene håndterer filer ulikt (november 2026):

- **ChatGPT** (Apps SDK) gir en fil brukeren har lagt ved i chatten videre til
  et verktøy når parameteren står i `_meta["openai/fileParams"]`. Verktøyet
  får et objekt med en kortlivet `download_url`.
- **Claude** gir ikke chat-vedlegg videre til eksterne connectors. Med
  kodekjøring ligger filen i sandkassen, og derfra kan Claude laste den opp
  over HTTP hvis nettverkstilgang er slått på for domenet.
- Å sende filen som base64 i et verktøyargument fungerer ikke. Et bilde på
  noen MB blir millioner av tegn i konteksten, og `/api/mcp` avviser
  forespørsler over 64 kB.

## Beslutninger

### Verktøy

| Verktøy                         | Scope | Hva                                                                                                               |
| ------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------- |
| `list-attachments`              | les   | Vedleggene til én plante, ett bed eller ett prosjekt                                                              |
| `get-attachment`                | les   | Metadata, og for bilder selve bildet som MCP-bildeinnhold (JPEG, 512/1024/1568 px), så assistenten kan se planten |
| `create-attachment-upload-link` | skriv | Kortlivet opplastingslenke, se under                                                                              |
| `attach-uploaded-file`          | skriv | ChatGPT-fil (`openai/fileParams: ["file"]`), lastes ned fra `download_url`                                        |
| `attach-file-from-url`          | skriv | Kopierer et offentlig bilde eller en PDF fra en https-URL; URL-en lagres som `sourceUrl`                          |
| `update-attachment`             | skriv | Bildetekst, og `makeCover` for hovedbilde                                                                         |
| `delete-attachment`             | skriv | Sletter, med bekreftelse fra brukeren                                                                             |

Et vedlegg tilhører hage (plante, bed) eller prosjekter. Verktøyene er derfor
synlige med _ett av_ scopene `garden:*` og `maintenance:*`, og sjekker domenet
til målet i hvert kall. Et token med bare `garden:write` kan ikke laste opp til
et prosjekt. `defineTool` tar nå en liste med scopes i tillegg til ett scope og
`null`, og kan publisere `_meta`.

PDF-innhold vises ikke i `get-attachment`. Klientstøtten for PDF som innebygd
ressurs i verktøysvar er for ujevn. Assistenten får metadata og `appUrl`.

### Opplastingslenker

`create-attachment-upload-link` gir en URL, `https://home.jenanos.xyz/opplasting/<token>`,
som enten åpnes av brukeren (mobilvennlig side med «Ta bilde») eller brukes
direkte av assistentens sandkasse:

```sh
curl -F file=@bilde.jpg https://home.jenanos.xyz/api/upload-links/<token>
```

Tokenet er selve legitimasjonen, som en lenke for å nullstille passord:

- 256 tilfeldige bit, vist én gang. Bare SHA-256 lagres
  (`AttachmentUploadLink.tokenHash`).
- Gyldig i 30 minutter, maks 20 filer. Hver opplasting tar en plass atomisk,
  og en feilet opplasting gir den tilbake.
- Bundet til ett mål i én husstand. Opplastingen kjører som brukeren som lagde
  lenken, gjennom samme tjeneste som webappen. Er brukeren ikke lenger medlem,
  virker ikke lenken.
- Siden har `noindex` og `Referrer-Policy: no-referrer`. Utløpte lenker
  slettes av den vanlige oppryddingen hver sjette time.
- Ingen cookie og ingen Origin-sjekk. Tokenet i stien er autentiseringen, og
  det er det som gjør at en sandkasse kan bruke den.

### Nedlasting fra nettet og SSRF

Plan 11.17 sa at serveren aldri skal hente brukeroppgitte URL-er. Det endres
for akkurat to verktøy, og bare når de kalles eksplisitt.
`lib/application/attachments/download.ts` er det eneste stedet serveren henter
en URL:

- Bare `https` på port 443, uten brukernavn eller passord i URL-en.
- Vertsnavnet slås opp, og alle adressene må være offentlige. Loopback,
  private nett (inkludert Docker-nettet), link-local, CGNAT, dokumentasjonsnett
  og IPv4-mappede varianter avvises. Tilkoblingen bruker adressen som ble
  sjekket (`lookup` på forespørselen), så DNS rebinding kan ikke bytte inn en
  intern adresse.
- Maks tre omdirigeringer, hver sjekket på samme måte. 20 sekunder totalt og
  25 MB.
- Mål og husstand sjekkes _før_ nedlastingen, så et kall mot noe brukeren ikke
  eier gjør ingen forespørsel.
- Innholdet går gjennom samme filbehandling som en opplasting. Typen avgjøres
  av bytene, og bilder kodes om.

`imageUrl` og `sourceUrl` på planter er fortsatt bare data, og hentes aldri.

`attach-file-from-url` er annotert med `openWorldHint: true`. Det er det eneste
skriveverktøyet som når utenfor appen.

### Serverversjon

`0.11.0`. Serverinstruksjonene har en egen del om bilder og dokumenter.

## Konsekvenser

- I Claude virker flyten «her er et bilde, legg det på hostaen» når
  kodekjøring med nettilgang til `home.jenanos.xyz` er slått på. Ellers gir
  Claude brukeren lenken. I ChatGPT virker den direkte.
- Hvis ChatGPT endrer formatet på filobjektet, slutter `attach-uploaded-file`
  å virke, mens opplastingslenken fortsatt virker.
