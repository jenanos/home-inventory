"use client"

import { useState, useTransition } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { Button } from "@workspace/ui/components/button"
import { Textarea } from "@workspace/ui/components/textarea"
import { Label } from "@workspace/ui/components/label"
import { Badge } from "@workspace/ui/components/badge"
import { Separator } from "@workspace/ui/components/separator"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import {
  BotMessageSquare,
  Copy,
  Check,
  Loader2,
  ClipboardPaste,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
} from "lucide-react"
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

// ─── Types ─────────────────────────────────────────────────────

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

// ─── Prompt ────────────────────────────────────────────────────

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

// ─── Parsing ───────────────────────────────────────────────────

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

      if (entry.description && typeof entry.description === "string") {
        task.description = entry.description.trim()
      }
      if (entry.priority && typeof entry.priority === "string") {
        const p = entry.priority.toUpperCase()
        if (["HIGH", "MEDIUM", "LOW"].includes(p)) {
          task.priority = p
        }
      }
      if (entry.estimatedDuration && typeof entry.estimatedDuration === "string") {
        task.estimatedDuration = entry.estimatedDuration.trim()
      }
      if (entry.estimatedPrice != null) {
        const price = Number(entry.estimatedPrice)
        if (!isNaN(price) && price >= 0) {
          task.estimatedPrice = price
        }
      }
      if (entry.dueDate && typeof entry.dueDate === "string") {
        const dueDate = entry.dueDate.trim()
        if (isValidCalendarDate(dueDate)) {
          task.dueDate = dueDate
        }
      }

      // Parse vendors
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

      // Parse progress entries
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

// ─── Duplicate helpers ─────────────────────────────────────────

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

// ─── Component ─────────────────────────────────────────────────

