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
import { bulkCreateShoppingItems } from "@/lib/actions/shopping-item"
import type { Priority, Phase } from "@workspace/db"

interface LlmImportDialogProps {
  listId: string
  listName: string
  categories: Array<{ id: string; name: string; icon: string | null }>
}

interface ParsedItem {
  name: string
  description?: string
  categoryName?: string
  priority?: Priority
  phase?: Phase
  estimatedPrice?: number
  url?: string
  storeName?: string
}

function buildPrompt(listName: string, categories: Array<{ name: string; icon: string | null }>) {
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
  "storeName": "Butikknavn"
}

Regler:
- "name" er obligatorisk, alle andre felter er valgfrie
- "estimatedPrice" skal være et tall i NOK uten valutategn
- "priority": HIGH = må ha, MEDIUM = bør ha, LOW = kjekt å ha
- "phase": BEFORE_MOVE = før innflytting, FIRST_WEEK = første uke, CAN_WAIT = kan vente, NO_RUSH = ingen hast
- "categoryName" bør matche en av de tilgjengelige kategoriene nøyaktig
- Svar BARE med JSON-arrayen, ingen ekstra tekst

Eksempel på forventet svar:
[
  {
    "name": "KALLAX Hylle",
    "description": "4x2 hvit, 147x77 cm",
    "categoryName": "Møbler",
    "priority": "MEDIUM",
    "phase": "FIRST_WEEK",
    "estimatedPrice": 1299,
    "url": "https://www.ikea.com/no/no/p/kallax-hylle-hvit-20275814/",
    "storeName": "IKEA"
  }
]`
}

function parseJsonInput(raw: string): { items: ParsedItem[]; error: string | null } {
  const trimmed = raw.trim()

  // Try to extract JSON array from the input (LLMs sometimes wrap in markdown code blocks)
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
        item.url = entry.url.trim()
      }
      if (entry.storeName && typeof entry.storeName === "string") {
        item.storeName = entry.storeName.trim()
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

export function LlmImportDialog({ listId, listName, categories }: LlmImportDialogProps) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<"prompt" | "paste" | "preview">("prompt")
  const [copied, setCopied] = useState(false)
  const [jsonInput, setJsonInput] = useState("")
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([])
  const [parseError, setParseError] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const prompt = buildPrompt(listName, categories)

  function handleCopyPrompt() {
    navigator.clipboard.writeText(prompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleParse() {
    const { items, error } = parseJsonInput(jsonInput)
    setParsedItems(items)
    setParseError(error)
    if (items.length > 0) {
      setStep("preview")
    }
  }

  function handleImport() {
    setImportError(null)
    startTransition(async () => {
      try {
        const categoryMap: Record<string, string> = {}
        for (const cat of categories) {
          categoryMap[cat.name] = cat.id
        }

        await bulkCreateShoppingItems({
          items: parsedItems,
          listId,
          categoryMap,
        })

        handleReset()
        setOpen(false)
      } catch {
        setImportError("Noe gikk galt under importen. Prøv igjen.")
      }
    })
  }

  function handleReset() {
    setStep("prompt")
    setCopied(false)
    setJsonInput("")
    setParsedItems([])
    setParseError(null)
    setImportError(null)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) handleReset() }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <BotMessageSquare className="h-4 w-4" data-icon="inline-start" />
          LLM-import
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {step === "prompt" && "Kopier prompt til LLM"}
            {step === "paste" && "Lim inn JSON fra LLM"}
            {step === "preview" && "Forhåndsvisning"}
          </DialogTitle>
        </DialogHeader>

        {step === "prompt" && (
          <div className="flex flex-col gap-4 overflow-hidden">
            <p className="text-sm text-muted-foreground">
              Kopier prompten under og lim den inn i din favoritt-LLM (ChatGPT, Claude, osv.).
              LLM-en vil formatere produktene dine som JSON som du kan importere tilbake hit.
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
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Lim inn JSON-svaret du fikk fra LLM-en.
            </p>

            <div className="grid gap-1.5">
              <Label htmlFor="llm-json-input">JSON fra LLM</Label>
              <Textarea
                id="llm-json-input"
                value={jsonInput}
                onChange={(e) => {
                  setJsonInput(e.target.value)
                  setParseError(null)
                }}
                placeholder={'[\n  {\n    "name": "Produktnavn",\n    ...\n  }\n]'}
                rows={10}
                className="font-mono text-xs"
              />
            </div>

            {parseError && parsedItems.length === 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/5 p-3">
                <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <p className="text-sm text-destructive whitespace-pre-line">{parseError}</p>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setStep("prompt")}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Tilbake
              </Button>
              <Button
                onClick={handleParse}
                disabled={!jsonInput.trim()}
                className="flex-1"
              >
                <ClipboardPaste className="h-4 w-4" data-icon="inline-start" />
                Tolk JSON
              </Button>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="flex flex-col gap-4 overflow-hidden">
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">
                {parsedItems.length} {parsedItems.length === 1 ? "produkt" : "produkter"} klare for import.
              </p>
              {parseError && (
                <Badge variant="secondary" className="text-xs">
                  {parseError}
                </Badge>
              )}
            </div>

            <ScrollArea className="max-h-72 rounded-lg border">
              <div className="divide-y">
                {parsedItems.map((item, i) => (
                  <div key={i} className="flex flex-col gap-1 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm">{item.name}</span>
                      {item.estimatedPrice != null && (
                        <span className="text-sm tabular-nums text-muted-foreground">
                          {formatPrice(item.estimatedPrice)}
                        </span>
                      )}
                    </div>
                    {item.description && (
                      <p className="text-xs text-muted-foreground">{item.description}</p>
                    )}
                    <div className="flex flex-wrap gap-1.5 mt-0.5">
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
                    </div>
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
                disabled={isPending || parsedItems.length === 0}
                className="flex-1"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" data-icon="inline-start" />
                    Importerer...
                  </>
                ) : (
                  <>
                    Importer {parsedItems.length} {parsedItems.length === 1 ? "produkt" : "produkter"}
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
