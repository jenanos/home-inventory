"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Badge } from "@workspace/ui/components/badge"
import { cn } from "@workspace/ui/lib/utils"
import { Sparkles, WandSparkles } from "lucide-react"
import {
  bulkCreatePlants,
  findExistingPlants,
  bulkImportPlantsWithDuplicates,
  replacePlants,
  type ExistingPlant,
  type PlantFieldUpdate,
} from "@/lib/actions/plant"
import {
  DuplicateFieldDiffCard,
  DuplicateSummary,
  computeFieldDiffs,
  type DuplicateItem,
  type FieldDiff,
} from "@/components/duplicate-field-diff"
import {
  LlmImportPageHeader,
  LlmImportModeToggle,
  LlmImportMultiPromptStep,
  LlmImportPasteStep,
  LlmImportPreviewHeader,
  LlmImportPromptStep,
  LlmImportStickyActions,
} from "@/components/llm-import-page"
import { toast } from "sonner"

interface LlmImportPageClientProps {
  householdName?: string
  existingPlants: ParsedPlant[]
}

interface ParsedPlant {
  name: string
  species?: string
  location?: string
  description?: string
  careInstructions?: string
  wateringNeed?: string
  wateringMethod?: string
  sunNeed?: string
  pruningSeason?: string
  isToxic?: boolean
  toxicityNotes?: string
  plantType?: string
  soilType?: string
  fertilizer?: string
  hardinessZone?: string
  lifecycle?: string
  bloomTime?: string
  pests?: string
  notes?: string
  imageUrl?: string
  sourceUrl?: string
}

type ImportMode = "merge" | "replace"

const WATERING_NEED = ["LOW", "MEDIUM", "HIGH"]
const WATERING_METHOD = ["MANUAL", "AUTOMATIC"]
const SUN_NEED = ["FULL_SUN", "PARTIAL_SHADE", "SHADE"]
const PLANT_TYPE = [
  "TREE",
  "SHRUB",
  "PERENNIAL",
  "ANNUAL",
  "FLOWER",
  "HERB",
  "VEGETABLE",
  "CLIMBER",
  "GRASS",
  "OTHER",
]
const LIFECYCLE = ["ANNUAL", "BIENNIAL", "PERENNIAL"]

function buildPrompt() {
  return `Hjelp meg med å lage en oversikt over plantene i hagen min. Ta informasjonen jeg gir deg og formater det som JSON.

Svar KUN med en gyldig JSON-array, uten noe annet tekst rundt. Hvert objekt representerer én plante med følgende felter:

{
  "name": "Navn på planten (obligatorisk)",
  "species": "Art / latinsk navn",
  "plantType": "TREE | SHRUB | PERENNIAL | ANNUAL | FLOWER | HERB | VEGETABLE | CLIMBER | GRASS | OTHER",
  "location": "Plassering i hagen",
  "description": "Kort beskrivelse av planten",
  "careInstructions": "Instruksjoner om stell",
  "wateringNeed": "LOW | MEDIUM | HIGH",
  "wateringMethod": "MANUAL | AUTOMATIC",
  "sunNeed": "FULL_SUN | PARTIAL_SHADE | SHADE",
  "pruningSeason": "Når på året den skal beskjæres",
  "isToxic": false,
  "toxicityNotes": "Detaljer om giftighet, f.eks. giftig for hund/katt",
  "soilType": "Jordtype/krav",
  "fertilizer": "Gjødsling (type + frekvens)",
  "hardinessZone": "Hardførhetssone, f.eks. H5",
  "lifecycle": "ANNUAL | BIENNIAL | PERENNIAL",
  "bloomTime": "Blomstringstid",
  "pests": "Vanlige skadedyr/sykdommer å se etter",
  "notes": "Egne notater",
  "imageUrl": "Direkte URL til et bilde av planten (https://...)",
  "sourceUrl": "Lenke til en nettside med mer info, f.eks. Wikipedia (https://...)"
}

Regler:
- "name" er obligatorisk, alle andre felter er valgfrie
- Enum-feltene ("plantType", "wateringNeed", "wateringMethod", "sunNeed", "lifecycle") MÅ bruke nøyaktig en av de tillatte verdiene over (store bokstaver)
  - wateringNeed: LOW = lite vann, MEDIUM = middels, HIGH = mye vann
  - wateringMethod: MANUAL = manuell vanning, AUTOMATIC = automatisk vanningsanlegg
  - sunNeed: FULL_SUN = mye sol, PARTIAL_SHADE = halvskygge, SHADE = skygge
  - lifecycle: ANNUAL = ettårig, BIENNIAL = toårig, PERENNIAL = flerårig
- "isToxic" skal være true eller false
- URL-er skal være rene URL-er (https://...), IKKE markdown-lenker
- Hvis du er usikker på et felt, utelat det heller enn å gjette
- Svar BARE med JSON-arrayen, ingen ekstra tekst

Eksempel:
[
  {
    "name": "Lavendel",
    "species": "Lavandula angustifolia",
    "plantType": "PERENNIAL",
    "location": "Bed langs sørveggen",
    "description": "Lilla, duftende halvbusk",
    "careInstructions": "Beskjær lett etter blomstring for å holde formen.",
    "wateringNeed": "LOW",
    "wateringMethod": "AUTOMATIC",
    "sunNeed": "FULL_SUN",
    "pruningSeason": "Sen sommer, etter blomstring",
    "isToxic": false,
    "soilType": "Veldrenert, kalkrik",
    "fertilizer": "Lite; sparsomt om våren",
    "hardinessZone": "H5",
    "lifecycle": "PERENNIAL",
    "bloomTime": "Juni–august",
    "pests": "Sjelden; pass på rotråte ved fuktig jord",
    "notes": "",
    "imageUrl": "https://upload.wikimedia.org/.../Lavandula.jpg",
    "sourceUrl": "https://no.wikipedia.org/wiki/Lavendel"
  }
]`
}