export function MaintenanceLlmImportDialog() {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<"prompt" | "paste" | "preview">("prompt")
  const [copied, setCopied] = useState(false)
  const [jsonInput, setJsonInput] = useState("")
  const [parsedTasks, setParsedTasks] = useState<ParsedTask[]>([])
  const [parseError, setParseError] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Duplicate state
  const [newTasks, setNewTasks] = useState<ParsedTask[]>([])
  const [duplicates, setDuplicates] = useState<TaskDuplicate[]>([])
  const [selectedFields, setSelectedFields] = useState<Map<string, Set<string>>>(new Map())
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false)

  const prompt = buildPrompt()

  function handleCopyPrompt() {
    navigator.clipboard.writeText(prompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleParse() {
    const { tasks, error } = parseJsonInput(jsonInput)
    setParsedTasks(tasks)
    setParseError(error)
    if (tasks.length > 0) {
      // Check for duplicates
      setIsCheckingDuplicates(true)
      try {
        const titles = tasks.map((t) => t.title)
        const existing = await findExistingMaintenanceTasks(titles)

        const existingByTitle = new Map<string, ExistingMaintenanceTask>()
        for (const e of existing) {
          existingByTitle.set(e.title.toLowerCase(), e)
        }

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
            // Pre-select all diff fields
            fieldSelections.set(match.id, new Set(diffs.map((d) => d.key)))
          } else {
            newItems.push(task)
          }
        }

        setNewTasks(newItems)
        setDuplicates(dupes)
        setSelectedFields(fieldSelections)
      } catch {
        // If duplicate check fails, treat all as new
        setNewTasks(tasks)
        setDuplicates([])
        setSelectedFields(new Map())
      } finally {
        setIsCheckingDuplicates(false)
      }
      setStep("preview")
    }
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
          // No duplicates or no updates selected - use the simple import
          if (newTasks.length > 0) {
            await bulkImportMaintenanceTasks({ tasks: newTasks })
          }
        } else {
          // Build updates from selected fields
          const updates = duplicates
            .filter((d) => (selectedFields.get(d.existingId)?.size ?? 0) > 0)
            .map((d) => {
              const fields: Record<string, unknown> = {}
              const selected = selectedFields.get(d.existingId) ?? new Set()
              for (const key of selected) {
                fields[key] = d.importedItem[key as keyof ParsedTask]
              }
              return { id: d.existingId, fields: fields as Record<string, string | number | undefined> }
            })

          await bulkImportMaintenanceTasksWithDuplicates({
            newTasks,
            updates,
          })
        }

        handleReset()
        setOpen(false)
      } catch (err) {
        console.error("Maintenance LLM import failed:", err)
        setImportError("Noe gikk galt under importen. Prøv igjen.")
      }
    })
  }

  const updateCount = duplicates.filter(
    (d) => (selectedFields.get(d.existingId)?.size ?? 0) > 0
  ).length

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

  function handleOpenChange(v: boolean) {
    setOpen(v)
    if (!v) handleReset()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <BotMessageSquare className="h-4 w-4" data-icon="inline-start" />
          LLM-import
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>
            {step === "prompt" && "Kopier prompt til LLM"}
            {step === "paste" && "Lim inn JSON fra LLM"}
            {step === "preview" && "Forhåndsvisning"}
          </DialogTitle>
        </DialogHeader>

        {step === "prompt" && (
          <div className="flex flex-col gap-4 flex-1 min-h-0 overflow-hidden">
            <p className="text-sm text-muted-foreground shrink-0">
              Kopier prompten under og lim den inn i din favoritt-LLM (ChatGPT, Claude, osv.).
              LLM-en vil formatere vedlikeholdsoppgavene dine som JSON som du kan importere tilbake hit.
            </p>

            <div className="relative overflow-hidden rounded-lg border bg-muted/50">
              <ScrollArea className="max-h-64 p-3">
                <pre className="whitespace-pre-wrap text-xs leading-relaxed font-mono">
                  {prompt}
                </pre>
              </ScrollArea>
            </div>

            <div className="flex items-center gap-2">
              <Button onClick={handleCopyPrompt} className="flex-1">
                {copied ? (
                  <>
                    <Check className="h-4 w-4" data-icon="inline-start" />
                    Kopiert!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" data-icon="inline-start" />
                    Kopier prompt
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={() => setStep("paste")}>
                Neste
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {step === "paste" && (
          <div className="flex flex-col gap-4 flex-1 min-h-0 overflow-hidden">
            <p className="text-sm text-muted-foreground shrink-0">
              Lim inn JSON-svaret du fikk fra LLM-en.
            </p>

            <div className="flex flex-col gap-1.5 flex-1 min-h-0">
              <Label htmlFor="maintenance-json-input" className="shrink-0">JSON fra LLM</Label>
              <Textarea
                id="maintenance-json-input"
                value={jsonInput}
                onChange={(e) => {
                  setJsonInput(e.target.value)
                  setParseError(null)
                }}
                placeholder={'[\n  {\n    "title": "Oppgavetittel",\n    ...\n  }\n]'}
                rows={10}
                className="font-mono text-xs flex-1 min-h-32 resize-y"
              />
            </div>

            {parseError && parsedTasks.length === 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/5 p-3">
                <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <p className="text-sm text-destructive whitespace-pre-line">{parseError}</p>
              </div>
            )}

            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" onClick={() => setStep("prompt")}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Tilbake
              </Button>
              <Button
                onClick={handleParse}
                disabled={!jsonInput.trim() || isCheckingDuplicates}
                className="flex-1"
              >
                {isCheckingDuplicates ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" data-icon="inline-start" />
                    Sjekker duplikater...
                  </>
                ) : (
                  <>
                    <ClipboardPaste className="h-4 w-4" data-icon="inline-start" />
                    Tolk JSON
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="flex flex-col gap-4 flex-1 min-h-0 overflow-hidden">
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              {duplicates.length > 0 ? (
                <DuplicateSummary
                  newCount={newTasks.length}
                  duplicateCount={duplicates.length}
                  updateCount={updateCount}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {parsedTasks.length} {parsedTasks.length === 1 ? "oppgave" : "oppgaver"} klare for import.
                </p>
              )}
              {parseError && (
                <Badge variant="secondary" className="text-xs">
                  {parseError}
                </Badge>
              )}
            </div>

            <ScrollArea className="max-h-72 rounded-lg border">
              <div className="divide-y">
                {/* Duplicates first */}
                {duplicates.map((dup) => (
                  <div key={dup.existingId} className="p-3">
                    <DuplicateFieldDiffCard
                      label={dup.existingLabel}
                      diffs={dup.diffs}
                      selectedFields={selectedFields.get(dup.existingId) ?? new Set()}
                      onToggleField={(field) => handleToggleField(dup.existingId, field)}
                    />
                  </div>
                ))}

                {/* New tasks */}
                {newTasks.map((task, i) => (
                  <div key={`new-${i}`} className="flex flex-col gap-1.5 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm">{task.title}</span>
                      {task.estimatedPrice != null && (
                        <span className="text-sm tabular-nums text-muted-foreground">
                          {formatPrice(task.estimatedPrice)}
                        </span>
                      )}
                    </div>
                    {task.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{task.description}</p>
                    )}
                    <div className="flex flex-wrap gap-1.5">
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
                      <div className="mt-1 space-y-1 pl-2 border-l-2 border-muted">
                        {task.vendors.map((v, j) => (
                          <div key={j} className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-xs text-muted-foreground font-medium shrink-0">
                                {j + 1}.
                              </span>
                              <span className="text-xs truncate">{v.name}</span>
                            </div>
                            {v.estimatedPrice != null && (
                              <span className="text-xs tabular-nums text-muted-foreground shrink-0">
                                {formatPrice(v.estimatedPrice)}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {task.progressEntries.length > 0 && (
                      <div className="mt-1 space-y-0.5 pl-2 border-l-2 border-muted">
                        {task.progressEntries.map((pe, j) => (
                          <div key={j} className="flex items-center gap-1.5">
                            <span className="text-xs text-muted-foreground">☐</span>
                            <span className="text-xs">{pe.title}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>

            <Separator />

            {importError && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/5 p-3">
                <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <p className="text-sm text-destructive">{importError}</p>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setStep("paste")}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Tilbake
              </Button>
              <Button
                onClick={handleImport}
                disabled={isPending || (newTasks.length === 0 && updateCount === 0)}
                className="flex-1"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" data-icon="inline-start" />
                    Importerer...
                  </>
                ) : (
                  <>
                    {newTasks.length > 0 && updateCount > 0
                      ? `Importer ${newTasks.length} nye + oppdater ${updateCount}`
                      : newTasks.length > 0
                        ? `Importer ${newTasks.length} ${newTasks.length === 1 ? "oppgave" : "oppgaver"}`
                        : `Oppdater ${updateCount} ${updateCount === 1 ? "oppgave" : "oppgaver"}`
                    }
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
