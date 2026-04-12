"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { Separator } from "@workspace/ui/components/separator"
import { cn } from "@workspace/ui/lib/utils"
import {
  X,
  Sparkles,
  WandSparkles,
} from "lucide-react"
import {
  bulkCreateShoppingItems,
  findExistingShoppingItems,
  bulkImportShoppingItemsWithDuplicates,
  type ExistingShoppingItem,
} from "@/lib/actions/shopping-item"
import { toast } from "sonner"
import type { Priority, Phase } from "@workspace/db"
import {
  DuplicateFieldDiffCard,
  DuplicateSummary,
  computeFieldDiffs,
  type DuplicateItem,
  type FieldDiff,
} from "@/components/duplicate-field-diff"
import {
  LlmImportPageHeader,
  LlmImportPasteStep,
  LlmImportPreviewHeader,
  LlmImportPromptStep,
  LlmImportStickyActions,
} from "@/components/llm-import-page"

interface LlmImportPageClientProps {
  listId: string
  listName: string
  categories: Array<{ id: string; name: string; icon: string | null }>
}

interface ParsedAlternative {
  name: string
  price?: number
  url?: string
  imageUrl?: string
  storeName?: string
  notes?: string
}

interface ParsedItem {
  name: string
  description?: string
  categoryName?: string
  priority?: Priority
  phase?: Phase
  estimatedPrice?: number
  url?: string
  imageUrl?: string
  storeName?: string
  alternatives?: ParsedAlternative[]
}

function buildPrompt(
  listName: string,
  categories: Array<{ name: string; icon: string | null }>
) {
  const categoryNames = categories.map((c) => c.name).join(", ")

  return `Ta alle produktene du har researchet og tilpass dem til følgende JSON-format, slik at jeg kan importere dem direkte i innkjøpslisten min "${listName}".

Svar KUN med en gyldig JSON-array, uten noe annet tekst rundt. Hvert produkt skal være et objekt med følgende felter:

{
  "name": "Produktnavn (obligatorisk)",
  "description": "Kort beskrivelse av produktet, f.eks. modell, farge, størrelse",
  "categoryName": "En av kategoriene: ${categoryNames}",
  "priority": "HIGH | MEDIUM | LOW",
  "phase": "BEFORE_MOVE | FIRST_WEEK | CAN_WAIT | NO_RUSH",
  "estimatedPrice": 1234,
  "url": "https://lenke-til-produkt",
  "imageUrl": "https://lenke-til-produktbilde",
  "storeName": "Butikknavn",
  "alternatives": [
    {
      "name": "Alternativt produktnavn",
      "price": 1234,
      "url": "https://lenke-til-alternativ",
      "imageUrl": "https://lenke-til-bilde",
      "storeName": "Butikknavn",
      "notes": "Kort notat om dette alternativet"
    }
  ]
}

Regler:
- "name" er obligatorisk, alle andre felter er valgfrie
- "estimatedPrice" og "price" skal være tall i NOK uten valutategn
- "priority": HIGH = må ha, MEDIUM = bør ha, LOW = kjekt å ha
- "phase": BEFORE_MOVE = før innflytting, FIRST_WEEK = første uke, CAN_WAIT = kan vente, NO_RUSH = ingen hast
- "categoryName" bør matche en av de tilgjengelige kategoriene nøyaktig
- "url" og "imageUrl" skal være rene URL-er (f.eks. https://...), IKKE markdown-lenker som [tekst](url)
- "imageUrl" skal være en direkte lenke til et produktbilde (JPG/PNG/WebP)
- "alternatives" er en liste med alternative produkter i prioritert rekkefølge (beste først). Bruk denne når du har researchet flere varianter/merker av samme type produkt
- Hvert alternativ i listen skal ha minst "name", og gjerne pris, lenke og bilde
- Svar BARE med JSON-arrayen, ingen ekstra tekst

Eksempel på forventet svar:
[
  {
    "name": "Vaskemaskin",
    "description": "8kg, energiklasse A",
    "categoryName": "Hvitevarer",
    "priority": "HIGH",
    "phase": "BEFORE_MOVE",
    "estimatedPrice": 7999,
    "storeName": "Elkjøp",
    "alternatives": [
      {
        "name": "Samsung WW80T4540AE",
        "price": 7999,
        "url": "https://www.elkjop.no/product/samsung-ww80t4540ae",
        "imageUrl": "https://www.elkjop.no/image/samsung-ww80t4540ae.jpg",
        "storeName": "Elkjøp",
        "notes": "Best i test, 8kg, 1400 rpm"
      },
      {
        "name": "LG F4WV308S6U",
        "price": 6499,
        "url": "https://www.power.no/product/lg-f4wv308s6u",
        "imageUrl": "https://www.power.no/image/lg-f4wv308s6u.jpg",
        "storeName": "Power",
        "notes": "AI DD-teknologi, 8kg, god pris"
      }
    ]
  }
]`
}

