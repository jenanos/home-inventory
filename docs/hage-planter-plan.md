# Implementeringsplan: Hage & Planter

Denne planen beskriver hvordan vi legger til et nytt område i appen for å holde
oversikt over hagen og plantene — på linje med eksisterende områder (`Innkjøp`,
`Vedlikehold`, `Budsjett`), inkludert **LLM-import** der man kan sparre frem og
tilbake med en språkmodell før man laster opp.

Planen er delt opp i **naturlig avgrensede oppgaver**. Hver oppgave er skrevet
slik at den kan gis til en LLM/agent isolert, og bygger videre på de foregående.
Rekkefølgen er ment som anbefalt utviklingsrekkefølge.

---

## Mål og kontekst

Brukeren har overtatt et hus med en stor hage med mange planter og blomster som
må stelles og følges opp. Behovet er en side som gir oversikt over alle
plantene, med felter for stell, vanning, beskjæring osv. Deler av hagen har
automatisk vanningsanlegg, resten vannes manuelt — dette må kunne registreres
per plante.

Området skal følge eksisterende konvensjoner i kodebasen:

- **Rute:** `/hage` under route-gruppen `apps/web/app/(app)/`
- **Server Components by default**, `"use client"` kun der det trengs
- **Server Actions** for mutasjoner (`apps/web/lib/actions/`)
- **Query-funksjoner** for henting (`apps/web/lib/queries/`)
- **Prisma** for datamodell (`packages/db/prisma/schema.prisma`), alltid via
  migrasjon (`pnpm db:migrate`) — aldri `db push` i utvikling
- **Tilgangskontroll** via `requireHousehold()` (alt knyttes til `householdId`)
- **Gjenbruk av LLM-import-komponentene** i
  `apps/web/components/llm-import-page.tsx` og duplikat-komponentene i
  `apps/web/components/duplicate-field-diff.tsx`

---

## Foreslått datamodell

Basert på ønskede felter, pluss tilleggsfelter som er nyttige for plantestell.
Endelig form besluttes i Oppgave 1, men dette er utgangspunktet.

### `Plant` (hovedmodell)

| Felt | Type | Beskrivelse / brukerønske |
| --- | --- | --- |
| `id` | `String @id @default(uuid()) @db.Uuid` | Primærnøkkel |
| `name` | `String` | Navn på planten (obligatorisk) |
| `species` | `String?` | **Type plante** / art (f.eks. «Rhododendron», «Lavendel») |
| `location` | `String?` | **Plassering** i hagen (f.eks. «Bed ved inngang», «Drivhus») |
| `description` | `String? @db.Text` | **Beskrivelse** av planten |
| `careInstructions` | `String? @db.Text` | **Instruksjoner om stell** |
| `wateringNeed` | `WateringNeed?` | **Mye/lite vann** (enum) |
| `wateringMethod` | `WateringMethod?` | **Manuell/automatisk** vanning |
| `lastWateredAt` | `DateTime?` | Sist vannet (nyttig for manuell vanning) |
| `sunNeed` | `SunNeed?` | **Mye/lite sol** (enum) |
| `lastPrunedAt` | `DateTime?` | **Når sist beskåret** |
| `pruningSeason` | `String?` | **Når på året den skal beskjæres** (f.eks. «Tidlig vår», «Etter blomstring») |
| `isToxic` | `Boolean @default(false)` | **Om den er giftig** |
| `toxicityNotes` | `String?` | Detaljer om giftighet (f.eks. «Giftig for hund/katt») |
| `householdId` | `String @db.Uuid` | Knytning til husholdning |
| `createdAt` / `updatedAt` | `DateTime` | Tidsstempler |

### Foreslåtte tilleggsfelter for plantestell

Disse er «annen relevant informasjon» som er verdt å ta med:

