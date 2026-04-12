"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Badge } from "@workspace/ui/components/badge"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { cn } from "@workspace/ui/lib/utils"
import { Sparkles, WandSparkles } from "lucide-react"
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
import {
  LlmImportPageHeader,
  LlmImportPasteStep,
  LlmImportPreviewHeader,
  LlmImportPromptStep,
  LlmImportStickyActions,
} from "@/components/llm-import-page"
import { toast } from "sonner"

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

function parseJsonInput(raw: string): { data: ParsedBudgetData; error: string | null } {
  const trimmed = raw.trim()

  let jsonStr = trimmed
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch?.[1]) {
    jsonStr = codeBlockMatch[1].trim()
  }

  const data: ParsedBudgetData = { members: [], loans: [], trips: [], entries: [] }
  const errors: string[] = []

  try {
    const parsed = JSON.parse(jsonStr)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        data,
        error: "Forventet et JSON-objekt med members, loans, trips og/eller entries.",
      }
    }

    if (Array.isArray(parsed.members)) {
      for (let i = 0; i < parsed.members.length; i++) {
        const member = parsed.members[i]
        if (!member?.name || typeof member.name !== "string" || !member.name.trim()) {
          errors.push(`Medlem ${i + 1}: Mangler "name".`)
          continue
        }
        const income = Number(member.grossMonthlyIncome)
        const tax = Number(member.taxPercent)
        if (isNaN(income) || income < 0) {
          errors.push(`Medlem ${i + 1}: Ugyldig "grossMonthlyIncome".`)
          continue
        }
        data.members.push({
          name: member.name.trim(),
          grossMonthlyIncome: income,
          taxPercent: isNaN(tax) || tax < 0 || tax > 100 ? 30 : tax,
        })
      }
    }

    if (Array.isArray(parsed.loans)) {
      for (let i = 0; i < parsed.loans.length; i++) {
        const loan = parsed.loans[i]
        if (
          !loan?.bankName ||
          typeof loan.bankName !== "string" ||
          !loan.bankName.trim() ||
          !loan?.loanName ||
          typeof loan.loanName !== "string" ||
          !loan.loanName.trim()
        ) {
          errors.push(`Lån ${i + 1}: Mangler "bankName" eller "loanName".`)
          continue
        }
        const interest = Number(loan.monthlyInterest)
        const principal = Number(loan.monthlyPrincipal)
        if (isNaN(interest) || isNaN(principal)) {
          errors.push(`Lån ${i + 1}: Ugyldig rente eller avdrag.`)
          continue
        }
        const loanType = String(loan.loanType ?? "MORTGAGE").toUpperCase()
        data.loans.push({
          bankName: String(loan.bankName).trim(),
          loanName: String(loan.loanName).trim(),
          loanType: loanType === "OTHER" ? "OTHER" : "MORTGAGE",
          monthlyInterest: interest,
          monthlyPrincipal: principal,
          monthlyFees: isNaN(Number(loan.monthlyFees)) ? 0 : Number(loan.monthlyFees),
        })
      }
    }

    if (Array.isArray(parsed.trips)) {
      for (let i = 0; i < parsed.trips.length; i++) {
        const trip = parsed.trips[i]
        if (!trip?.name || typeof trip.name !== "string" || !trip.name.trim()) {
          errors.push(`Reise ${i + 1}: Mangler "name".`)
          continue
        }
        const transportType = String(trip.transportType ?? "").toUpperCase()
        if (!["AIR_OR_PUBLIC", "CAR"].includes(transportType)) {
          errors.push(`Reise ${i + 1}: Ugyldig "transportType".`)
          continue
        }
        const annualTrips = Math.round(Number(trip.annualTrips))
        if (isNaN(annualTrips) || annualTrips <= 0) {
          errors.push(`Reise ${i + 1}: Ugyldig "annualTrips".`)
          continue
        }
        data.trips.push({
          name: trip.name.trim(),
          transportType,
          annualTrips,
          ticketPerTrip: Number(trip.ticketPerTrip) || 0,
          tollPerTrip: Number(trip.tollPerTrip) || 0,
          ferryPerTrip: Number(trip.ferryPerTrip) || 0,
          fuelPerTrip: Number(trip.fuelPerTrip) || 0,
        })
      }
    }

    if (Array.isArray(parsed.entries)) {
      for (let i = 0; i < parsed.entries.length; i++) {
        const entry = parsed.entries[i]
        if (!entry?.name || typeof entry.name !== "string" || !entry.name.trim()) {
          errors.push(`Post ${i + 1}: Mangler "name".`)
          continue
        }
        const type = String(entry.type ?? "").toUpperCase()
        if (!["INCOME", "EXPENSE", "DEDUCTION"].includes(type)) {
          errors.push(`Post ${i + 1}: Ugyldig type "${entry.type}".`)
          continue
        }
        const amount = Number(entry.monthlyAmount)
        if (isNaN(amount) || amount < 0) {
          errors.push(`Post ${i + 1}: Ugyldig "monthlyAmount".`)
          continue
        }
        const category = entry.category ? String(entry.category).toUpperCase() : undefined
        data.entries.push({
          name: entry.name.trim(),
          category,
          type,
          monthlyAmount: amount,
        })
      }
    }

    const totalItems =
      data.members.length + data.loans.length + data.trips.length + data.entries.length

    if (totalItems === 0 && errors.length > 0) {
      return { data, error: errors.join("\n") }
    }
    if (totalItems === 0) {
      return { data, error: "Ingen data funnet i JSON." }
    }

    return {
      data,
      error: errors.length > 0 ? `${totalItems} poster tolket. ${errors.length} ble hoppet over.` : null,
    }
  } catch {
    return {
      data,
      error: "Ugyldig JSON. Sjekk at du har limt inn et gyldig JSON-format.",
    }
  }
}

