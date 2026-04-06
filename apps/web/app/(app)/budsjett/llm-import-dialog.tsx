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
import { bulkImportBudget } from "@/lib/actions/budget"

// ─── Types ─────────────────────────────────────────────────────

interface ParsedMember {
  name: string
  grossMonthlyIncome: number
  taxPercent: number
}

interface ParsedLoan {
  bankName: string
  loanName: string
  loanType: string
  monthlyInterest: number
  monthlyPrincipal: number
  monthlyFees: number
}

interface ParsedTrip {
  name: string
  transportType: string
  annualTrips: number
  ticketPerTrip?: number
  tollPerTrip?: number
  ferryPerTrip?: number
  fuelPerTrip?: number
}

interface ParsedEntry {
  name: string
  category?: string
  type: string
  monthlyAmount: number
}

interface ParsedBudgetData {
  members: ParsedMember[]
  loans: ParsedLoan[]
  trips: ParsedTrip[]
  entries: ParsedEntry[]
}

// ─── Prompt ────────────────────────────────────────────────────

function buildPrompt() {
  return `Hjelp meg med å sette opp et budsjett for husstanden min. Ta informasjonen jeg gir deg om inntekter, lån, reiser og kostnader og formater det som JSON.

Svar KUN med et gyldig JSON-objekt, uten noe annet tekst rundt. Objektet skal ha følgende struktur:

{
  "members": [
    {
      "name": "Navn på person (obligatorisk)",
      "grossMonthlyIncome": 50000,
      "taxPercent": 34
    }
  ],
  "loans": [
    {
      "bankName": "Banknavn (obligatorisk)",
      "loanName": "Navn på lån (obligatorisk)",
      "loanType": "MORTGAGE",
      "monthlyInterest": 5000,
      "monthlyPrincipal": 3000,
      "monthlyFees": 50
    }
  ],
  "trips": [
    {
      "name": "Påsketur til familie",
      "transportType": "CAR",
      "annualTrips": 4,
      "tollPerTrip": 350,
      "ferryPerTrip": 200,
      "fuelPerTrip": 600
    }
  ],
  "entries": [
    {
      "name": "Navn på post (obligatorisk)",
      "category": "ELECTRICITY",
      "type": "EXPENSE",
      "monthlyAmount": 2000
    }
  ]
}

Regler:
- Alle listene (members, loans, trips, entries) er valgfrie – inkluder bare de som er relevante
- Alle beløp skal være tall i NOK
- For trips skal kostnader være per reise, mens appen regner om til månedskostnad ved å dele årssum på 12

For "members":
- "name" er obligatorisk
- "grossMonthlyIncome" er brutto månedsinntekt
- "taxPercent" er skatteprosent (typisk 25-40%)

For "loans":
- "bankName" og "loanName" er obligatoriske
- "loanType" kan være "MORTGAGE" (default) eller "OTHER"
- Bruk flere låneposter for å splitte boliglån på flere banker (f.eks. SPK + annen bank)
- "monthlyInterest" er månedlige rentekostnader
- "monthlyPrincipal" er månedlig avdrag
- "monthlyFees" er månedlige gebyrer (valgfritt, standard 0)

For "trips":
- "name" er obligatorisk
- "transportType" er obligatorisk: "AIR_OR_PUBLIC" eller "CAR"
- "annualTrips" er obligatorisk (antall reiser per år)
- Hvis transportType="AIR_OR_PUBLIC": bruk "ticketPerTrip"
- Hvis transportType="CAR": bruk "tollPerTrip", "ferryPerTrip" og eventuelt "fuelPerTrip"

For "entries":
- "name" er obligatorisk
- "type" er obligatorisk: "INCOME" (inntekt), "EXPENSE" (utgift), eller "DEDUCTION" (fradrag)
- "category" er valgfritt, og kan være en av:
  Boligkostnader: ELECTRICITY (strøm), MUNICIPAL_FEES (kommunale avgifter), INSURANCE (forsikring), HOME_MAINTENANCE (vedlikehold)
  Faste kostnader: TRANSPORT, SUBSCRIPTIONS (abonnement), FOOD (mat), CHILDREN (barn), PERSONAL (personlig), SAVINGS (sparing), BUFFER
- "monthlyAmount" er beløp per måned

Eksempel:
{
  "members": [
    { "name": "Ola", "grossMonthlyIncome": 55000, "taxPercent": 34 },
    { "name": "Kari", "grossMonthlyIncome": 48000, "taxPercent": 30 }
  ],
  "loans": [
    { "bankName": "SPK", "loanName": "Boliglån del 1", "loanType": "MORTGAGE", "monthlyInterest": 4200, "monthlyPrincipal": 3500, "monthlyFees": 0 },
    { "bankName": "DNB", "loanName": "Boliglån del 2", "loanType": "MORTGAGE", "monthlyInterest": 4300, "monthlyPrincipal": 4200, "monthlyFees": 50 }
  ],
  "trips": [
    { "name": "Sommerferie", "transportType": "AIR_OR_PUBLIC", "annualTrips": 1, "ticketPerTrip": 12000 },
    { "name": "Hytteturer", "transportType": "CAR", "annualTrips": 10, "tollPerTrip": 160, "ferryPerTrip": 120, "fuelPerTrip": 500 }
  ],
  "entries": [
    { "name": "Strøm", "category": "ELECTRICITY", "type": "EXPENSE", "monthlyAmount": 2500 },
    { "name": "Dagligvarer", "category": "FOOD", "type": "EXPENSE", "monthlyAmount": 8000 }
  ]
}`
}