function buildContextPrompt(
  existingPlants: ParsedPlant[],
  householdName?: string
) {
  return `Jeg bruker en app for å holde oversikt over plantene i hagen${householdName ? ` for ${householdName}` : ""}.

Her er dagens planter i JSON-format:

${JSON.stringify(existingPlants, null, 2)}

Jeg ønsker å sparre om hagen og plantestellet i naturlig språk.

Hjelp meg med å vurdere:
- om stell, vanning og plassering gir mening for hver plante
- om noe bør legges til, fjernes eller flyttes
- om det er planter som trenger spesiell oppfølging (f.eks. giftige planter eller beskjæring)

Viktig:
- svar i naturlig språk
- ikke returner JSON nå
- bruk JSON-en over som kontekst når du kommer med råd`
}

function buildReplacePrompt() {
  return `Ta alt vi har diskutert om hagen og plantene mine og skriv en oppdatert JSON-array som kan erstatte hele oversikten i appen.

Hele svaret ditt vil overskrive dagens planter, så ta bare med det som faktisk skal være igjen.

${buildPrompt()}`
}

function coerceEnum(value: unknown, allowed: string[]): string | undefined {
  if (typeof value !== "string") return undefined
  const upper = value.trim().toUpperCase()
  return allowed.includes(upper) ? upper : undefined
}

