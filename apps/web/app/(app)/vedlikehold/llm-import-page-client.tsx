"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Badge } from "@workspace/ui/components/badge"
import { cn } from "@workspace/ui/lib/utils"
import { Sparkles, WandSparkles } from "lucide-react"
import {
  bulkImportMaintenanceTasks,
  findExistingMaintenanceTasks,
  bulkImportMaintenanceTasksWithDuplicates,
  type ExistingMaintenanceTask,
} from "@/lib/actions/maintenance-task"
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
import { toast } from "sonner"

interface LlmImportPageClientProps {
  householdName?: string
}

interface ParsedVendor {
  name: string
  description?: string
  phone?: string
  email?: string
  website?: string
  estimatedPrice?: number
  notes?: string
}

interface ParsedProgressEntry {
  title: string
  description?: string
}

interface ParsedTask {
  title: string
  description?: string
  priority?: string
  estimatedDuration?: string
  estimatedPrice?: number
  dueDate?: string
  vendors: ParsedVendor[]
  progressEntries: ParsedProgressEntry[]
}

function buildPrompt() {
  return `Hjelp meg med å lage en oversikt over vedlikeholdsoppgaver for boligen min. Ta informasjonen jeg gir deg og formater det som JSON.

Svar KUN med en gyldig JSON-array, uten noe annet tekst rundt. Hver oppgave skal være et objekt med følgende felter:

{
  "title": "Tittel på oppgave (obligatorisk)",
  "description": "Detaljert beskrivelse av hva som må gjøres",
  "priority": "HIGH | MEDIUM | LOW",
  "estimatedDuration": "Antatt varighet, f.eks. '2 dager' eller '4 timer'",
  "estimatedPrice": 15000,
  "dueDate": "2025-06-01",
  "vendors": [
    {
      "name": "Firma/håndverker (obligatorisk)",
      "description": "Hva de tilbyr",
      "phone": "12345678",
      "email": "firma@example.com",
      "website": "https://firma.no",
      "estimatedPrice": 15000,
      "notes": "Tilleggsinfo om dette tilbudet"
    }
  ],
  "progressEntries": [
    {
      "title": "Steg i prosessen (obligatorisk)",
      "description": "Beskrivelse av steget"
    }
  ]
}

Regler:
- "title" er obligatorisk, alle andre felter er valgfrie
- "estimatedPrice" skal være tall i NOK uten valutategn
- "priority": HIGH = haster, MEDIUM = bør gjøres snart, LOW = kan vente
- "dueDate" skal være i formatet YYYY-MM-DD
- "vendors" er en liste med aktører/håndverkere som kan utføre jobben. Bruk denne for å sammenligne tilbud
- "progressEntries" er en sjekkliste med steg for å fullføre oppgaven
- URL-er skal være rene URL-er (https://...), IKKE markdown-lenker
- Svar BARE med JSON-arrayen, ingen ekstra tekst

Eksempel:
[
  {
    "title": "Male fasade",
    "description": "Hele huset må males utvendig. Gammel maling flasser.",
    "priority": "MEDIUM",
    "estimatedDuration": "1 uke",
    "estimatedPrice": 45000,
    "dueDate": "2025-08-01",
    "vendors": [
      {
        "name": "Malermester Hansen",
        "phone": "98765432",
        "email": "post@hansen-maler.no",
        "website": "https://hansen-maler.no",
        "estimatedPrice": 45000,
        "notes": "Anbefalt av naboen, 2 ukers leveringstid"
      },
      {
        "name": "Bygg & Mal AS",
        "estimatedPrice": 52000,
        "notes": "Inkluderer stillas"
      }
    ],
    "progressEntries": [
      { "title": "Innhente tilbud", "description": "Kontakte minst 3 firmaer" },
      { "title": "Velge aktør" },
      { "title": "Vaske og skrape fasade" },
      { "title": "Grunne og male" },
      { "title": "Sluttkontroll" }
    ]
  }
]`
}

function cleanMarkdownUrl(value: string): string {
  const match = value.match(/\[.*?\]\((.+)\)/)
  return match?.[1]?.trim() || value.trim()
}

