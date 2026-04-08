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
  bulkImportBudget,
  findExistingBudgetItems,
  bulkImportBudgetWithDuplicates,
  type ExistingBudgetMember,
  type ExistingBudgetLoan,
  type ExistingBudgetTrip,
  type ExistingBudgetEntry,
} from "@/lib/actions/budget"
import {
  DuplicateFieldDiffCard,
  DuplicateSummary,
  computeFieldDiffs,
  type FieldDiff,
} from "@/components/duplicate-field-diff"

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

// ─── Duplicate helpers ─────────────────────────────────────────

interface BudgetDuplicate<TImported, TExisting> {
  importedItem: TImported
  existingId: string
  existingLabel: string
  diffs: FieldDiff[]
  existing: TExisting
}

function buildMemberDiffs(imported: ParsedMember, existing: ExistingBudgetMember): FieldDiff[] {
  return computeFieldDiffs([
    { key: "grossMonthlyIncome", label: "Brutto månedsinntekt", existingValue: existing.grossMonthlyIncome, newValue: imported.grossMonthlyIncome, format: (v) => formatPrice(Number(v)) },
    { key: "taxPercent", label: "Skatteprosent", existingValue: existing.taxPercent, newValue: imported.taxPercent, format: (v) => `${v}%` },
  ])
}

function buildLoanDiffs(imported: ParsedLoan, existing: ExistingBudgetLoan): FieldDiff[] {
  return computeFieldDiffs([
    { key: "bankName", label: "Banknavn", existingValue: existing.bankName, newValue: imported.bankName },
    { key: "loanType", label: "Lånetype", existingValue: existing.loanType, newValue: imported.loanType, format: (v) => String(v) === "MORTGAGE" ? "Boliglån" : "Annet" },
    { key: "monthlyInterest", label: "Månedlig rente", existingValue: existing.monthlyInterest, newValue: imported.monthlyInterest, format: (v) => formatPrice(Number(v)) },
    { key: "monthlyPrincipal", label: "Månedlig avdrag", existingValue: existing.monthlyPrincipal, newValue: imported.monthlyPrincipal, format: (v) => formatPrice(Number(v)) },
    { key: "monthlyFees", label: "Månedlige gebyrer", existingValue: existing.monthlyFees, newValue: imported.monthlyFees, format: (v) => formatPrice(Number(v)) },
  ])
}

function buildTripDiffs(imported: ParsedTrip, existing: ExistingBudgetTrip): FieldDiff[] {
  return computeFieldDiffs([
    { key: "transportType", label: "Transporttype", existingValue: existing.transportType, newValue: imported.transportType, format: (v) => String(v) === "AIR_OR_PUBLIC" ? "Fly/offentlig" : "Bil" },
    { key: "annualTrips", label: "Reiser per år", existingValue: existing.annualTrips, newValue: imported.annualTrips, format: (v) => String(v) },
    { key: "ticketPerTrip", label: "Billett per reise", existingValue: existing.ticketPerTrip, newValue: imported.ticketPerTrip, format: (v) => formatPrice(Number(v)) },
    { key: "tollPerTrip", label: "Bom per reise", existingValue: existing.tollPerTrip, newValue: imported.tollPerTrip, format: (v) => formatPrice(Number(v)) },
    { key: "ferryPerTrip", label: "Ferge per reise", existingValue: existing.ferryPerTrip, newValue: imported.ferryPerTrip, format: (v) => formatPrice(Number(v)) },
    { key: "fuelPerTrip", label: "Drivstoff per reise", existingValue: existing.fuelPerTrip, newValue: imported.fuelPerTrip, format: (v) => formatPrice(Number(v)) },
  ])
}