function parseJsonInput(
  raw: string,
  { allowEmpty = false }: { allowEmpty?: boolean } = {}
): { plants: ParsedPlant[]; error: string | null } {
  const trimmed = raw.trim()

  let jsonStr = trimmed
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch?.[1]) {
    jsonStr = codeBlockMatch[1].trim()
  }

  try {
    const parsed = JSON.parse(jsonStr)

    if (!Array.isArray(parsed)) {
      return {
        plants: [],
        error: "Forventet en JSON-array, men fikk et annet format.",
      }
    }

    if (!allowEmpty && parsed.length === 0) {
      return { plants: [], error: "JSON-arrayen er tom." }
    }

    const plants: ParsedPlant[] = []
    const errors: string[] = []

    for (let i = 0; i < parsed.length; i++) {
      const entry = parsed[i]

      if (!entry || typeof entry !== "object") {
        errors.push(`Element ${i + 1}: Ikke et gyldig objekt.`)
        continue
      }

      if (!entry.name || typeof entry.name !== "string" || !entry.name.trim()) {
        errors.push(`Element ${i + 1}: Mangler obligatorisk felt "name".`)
        continue
      }

      const plant: ParsedPlant = { name: String(entry.name).trim() }

      const textField = (key: keyof ParsedPlant) => {
        const value = entry[key]
        if (value && typeof value === "string" && value.trim()) {
          // @ts-expect-error -- assigning string field
          plant[key] = value.trim()
        }
      }

      textField("species")
      textField("location")
      textField("description")
      textField("careInstructions")
      textField("pruningSeason")
      textField("toxicityNotes")
      textField("soilType")
      textField("fertilizer")
      textField("hardinessZone")
      textField("bloomTime")
      textField("pests")
      textField("notes")
      textField("imageUrl")
      textField("sourceUrl")

      plant.wateringNeed = coerceEnum(entry.wateringNeed, WATERING_NEED)
      plant.wateringMethod = coerceEnum(entry.wateringMethod, WATERING_METHOD)
      plant.sunNeed = coerceEnum(entry.sunNeed, SUN_NEED)
      plant.plantType = coerceEnum(entry.plantType, PLANT_TYPE)
      plant.lifecycle = coerceEnum(entry.lifecycle, LIFECYCLE)

      if (typeof entry.isToxic === "boolean") {
        plant.isToxic = entry.isToxic
      } else if (typeof entry.isToxic === "string") {
        plant.isToxic = entry.isToxic.trim().toLowerCase() === "true"
      }

      plants.push(plant)
    }

    if (plants.length === 0 && errors.length > 0) {
      return { plants: [], error: errors.join("\n") }
    }

    return {
      plants,
      error:
        errors.length > 0
          ? `${plants.length} planter ble tolket. ${errors.length} ble hoppet over.`
          : null,
    }
  } catch {
    return {
      plants: [],
      error: "Ugyldig JSON. Sjekk at du har limt inn et gyldig JSON-format.",
    }
  }
}

const plantTypeLabel: Record<string, string> = {
  TREE: "Tre",
  SHRUB: "Busk",
  PERENNIAL: "Staude",
  ANNUAL: "Ettårig",
  FLOWER: "Blomst",
  HERB: "Krydder",
  VEGETABLE: "Grønnsak",
  CLIMBER: "Klatreplante",
  GRASS: "Gress",
  OTHER: "Annet",
}
const wateringNeedLabel: Record<string, string> = {
  LOW: "Lite vann",
  MEDIUM: "Middels vann",
  HIGH: "Mye vann",
}
const wateringMethodLabel: Record<string, string> = {
  MANUAL: "Manuell",
  AUTOMATIC: "Automatisk",
}
const sunNeedLabel: Record<string, string> = {
  FULL_SUN: "Mye sol",
  PARTIAL_SHADE: "Halvskygge",
  SHADE: "Skygge",
}
const lifecycleLabel: Record<string, string> = {
  ANNUAL: "Ettårig",
  BIENNIAL: "Toårig",
  PERENNIAL: "Flerårig",
}

type PlantDuplicate = DuplicateItem<ParsedPlant>

