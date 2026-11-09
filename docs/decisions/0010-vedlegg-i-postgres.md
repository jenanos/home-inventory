# ADR 0010: Bilder og filer som vedlegg, lagret i PostgreSQL

- Status: Akseptert
- Dato: 2026-11-09
- Bygger på: [ADR 0009](0009-hagebed-og-plasseringer.md)

## Kontekst

Planter hadde bare en `imageUrl` til et bilde på nettet. Husstanden vil ta egne
bilder av plantene og bedene, og legge ved bilder og PDF-er (for eksempel
tilbud) på prosjekter. Volumet er lite: en husstand med noen titalls planter og
prosjekter. Det er i størrelsesorden noen hundre filer og noen hundre MB, ikke
mer.

Alternativer som ble vurdert:

| | PostgreSQL (`bytea`) | Docker-volum på serveren | Objektlagring (R2/S3) |
| --- | --- | --- | --- |
| Backup | Med i dagens `pg_dump` | Backup-skriptet må utvides | Egen livssyklus |
| Konsistens | Fil og rad i samme transaksjon | Kan komme ut av synk | Kan komme ut av synk |
| Ny infrastruktur | Ingen | Volum, filrettigheter | Konto, nøkler, CORS |
| Skalerer | Dårlig ved stort volum | Godt | Best |

## Beslutning

Filene lagres i PostgreSQL. Ved dette volumet er det viktigste at backup og
konsistens virker uten nye rutiner. Velger vi å flytte senere, er det et
migreringsskript, fordi lagringen bare brukes gjennom
`lib/application/attachments/`.

### Datamodell

- `Attachment`: metadata (navn, type, størrelse, mål, sha256, bildetekst,
  rekkefølge, kilde, opplaster) og nøyaktig én eier: `plantId`, `bedId` eller
  `projectId`. Det håndheves av en check constraint
  (`num_nonnulls(...) = 1`). Sletting av eieren sletter vedleggene.
- `AttachmentContent`: selve bytene og et miniatyrbilde. De ligger i en egen
  tabell, så lister og sider aldri leser dem. Kolonnene bruker
  `STORAGE EXTERNAL`, fordi innholdet allerede er komprimert.
- Det første bildet (laveste `sortOrder`) er hovedbildet på plante- og
  bedkort. Et opplastet bilde går foran `imageUrl`, som beholdes som lenke.

### Filbehandling

- Typen avgjøres av bytene (magiske tall), aldri av filnavn eller MIME-type fra
  klienten. Tillatt: JPEG, PNG, WebP, GIF, AVIF og PDF.
- Bilder dekodes og kodes på nytt med sharp: EXIF-orientering brukes, største
  side blir maks 2560 px, formatet er WebP (kvalitet 82), og et miniatyrbilde
  på 480 px lagres ved siden av. All metadata forsvinner, også GPS-posisjonen
  telefonen skriver inn. Et bilde fra mobilen blir typisk 300–800 kB.
- HEIC avvises med en forklaring. Prebygd sharp kan ikke dekode HEVC, og
  nettleseren på iPhone gjør bildet om til JPEG ved opplasting uansett.
- PDF lagres uendret, maks 20 MB. Andre dokumenttyper er ikke tillatt ennå.
- Grenser: 25 MB per opplastet fil, 100 vedlegg per eier og 2 GB per
  husstand. Det siste er et vern mot en klient som går amok, ikke en kvote noen
  skal nå.

### HTTP

- `POST /api/attachments` (multipart) laster opp. Det er en route handler og
  ikke en Server Action, fordi filene er langt større enn grensen for Server
  Actions. Ruten krever innlogget husstandsmedlem og at `Origin` er appens
  egen, i tillegg til `SameSite=Lax` på sesjonscookien.
- `GET /api/attachments/:id[?variant=thumbnail][&download=1]` serverer
  filen. Ukjent ID og andres vedlegg gir samme 404. Svaret har
  `Content-Type` fra serveren selv, `X-Content-Type-Options: nosniff`,
  `Cache-Control: private, max-age=31536000, immutable` (innholdet til en ID
  endres aldri) og ETag lik sha256.
- Middleware bufrer forespørsler og kutter ved 10 MB som standard.
  `experimental.proxyClientMaxBodySize` er satt til 30 MB.
- Bildetekst, hovedbilde og sletting er vanlige Server Actions.

### Web

Galleriet (`components/attachments/attachment-gallery.tsx`) brukes på
plantesiden (`/hage/[id]`, ny), bedsiden (`/hage/bed/[id]`, ny) og
prosjektsiden. På mobil kan man ta bilde direkte. På desktop kan man dra filer
inn.

### Backup

Vedleggene er med i den vanlige databasedumpen. Dumpene blir større i takt med
filene. Ved 300 MB vedlegg og seks bevarte dumper på tre steder blir det
noen GB i OneDrive. Kommer volumet langt over det, bør vedleggene flyttes til
objektlagring.