| Felt | Type | Hvorfor |
| --- | --- | --- |
| `plantType` | `PlantType?` (enum) | Kategori: busk, tre, staude, ettårig, krydder, grønnsak, blomst, klatreplante osv. |
| `soilType` | `String?` | Jordtype/krav (f.eks. «Surjord», «Veldrenert») |
| `fertilizer` | `String?` | Gjødsling (type + frekvens) |
| `hardinessZone` | `String?` | Hardførhetssone (relevant i norsk klima) |
| `lifecycle` | `Lifecycle?` (enum) | Ettårig / toårig / flerårig |
| `bloomTime` | `String?` | Blomstringstid (f.eks. «Juni–august») |
| `plantedAt` | `DateTime?` | Når planten ble plantet/anskaffet |
| `pests` | `String? @db.Text` | Vanlige skadedyr/sykdommer å se etter |
| `notes` | `String? @db.Text` | Fritekst / egne notater |
| `imageUrl` | `String?` | Bilde av planten |

### Enums

```prisma
enum WateringNeed {
  LOW
  MEDIUM
  HIGH
}

enum WateringMethod {
  MANUAL
  AUTOMATIC
}

enum SunNeed {
  FULL_SUN      // Mye sol
  PARTIAL_SHADE // Halvskygge
  SHADE         // Skygge / lite sol
}

enum PlantType {
  TREE          // Tre
  SHRUB         // Busk
  PERENNIAL     // Staude
  ANNUAL        // Ettårig
  FLOWER        // Blomst
  HERB          // Krydder/urt
  VEGETABLE     // Grønnsak
  CLIMBER       // Klatreplante
  GRASS         // Gress/prydgress
  OTHER
}

enum Lifecycle {
  ANNUAL     // Ettårig
  BIENNIAL   // Toårig
  PERENNIAL  // Flerårig
}
```

### Mulig utvidelse (egen modell, kan utsettes)

For historikk over stell (vanning, beskjæring, gjødsling) kan en relatert modell
`PlantCareLog` legges til senere — på samme måte som `TaskProgressEntry` henger
på `MaintenanceTask`. Dette holdes utenfor MVP og er skissert i Oppgave 8.

---

## Oppgaver

### Oppgave 1 — Datamodell og migrasjon

**Mål:** Legge til `Plant`-modellen og tilhørende enums i Prisma-schemaet og
opprette migrasjon.

**Filer:**
- `packages/db/prisma/schema.prisma`

**Gjør:**
1. Legg til `Plant`-modellen og enums (`WateringNeed`, `WateringMethod`,
   `SunNeed`, `PlantType`, `Lifecycle`) som beskrevet i «Foreslått datamodell».
2. Legg til relasjon `plants Plant[]` på `Household`-modellen (se eksisterende
   `maintenanceTasks MaintenanceTask[]`).
3. Legg til `@@index([householdId])` på `Plant`.
4. Kjør `pnpm db:migrate` og gi migrasjonen et beskrivende navn (f.eks.
   `add_plant_model`).
5. Verifiser at Prisma-klienten genereres og at typene eksporteres fra
   `@workspace/db`.

**Akseptansekriterier:**
- Migrasjon finnes under `packages/db/prisma/migrations/`
- `Plant`, `WateringNeed`, `WateringMethod`, `SunNeed`, `PlantType`,
  `Lifecycle` kan importeres fra `@workspace/db`
- `pnpm typecheck` er grønn

---

### Oppgave 2 — Query-funksjoner

**Mål:** Lese-funksjoner for planter, scoped til husholdning.

**Filer:**
- `apps/web/lib/queries/plant.ts` (ny)

**Gjør:**
1. `getPlants(householdId: string)` — henter alle planter sortert (f.eks.
   `orderBy: { name: "asc" }` eller `updatedAt: "desc"`).
2. `getPlant(plantId: string, householdId: string)` — henter én plante og
   returnerer `null` hvis den ikke tilhører husholdningen.
3. Følg mønsteret i `apps/web/lib/queries/shopping-list.ts` /
   `maintenance.ts` (importer `db` fra `@workspace/db`, returner typede data).