function isValidCalendarDate(value: string): boolean {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return false

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

function parseJsonInput(raw: string): { tasks: ParsedTask[]; error: string | null } {
  const trimmed = raw.trim()

  let jsonStr = trimmed
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch?.[1]) {
    jsonStr = codeBlockMatch[1].trim()
  }

  try {
    const parsed = JSON.parse(jsonStr)

    if (!Array.isArray(parsed)) {
      return { tasks: [], error: "Forventet en JSON-array, men fikk et annet format." }
    }

    if (parsed.length === 0) {
      return { tasks: [], error: "JSON-arrayen er tom." }
    }

    const tasks: ParsedTask[] = []
    const errors: string[] = []

    for (let i = 0; i < parsed.length; i++) {
      const entry = parsed[i]

      if (!entry || typeof entry !== "object") {
        errors.push(`Element ${i + 1}: Ikke et gyldig objekt.`)
        continue
      }

      if (!entry.title || typeof entry.title !== "string" || !entry.title.trim()) {
        errors.push(`Element ${i + 1}: Mangler obligatorisk felt "title".`)
        continue
      }

      const task: ParsedTask = {
        title: String(entry.title).trim(),
        vendors: [],
        progressEntries: [],
      }

      if (entry.description && typeof entry.description === "string") task.description = entry.description.trim()
      if (entry.priority && typeof entry.priority === "string") {
        const p = entry.priority.toUpperCase()
        if (["HIGH", "MEDIUM", "LOW"].includes(p)) task.priority = p
      }
      if (entry.estimatedDuration && typeof entry.estimatedDuration === "string") {
        task.estimatedDuration = entry.estimatedDuration.trim()
      }
      if (entry.estimatedPrice != null) {
        const price = Number(entry.estimatedPrice)
        if (!isNaN(price) && price >= 0) task.estimatedPrice = price
      }
      if (entry.dueDate && typeof entry.dueDate === "string") {
        const dueDate = entry.dueDate.trim()
        if (isValidCalendarDate(dueDate)) task.dueDate = dueDate
      }

      if (Array.isArray(entry.vendors)) {
        for (const v of entry.vendors) {
          if (!v || typeof v !== "object") continue
          if (!v.name || typeof v.name !== "string" || !v.name.trim()) continue

          const vendor: ParsedVendor = { name: String(v.name).trim() }
          if (v.description && typeof v.description === "string") vendor.description = v.description.trim()
          if (v.phone && typeof v.phone === "string") vendor.phone = v.phone.trim()
          if (v.email && typeof v.email === "string") vendor.email = v.email.trim()
          if (v.website && typeof v.website === "string") vendor.website = cleanMarkdownUrl(v.website)
          if (v.estimatedPrice != null) {
            const vp = Number(v.estimatedPrice)
            if (!isNaN(vp) && vp >= 0) vendor.estimatedPrice = vp
          }
          if (v.notes && typeof v.notes === "string") vendor.notes = v.notes.trim()
          task.vendors.push(vendor)
        }
      }

      if (Array.isArray(entry.progressEntries)) {
        for (const pe of entry.progressEntries) {
          if (!pe || typeof pe !== "object") continue
          if (!pe.title || typeof pe.title !== "string" || !pe.title.trim()) continue

          const progressEntry: ParsedProgressEntry = { title: String(pe.title).trim() }
          if (pe.description && typeof pe.description === "string") {
            progressEntry.description = pe.description.trim()
          }
          task.progressEntries.push(progressEntry)
        }
      }

      tasks.push(task)
    }

    if (tasks.length === 0 && errors.length > 0) {
      return { tasks: [], error: errors.join("\n") }
    }

    return {
      tasks,
      error: errors.length > 0 ? `${tasks.length} oppgaver ble tolket. ${errors.length} ble hoppet over.` : null,
    }
  } catch {
    return { tasks: [], error: "Ugyldig JSON. Sjekk at du har limt inn et gyldig JSON-format." }
  }
}

const priorityLabel: Record<string, string> = {
  HIGH: "Høy",
  MEDIUM: "Medium",
  LOW: "Lav",
}

const formatPrice = (price: number) =>
  new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    maximumFractionDigits: 0,
  }).format(price)

type TaskDuplicate = DuplicateItem<ParsedTask>

function buildTaskDiffs(imported: ParsedTask, existing: ExistingMaintenanceTask): FieldDiff[] {
  return computeFieldDiffs([
    { key: "description", label: "Beskrivelse", existingValue: existing.description, newValue: imported.description },
    { key: "priority", label: "Prioritet", existingValue: existing.priority, newValue: imported.priority, format: (v) => priorityLabel[String(v)] ?? String(v) },
    { key: "estimatedDuration", label: "Varighet", existingValue: existing.estimatedDuration, newValue: imported.estimatedDuration },
    { key: "estimatedPrice", label: "Pris", existingValue: existing.estimatedPrice, newValue: imported.estimatedPrice, format: (v) => formatPrice(Number(v)) },
    { key: "dueDate", label: "Frist", existingValue: existing.dueDate, newValue: imported.dueDate, format: (v) => new Date(String(v)).toLocaleDateString("nb-NO") },
  ])
}