const formatPrice = (price: number) =>
  new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    maximumFractionDigits: 0,
  }).format(price)

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

type BudgetDuplicate<TImported, TExisting> = {
  importedItem: TImported
  existingId: string
  existingLabel: string
  diffs: FieldDiff[]
  existing: TExisting
}

export function BudgetLlmImportPageClient() {
  const router = useRouter()
  const [step, setStep] = useState<"prompt" | "paste" | "preview">("prompt")
  const [copied, setCopied] = useState(false)
  const [jsonInput, setJsonInput] = useState("")
  const [parsedData, setParsedData] = useState<ParsedBudgetData>({ members: [], loans: [], trips: [], entries: [] })
  const [parseError, setParseError] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
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
  const updateCount = allDuplicates.filter((d) => (selectedFields.get(d.existingId)?.size ?? 0) > 0).length
  const hasDuplicates = allDuplicates.length > 0
  const totalItems = parsedData.members.length + parsedData.loans.length + parsedData.trips.length + parsedData.entries.length

  function handleCopyPrompt() {
    navigator.clipboard.writeText(prompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleParse() {
    const { data, error } = parseJsonInput(jsonInput)
    setParsedData(data)
    setParseError(error)
    const total = data.members.length + data.loans.length + data.trips.length + data.entries.length
    if (total === 0) return

    setIsCheckingDuplicates(true)
    try {
      const existing = await findExistingBudgetItems()

      const existingMembersByName = new Map<string, ExistingBudgetMember>()
      for (const member of existing.members) existingMembersByName.set(member.name.toLowerCase(), member)
      const freshMembers: ParsedMember[] = []
      const dupMembers: BudgetDuplicate<ParsedMember, ExistingBudgetMember>[] = []
      for (const member of data.members) {
        const match = existingMembersByName.get(member.name.toLowerCase())
        if (match) {
          dupMembers.push({ importedItem: member, existingId: match.id, existingLabel: match.name, diffs: buildMemberDiffs(member, match), existing: match })
        } else {
          freshMembers.push(member)
        }
      }

      const existingLoansByName = new Map<string, ExistingBudgetLoan>()
      for (const loan of existing.loans) existingLoansByName.set(loan.loanName.toLowerCase(), loan)
      const freshLoans: ParsedLoan[] = []
      const dupLoans: BudgetDuplicate<ParsedLoan, ExistingBudgetLoan>[] = []
      for (const loan of data.loans) {
        const match = existingLoansByName.get(loan.loanName.toLowerCase())
        if (match) {
          dupLoans.push({ importedItem: loan, existingId: match.id, existingLabel: match.loanName, diffs: buildLoanDiffs(loan, match), existing: match })
        } else {
          freshLoans.push(loan)
        }
      }

      const existingTripsByName = new Map<string, ExistingBudgetTrip>()
      for (const trip of existing.trips) existingTripsByName.set(trip.name.toLowerCase(), trip)
      const freshTrips: ParsedTrip[] = []
      const dupTrips: BudgetDuplicate<ParsedTrip, ExistingBudgetTrip>[] = []
      for (const trip of data.trips) {
        const match = existingTripsByName.get(trip.name.toLowerCase())
        if (match) {
          dupTrips.push({ importedItem: trip, existingId: match.id, existingLabel: match.name, diffs: buildTripDiffs(trip, match), existing: match })
        } else {
          freshTrips.push(trip)
        }
      }

      const existingEntriesByKey = new Map<string, ExistingBudgetEntry>()
      for (const entry of existing.entries) existingEntriesByKey.set(`${entry.name.toLowerCase()}::${entry.type.toLowerCase()}`, entry)
      const freshEntries: ParsedEntry[] = []
      const dupEntries: BudgetDuplicate<ParsedEntry, ExistingBudgetEntry>[] = []
      for (const entry of data.entries) {
        const match = existingEntriesByKey.get(`${entry.name.toLowerCase()}::${entry.type.toLowerCase()}`)
        if (match) {
          dupEntries.push({ importedItem: entry, existingId: match.id, existingLabel: entry.name, diffs: buildEntryDiffs(entry, match), existing: match })
        } else {
          freshEntries.push(entry)
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

      const fieldSelections = new Map<string, Set<string>>()
      for (const dup of [...dupMembers, ...dupLoans, ...dupTrips, ...dupEntries]) {
        fieldSelections.set(dup.existingId, new Set(dup.diffs.map((f) => f.key)))
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

  function handleToggleField(existingId: string, field: string) {
    setSelectedFields((prev) => {
      const next = new Map(prev)
      const fields = new Set(next.get(existingId) ?? [])
      if (fields.has(field)) fields.delete(field)
      else fields.add(field)
      next.set(existingId, fields)
      return next
    })
  }

  function handleImport() {
    setImportError(null)
    startTransition(async () => {
      try {
        if (!hasDuplicates || updateCount === 0) {
          if (totalNewItems > 0) {
            await bulkImportBudget({
              members: newMembers,
              loans: newLoans,
              trips: newTrips,
              entries: newEntries,
            })
          }
        } else {
          const memberUpdates = memberDuplicates
            .filter((d) => (selectedFields.get(d.existingId)?.size ?? 0) > 0)
            .map((d) => {
              const fields: { grossMonthlyIncome?: number; taxPercent?: number } = {}
              const selected = selectedFields.get(d.existingId) ?? new Set()
              if (selected.has("grossMonthlyIncome")) fields.grossMonthlyIncome = d.importedItem.grossMonthlyIncome
              if (selected.has("taxPercent")) fields.taxPercent = d.importedItem.taxPercent
              return { id: d.existingId, fields }
            })

          const loanUpdates = loanDuplicates
            .filter((d) => (selectedFields.get(d.existingId)?.size ?? 0) > 0)
            .map((d) => {
              const fields: { bankName?: string; loanType?: string; monthlyInterest?: number; monthlyPrincipal?: number; monthlyFees?: number } = {}
              const selected = selectedFields.get(d.existingId) ?? new Set()
              if (selected.has("bankName")) fields.bankName = d.importedItem.bankName
              if (selected.has("loanType")) fields.loanType = d.importedItem.loanType
              if (selected.has("monthlyInterest")) fields.monthlyInterest = d.importedItem.monthlyInterest
              if (selected.has("monthlyPrincipal")) fields.monthlyPrincipal = d.importedItem.monthlyPrincipal
              if (selected.has("monthlyFees")) fields.monthlyFees = d.importedItem.monthlyFees
              return { id: d.existingId, fields }
            })

          const tripUpdates = tripDuplicates
            .filter((d) => (selectedFields.get(d.existingId)?.size ?? 0) > 0)
            .map((d) => {
              const fields: { transportType?: string; annualTrips?: number; ticketPerTrip?: number | null; tollPerTrip?: number | null; ferryPerTrip?: number | null; fuelPerTrip?: number | null } = {}
              const selected = selectedFields.get(d.existingId) ?? new Set()
              if (selected.has("transportType")) fields.transportType = d.importedItem.transportType
              if (selected.has("annualTrips")) fields.annualTrips = d.importedItem.annualTrips
              if (selected.has("ticketPerTrip")) fields.ticketPerTrip = d.importedItem.ticketPerTrip
              if (selected.has("tollPerTrip")) fields.tollPerTrip = d.importedItem.tollPerTrip
              if (selected.has("ferryPerTrip")) fields.ferryPerTrip = d.importedItem.ferryPerTrip
              if (selected.has("fuelPerTrip")) fields.fuelPerTrip = d.importedItem.fuelPerTrip
              return { id: d.existingId, fields }
            })

          const entryUpdates = entryDuplicates
            .filter((d) => (selectedFields.get(d.existingId)?.size ?? 0) > 0)
            .map((d) => {
              const fields: { category?: string | null; monthlyAmount?: number } = {}
              const selected = selectedFields.get(d.existingId) ?? new Set()
              if (selected.has("category")) fields.category = d.importedItem.category ?? null
              if (selected.has("monthlyAmount")) fields.monthlyAmount = d.importedItem.monthlyAmount
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

        toast.success("Budsjett importert")
        router.push("/budsjett")
        router.refresh()
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

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <LlmImportPageHeader
        backHref="/budsjett"
        backLabel="Tilbake til budsjett"
        title="Importer budsjettdata"
        description="Lim inn JSON fra en LLM, gå gjennom duplikater og importer med mer plass enn i en modal."
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
                  <p>Bruk kun feltene som er relevante. LLM-en kan sende delvis utfylte objekter, og resten blir bare ignorert.</p>
                </div>
              </div>
              <div className="rounded-lg border bg-muted/20 px-3 py-3">
                <div className="flex items-start gap-3 text-sm text-muted-foreground">
                  <WandSparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <p>Duplikater blir matchet på navn, lån på loanName, reiser på navn og budsjettposter på navn + type.</p>
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
          inputId="budget-json-input"
          value={jsonInput}
          onChange={(value) => {
            setJsonInput(value)
            setParseError(null)
          }}
          placeholder={'{\n  "members": [...],\n  "loans": [...],\n  "entries": [...]\n}'}
          parseError={parseError}
          showError={totalItems === 0}
          onBack={() => setStep("prompt")}
          onParse={handleParse}
          isParsing={isCheckingDuplicates}
          rows={16}
        />
      )}

      {step === "preview" && (
        <>
          <LlmImportPreviewHeader
            summary={
              hasDuplicates ? (
                <DuplicateSummary newCount={totalNewItems} duplicateCount={allDuplicates.length} updateCount={updateCount} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {totalItems} {totalItems === 1 ? "post" : "poster"} klare for import.
                </p>
              )
            }
            parseError={parseError}
            description="Gå gjennom nye poster og velg hvilke duplikatfelt som skal oppdateres."
          />

          <ScrollArea className="min-h-[24rem] rounded-lg border">
            <div className="divide-y">
              {(memberDuplicates.length > 0 || newMembers.length > 0) && (
                <div className="p-3">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    Medlemmer ({memberDuplicates.length + newMembers.length})
                  </p>
                  <div className="space-y-2">
                    {memberDuplicates.map((dup) => (
                      <DuplicateFieldDiffCard key={dup.existingId} label={dup.existingLabel} diffs={dup.diffs} selectedFields={selectedFields.get(dup.existingId) ?? new Set()} onToggleField={(field) => handleToggleField(dup.existingId, field)} />
                    ))}
                    {newMembers.map((member, index) => (
                      <SimpleNewRow
                        key={`member-${index}`}
                        title={member.name}
                        meta={`Skatt: ${member.taxPercent}%`}
                        value={formatPrice(member.grossMonthlyIncome)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {(loanDuplicates.length > 0 || newLoans.length > 0) && (
                <div className="p-3">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    Lån ({loanDuplicates.length + newLoans.length})
                  </p>
                  <div className="space-y-2">
                    {loanDuplicates.map((dup) => (
                      <DuplicateFieldDiffCard key={dup.existingId} label={dup.existingLabel} diffs={dup.diffs} selectedFields={selectedFields.get(dup.existingId) ?? new Set()} onToggleField={(field) => handleToggleField(dup.existingId, field)} />
                    ))}
                    {newLoans.map((loan, index) => {
                      const total = loan.monthlyInterest + loan.monthlyPrincipal + loan.monthlyFees
                      return (
                        <SimpleNewRow
                          key={`loan-${index}`}
                          title={loan.loanName}
                          meta={`${loan.bankName} · ${loan.loanType === "MORTGAGE" ? "Boliglån" : "Annet"}`}
                          value={`${formatPrice(total)}/mnd`}
                        />
                      )
                    })}
                  </div>
                </div>
              )}

              {(tripDuplicates.length > 0 || newTrips.length > 0) && (
                <div className="p-3">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    Reiser ({tripDuplicates.length + newTrips.length})
                  </p>
                  <div className="space-y-2">
                    {tripDuplicates.map((dup) => (
                      <DuplicateFieldDiffCard key={dup.existingId} label={dup.existingLabel} diffs={dup.diffs} selectedFields={selectedFields.get(dup.existingId) ?? new Set()} onToggleField={(field) => handleToggleField(dup.existingId, field)} />
                    ))}
                    {newTrips.map((trip, index) => {
                      const perTrip =
                        trip.transportType === "AIR_OR_PUBLIC"
                          ? trip.ticketPerTrip || 0
                          : (trip.tollPerTrip || 0) + (trip.ferryPerTrip || 0) + (trip.fuelPerTrip || 0)
                      const monthly = (trip.annualTrips * perTrip) / 12
                      return (
                        <SimpleNewRow
                          key={`trip-${index}`}
                          title={trip.name}
                          meta={`${trip.transportType === "AIR_OR_PUBLIC" ? "Fly/offentlig" : "Bil"} · ${trip.annualTrips} reiser/år`}
                          value={`${formatPrice(monthly)}/mnd`}
                        />
                      )
                    })}
                  </div>
                </div>
              )}

              {(entryDuplicates.length > 0 || newEntries.length > 0) && (
                <div className="p-3">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    Budsjettposter ({entryDuplicates.length + newEntries.length})
                  </p>
                  <div className="space-y-2">
                    {entryDuplicates.map((dup) => (
                      <DuplicateFieldDiffCard key={dup.existingId} label={dup.existingLabel} diffs={dup.diffs} selectedFields={selectedFields.get(dup.existingId) ?? new Set()} onToggleField={(field) => handleToggleField(dup.existingId, field)} />
                    ))}
                    {newEntries.map((entry, index) => (
                      <SimpleNewRow
                        key={`entry-${index}`}
                        title={entry.name}
                        meta={[
                          entry.category ? CATEGORY_LABELS[entry.category] ?? entry.category : null,
                          ENTRY_TYPE_LABELS[entry.type] ?? entry.type,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                        value={`${formatPrice(entry.monthlyAmount)}/mnd`}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          <LlmImportStickyActions
            importError={importError}
            onBack={() => setStep("paste")}
            cancelHref="/budsjett"
            onPrimary={handleImport}
            isPending={isPending}
            primaryDisabled={isPending || (totalNewItems === 0 && updateCount === 0)}
            primaryLabel={
              totalNewItems > 0 && updateCount > 0
                ? `Importer ${totalNewItems} nye + oppdater ${updateCount}`
                : totalNewItems > 0
                  ? `Importer ${totalNewItems} ${totalNewItems === 1 ? "post" : "poster"}`
                  : `Oppdater ${updateCount} ${updateCount === 1 ? "post" : "poster"}`
            }
          />
        </>
      )}
    </div>
  )
}

function SimpleNewRow({
  title,
  meta,
  value,
}: {
  title: string
  meta: string
  value: string
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border bg-card px-3 py-2.5">
      <div className="min-w-0">
        <p className="break-words text-sm font-medium">{title}</p>
        {meta && <p className="mt-0.5 text-xs text-muted-foreground">{meta}</p>}
      </div>
      <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
        {value}
      </span>
    </div>
  )
}