**Akseptansekriterier:**
- Funksjonene returnerer korrekt typede data og lekker ikke data på tvers av
  husholdninger.

---

### Oppgave 3 — Server Actions (CRUD)

**Mål:** Mutasjoner for å opprette, oppdatere og slette planter.

**Filer:**
- `apps/web/lib/actions/plant.ts` (ny)

**Gjør (følg `apps/web/lib/actions/maintenance-task.ts` som mal):**
1. `"use server"` øverst.
2. `createPlant(input)`, `updatePlant(input)`, `deletePlant(plantId)`.
3. Hver action kaller `requireHousehold()` og verifiserer at planten tilhører
   `membership.householdId` før mutasjon.
4. Kall `revalidatePath("/hage")` (og evt. detaljside) etter mutasjon.
5. Definer input-typer eksplisitt (unngå `any`), bruk enum-typene fra
   `@workspace/db`.

**Akseptansekriterier:**
- CRUD fungerer og er tilgangskontrollert.
- `pnpm typecheck` og `pnpm lint` er grønne.

---

### Oppgave 4 — Hovedside `/hage` med oversikt

**Mål:** Server Component som lister plantene, med tomtilstand og knapper for
«Ny plante» og «LLM-import».

**Filer:**
- `apps/web/app/(app)/hage/page.tsx` (ny)
- `apps/web/app/(app)/hage/plant-card.tsx` (ny) — kort som viser plante med
  badges for vann/sol/giftig/vanningsmetode
- (valgfritt) `apps/web/app/(app)/hage/plants-stats-summary.tsx` for
  oppsummeringskort, jf. eksisterende `*-stats-summary.tsx`

**Gjør:**
1. Hent husholdning via `requireHousehold()` og planter via `getPlants()`.
2. Header med tittel «Hage», beskrivelse, og handlingsknapper:
   - `LLM-import` → `Link` til `/hage/llm-import` (ikon `BotMessageSquare`)
   - `Ny plante` → åpner dialog fra Oppgave 5
3. Tomtilstand (jf. mønster i `lists`/`vedlikehold`) med ikon `Leaf`/`Flower2`.
4. Grid med `PlantCard` for hver plante. Bruk `Badge` for vannbehov, solbehov,
   vanningsmetode (manuell/automatisk) og en tydelig markør hvis `isToxic`.

**Akseptansekriterier:**
- Siden rendres med både tomtilstand og data.
- Giftige planter er visuelt tydelig markert.

---

### Oppgave 5 — Opprett/rediger plante (dialog + skjema)

**Mål:** Skjema for å legge til og redigere en plante manuelt.

**Filer:**
- `apps/web/app/(app)/hage/create-plant-dialog.tsx` (ny)
- (valgfritt) `apps/web/app/(app)/hage/edit-plant-dialog.tsx` eller en delt
  `plant-form.tsx`

**Gjør (følg `apps/web/app/(app)/lists/create-list-dialog.tsx` som mal):**
1. `"use client"`, bruk `useState` + `useTransition` + `useRouter`.
2. Felter: navn (påkrevd), art, plassering, type (`Select`), beskrivelse,
   stellinstruksjoner, vannbehov (`Select`), vanningsmetode (`Select`),
   solbehov (`Select`), sist beskåret (dato), beskjæringssesong, giftig
   (`Checkbox`/`Switch`) + giftnotat, samt tilleggsfeltene.
3. Bruk eksisterende shadcn-komponenter fra `@workspace/ui` (`Dialog`, `Input`,
   `Textarea`, `Select`, `Label`, `Checkbox`/`Switch`, `Button`, `Calendar` +
   `Popover` for datoer). Sjekk at komponentene finnes i
   `packages/ui/src/components/` før bruk; legg evt. til via shadcn-CLI
   (`pnpm dlx shadcn@latest add <komponent> -c packages/ui`).