// ─── Parsing ───────────────────────────────────────────────────

const VALID_ENTRY_TYPES = new Set(["INCOME", "EXPENSE", "DEDUCTION"])
const VALID_LOAN_TYPES = new Set(["MORTGAGE", "OTHER"])
const VALID_TRIP_TYPES = new Set(["AIR_OR_PUBLIC", "CAR"])
const VALID_CATEGORIES = new Set([
  "ELECTRICITY", "MUNICIPAL_FEES", "INSURANCE", "HOME_MAINTENANCE",
  "TRANSPORT", "SUBSCRIPTIONS", "FOOD", "CHILDREN", "PERSONAL", "SAVINGS", "BUFFER",
])

const CATEGORY_LABELS: Record<string, string> = {
  ELECTRICITY: "Strøm",
  MUNICIPAL_FEES: "Kommunale avgifter",
  INSURANCE: "Forsikring",
  HOME_MAINTENANCE: "Vedlikehold",
  TRANSPORT: "Transport",
  SUBSCRIPTIONS: "Abonnement",
  FOOD: "Mat",
  CHILDREN: "Barn",
  PERSONAL: "Personlig forbruk",
  SAVINGS: "Sparing",
  BUFFER: "Buffer",
}

const ENTRY_TYPE_LABELS: Record<string, string> = {
  INCOME: "Inntekt",
  EXPENSE: "Kostnad",
  DEDUCTION: "Fradrag",
}