export function MaintenanceLlmImportPageClient({
  householdName,
}: LlmImportPageClientProps) {
  const router = useRouter()
  const [step, setStep] = useState<"prompt" | "paste" | "preview">("prompt")
  const [copied, setCopied] = useState(false)
  const [jsonInput, setJsonInput] = useState("")
  const [parsedTasks, setParsedTasks] = useState<ParsedTask[]>([])
  const [parseError, setParseError] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [newTasks, setNewTasks] = useState<ParsedTask[]>([])
  const [duplicates, setDuplicates] = useState<TaskDuplicate[]>([])
  const [selectedFields, setSelectedFields] = useState<Map<string, Set<string>>>(new Map())
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false)

  const prompt = buildPrompt()
  const updateCount = duplicates.filter((d) => (selectedFields.get(d.existingId)?.size ?? 0) > 0).length
  const totalItems = parsedTasks.length

  function handleCopyPrompt() {
    navigator.clipboard.writeText(prompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleParse() {
    const { tasks, error } = parseJsonInput(jsonInput)
    setParsedTasks(tasks)
    setParseError(error)

    if (tasks.length === 0) return

    setIsCheckingDuplicates(true)
    try {
      const titles = tasks.map((t) => t.title)
      const existing = await findExistingMaintenanceTasks(titles)

      const existingByTitle = new Map<string, ExistingMaintenanceTask>()
      for (const e of existing) existingByTitle.set(e.title.toLowerCase(), e)

      const newItems: ParsedTask[] = []
      const dupes: TaskDuplicate[] = []
      const fieldSelections = new Map<string, Set<string>>()

      for (const task of tasks) {
        const match = existingByTitle.get(task.title.toLowerCase())
        if (match) {
          const diffs = buildTaskDiffs(task, match)
          dupes.push({
            importedItem: task,
            existingId: match.id,
            existingLabel: match.title,
            diffs,
          })
          fieldSelections.set(match.id, new Set(diffs.map((d) => d.key)))
        } else {
          newItems.push(task)
        }
      }

      setNewTasks(newItems)
      setDuplicates(dupes)
      setSelectedFields(fieldSelections)
    } catch {
      setNewTasks(tasks)
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
        const hasDuplicateUpdates = duplicates.some((d) => (selectedFields.get(d.existingId)?.size ?? 0) > 0)

        if (duplicates.length === 0 || !hasDuplicateUpdates) {
          if (newTasks.length > 0) {
            await bulkImportMaintenanceTasks({ tasks: newTasks })
          }
        } else {
          const updates = duplicates
            .filter((d) => (selectedFields.get(d.existingId)?.size ?? 0) > 0)
            .map((d) => {
              const selected = selectedFields.get(d.existingId) ?? new Set()
              const item = d.importedItem
              const fields: {
                description?: string
                priority?: string
                estimatedDuration?: string
                estimatedPrice?: number
                dueDate?: string
              } = {}

              if (selected.has("description")) fields.description = item.description
              if (selected.has("priority")) fields.priority = item.priority
              if (selected.has("estimatedDuration")) fields.estimatedDuration = item.estimatedDuration
              if (selected.has("estimatedPrice")) fields.estimatedPrice = item.estimatedPrice
              if (selected.has("dueDate")) fields.dueDate = item.dueDate
              return { id: d.existingId, fields }
            })

          await bulkImportMaintenanceTasksWithDuplicates({
            newTasks,
            updates,
          })
        }

        handleReset()
        router.push("/vedlikehold")
        router.refresh()
        toast.success("Vedlikeholdsoppgaver importert")
      } catch (err) {
        console.error("Maintenance LLM import failed:", err)
        setImportError("Noe gikk galt under importen. Prøv igjen.")
      }
    })
  }

  function handleReset() {
    setStep("prompt")
    setCopied(false)
    setJsonInput("")
    setParsedTasks([])
    setParseError(null)
    setImportError(null)
    setNewTasks([])
    setDuplicates([])
    setSelectedFields(new Map())
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <LlmImportPageHeader
        backHref="/vedlikehold"
        backLabel="Tilbake til vedlikehold"
        title={`Importer vedlikeholdsoppgaver${householdName ? ` for ${householdName}` : ""}`}
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
                  <p>Oppgaver med samme tittel blir behandlet som duplikater, så du kan velge hvilke felt som skal oppdateres.</p>
                </div>
              </div>
              <div className="rounded-lg border bg-muted/20 px-3 py-3">
                <div className="flex items-start gap-3 text-sm text-muted-foreground">
                  <WandSparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <p>Vendors og fremdriftspunkter kan være detaljerte, men modellen bør fortsatt kun svare med ren JSON.</p>
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
          inputId="maintenance-json-input"
          value={jsonInput}
          onChange={(value) => {
            setJsonInput(value)
            setParseError(null)
          }}
          placeholder={'[\n  {\n    "title": "Oppgavetittel",\n    ...\n  }\n]'}
          parseError={parseError}
          showError={parsedTasks.length === 0}
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
                  newCount={newTasks.length}
                  duplicateCount={duplicates.length}
                  updateCount={updateCount}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {totalItems} {totalItems === 1 ? "oppgave" : "oppgaver"} klare for import.
                </p>
              )
            }
            parseError={parseError}
            description="Gå gjennom nye oppgaver og velg hvilke duplikatfelt som skal oppdateres."
          />

          <div
            className={cn(
              "grid gap-6",
              duplicates.length > 0 &&
                newTasks.length > 0 &&
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

            {newTasks.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-heading text-lg font-medium">Nye oppgaver</h3>
                  <span className="text-sm text-muted-foreground">
                    {newTasks.length} {newTasks.length === 1 ? "oppgave" : "oppgaver"}
                  </span>
                </div>
                <div className="space-y-3">
                  {newTasks.map((task, i) => (
                    <div key={`new-${i}`} className="rounded-lg border bg-card p-3 ring-1 ring-foreground/5">
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0 flex-1 break-words font-medium text-sm">
                          {task.title}
                        </span>
                        {task.estimatedPrice != null && (
                          <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                            {formatPrice(task.estimatedPrice)}
                          </span>
                        )}
                      </div>
                      {task.description && (
                        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                          {task.description}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {task.priority && (
                          <Badge variant="secondary" className="text-xs">
                            {priorityLabel[task.priority] ?? task.priority}
                          </Badge>
                        )}
                        {task.estimatedDuration && (
                          <Badge variant="outline" className="text-xs">
                            {task.estimatedDuration}
                          </Badge>
                        )}
                        {task.dueDate && (
                          <Badge variant="outline" className="text-xs">
                            {new Date(task.dueDate).toLocaleDateString("nb-NO")}
                          </Badge>
                        )}
                        {task.vendors.length > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {task.vendors.length} {task.vendors.length === 1 ? "aktør" : "aktører"}
                          </Badge>
                        )}
                        {task.progressEntries.length > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {task.progressEntries.length} steg
                          </Badge>
                        )}
                      </div>
                      {task.vendors.length > 0 && (
                        <div className="mt-2 space-y-1 border-l-2 border-muted pl-2">
                          {task.vendors.map((vendor, j) => (
                            <div key={j} className="flex items-start justify-between gap-2">
                              <div className="flex min-w-0 items-start gap-1.5">
                                <span className="shrink-0 text-xs font-medium text-muted-foreground">
                                  {j + 1}.
                                </span>
                                <span className="break-words text-xs">{vendor.name}</span>
                              </div>
                              {vendor.estimatedPrice != null && (
                                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                  {formatPrice(vendor.estimatedPrice)}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {task.progressEntries.length > 0 && (
                        <div className="mt-2 space-y-0.5 border-l-2 border-muted pl-2">
                          {task.progressEntries.map((entry, j) => (
                            <div key={j} className="flex items-start gap-1.5">
                              <span className="shrink-0 text-xs text-muted-foreground">☐</span>
                              <span className="break-words text-xs">{entry.title}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          <LlmImportStickyActions
            importError={importError}
            onBack={() => setStep("paste")}
            cancelHref="/vedlikehold"
            onPrimary={handleImport}
            isPending={isPending}
            primaryDisabled={isPending || (newTasks.length === 0 && updateCount === 0)}
            primaryLabel={
              newTasks.length > 0 && updateCount > 0
                ? `Importer ${newTasks.length} nye + oppdater ${updateCount}`
                : newTasks.length > 0
                  ? `Importer ${newTasks.length} ${newTasks.length === 1 ? "oppgave" : "oppgaver"}`
                  : `Oppdater ${updateCount} ${updateCount === 1 ? "oppgave" : "oppgaver"}`
            }
          />
        </>
      )}
    </div>
  )
}