4. Kall server actions fra Oppgave 3.

**Akseptansekriterier:**
- Plante kan opprettes og redigeres via UI; lange tekstfelter bruker
  `Textarea`; enum-felter bruker `Select`.

---

### Oppgave 6 — LLM-import (kjernen i ønsket)

**Mål:** Egen import-flyt der man sparrer med en språkmodell, får en
prompt å lime inn hos LLM-en, limer JSON-svaret tilbake, ser forhåndsvisning med
duplikathåndtering, og importerer. Skal speile eksisterende import-sider men
være tilpasset planter.

**Studer disse som mal (samme mønster gjenbrukes):**
- `apps/web/app/(app)/lists/[id]/llm-import/page.tsx` (server)
- `apps/web/app/(app)/lists/[id]/llm-import-page-client.tsx` (klient, mest
  komplett: prompt-bygging, JSON-parsing, duplikatdeteksjon, felt-seleksjon)
- `apps/web/app/(app)/vedlikehold/llm-import-page-client.tsx`
- `apps/web/app/(app)/budsjett/llm-import-page-client.tsx`

**Gjenbruk disse komponentene (ikke bygg på nytt):**
- `apps/web/components/llm-import-page.tsx` — `LlmImportPageHeader`,
  `LlmImportPromptStep`, `LlmImportPasteStep`, `LlmImportPreviewHeader`,
  `LlmImportModeToggle`, `LlmImportStickyActions`, `LlmImportErrorAlert`
- `apps/web/components/duplicate-field-diff.tsx` — `DuplicateFieldDiffCard`,
  `DuplicateSummary`, `computeFieldDiffs`

**Filer:**
- `apps/web/app/(app)/hage/llm-import/page.tsx` (ny, server)
- `apps/web/app/(app)/hage/llm-import-page-client.tsx` (ny, klient)

**Gjør:**
1. **Server page:** Hent husholdning + eksisterende planter (navn brukes til
   duplikatsjekk), send som props til klient-komponenten.
2. **Prompt-bygging:** Skriv en `buildPrompt(...)` tilpasset planter. Den skal
   instruere LLM-en til å svare med en ren JSON-array der hvert objekt har
   feltene fra datamodellen. Forklar tillatte enum-verdier på norsk. Skissert
   format:

   ```json
   [
     {
       "name": "Lavendel",
       "species": "Lavandula angustifolia",
       "plantType": "PERENNIAL",
       "location": "Bed langs sørveggen",
       "description": "Lilla, duftende halvbusk",
       "careInstructions": "Beskjær lett etter blomstring...",
       "wateringNeed": "LOW",
       "wateringMethod": "AUTOMATIC",
       "sunNeed": "FULL_SUN",
       "pruningSeason": "Sen sommer, etter blomstring",
       "isToxic": false,
       "toxicityNotes": null,
       "soilType": "Veldrenert, kalkrik",
       "fertilizer": "Lite; sparsomt om våren",
       "hardinessZone": "H5",
       "lifecycle": "PERENNIAL",
       "bloomTime": "Juni–august",
       "pests": "Sjelden; pass på rotråte ved fuktig jord",
       "notes": ""
     }
   ]
   ```

   Reglene i prompten må presisere: `name` er obligatorisk, enum-feltene må bruke
   nøyaktig de tillatte verdiene, datoer på ISO-format, rene URL-er (ikke
   markdown), og «svar BARE med JSON-array».
3. **JSON-parsing:** Gjenbruk parsing-mønsteret fra
   `lists/[id]/llm-import-page-client.tsx` (`parseJsonInput`): toler markdown
   code-blocks, valider at det er en array, valider `name`, map og rens hvert
   felt, valider enum-verdier mot tillatte sett.
4. **Duplikatdeteksjon:** Legg til `findExistingPlants(householdId, names)` i
   `apps/web/lib/actions/plant.ts`. Match på navn (case-insensitivt), bygg
   diff per felt og la brukeren velge hvilke felter som skal oppdateres
   (`DuplicateFieldDiffCard`).