function buildPlantDiffs(
  imported: ParsedPlant,
  existing: ExistingPlant
): FieldDiff[] {
  const toxicLabel = (v: unknown) => (v ? "Ja" : "Nei")
  return computeFieldDiffs([
    {
      key: "species",
      label: "Art",
      existingValue: existing.species,
      newValue: imported.species,
    },
    {
      key: "location",
      label: "Plassering",
      existingValue: existing.location,
      newValue: imported.location,
    },
    {
      key: "plantType",
      label: "Type",
      existingValue: existing.plantType,
      newValue: imported.plantType,
      format: (v) => plantTypeLabel[String(v)] ?? String(v),
    },
    {
      key: "description",
      label: "Beskrivelse",
      existingValue: existing.description,
      newValue: imported.description,
    },
    {
      key: "careInstructions",
      label: "Stell",
      existingValue: existing.careInstructions,
      newValue: imported.careInstructions,
    },
    {
      key: "wateringNeed",
      label: "Vannbehov",
      existingValue: existing.wateringNeed,
      newValue: imported.wateringNeed,
      format: (v) => wateringNeedLabel[String(v)] ?? String(v),
    },
    {
      key: "wateringMethod",
      label: "Vanningsmetode",
      existingValue: existing.wateringMethod,
      newValue: imported.wateringMethod,
      format: (v) => wateringMethodLabel[String(v)] ?? String(v),
    },
    {
      key: "sunNeed",
      label: "Solbehov",
      existingValue: existing.sunNeed,
      newValue: imported.sunNeed,
      format: (v) => sunNeedLabel[String(v)] ?? String(v),
    },
    {
      key: "lifecycle",
      label: "Livssyklus",
      existingValue: existing.lifecycle,
      newValue: imported.lifecycle,
      format: (v) => lifecycleLabel[String(v)] ?? String(v),
    },
    {
      key: "pruningSeason",
      label: "Beskjæringssesong",
      existingValue: existing.pruningSeason,
      newValue: imported.pruningSeason,
    },
    {
      key: "bloomTime",
      label: "Blomstringstid",
      existingValue: existing.bloomTime,
      newValue: imported.bloomTime,
    },
    {
      key: "soilType",
      label: "Jordtype",
      existingValue: existing.soilType,
      newValue: imported.soilType,
    },
    {
      key: "fertilizer",
      label: "Gjødsling",
      existingValue: existing.fertilizer,
      newValue: imported.fertilizer,
    },
    {
      key: "hardinessZone",
      label: "Hardførhetssone",
      existingValue: existing.hardinessZone,
      newValue: imported.hardinessZone,
    },
    {
      key: "isToxic",
      label: "Giftig",
      existingValue: existing.isToxic,
      newValue: imported.isToxic,
      format: toxicLabel,
    },
    {
      key: "toxicityNotes",
      label: "Giftnotat",
      existingValue: existing.toxicityNotes,
      newValue: imported.toxicityNotes,
    },
    {
      key: "pests",
      label: "Skadedyr",
      existingValue: existing.pests,
      newValue: imported.pests,
    },
    {
      key: "notes",
      label: "Notater",
      existingValue: existing.notes,
      newValue: imported.notes,
    },
    {
      key: "imageUrl",
      label: "Bilde-URL",
      existingValue: existing.imageUrl,
      newValue: imported.imageUrl,
    },
    {
      key: "sourceUrl",
      label: "Lenke",
      existingValue: existing.sourceUrl,
      newValue: imported.sourceUrl,
    },
  ])
}

const UPDATABLE_FIELDS = [
  "species",
  "location",
  "plantType",
  "description",
  "careInstructions",
  "wateringNeed",
  "wateringMethod",
  "sunNeed",
  "lifecycle",
  "pruningSeason",
  "bloomTime",
  "soilType",
  "fertilizer",
  "hardinessZone",
  "isToxic",
  "toxicityNotes",
  "pests",
  "notes",
  "imageUrl",
  "sourceUrl",
] as const