function parseJsonInput(raw: string): { data: ParsedBudgetData; error: string | null } {
  const trimmed = raw.trim()

  let jsonStr = trimmed
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch?.[1]) {
    jsonStr = codeBlockMatch[1].trim()
  }

  try {
    const parsed = JSON.parse(jsonStr)

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { data: { members: [], loans: [], trips: [], entries: [] }, error: "Forventet et JSON-objekt med members, loans, trips og/eller entries." }
    }

    const result: ParsedBudgetData = { members: [], loans: [], trips: [], entries: [] }
    const errors: string[] = []

    // Parse members
    if (Array.isArray(parsed.members)) {
      for (let i = 0; i < parsed.members.length; i++) {
        const m = parsed.members[i]
        if (!m?.name || typeof m.name !== "string" || !m.name.trim()) {
          errors.push(`Medlem ${i + 1}: Mangler "name".`)
          continue
        }
        const income = Number(m.grossMonthlyIncome)
        const tax = Number(m.taxPercent)
        if (isNaN(income) || income < 0) {
          errors.push(`Medlem ${i + 1}: Ugyldig "grossMonthlyIncome".`)
          continue
        }
        result.members.push({
          name: m.name.trim(),
          grossMonthlyIncome: income,
          taxPercent: isNaN(tax) || tax < 0 || tax > 100 ? 30 : tax,
        })
      }
    }

    // Parse loans
    if (Array.isArray(parsed.loans)) {
      for (let i = 0; i < parsed.loans.length; i++) {
        const l = parsed.loans[i]
        if (
          !l?.bankName ||
          typeof l.bankName !== "string" ||
          !l.bankName.trim() ||
          !l?.loanName ||
          typeof l.loanName !== "string" ||
          !l.loanName.trim()
        ) {
          errors.push(`Lån ${i + 1}: Mangler "bankName" eller "loanName".`)
          continue
        }
        const interest = Number(l.monthlyInterest)
        const principal = Number(l.monthlyPrincipal)
        if (isNaN(interest) || isNaN(principal)) {
          errors.push(`Lån ${i + 1}: Ugyldig rente eller avdrag.`)
          continue
        }
        const loanType = String(l.loanType ?? "MORTGAGE").toUpperCase()
        result.loans.push({
          bankName: String(l.bankName).trim(),
          loanName: String(l.loanName).trim(),
          loanType: VALID_LOAN_TYPES.has(loanType) ? loanType : "MORTGAGE",
          monthlyInterest: interest,
          monthlyPrincipal: principal,
          monthlyFees: isNaN(Number(l.monthlyFees)) ? 0 : Number(l.monthlyFees),
        })
      }
    }

    // Parse trips
    if (Array.isArray(parsed.trips)) {
      for (let i = 0; i < parsed.trips.length; i++) {
        const t = parsed.trips[i]
        if (!t?.name || typeof t.name !== "string" || !t.name.trim()) {
          errors.push(`Reise ${i + 1}: Mangler "name".`)
          continue
        }
        const transportType = String(t.transportType ?? "").toUpperCase()
        if (!VALID_TRIP_TYPES.has(transportType)) {
          errors.push(`Reise ${i + 1}: Ugyldig "transportType".`)
          continue
        }
        const annualTrips = Math.round(Number(t.annualTrips))
        if (isNaN(annualTrips) || annualTrips <= 0) {
          errors.push(`Reise ${i + 1}: Ugyldig "annualTrips".`)
          continue
        }
        result.trips.push({
          name: t.name.trim(),
          transportType,
          annualTrips,
          ticketPerTrip: Number(t.ticketPerTrip) || 0,
          tollPerTrip: Number(t.tollPerTrip) || 0,
          ferryPerTrip: Number(t.ferryPerTrip) || 0,
          fuelPerTrip: Number(t.fuelPerTrip) || 0,
        })
      }
    }

    // Parse entries
    if (Array.isArray(parsed.entries)) {
      for (let i = 0; i < parsed.entries.length; i++) {
        const e = parsed.entries[i]
        if (!e?.name || typeof e.name !== "string" || !e.name.trim()) {
          errors.push(`Post ${i + 1}: Mangler "name".`)
          continue
        }
        const type = String(e.type ?? "").toUpperCase()
        if (!VALID_ENTRY_TYPES.has(type)) {
          errors.push(`Post ${i + 1}: Ugyldig type "${e.type}".`)
          continue
        }
        const amount = Number(e.monthlyAmount)
        if (isNaN(amount) || amount < 0) {
          errors.push(`Post ${i + 1}: Ugyldig "monthlyAmount".`)
          continue
        }
        const category = e.category ? String(e.category).toUpperCase() : undefined
        result.entries.push({
          name: e.name.trim(),
          category: category && VALID_CATEGORIES.has(category) ? category : undefined,
          type,
          monthlyAmount: amount,
        })
      }
    }

    const totalItems = result.members.length + result.loans.length + result.trips.length + result.entries.length
    if (totalItems === 0 && errors.length > 0) {
      return { data: result, error: errors.join("\n") }
    }
    if (totalItems === 0) {
      return { data: result, error: "Ingen data funnet i JSON." }
    }

    return {
      data: result,
      error: errors.length > 0 ? `${totalItems} poster tolket. ${errors.length} ble hoppet over.` : null,
    }
  } catch {
    return { data: { members: [], loans: [], trips: [], entries: [] }, error: "Ugyldig JSON. Sjekk at du har limt inn et gyldig JSON-format." }
  }
}

const formatPrice = (price: number) =>
  new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    maximumFractionDigits: 0,
  }).format(price)

// ─── Component ─────────────────────────────────────────────────