function cleanMarkdownUrl(value: string): string {
  const match = value.match(/\[.*?\]\((.+)\)/)
  return match?.[1]?.trim() || value.trim()
}

function parseJsonInput(raw: string): { items: ParsedItem[]; error: string | null } {
  const trimmed = raw.trim()

  let jsonStr = trimmed
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch?.[1]) {
    jsonStr = codeBlockMatch[1].trim()
  }

  try {
    const parsed = JSON.parse(jsonStr)

    if (!Array.isArray(parsed)) {
      return { items: [], error: "Forventet en JSON-array, men fikk et annet format." }
    }

    if (parsed.length === 0) {
      return { items: [], error: "JSON-arrayen er tom." }
    }

    const items: ParsedItem[] = []
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

      const item: ParsedItem = {
        name: String(entry.name).trim(),
      }

      if (entry.description && typeof entry.description === "string") {
        item.description = entry.description.trim()
      }
      if (entry.categoryName && typeof entry.categoryName === "string") {
        item.categoryName = entry.categoryName.trim()
      }
      if (entry.priority && typeof entry.priority === "string") {
        const p = entry.priority.toUpperCase()
        if (["HIGH", "MEDIUM", "LOW"].includes(p)) {
          item.priority = p as Priority
        }
      }
      if (entry.phase && typeof entry.phase === "string") {
        const ph = entry.phase.toUpperCase()
        if (["BEFORE_MOVE", "FIRST_WEEK", "CAN_WAIT", "NO_RUSH"].includes(ph)) {
          item.phase = ph as Phase
        }
      }
      if (entry.estimatedPrice != null) {
        const price = Number(entry.estimatedPrice)
        if (!isNaN(price) && price >= 0) {
          item.estimatedPrice = price
        }
      }
      if (entry.url && typeof entry.url === "string") {
        item.url = cleanMarkdownUrl(entry.url)
      }
      if (entry.imageUrl && typeof entry.imageUrl === "string") {
        item.imageUrl = cleanMarkdownUrl(entry.imageUrl)
      }
      if (entry.storeName && typeof entry.storeName === "string") {
        item.storeName = entry.storeName.trim()
      }

      if (Array.isArray(entry.alternatives) && entry.alternatives.length > 0) {
        const alts: ParsedAlternative[] = []
        for (const altEntry of entry.alternatives) {
          if (!altEntry || typeof altEntry !== "object") continue
          if (!altEntry.name || typeof altEntry.name !== "string" || !altEntry.name.trim()) continue

          const alt: ParsedAlternative = {
            name: String(altEntry.name).trim(),
          }
          if (altEntry.price != null) {
            const altPrice = Number(altEntry.price)
            if (!isNaN(altPrice) && altPrice >= 0) {
              alt.price = altPrice
            }
          }
          if (altEntry.url && typeof altEntry.url === "string") {
            alt.url = cleanMarkdownUrl(altEntry.url)
          }
          if (altEntry.imageUrl && typeof altEntry.imageUrl === "string") {
            alt.imageUrl = cleanMarkdownUrl(altEntry.imageUrl)
          }
          if (altEntry.storeName && typeof altEntry.storeName === "string") {
            alt.storeName = altEntry.storeName.trim()
          }
          if (altEntry.notes && typeof altEntry.notes === "string") {
            alt.notes = altEntry.notes.trim()
          }
          alts.push(alt)
        }
        if (alts.length > 0) {
          item.alternatives = alts
        }
      }

      items.push(item)
    }

    if (items.length === 0 && errors.length > 0) {
      return { items: [], error: errors.join("\n") }
    }

    return {
      items,
      error: errors.length > 0 ? `${items.length} produkter ble tolket. ${errors.length} ble hoppet over.` : null,
    }
  } catch {
    return { items: [], error: "Ugyldig JSON. Sjekk at du har limt inn et gyldig JSON-format." }
  }
}