export function PlantLlmImportPageClient({
  householdName,
  existingPlants,
}: LlmImportPageClientProps) {
  const router = useRouter()
  const [mode, setMode] = useState<ImportMode>("merge")
  const [step, setStep] = useState<"prompt" | "paste" | "preview">("prompt")
  const [copiedPrompt, setCopiedPrompt] = useState<
    "merge" | "context" | "replace" | null
  >(null)
  const [jsonInput, setJsonInput] = useState("")
  const [parsedPlants, setParsedPlants] = useState<ParsedPlant[]>([])
  const [parseError, setParseError] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [newPlants, setNewPlants] = useState<ParsedPlant[]>([])
  const [duplicates, setDuplicates] = useState<PlantDuplicate[]>([])
  const [selectedFields, setSelectedFields] = useState<
    Map<string, Set<string>>
  >(new Map())
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false)

  const prompt = buildPrompt()
  const contextPrompt = buildContextPrompt(existingPlants, householdName)
  const replacePrompt = buildReplacePrompt()
  const updateCount = duplicates.filter(
    (d) => (selectedFields.get(d.existingId)?.size ?? 0) > 0
  ).length
  const totalItems = parsedPlants.length

  function handleCopyPrompt(
    value: string,
    target: "merge" | "context" | "replace"
  ) {
    navigator.clipboard.writeText(value)
    setCopiedPrompt(target)
    setTimeout(() => {
      setCopiedPrompt((current) => (current === target ? null : current))
    }, 2000)
  }

  function handleReset(nextMode: ImportMode = mode) {
    setMode(nextMode)
    setStep("prompt")
    setCopiedPrompt(null)
    setJsonInput("")
    setParsedPlants([])
    setParseError(null)
    setImportError(null)
    setNewPlants([])
    setDuplicates([])
    setSelectedFields(new Map())
    setIsCheckingDuplicates(false)
  }

  async function handleParse() {
    const { plants, error } = parseJsonInput(jsonInput, {
      allowEmpty: mode === "replace",
    })
    setParsedPlants(plants)
    setParseError(error)

    if (mode === "replace") {
      // Only a valid (possibly empty) array may reach the destructive replace
      // preview. Invalid JSON / a non-array / entries missing "name" all yield
      // plants: [] with an error — keep the user on the paste step in that case
      // so they can't accidentally wipe the whole list via "Tøm planteoversikten".
      if (plants.length === 0 && error !== null) {
        return
      }
      setNewPlants(plants)
      setDuplicates([])
      setSelectedFields(new Map())
      setStep("preview")
      return
    }

    if (plants.length === 0) return

    setIsCheckingDuplicates(true)
    try {
      const names = plants.map((p) => p.name)
      const existing = await findExistingPlants(names)

      const existingByName = new Map<string, ExistingPlant>()
      for (const e of existing) existingByName.set(e.name.toLowerCase(), e)

      const newItems: ParsedPlant[] = []
      const dupes: PlantDuplicate[] = []
      const fieldSelections = new Map<string, Set<string>>()

      for (const plant of plants) {
        const match = existingByName.get(plant.name.toLowerCase())
        if (match) {
          const diffs = buildPlantDiffs(plant, match)
          dupes.push({
            importedItem: plant,
            existingId: match.id,
            existingLabel: match.name,
            diffs,
          })
          fieldSelections.set(match.id, new Set(diffs.map((d) => d.key)))
        } else {
          newItems.push(plant)
        }
      }

      setNewPlants(newItems)
      setDuplicates(dupes)
      setSelectedFields(fieldSelections)
    } catch {
      setNewPlants(plants)
      setDuplicates([])
      setSelectedFields(new Map())
    } finally {
      setIsCheckingDuplicates(false)
    }

    setStep("preview")
  }

  function handleToggleField(existingId: string, field: string) {
    setSelectedFields((prev) => {
      const next = new Map(prev)
      const fields = new Set(next.get(existingId) ?? [])
      if (fields.has(field)) {
        fields.delete(field)
      } else {
        fields.add(field)
      }
      next.set(existingId, fields)
      return next
    })
  }

  function handleImport() {
    setImportError(null)
    startTransition(async () => {
      try {
        if (mode === "replace") {
          await replacePlants({ plants: parsedPlants })
          handleReset()
          router.push("/hage")
          router.refresh()
          toast.success(
            parsedPlants.length === 0
              ? "Planteoversikten ble tømt"
              : "Plantene ble erstattet"
          )
          return
        }

        const hasDuplicateUpdates = duplicates.some(
          (d) => (selectedFields.get(d.existingId)?.size ?? 0) > 0
        )

        if (duplicates.length === 0 || !hasDuplicateUpdates) {
          if (newPlants.length > 0) {
            await bulkCreatePlants({ plants: newPlants })
          }
        } else {
          const updates: PlantFieldUpdate[] = duplicates
            .filter((d) => (selectedFields.get(d.existingId)?.size ?? 0) > 0)
            .map((d) => {
              const selected = selectedFields.get(d.existingId) ?? new Set()
              const item = d.importedItem
              const fields: PlantFieldUpdate["fields"] = {}
              for (const key of UPDATABLE_FIELDS) {
                if (!selected.has(key)) continue
                const value = item[key]
                if (key === "isToxic") {
                  fields.isToxic = Boolean(value)
                } else if (typeof value === "string") {
                  ;(fields as Record<string, string>)[key] = value
                }
              }
              return { id: d.existingId, fields }
            })

          await bulkImportPlantsWithDuplicates({ newPlants, updates })
        }

        handleReset()
        router.push("/hage")
        router.refresh()
        toast.success("Planter importert")
      } catch (err) {
        console.error("Plant LLM import failed:", err)
        setImportError("Noe gikk galt under importen. Prøv igjen.")
      }
    })
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <LlmImportPageHeader
        backHref="/hage"
        backLabel="Tilbake til hage"
        title={`Importer planter${householdName ? ` for ${householdName}` : ""}`}
        description="Lim inn JSON fra en LLM, gå gjennom duplikater og importer plantene til hagen."
        step={step}
      />

      <LlmImportModeToggle
        value={mode}
        onValueChange={(nextMode) => handleReset(nextMode)}
        options={[
          {
            value: "merge",
            label: "Vanlig import",
            description:
              "Importer nye planter og velg hvilke felt som skal oppdateres ved duplikater.",
          },
          {
            value: "replace",
            label: "Sparring + erstatt",
            description:
              "Kopier dagens planter til LLM-en din, sparr i naturlig språk og lim inn et endelig JSON-svar som erstatter hele oversikten.",
          },
        ]}
      />

      {step === "prompt" && mode === "merge" && (
        <LlmImportPromptStep
          title="Kopier prompt til LLM"
          description="Bruk prompten under i ChatGPT, Claude eller annen LLM. Be modellen svare kun med JSON."
          prompt={prompt}
          copied={copiedPrompt === "merge"}
          onCopy={() => handleCopyPrompt(prompt, "merge")}
          onNext={() => setStep("paste")}
          sidebar={
            <>
              <div className="rounded-lg border bg-muted/20 px-3 py-3">
                <div className="flex items-start gap-3 text-sm text-muted-foreground">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <p>
                    Planter med samme navn blir behandlet som duplikater, så du
                    kan velge hvilke felt som skal oppdateres.
                  </p>
                </div>
              </div>
              <div className="rounded-lg border bg-muted/20 px-3 py-3">
                <div className="flex items-start gap-3 text-sm text-muted-foreground">
                  <WandSparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <p>
                    Be modellen bruke de tillatte enum-verdiene for vann, sol og
                    type, og kun svare med ren JSON.
                  </p>
                </div>
              </div>
            </>
          }
        />
      )}

      {step === "prompt" && mode === "replace" && (
        <LlmImportMultiPromptStep
          title="Kopier sparringsgrunnlag"
          description="Bruk først dagens planter som kontekst i en naturlig samtale med LLM-en. Når dere er ferdige, bruk prompten under for å få tilbake et endelig JSON-svar som kan erstatte hele oversikten."
          sections={[
            {
              id: "context",
              title: "1. Prompt med dagens planter",
              description:
                "Send denne først for å gi LLM-en kontekst og be om sparring i naturlig språk.",
              prompt: contextPrompt,
              copied: copiedPrompt === "context",
              onCopy: () => handleCopyPrompt(contextPrompt, "context"),
              copyLabel: "Kopier sparringsprompt",
            },
            {
              id: "replace",
              title: "2. Prompt for endelig JSON",
              description:
                "Bruk denne når dere er ferdige med sparringen og du vil ha et ferdig JSON-svar tilbake.",
              prompt: replacePrompt,
              copied: copiedPrompt === "replace",
              onCopy: () => handleCopyPrompt(replacePrompt, "replace"),
              copyLabel: "Kopier JSON-prompt",
            },
          ]}
          onNext={() => setStep("paste")}
          sidebar={
            <>
              <div className="rounded-lg border bg-muted/20 px-3 py-3">
                <div className="flex items-start gap-3 text-sm text-muted-foreground">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <p>
                    Hele JSON-svaret du limer inn senere vil erstatte alle
                    plantene i hagen.
                  </p>
                </div>
              </div>
              <div className="rounded-lg border bg-muted/20 px-3 py-3">
                <div className="flex items-start gap-3 text-sm text-muted-foreground">
                  <WandSparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <p>
                    Tom JSON-array er lov i dette sporet hvis du ønsker å tømme
                    oversikten helt.
                  </p>
                </div>
              </div>
            </>
          }
        />
      )}

      {step === "paste" && (
        <LlmImportPasteStep
          title={
            mode === "replace"
              ? "Lim inn oppdatert JSON"
              : "Lim inn JSON-svaret"
          }
          label="JSON fra LLM"
          inputId="plant-json-input"
          value={jsonInput}
          onChange={(value) => {
            setJsonInput(value)
            setParseError(null)
          }}
          placeholder={'[\n  {\n    "name": "Lavendel",\n    ...\n  }\n]'}
          parseError={parseError}
          showError={parsedPlants.length === 0}
          onBack={() => setStep("prompt")}
          onParse={handleParse}
          isParsing={mode === "merge" && isCheckingDuplicates}
        />
      )}

      {step === "preview" && (
        <>
          <LlmImportPreviewHeader
            summary={
              mode === "merge" && duplicates.length > 0 ? (
                <DuplicateSummary
                  newCount={newPlants.length}
                  duplicateCount={duplicates.length}
                  updateCount={updateCount}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {totalItems} {totalItems === 1 ? "plante" : "planter"}{" "}
                  {mode === "replace"
                    ? "klare til å erstatte oversikten."
                    : "klare for import."}
                </p>
              )
            }
            parseError={parseError}
            description={
              mode === "replace"
                ? "Se gjennom JSON-en før du erstatter hele planteoversikten."
                : "Gå gjennom nye planter og velg hvilke duplikatfelt som skal oppdateres."
            }
          />

          {mode === "replace" ? (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
              Dette sporet overskriver alle eksisterende planter. Planter du har
              fjernet i JSON-svaret blir også fjernet i appen.
            </div>
          ) : null}

          <div
            className={cn(
              "grid gap-6",
              mode === "merge" &&
                duplicates.length > 0 &&
                newPlants.length > 0 &&
                "xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
            )}
          >
            {mode === "merge" && duplicates.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-heading text-lg font-medium">
                    Duplikater
                  </h3>
                  <span className="text-sm text-muted-foreground">
                    {duplicates.length} treff
                  </span>
                </div>
                <div className="space-y-2">
                  {duplicates.map((dup) => (
                    <DuplicateFieldDiffCard
                      key={dup.existingId}
                      label={dup.existingLabel}
                      diffs={dup.diffs}
                      selectedFields={
                        selectedFields.get(dup.existingId) ?? new Set()
                      }
                      onToggleField={(field) =>
                        handleToggleField(dup.existingId, field)
                      }
                    />
                  ))}
                </div>
              </section>
            )}

            {newPlants.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-heading text-lg font-medium">
                    Nye planter
                  </h3>
                  <span className="text-sm text-muted-foreground">
                    {newPlants.length}{" "}
                    {newPlants.length === 1 ? "plante" : "planter"}
                  </span>
                </div>
                <div className="space-y-3">
                  {newPlants.map((plant, i) => (
                    <div
                      key={`new-${i}`}
                      className="rounded-lg border bg-card p-3 ring-1 ring-foreground/5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0 flex-1 text-sm font-medium break-words">
                          {plant.name}
                        </span>
                        {plant.species && (
                          <span className="shrink-0 text-xs text-muted-foreground italic">
                            {plant.species}
                          </span>
                        )}
                      </div>
                      {plant.location && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          📍 {plant.location}
                        </p>
                      )}
                      {plant.description && (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {plant.description}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {plant.plantType && (
                          <Badge variant="secondary" className="text-xs">
                            {plantTypeLabel[plant.plantType] ?? plant.plantType}
                          </Badge>
                        )}
                        {plant.wateringNeed && (
                          <Badge variant="outline" className="text-xs">
                            {wateringNeedLabel[plant.wateringNeed]}
                          </Badge>
                        )}
                        {plant.sunNeed && (
                          <Badge variant="outline" className="text-xs">
                            {sunNeedLabel[plant.sunNeed]}
                          </Badge>
                        )}
                        {plant.wateringMethod && (
                          <Badge variant="outline" className="text-xs">
                            {wateringMethodLabel[plant.wateringMethod]}
                          </Badge>
                        )}
                        {plant.isToxic && (
                          <Badge
                            variant="outline"
                            className="border-red-300 bg-red-100 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-900/30 dark:text-red-400"
                          >
                            Giftig
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          <LlmImportStickyActions
            importError={importError}
            onBack={() => setStep("paste")}
            cancelHref="/hage"
            onPrimary={handleImport}
            isPending={isPending}
            primaryDisabled={
              isPending ||
              (mode === "merge" && newPlants.length === 0 && updateCount === 0)
            }
            primaryLabel={
              mode === "replace"
                ? totalItems === 0
                  ? "Tøm planteoversikten"
                  : `Erstatt med ${totalItems} ${totalItems === 1 ? "plante" : "planter"}`
                : newPlants.length > 0 && updateCount > 0
                  ? `Importer ${newPlants.length} nye + oppdater ${updateCount}`
                  : newPlants.length > 0
                    ? `Importer ${newPlants.length} ${newPlants.length === 1 ? "plante" : "planter"}`
                    : `Oppdater ${updateCount} ${updateCount === 1 ? "plante" : "planter"}`
            }
          />
        </>
      )}
    </div>
  )
}