export function BudgetLlmImportDialog() {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<"prompt" | "paste" | "preview">("prompt")
  const [copied, setCopied] = useState(false)
  const [jsonInput, setJsonInput] = useState("")
  const [parsedData, setParsedData] = useState<ParsedBudgetData>({ members: [], loans: [], trips: [], entries: [] })
  const [parseError, setParseError] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const prompt = buildPrompt()

  function handleCopyPrompt() {
    navigator.clipboard.writeText(prompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleParse() {
    const { data, error } = parseJsonInput(jsonInput)
    setParsedData(data)
    setParseError(error)
    const totalItems = data.members.length + data.loans.length + data.trips.length + data.entries.length
    if (totalItems > 0) {
      setStep("preview")
    }
  }

  function handleImport() {
    setImportError(null)
    startTransition(async () => {
      try {
        await bulkImportBudget({
          members: parsedData.members,
          loans: parsedData.loans,
          trips: parsedData.trips,
          entries: parsedData.entries,
        })
        handleReset()
        setOpen(false)
      } catch (err) {
        console.error("Budget LLM import failed:", err)
        setImportError("Noe gikk galt under importen. Prøv igjen.")
      }
    })
  }

  function handleReset() {
    setStep("prompt")
    setCopied(false)
    setJsonInput("")
    setParsedData({ members: [], loans: [], trips: [], entries: [] })
    setParseError(null)
    setImportError(null)
  }

  function handleOpenChange(v: boolean) {
    setOpen(v)
    if (!v) handleReset()
  }

  const totalItems = parsedData.members.length + parsedData.loans.length + parsedData.trips.length + parsedData.entries.length

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
              LLM-en vil formatere budsjettdataene dine som JSON som du kan importere tilbake hit.
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
              <Label htmlFor="budget-json-input" className="shrink-0">JSON fra LLM</Label>
              <Textarea
                id="budget-json-input"
                value={jsonInput}
                onChange={(e) => {
                  setJsonInput(e.target.value)
                  setParseError(null)
                }}
                placeholder={'{\n  "members": [...],\n  "loans": [...],\n  "entries": [...]\n}'}
                rows={10}
                className="font-mono text-xs flex-1 min-h-32 resize-y"
              />
            </div>

            {parseError && totalItems === 0 && (
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
          <div className="flex flex-col gap-4 flex-1 min-h-0 overflow-hidden">
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <p className="text-sm text-muted-foreground">
                {totalItems} {totalItems === 1 ? "post" : "poster"} klare for import.
              </p>
              {parseError && (
                <Badge variant="secondary" className="text-xs">
                  {parseError}
                </Badge>
              )}
            </div>

            <ScrollArea className="max-h-72 rounded-lg border">
              <div className="divide-y">
                {/* Members */}
                {parsedData.members.length > 0 && (
                  <div className="p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      Medlemmer ({parsedData.members.length})
                    </p>
                    <div className="space-y-2">
                      {parsedData.members.map((m, i) => (
                        <div key={i} className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">{m.name}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                              Skatt: {m.taxPercent}%
                            </span>
                            <span className="text-sm tabular-nums text-muted-foreground">
                              {formatPrice(m.grossMonthlyIncome)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Loans */}
                {parsedData.loans.length > 0 && (
                  <div className="p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      Lån ({parsedData.loans.length})
                    </p>
                    <div className="space-y-2">
                      {parsedData.loans.map((l, i) => {
                        const total = l.monthlyInterest + l.monthlyPrincipal + l.monthlyFees
                        return (
                          <div key={i} className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <span className="text-sm font-medium">{l.loanName}</span>
                              <span className="text-xs text-muted-foreground ml-2">{l.bankName} · {l.loanType === "MORTGAGE" ? "Boliglån" : "Annet"}</span>
                            </div>
                            <span className="text-sm tabular-nums text-muted-foreground shrink-0">
                              {formatPrice(total)}/mnd
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Trips */}
                {parsedData.trips.length > 0 && (
                  <div className="p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      Reiser ({parsedData.trips.length})
                    </p>
                    <div className="space-y-2">
                      {parsedData.trips.map((t, i) => {
                        const perTrip = t.transportType === "AIR_OR_PUBLIC"
                          ? (t.ticketPerTrip || 0)
                          : (t.tollPerTrip || 0) + (t.ferryPerTrip || 0) + (t.fuelPerTrip || 0)
                        const monthly = (t.annualTrips * perTrip) / 12
                        return (
                          <div key={i} className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <span className="text-sm font-medium">{t.name}</span>
                              <span className="text-xs text-muted-foreground ml-2">
                                {t.transportType === "AIR_OR_PUBLIC" ? "Fly/offentlig" : "Bil"} · {t.annualTrips} reiser/år
                              </span>
                            </div>
                            <span className="text-sm tabular-nums text-muted-foreground shrink-0">
                              {formatPrice(monthly)}/mnd
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Entries */}
                {parsedData.entries.length > 0 && (
                  <div className="p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      Budsjettposter ({parsedData.entries.length})
                    </p>
                    <div className="space-y-2">
                      {parsedData.entries.map((e, i) => (
                        <div key={i} className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-sm font-medium">{e.name}</span>
                            <div className="flex gap-1">
                              {e.category && (
                                <Badge variant="outline" className="text-xs">
                                  {CATEGORY_LABELS[e.category] ?? e.category}
                                </Badge>
                              )}
                              <Badge variant="secondary" className="text-xs">
                                {ENTRY_TYPE_LABELS[e.type] ?? e.type}
                              </Badge>
                            </div>
                          </div>
                          <span className="text-sm tabular-nums text-muted-foreground shrink-0">
                            {formatPrice(e.monthlyAmount)}/mnd
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
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
                disabled={isPending || totalItems === 0}
                className="flex-1"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" data-icon="inline-start" />
                    Importerer...
                  </>
                ) : (
                  <>
                    Importer {totalItems} {totalItems === 1 ? "post" : "poster"}
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