5. **To importspor (`LlmImportModeToggle`):**
   - *Legg til/oppdater* (merge med duplikathåndtering)
   - *Erstatt alt* (replace) — sletter eksisterende og setter inn nytt
6. **Import-actions:** Legg til i `apps/web/lib/actions/plant.ts`:
   - `bulkCreatePlants(input)`
   - `bulkImportPlantsWithDuplicates(input)` (nye + valgte felt-oppdateringer)
   - `replacePlants(input)` (innen `db.$transaction`)
   Alle scoped til `householdId` og med `revalidatePath("/hage")`.
7. Naviger tilbake til `/hage` med `toast` ved suksess.

**Akseptansekriterier:**
- Hele flyten prompt → lim inn JSON → forhåndsvisning → import fungerer.
- Duplikater oppdages og felt-seleksjon respekteres.
- «Erstatt alt»-sporet fungerer i en transaksjon.
- Ugyldig JSON og manglende `name` gir tydelige feilmeldinger.
- Mønster og UI er konsistent med de andre LLM-import-sidene.

---

### Oppgave 7 — Navigasjon

**Mål:** Gjøre `/hage` tilgjengelig i navigasjonen.

**Filer:**
- `apps/web/app/(app)/app-sidebar.tsx` — legg til i `navItems` (importer ikon,
  f.eks. `Leaf` eller `Flower2` fra `lucide-react`), plasser før
  «Innstillinger».
- `apps/web/app/(app)/mobile-nav.tsx` — legg til samme element i `items`.

**Akseptansekriterier:**
- «Hage» vises i både desktop-sidebar og mobilnavigasjon, med aktiv-tilstand
  som matcher `/hage`-ruter.

---

### Oppgave 8 — (Valgfritt, kan utsettes) Detaljside og stell-logg

**Mål:** Egen detaljside per plante og historikk over stell.

**Forslag:**
- `apps/web/app/(app)/hage/[id]/page.tsx` — full visning av én plante.
- Ny Prisma-modell `PlantCareLog` (felt: `type` [VANNING/BESKJÆRING/GJØDSLING/
  ANNET], `date`, `notes`, `plantId`) med relasjon til `Plant`, jf.
  `TaskProgressEntry`. Egen migrasjon.
- Actions for å legge til/fjerne logg-oppføringer; oppdater f.eks.
  `lastWateredAt`/`lastPrunedAt` automatisk når relevant logg legges til.

**Akseptansekriterier:**
- Detaljside viser all info + logg; nye logg-oppføringer reflekteres på kortet.

---

### Oppgave 9 — Verifisering og opprydding

**Mål:** Sikre at alt henger sammen.

**Gjør:**
1. `pnpm lint`, `pnpm typecheck`, `pnpm format`.
2. `pnpm build` for å verifisere at alt kompilerer (jf. CLAUDE.md).
3. Manuell gjennomgang: opprett plante, rediger, slett, kjør LLM-import begge
   spor, sjekk dark mode og mobilvisning.

**Akseptansekriterier:**
- Alle sjekker grønne; ingen `any`-typer introdusert; UI konsistent med resten
  av appen.

---

## Anbefalt rekkefølge

1. Oppgave 1 (datamodell) →
2. Oppgave 2 (queries) + Oppgave 3 (actions) →
3. Oppgave 4 (oversikt) + Oppgave 5 (skjema) →
4. Oppgave 6 (LLM-import) →
5. Oppgave 7 (navigasjon) →
6. Oppgave 9 (verifisering).
7. Oppgave 8 er en valgfri utvidelse som kan tas når MVP er på plass.

Oppgave 1 må komme først (alt avhenger av datamodellen). Oppgave 6 (LLM-import)
avhenger av at actions/queries fra 2–3 finnes, men kan ellers utvikles parallelt
med 4–5.