const priorityLabel: Record<string, string> = {
  HIGH: "Høy",
  MEDIUM: "Medium",
  LOW: "Lav",
}

const phaseLabel: Record<string, string> = {
  BEFORE_MOVE: "Før innflytting",
  FIRST_WEEK: "Første uke",
  CAN_WAIT: "Kan vente",
  NO_RUSH: "Ingen hast",
}

const formatPrice = (price: number) =>
  new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    maximumFractionDigits: 0,
  }).format(price)

type ItemDuplicate = DuplicateItem<ParsedItem>

function buildItemDiffs(
  imported: ParsedItem,
  existing: ExistingShoppingItem,
  categoryIdToName: Record<string, string>,
): FieldDiff[] {
  const existingCategoryName = existing.categoryId
    ? categoryIdToName[existing.categoryId] ?? null
    : null

  return computeFieldDiffs([
    { key: "description", label: "Beskrivelse", existingValue: existing.description, newValue: imported.description },
    { key: "categoryName", label: "Kategori", existingValue: existingCategoryName, newValue: imported.categoryName },
    { key: "priority", label: "Prioritet", existingValue: existing.priority, newValue: imported.priority, format: (v) => priorityLabel[String(v)] ?? String(v) },
    { key: "phase", label: "Fase", existingValue: existing.phase, newValue: imported.phase, format: (v) => phaseLabel[String(v)] ?? String(v) },
    { key: "estimatedPrice", label: "Pris", existingValue: existing.estimatedPrice, newValue: imported.estimatedPrice, format: (v) => formatPrice(Number(v)) },
    { key: "url", label: "URL", existingValue: existing.url, newValue: imported.url },
    { key: "imageUrl", label: "Bilde-URL", existingValue: existing.imageUrl, newValue: imported.imageUrl },
    { key: "storeName", label: "Butikk", existingValue: existing.storeName, newValue: imported.storeName },
  ])
}