function buildEntryDiffs(imported: ParsedEntry, existing: ExistingBudgetEntry): FieldDiff[] {
  return computeFieldDiffs([
    { key: "category", label: "Kategori", existingValue: existing.category, newValue: imported.category, format: (v) => CATEGORY_LABELS[String(v)] ?? String(v) },
    { key: "monthlyAmount", label: "Månedlig beløp", existingValue: existing.monthlyAmount, newValue: imported.monthlyAmount, format: (v) => formatPrice(Number(v)) },
  ])
}

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

  // Duplicate state - per section
  const [newMembers, setNewMembers] = useState<ParsedMember[]>([])
  const [newLoans, setNewLoans] = useState<ParsedLoan[]>([])
  const [newTrips, setNewTrips] = useState<ParsedTrip[]>([])
  const [newEntries, setNewEntries] = useState<ParsedEntry[]>([])

  const [memberDuplicates, setMemberDuplicates] = useState<BudgetDuplicate<ParsedMember, ExistingBudgetMember>[]>([])
  const [loanDuplicates, setLoanDuplicates] = useState<BudgetDuplicate<ParsedLoan, ExistingBudgetLoan>[]>([])
  const [tripDuplicates, setTripDuplicates] = useState<BudgetDuplicate<ParsedTrip, ExistingBudgetTrip>[]>([])
  const [entryDuplicates, setEntryDuplicates] = useState<BudgetDuplicate<ParsedEntry, ExistingBudgetEntry>[]>([])

  const [selectedFields, setSelectedFields] = useState<Map<string, Set<string>>>(new Map())
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false)

  const prompt = buildPrompt()

  const allDuplicates = [...memberDuplicates, ...loanDuplicates, ...tripDuplicates, ...entryDuplicates]
  const totalNewItems = newMembers.length + newLoans.length + newTrips.length + newEntries.length
  const updateCount = allDuplicates.filter(
    (d) => (selectedFields.get(d.existingId)?.size ?? 0) > 0
  ).length
  const hasDuplicates = allDuplicates.length > 0

  function handleCopyPrompt() {
    navigator.clipboard.writeText(prompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleParse() {
    const { data, error } = parseJsonInput(jsonInput)
    setParsedData(data)
    setParseError(error)
    const totalItems = data.members.length + data.loans.length + data.trips.length + data.entries.length
    if (totalItems > 0) {
      setIsCheckingDuplicates(true)
      try {
        const existing = await findExistingBudgetItems()

        // Match members by name
        const existingMembersByName = new Map<string, ExistingBudgetMember>()
        for (const m of existing.members) existingMembersByName.set(m.name.toLowerCase(), m)

        const freshMembers: ParsedMember[] = []
        const dupMembers: BudgetDuplicate<ParsedMember, ExistingBudgetMember>[] = []
        for (const m of data.members) {
          const match = existingMembersByName.get(m.name.toLowerCase())
          if (match) {
            dupMembers.push({ importedItem: m, existingId: match.id, existingLabel: match.name, diffs: buildMemberDiffs(m, match), existing: match })
          } else {
            freshMembers.push(m)
          }
        }

        // Match loans by loanName
        const existingLoansByName = new Map<string, ExistingBudgetLoan>()
        for (const l of existing.loans) existingLoansByName.set(l.loanName.toLowerCase(), l)

        const freshLoans: ParsedLoan[] = []
        const dupLoans: BudgetDuplicate<ParsedLoan, ExistingBudgetLoan>[] = []
        for (const l of data.loans) {
          const match = existingLoansByName.get(l.loanName.toLowerCase())
          if (match) {
            dupLoans.push({ importedItem: l, existingId: match.id, existingLabel: match.loanName, diffs: buildLoanDiffs(l, match), existing: match })
          } else {
            freshLoans.push(l)
          }
        }

        // Match trips by name
        const existingTripsByName = new Map<string, ExistingBudgetTrip>()
        for (const t of existing.trips) existingTripsByName.set(t.name.toLowerCase(), t)

        const freshTrips: ParsedTrip[] = []
        const dupTrips: BudgetDuplicate<ParsedTrip, ExistingBudgetTrip>[] = []
        for (const t of data.trips) {
          const match = existingTripsByName.get(t.name.toLowerCase())
          if (match) {
            dupTrips.push({ importedItem: t, existingId: match.id, existingLabel: match.name, diffs: buildTripDiffs(t, match), existing: match })
          } else {
            freshTrips.push(t)
          }
        }

        // Match entries by name + type
        const existingEntriesByKey = new Map<string, ExistingBudgetEntry>()
        for (const e of existing.entries) existingEntriesByKey.set(`${e.name.toLowerCase()}::${e.type.toLowerCase()}`, e)

        const freshEntries: ParsedEntry[] = []
        const dupEntries: BudgetDuplicate<ParsedEntry, ExistingBudgetEntry>[] = []
        for (const e of data.entries) {
          const match = existingEntriesByKey.get(`${e.name.toLowerCase()}::${e.type.toLowerCase()}`)
          if (match) {
            dupEntries.push({ importedItem: e, existingId: match.id, existingLabel: e.name, diffs: buildEntryDiffs(e, match), existing: match })
          } else {
            freshEntries.push(e)
          }
        }

        setNewMembers(freshMembers)
        setNewLoans(freshLoans)
        setNewTrips(freshTrips)
        setNewEntries(freshEntries)
        setMemberDuplicates(dupMembers)
        setLoanDuplicates(dupLoans)
        setTripDuplicates(dupTrips)
        setEntryDuplicates(dupEntries)

        // Pre-select all diff fields
        const fieldSelections = new Map<string, Set<string>>()
        for (const d of [...dupMembers, ...dupLoans, ...dupTrips, ...dupEntries]) {
          fieldSelections.set(d.existingId, new Set(d.diffs.map((f) => f.key)))
        }
        setSelectedFields(fieldSelections)
      } catch {
        setNewMembers(data.members)
        setNewLoans(data.loans)
        setNewTrips(data.trips)
        setNewEntries(data.entries)
        setMemberDuplicates([])
        setLoanDuplicates([])
        setTripDuplicates([])
        setEntryDuplicates([])
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
        if (!hasDuplicates || updateCount === 0) {
          // No duplicates or no updates - use simple import
          const hasNew = totalNewItems > 0
          if (hasNew) {
            await bulkImportBudget({
              members: newMembers,
              loans: newLoans,
              trips: newTrips,
              entries: newEntries,
            })
          }
        } else {
          // Build updates from selected fields
          const memberUpdates = memberDuplicates
            .filter((d) => (selectedFields.get(d.existingId)?.size ?? 0) > 0)
            .map((d) => {
              const fields: Record<string, unknown> = {}
              const sel = selectedFields.get(d.existingId) ?? new Set()
              if (sel.has("grossMonthlyIncome")) fields.grossMonthlyIncome = d.importedItem.grossMonthlyIncome
              if (sel.has("taxPercent")) fields.taxPercent = d.importedItem.taxPercent
              return { id: d.existingId, fields }
            })

          const loanUpdates = loanDuplicates
            .filter((d) => (selectedFields.get(d.existingId)?.size ?? 0) > 0)
            .map((d) => {
              const fields: Record<string, unknown> = {}
              const sel = selectedFields.get(d.existingId) ?? new Set()
              if (sel.has("bankName")) fields.bankName = d.importedItem.bankName
              if (sel.has("loanType")) fields.loanType = d.importedItem.loanType
              if (sel.has("monthlyInterest")) fields.monthlyInterest = d.importedItem.monthlyInterest
              if (sel.has("monthlyPrincipal")) fields.monthlyPrincipal = d.importedItem.monthlyPrincipal
              if (sel.has("monthlyFees")) fields.monthlyFees = d.importedItem.monthlyFees
              return { id: d.existingId, fields }
            })

          const tripUpdates = tripDuplicates
            .filter((d) => (selectedFields.get(d.existingId)?.size ?? 0) > 0)
            .map((d) => {
              const fields: Record<string, unknown> = {}
              const sel = selectedFields.get(d.existingId) ?? new Set()
              if (sel.has("transportType")) fields.transportType = d.importedItem.transportType
              if (sel.has("annualTrips")) fields.annualTrips = d.importedItem.annualTrips
              if (sel.has("ticketPerTrip")) fields.ticketPerTrip = d.importedItem.ticketPerTrip
              if (sel.has("tollPerTrip")) fields.tollPerTrip = d.importedItem.tollPerTrip
              if (sel.has("ferryPerTrip")) fields.ferryPerTrip = d.importedItem.ferryPerTrip
              if (sel.has("fuelPerTrip")) fields.fuelPerTrip = d.importedItem.fuelPerTrip
              return { id: d.existingId, fields }
            })

          const entryUpdates = entryDuplicates
            .filter((d) => (selectedFields.get(d.existingId)?.size ?? 0) > 0)
            .map((d) => {
              const fields: Record<string, unknown> = {}
              const sel = selectedFields.get(d.existingId) ?? new Set()
              if (sel.has("category")) fields.category = d.importedItem.category ?? null
              if (sel.has("monthlyAmount")) fields.monthlyAmount = d.importedItem.monthlyAmount
              return { id: d.existingId, fields }
            })

          await bulkImportBudgetWithDuplicates({
            newMembers,
            memberUpdates,
            newLoans,
            loanUpdates,
            newTrips,
            tripUpdates,
            newEntries,
            entryUpdates,
          })
        }

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
    setNewMembers([])
    setNewLoans([])
    setNewTrips([])
    setNewEntries([])
    setMemberDuplicates([])
    setLoanDuplicates([])
    setTripDuplicates([])
    setEntryDuplicates([])
    setSelectedFields(new Map())
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
              {hasDuplicates ? (
                <DuplicateSummary
                  newCount={totalNewItems}
                  duplicateCount={allDuplicates.length}
                  updateCount={updateCount}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {totalItems} {totalItems === 1 ? "post" : "poster"} klare for import.
                </p>
              )}
              {parseError && (
                <Badge variant="secondary" className="text-xs">
                  {parseError}
                </Badge>
              )}
            </div>

            <ScrollArea className="flex-1 min-h-0 rounded-lg border">
              <div className="divide-y">
                {/* Members */}
                {(memberDuplicates.length > 0 || newMembers.length > 0) && (
                  <div className="p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      Medlemmer ({memberDuplicates.length + newMembers.length})
                    </p>
                    <div className="space-y-2">
                      {memberDuplicates.map((dup) => (
                        <DuplicateFieldDiffCard
                          key={dup.existingId}
                          label={dup.existingLabel}
                          diffs={dup.diffs}
                          selectedFields={selectedFields.get(dup.existingId) ?? new Set()}
                          onToggleField={(field) => handleToggleField(dup.existingId, field)}
                        />
                      ))}
                      {newMembers.map((m, i) => (
                        <div key={`new-member-${i}`} className="flex items-center justify-between gap-2">
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
                {(loanDuplicates.length > 0 || newLoans.length > 0) && (
                  <div className="p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      Lån ({loanDuplicates.length + newLoans.length})
                    </p>
                    <div className="space-y-2">
                      {loanDuplicates.map((dup) => (
                        <DuplicateFieldDiffCard
                          key={dup.existingId}
                          label={dup.existingLabel}
                          diffs={dup.diffs}
                          selectedFields={selectedFields.get(dup.existingId) ?? new Set()}
                          onToggleField={(field) => handleToggleField(dup.existingId, field)}
                        />
                      ))}
                      {newLoans.map((l, i) => {
                        const total = l.monthlyInterest + l.monthlyPrincipal + l.monthlyFees
                        return (
                          <div key={`new-loan-${i}`} className="flex items-center justify-between gap-2">
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
                {(tripDuplicates.length > 0 || newTrips.length > 0) && (
                  <div className="p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      Reiser ({tripDuplicates.length + newTrips.length})
                    </p>
                    <div className="space-y-2">
                      {tripDuplicates.map((dup) => (
                        <DuplicateFieldDiffCard
                          key={dup.existingId}
                          label={dup.existingLabel}
                          diffs={dup.diffs}
                          selectedFields={selectedFields.get(dup.existingId) ?? new Set()}
                          onToggleField={(field) => handleToggleField(dup.existingId, field)}
                        />
                      ))}
                      {newTrips.map((t, i) => {
                        const perTrip = t.transportType === "AIR_OR_PUBLIC"
                          ? (t.ticketPerTrip || 0)
                          : (t.tollPerTrip || 0) + (t.ferryPerTrip || 0) + (t.fuelPerTrip || 0)
                        const monthly = (t.annualTrips * perTrip) / 12
                        return (
                          <div key={`new-trip-${i}`} className="flex items-center justify-between gap-2">
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
                {(entryDuplicates.length > 0 || newEntries.length > 0) && (
                  <div className="p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      Budsjettposter ({entryDuplicates.length + newEntries.length})
                    </p>
                    <div className="space-y-2">
                      {entryDuplicates.map((dup) => (
                        <DuplicateFieldDiffCard
                          key={dup.existingId}
                          label={dup.existingLabel}
                          diffs={dup.diffs}
                          selectedFields={selectedFields.get(dup.existingId) ?? new Set()}
                          onToggleField={(field) => handleToggleField(dup.existingId, field)}
                        />
                      ))}
                      {newEntries.map((e, i) => (
                        <div key={`new-entry-${i}`} className="flex items-center justify-between gap-2">
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

            <Separator className="shrink-0" />

            {importError && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/5 p-3">
                <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <p className="text-sm text-destructive">{importError}</p>
              </div>
            )}

            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" onClick={() => setStep("paste")}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Tilbake
              </Button>
              <Button
                onClick={handleImport}
                disabled={isPending || (totalNewItems === 0 && updateCount === 0)}
                className="flex-1"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" data-icon="inline-start" />
                    Importerer...
                  </>
                ) : (
                  <>
                    {totalNewItems > 0 && updateCount > 0
                      ? `Importer ${totalNewItems} nye + oppdater ${updateCount}`
                      : totalNewItems > 0
                        ? `Importer ${totalNewItems} ${totalNewItems === 1 ? "post" : "poster"}`
                        : `Oppdater ${updateCount} ${updateCount === 1 ? "post" : "poster"}`
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