export function LlmImportPageClient({
  listId,
  listName,
  categories,
}: LlmImportPageClientProps) {
  const router = useRouter()
  const [step, setStep] = useState<"prompt" | "paste" | "preview">("prompt")
  const [copied, setCopied] = useState(false)
  const [jsonInput, setJsonInput] = useState("")
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([])
  const [parseError, setParseError] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [newItems, setNewItems] = useState<ParsedItem[]>([])
  const [duplicates, setDuplicates] = useState<ItemDuplicate[]>([])
  const [selectedFields, setSelectedFields] = useState<Map<string, Set<string>>>(new Map())
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false)

  const prompt = buildPrompt(listName, categories)

  const categoryMap: Record<string, string> = {}
  const categoryIdToName: Record<string, string> = {}
  for (const cat of categories) {
    categoryMap[cat.name] = cat.id
    categoryIdToName[cat.id] = cat.name
  }

  const updateCount = duplicates.filter(
    (d) => (selectedFields.get(d.existingId)?.size ?? 0) > 0
  ).length

  function handleCopyPrompt() {
    navigator.clipboard.writeText(prompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleParse() {
    const { items, error } = parseJsonInput(jsonInput)
    setParsedItems(items)
    setParseError(error)

    if (items.length === 0) return

    setIsCheckingDuplicates(true)
    try {
      const names = items.map((it) => it.name)
      const existing = await findExistingShoppingItems(listId, names)

      const existingByName = new Map<string, ExistingShoppingItem>()
      for (const entry of existing) {
        existingByName.set(entry.name.toLowerCase(), entry)
      }

      const fresh: ParsedItem[] = []
      const dupes: ItemDuplicate[] = []
      const fieldSelections = new Map<string, Set<string>>()

      for (const item of items) {
        const match = existingByName.get(item.name.toLowerCase())
        if (match) {
          const diffs = buildItemDiffs(item, match, categoryIdToName)
          dupes.push({
            importedItem: item,
            existingId: match.id,
            existingLabel: match.name,
            diffs,
          })
          fieldSelections.set(match.id, new Set(diffs.map((d) => d.key)))
        } else {
          fresh.push(item)
        }
      }

      setNewItems(fresh)
      setDuplicates(dupes)
      setSelectedFields(fieldSelections)
    } catch {
      setNewItems(items)
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
        const hasDuplicateUpdates = duplicates.some(
          (d) => (selectedFields.get(d.existingId)?.size ?? 0) > 0
        )

        if (duplicates.length === 0 || !hasDuplicateUpdates) {
          if (newItems.length > 0) {
            await bulkCreateShoppingItems({
              items: newItems,
              listId,
              categoryMap,
            })
          }
        } else {
          const updates = duplicates
            .filter((d) => (selectedFields.get(d.existingId)?.size ?? 0) > 0)
            .map((d) => {
              const selected = selectedFields.get(d.existingId) ?? new Set()
              const item = d.importedItem
              const fields: {
                description?: string
                categoryId?: string | null
                priority?: Priority
                phase?: Phase | null
                estimatedPrice?: number
                url?: string
                imageUrl?: string
                storeName?: string
              } = {}

              if (selected.has("description")) fields.description = item.description
              if (selected.has("categoryName")) {
                fields.categoryId = item.categoryName ? categoryMap[item.categoryName] ?? null : null
              }
              if (selected.has("priority")) fields.priority = item.priority
              if (selected.has("phase")) fields.phase = item.phase ?? null
              if (selected.has("estimatedPrice")) fields.estimatedPrice = item.estimatedPrice
              if (selected.has("url")) fields.url = item.url
              if (selected.has("imageUrl")) fields.imageUrl = item.imageUrl
              if (selected.has("storeName")) fields.storeName = item.storeName

              return { id: d.existingId, fields }
            })

          await bulkImportShoppingItemsWithDuplicates({
            newItems,
            updates,
            listId,
            categoryMap,
          })
        }

        const totalImported = newItems.length + (hasDuplicateUpdates ? updateCount : 0)
        toast.success(`${totalImported} ${totalImported === 1 ? "produkt" : "produkter"} importert/oppdatert`)
        router.push(`/lists/${listId}`)
        router.refresh()
      } catch (err) {
        console.error("LLM import failed:", err)
        setImportError("Noe gikk galt under importen. Prøv igjen.")
      }
    })
  }

  function handleRemoveItem(index: number) {
    setNewItems((prev) => prev.filter((_, i) => i !== index))
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <LlmImportPageHeader
        backHref={`/lists/${listId}`}
        backLabel="Tilbake til listen"
        title={`Importer produkter til ${listName}`}
        description="Lim inn JSON fra en LLM, gå gjennom duplikater og importer med mye bedre plass enn i en modal."
        step={step}
      />

      {step === "prompt" && (
        <LlmImportPromptStep
          title="Kopier prompt til LLM"
          description="Bruk prompten under i ChatGPT, Claude eller annen LLM. Be modellen svare kun med JSON."
          prompt={prompt}
          copied={copied}
          onCopy={handleCopyPrompt}
          onNext={() => setStep("paste")}
          sidebar={
            <>
              <div className="rounded-lg border bg-muted/20 px-3 py-3">
              <div className="flex items-start gap-3 text-sm text-muted-foreground">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p>Kategorien bør matche en eksisterende kategori nøyaktig for at importen skal plassere produktet riktig.</p>
              </div>
              </div>
              <div className="rounded-lg border bg-muted/20 px-3 py-3">
              <div className="flex items-start gap-3 text-sm text-muted-foreground">
                <WandSparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p>Hvis et produkt finnes fra før, får du velge hvilke felt som skal oppdateres før noe skrives til listen.</p>
              </div>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">Tilgjengelige kategorier</p>
                <div className="flex flex-wrap gap-2">
                  {categories.map((category) => (
                    <Badge key={category.id} variant="secondary" className="text-xs">
                      {category.name}
                    </Badge>
                  ))}
                </div>
              </div>
            </>
          }
        />
      )}

      {step === "paste" && (
        <LlmImportPasteStep
          title="Lim inn JSON-svaret"
          label="JSON fra LLM"
          inputId="llm-json-input"
          value={jsonInput}
          onChange={(value) => {
            setJsonInput(value)
            setParseError(null)
          }}
          placeholder={'[\n  {\n    "name": "Produktnavn",\n    ...\n  }\n]'}
          parseError={parseError}
          showError={parsedItems.length === 0}
          onBack={() => setStep("prompt")}
          onParse={handleParse}
          isParsing={isCheckingDuplicates}
        />
      )}

      {step === "preview" && (
        <>
          <LlmImportPreviewHeader
            summary={
              duplicates.length > 0 ? (
                <DuplicateSummary
                  newCount={newItems.length}
                  duplicateCount={duplicates.length}
                  updateCount={updateCount}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {parsedItems.length} {parsedItems.length === 1 ? "produkt" : "produkter"} klare for import.
                </p>
              )
            }
            parseError={parseError}
            description="Gå gjennom nye produkter og velg hvilke duplikatfelt som skal oppdateres."
          />

          <div
            className={cn(
              "grid gap-6",
              duplicates.length > 0 &&
                newItems.length > 0 &&
                "xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
            )}
          >
            {duplicates.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-heading text-lg font-medium">Duplikater</h3>
                  <span className="text-sm text-muted-foreground">
                    {duplicates.length} {duplicates.length === 1 ? "treff" : "treff"}
                  </span>
                </div>
                <div className="space-y-2">
                  {duplicates.map((dup) => (
                    <DuplicateFieldDiffCard
                      key={dup.existingId}
                      label={dup.existingLabel}
                      diffs={dup.diffs}
                      selectedFields={selectedFields.get(dup.existingId) ?? new Set()}
                      onToggleField={(field) => handleToggleField(dup.existingId, field)}
                    />
                  ))}
                </div>
              </section>
            )}

            {newItems.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-heading text-lg font-medium">Nye produkter</h3>
                  <span className="text-sm text-muted-foreground">
                    {newItems.length} {newItems.length === 1 ? "produkt" : "produkter"}
                  </span>
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  {newItems.map((item, index) => (
                    <ImportItemPreviewCard
                      key={`new-${index}`}
                      item={item}
                      onRemove={() => handleRemoveItem(index)}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>

          <LlmImportStickyActions
            importError={importError}
            onBack={() => setStep("paste")}
            cancelHref={`/lists/${listId}`}
            onPrimary={handleImport}
            isPending={isPending}
            primaryDisabled={isPending || (newItems.length === 0 && updateCount === 0)}
            primaryLabel={
              newItems.length > 0 && updateCount > 0
                ? `Importer ${newItems.length} nye + oppdater ${updateCount}`
                : newItems.length > 0
                  ? `Importer ${newItems.length} ${newItems.length === 1 ? "produkt" : "produkter"}`
                  : `Oppdater ${updateCount} ${updateCount === 1 ? "produkt" : "produkter"}`
            }
          />
        </>
      )}
    </div>
  )
}

function ImportItemPreviewCard({
  item,
  onRemove,
}: {
  item: ParsedItem
  onRemove: () => void
}) {
  return (
    <div className="flex h-full items-start gap-3 rounded-lg border bg-card p-3 ring-1 ring-foreground/5">
      {item.imageUrl && (
        <img
          src={item.imageUrl}
          alt={item.name}
          className="h-14 w-14 shrink-0 rounded-md object-cover"
          onError={(e) => {
            e.currentTarget.style.display = "none"
          }}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="break-words font-medium">{item.name}</p>
            {item.description && (
              <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {item.estimatedPrice != null && (
              <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                {formatPrice(item.estimatedPrice)}
              </span>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onRemove}
            >
              <X className="h-3.5 w-3.5" />
              <span className="sr-only">Fjern {item.name}</span>
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {item.categoryName && (
            <Badge variant="outline" className="text-xs">
              {item.categoryName}
            </Badge>
          )}
          {item.priority && (
            <Badge variant="secondary" className="text-xs">
              {priorityLabel[item.priority] ?? item.priority}
            </Badge>
          )}
          {item.phase && (
            <Badge variant="secondary" className="text-xs">
              {phaseLabel[item.phase] ?? item.phase}
            </Badge>
          )}
          {item.storeName && (
            <Badge variant="outline" className="text-xs">
              {item.storeName}
            </Badge>
          )}
          {item.alternatives && item.alternatives.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {item.alternatives.length} {item.alternatives.length === 1 ? "alternativ" : "alternativer"}
            </Badge>
          )}
        </div>

        {item.alternatives && item.alternatives.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              {item.alternatives.map((alt, index) => (
                <div key={`${item.name}-${index}`} className="flex items-start gap-2">
                  {alt.imageUrl && (
                    <img
                      src={alt.imageUrl}
                      alt={alt.name}
                      className="mt-0.5 h-8 w-8 shrink-0 rounded object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = "none"
                      }}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-xs text-muted-foreground">{index + 1}.</span>
                      <span className="min-w-0 break-words text-sm">{alt.name}</span>
                      {alt.storeName && (
                        <span className="text-xs text-muted-foreground">{alt.storeName}</span>
                      )}
                    </div>
                    {alt.price != null && (
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {formatPrice(alt.price)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
