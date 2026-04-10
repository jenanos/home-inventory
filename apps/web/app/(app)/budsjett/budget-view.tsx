"use client"

import { useState, useMemo, useTransition } from "react"
import {
  Wallet,
  Landmark,
  Home,
  Receipt,
  PlusCircle,
  Pencil,
  Trash2,
  Users,
  TrendingUp,
  TrendingDown,
  PiggyBank,
  Plane,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { Separator } from "@workspace/ui/components/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import {
  upsertBudgetMember,
  deleteBudgetMember,
  upsertBudgetLoan,
  deleteBudgetLoan,
  deleteBudgetTrip,
  upsertBudgetEntry,
  deleteBudgetEntry,
  updateTaxDeductionPercent,
} from "@/lib/actions/budget"
import { toast } from "sonner"
import type { BudgetCategory, BudgetEntryType, BudgetLoanType, TripTransportType } from "@workspace/db"
import { MemberDialog } from "./member-dialog"
import { LoanDialog } from "./loan-dialog"
import { EntryDialog } from "./entry-dialog"
import { TripDialog } from "./trip-dialog"

// ─── Types ──────────────────────────────────────────────────────

export interface BudgetData {
  id: string
  taxDeductionPercent: number
  members: BudgetMemberData[]
  loans: BudgetLoanData[]
  trips: BudgetTripData[]
  entries: BudgetEntryData[]
}

export interface BudgetMemberData {
  id: string
  name: string
  grossMonthlyIncome: number
  taxPercent: number
}

export interface BudgetLoanData {
  id: string
  bankName: string
  loanName: string
  loanType: BudgetLoanType
  monthlyInterest: number
  monthlyPrincipal: number
  monthlyFees: number
}


export interface BudgetTripData {
  id: string
  name: string
  transportType: TripTransportType
  annualTrips: number
  ticketPerTrip: number
  tollPerTrip: number
  ferryPerTrip: number
  fuelPerTrip: number
}

export interface BudgetEntryData {
  id: string
  name: string
  category: BudgetCategory | null
  type: BudgetEntryType
  monthlyAmount: number
}

// ─── Config ─────────────────────────────────────────────────────

const HOUSING_CATEGORIES: BudgetCategory[] = [
  "ELECTRICITY",
  "MUNICIPAL_FEES",
  "INSURANCE",
  "HOME_MAINTENANCE",
]

const FIXED_CATEGORIES: BudgetCategory[] = [
  "TRANSPORT",
  "SUBSCRIPTIONS",
  "FOOD",
  "CHILDREN",
  "PERSONAL",
  "SAVINGS",
  "BUFFER",
]

export const CATEGORY_LABELS: Record<BudgetCategory, string> = {
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

const ENTRY_TYPE_LABELS: Record<BudgetEntryType, string> = {
  INCOME: "Inntekt",
  EXPENSE: "Kostnad",
  DEDUCTION: "Fradrag",
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    maximumFractionDigits: 0,
  }).format(amount)

// ─── Component ──────────────────────────────────────────────────

interface BudgetViewProps {
  budget: BudgetData
}

export function BudgetView({ budget }: BudgetViewProps) {
  const [period, setPeriod] = useState<"month" | "year">("month")
  const multiplier = period === "year" ? 12 : 1

  // Dialog state
  const [memberDialogOpen, setMemberDialogOpen] = useState(false)
  const [editingMember, setEditingMember] = useState<BudgetMemberData | null>(null)

  const [loanDialogOpen, setLoanDialogOpen] = useState(false)
  const [editingLoan, setEditingLoan] = useState<BudgetLoanData | null>(null)

  const [tripDialogOpen, setTripDialogOpen] = useState(false)
  const [editingTrip, setEditingTrip] = useState<BudgetTripData | null>(null)

  const [entryDialogOpen, setEntryDialogOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<BudgetEntryData | null>(null)
  const [entryDefaults, setEntryDefaults] = useState<{
    category?: BudgetCategory
    type?: BudgetEntryType
  }>({})

  const [isPending, startTransition] = useTransition()

  // ─── Calculations ───────────────────────────────────────────

  const calculations = useMemo(() => {
    const totalGrossIncome = budget.members.reduce(
      (sum, m) => sum + m.grossMonthlyIncome,
      0
    )
    const totalNetIncome = budget.members.reduce(
      (sum, m) => sum + m.grossMonthlyIncome * (1 - m.taxPercent / 100),
      0
    )

    const totalLoanInterest = budget.loans.reduce(
      (sum, l) => sum + l.monthlyInterest,
      0
    )
    const totalLoanPrincipal = budget.loans.reduce(
      (sum, l) => sum + l.monthlyPrincipal,
      0
    )
    const totalLoanFees = budget.loans.reduce(
      (sum, l) => sum + l.monthlyFees,
      0
    )
    const totalLoanCost = totalLoanInterest + totalLoanPrincipal + totalLoanFees

    const totalTripCost = budget.trips.reduce((sum, trip) => {
      const perTrip =
        trip.transportType === "AIR_OR_PUBLIC"
          ? trip.ticketPerTrip
          : trip.tollPerTrip + trip.ferryPerTrip + trip.fuelPerTrip

      return sum + (trip.annualTrips * perTrip) / 12
    }, 0)

    // Rentefradrag: annual interest * deduction rate / 12
    const monthlyTaxDeduction =
      (totalLoanInterest * 12 * (budget.taxDeductionPercent / 100)) / 12

    const housingEntries = budget.entries.filter(
      (e) => e.category && HOUSING_CATEGORIES.includes(e.category)
    )
    const fixedEntries = budget.entries.filter(
      (e) => e.category && FIXED_CATEGORIES.includes(e.category)
    )
    const manualEntries = budget.entries.filter((e) => !e.category)

    const totalHousing = housingEntries.reduce(
      (sum, e) => {
        if (e.type === "DEDUCTION") return sum - e.monthlyAmount
        if (e.type === "INCOME") return sum
        return sum + e.monthlyAmount
      },
      0
    )
    const totalFixed = fixedEntries.reduce(
      (sum, e) => {
        if (e.type === "DEDUCTION") return sum - e.monthlyAmount
        if (e.type === "INCOME") return sum
        return sum + e.monthlyAmount
      },
      0
    )

    // Gather income and deductions from categorized entries
    const categorizedIncome = [...housingEntries, ...fixedEntries]
      .filter((e) => e.type === "INCOME")
      .reduce((sum, e) => sum + e.monthlyAmount, 0)
    const categorizedDeductions = [...housingEntries, ...fixedEntries]
      .filter((e) => e.type === "DEDUCTION")
      .reduce((sum, e) => sum + e.monthlyAmount, 0)

    const manualIncome = manualEntries
      .filter((e) => e.type === "INCOME")
      .reduce((sum, e) => sum + e.monthlyAmount, 0)
    const manualExpenses = manualEntries
      .filter((e) => e.type === "EXPENSE")
      .reduce((sum, e) => sum + e.monthlyAmount, 0)
    const manualDeductions = manualEntries
      .filter((e) => e.type === "DEDUCTION")
      .reduce((sum, e) => sum + e.monthlyAmount, 0)

    const totalIncome = totalNetIncome + manualIncome + categorizedIncome
    const totalExpenses =
      totalLoanCost + totalTripCost + totalHousing + totalFixed + manualExpenses
    const totalDeductions =
      monthlyTaxDeduction + manualDeductions + categorizedDeductions
    const disposable = totalIncome - totalExpenses + totalDeductions

    return {
      totalGrossIncome,
      totalNetIncome,
      totalLoanInterest,
      totalLoanPrincipal,
      totalLoanFees,
      totalLoanCost,
      totalTripCost,
      monthlyTaxDeduction,
      housingEntries,
      fixedEntries,
      manualEntries,
      totalHousing,
      totalFixed,
      manualIncome,
      manualExpenses,
      manualDeductions,
      totalIncome,
      totalExpenses,
      totalDeductions,
      disposable,
    }
  }, [budget])

  // ─── Handlers ─────────────────────────────────────────────

  function handleDeleteMember(id: string) {
    startTransition(async () => {
      try {
        await deleteBudgetMember(id)
        toast.success("Medlem slettet")
      } catch {
        toast.error("Kunne ikke slette medlem")
      }
    })
  }

  function handleDeleteLoan(id: string) {
    startTransition(async () => {
      try {
        await deleteBudgetLoan(id)
        toast.success("Lån slettet")
      } catch {
        toast.error("Kunne ikke slette lån")
      }
    })
  }

  function handleDeleteTrip(id: string) {
    startTransition(async () => {
      try {
        await deleteBudgetTrip(id)
        toast.success("Reise slettet")
      } catch {
        toast.error("Kunne ikke slette reise")
      }
    })
  }

  function handleDeleteEntry(id: string) {
    startTransition(async () => {
      try {
        await deleteBudgetEntry(id)
        toast.success("Post slettet")
      } catch {
        toast.error("Kunne ikke slette post")
      }
    })
  }

  function openAddEntry(defaults: {
    category?: BudgetCategory
    type?: BudgetEntryType
  }) {
    setEditingEntry(null)
    setEntryDefaults(defaults)
    setEntryDialogOpen(true)
  }

  // ─── Render ───────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 overflow-x-hidden">
      {/* Period toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs
          value={period}
          onValueChange={(v) => setPeriod(v as "month" | "year")}
        >
          <TabsList>
            <TabsTrigger value="month">Per måned</TabsTrigger>
            <TabsTrigger value="year">Per år</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Netto inntekt</CardTitle>
            <TrendingUp className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold tabular-nums text-green-600 dark:text-green-400">
              {formatCurrency(calculations.totalIncome * multiplier)}
            </div>
            <p className="text-muted-foreground text-xs">
              Brutto: {formatCurrency(calculations.totalGrossIncome * multiplier)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Totale kostnader
            </CardTitle>
            <TrendingDown className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold tabular-nums text-red-600 dark:text-red-400">
              {formatCurrency(calculations.totalExpenses * multiplier)}
            </div>
            <p className="text-muted-foreground text-xs">
              Fradrag: {formatCurrency(calculations.totalDeductions * multiplier)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rentefradrag</CardTitle>
            <Receipt className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold tabular-nums text-blue-600 dark:text-blue-400">
              {formatCurrency(
                calculations.monthlyTaxDeduction * multiplier
              )}
            </div>
            <p className="text-muted-foreground text-xs">
              {budget.taxDeductionPercent}% av rentekostnader
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Disponibelt</CardTitle>
            <PiggyBank className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div
              className={`text-xl sm:text-2xl font-bold tabular-nums ${
                calculations.disposable >= 0
                  ? "text-green-600 dark:text-green-400"
                  : "text-red-600 dark:text-red-400"
              }`}
            >
              {formatCurrency(calculations.disposable * multiplier)}
            </div>
            <p className="text-muted-foreground text-xs">
              Etter alle kostnader og fradrag
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Income section */}
      <BudgetSection
        title="Inntekter"
        icon={<Users className="h-4 w-4" />}
        badge={
          <Badge variant="outline" className="text-green-700 dark:text-green-400">
            {formatCurrency(calculations.totalNetIncome * multiplier)} netto
          </Badge>
        }
        onAdd={() => {
          setEditingMember(null)
          setMemberDialogOpen(true)
        }}
        addLabel="Legg til medlem"
      >
        {budget.members.length === 0 ? (
          <p className="text-muted-foreground py-4 text-center text-sm">
            Ingen medlemmer lagt til ennå
          </p>
        ) : (
          <div className="divide-border divide-y">
            {budget.members.map((member) => {
              const netIncome =
                member.grossMonthlyIncome * (1 - member.taxPercent / 100)
              return (
                <div
                  key={member.id}
                  className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{member.name}</p>
                    <p className="text-muted-foreground text-xs sm:text-sm break-words">
                      Brutto: {formatCurrency(member.grossMonthlyIncome * multiplier)}
                      {" · "}
                      Skatt: {member.taxPercent}%
                    </p>
                  </div>
                  <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-start sm:gap-2">
                    <div className="text-right">
                      <p className="font-medium tabular-nums text-sm sm:text-base">
                        {formatCurrency(netIncome * multiplier)}
                      </p>
                      <Badge variant="secondary" className="text-xs hidden sm:inline-flex">
                        Beregnet
                      </Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => {
                        setEditingMember(member)
                        setMemberDialogOpen(true)
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleDeleteMember(member.id)}
                      disabled={isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </BudgetSection>

      {/* Loans section */}
      <BudgetSection
        title="Lån"
        icon={<Landmark className="h-4 w-4" />}
        badge={
          <Badge variant="outline" className="text-red-700 dark:text-red-400">
            {formatCurrency(calculations.totalLoanCost * multiplier)}
          </Badge>
        }
        onAdd={() => {
          setEditingLoan(null)
          setLoanDialogOpen(true)
        }}
        addLabel="Legg til lån"
      >
        {budget.loans.length === 0 ? (
          <p className="text-muted-foreground py-4 text-center text-sm">
            Ingen lån lagt til ennå
          </p>
        ) : (
          <div className="divide-border divide-y">
            {budget.loans.map((loan) => {
              const totalMonthly =
                loan.monthlyInterest + loan.monthlyPrincipal + loan.monthlyFees
              return (
                <div
                  key={loan.id}
                  className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
                      {loan.loanName}
                      <span className="text-muted-foreground text-sm font-normal hidden sm:inline">
                        {loan.bankName}
                      </span>
                      <Badge variant="secondary" className="text-xs hidden sm:inline-flex">
                        {loan.loanType === "MORTGAGE" ? "Boliglån" : "Annet"}
                      </Badge>
                    </p>
                    <p className="text-muted-foreground text-xs sm:text-sm flex flex-wrap gap-x-1 gap-y-1 break-words">
                      <span className="sm:hidden">{loan.bankName}</span>
                      <span className="hidden sm:inline">Renter: {formatCurrency(loan.monthlyInterest * multiplier)}</span>
                      <span className="hidden sm:inline">·</span>
                      <span className="hidden sm:inline">Avdrag: {formatCurrency(loan.monthlyPrincipal * multiplier)}</span>
                      {loan.monthlyFees > 0 && (
                        <>
                          <span className="hidden sm:inline">·</span>
                          <span className="hidden sm:inline">Gebyrer: {formatCurrency(loan.monthlyFees * multiplier)}</span>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-start sm:gap-2">
                    <p className="font-medium tabular-nums text-sm sm:text-base">
                      {formatCurrency(totalMonthly * multiplier)}
                    </p>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => {
                        setEditingLoan(loan)
                        setLoanDialogOpen(true)
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleDeleteLoan(loan.id)}
                      disabled={isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )
            })}
            {/* Auto-calculated rentefradrag row */}
            {calculations.totalLoanInterest > 0 && (
              <>
                <div className="bg-muted/50 flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-blue-700 dark:text-blue-400">
                      Rentefradrag
                    </p>
                    <p className="text-muted-foreground text-xs sm:text-sm break-words">
                      {budget.taxDeductionPercent}% av totale rentekostnader (
                      {formatCurrency(calculations.totalLoanInterest * 12)}/år)
                    </p>
                  </div>
                  <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-start sm:gap-2">
                    <div className="text-right">
                      <p className="font-medium tabular-nums text-blue-700 dark:text-blue-400 text-sm sm:text-base">
                        −{formatCurrency(calculations.monthlyTaxDeduction * multiplier)}
                      </p>
                      <Badge variant="secondary" className="text-xs hidden sm:inline-flex">
                        Beregnet
                      </Badge>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </BudgetSection>


      {/* Trips section */}
      <BudgetSection
        title="Reiser"
        icon={<Plane className="h-4 w-4" />}
        badge={
          <Badge variant="outline" className="text-red-700 dark:text-red-400">
            {formatCurrency(calculations.totalTripCost * multiplier)}
          </Badge>
        }
        onAdd={() => {
          setEditingTrip(null)
          setTripDialogOpen(true)
        }}
        addLabel="Legg til reise"
      >
        {budget.trips.length === 0 ? (
          <p className="text-muted-foreground py-4 text-center text-sm">
            Ingen reiser lagt til ennå
          </p>
        ) : (
          <div className="divide-border divide-y">
            {budget.trips.map((trip) => {
              const perTrip =
                trip.transportType === "AIR_OR_PUBLIC"
                  ? trip.ticketPerTrip
                  : trip.tollPerTrip + trip.ferryPerTrip + trip.fuelPerTrip
              const monthly = (trip.annualTrips * perTrip) / 12

              return (
                <div key={trip.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{trip.name}</p>
                    <p className="text-muted-foreground text-xs sm:text-sm break-words">
                      {trip.transportType === "AIR_OR_PUBLIC"
                        ? `Fly/offentlig · ${trip.annualTrips} reiser/år · Billett ${formatCurrency(perTrip)}/reise`
                        : `Bil · ${trip.annualTrips} reiser/år · Bom/ferge/drivstoff ${formatCurrency(perTrip)}/reise`}
                    </p>
                  </div>
                  <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-start sm:gap-2">
                    <p className="font-medium tabular-nums text-sm sm:text-base">{formatCurrency(monthly * multiplier)}</p>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => {
                        setEditingTrip(trip)
                        setTripDialogOpen(true)
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleDeleteTrip(trip.id)}
                      disabled={isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </BudgetSection>

      {/* Housing costs section */}
      <BudgetSection
        title="Boligkostnader"
        icon={<Home className="h-4 w-4" />}
        badge={
          <Badge variant="outline" className="text-red-700 dark:text-red-400">
            {formatCurrency(calculations.totalHousing * multiplier)}
          </Badge>
        }
        onAdd={() => openAddEntry({ type: "EXPENSE" })}
        addLabel="Legg til kostnad"
      >
        <EntryList
          entries={calculations.housingEntries}
          multiplier={multiplier}
          onEdit={(entry) => {
            setEditingEntry(entry)
            setEntryDefaults({})
            setEntryDialogOpen(true)
          }}
          onDelete={handleDeleteEntry}
          isPending={isPending}
          emptyText="Ingen boligkostnader lagt til"
          showCategory
        />
        {/* Quick add buttons for housing categories not yet added */}
        <QuickAddButtons
          categories={HOUSING_CATEGORIES}
          existingEntries={calculations.housingEntries}
          onAdd={(category) =>
            openAddEntry({ category, type: "EXPENSE" })
          }
        />
      </BudgetSection>

      {/* Fixed costs section */}
      <BudgetSection
        title="Faste kostnader"
        icon={<Wallet className="h-4 w-4" />}
        badge={
          <Badge variant="outline" className="text-red-700 dark:text-red-400">
            {formatCurrency(calculations.totalFixed * multiplier)}
          </Badge>
        }
        onAdd={() => openAddEntry({ type: "EXPENSE" })}
        addLabel="Legg til kostnad"
      >
        <EntryList
          entries={calculations.fixedEntries}
          multiplier={multiplier}
          onEdit={(entry) => {
            setEditingEntry(entry)
            setEntryDefaults({})
            setEntryDialogOpen(true)
          }}
          onDelete={handleDeleteEntry}
          isPending={isPending}
          emptyText="Ingen faste kostnader lagt til"
          showCategory
        />
        <QuickAddButtons
          categories={FIXED_CATEGORIES}
          existingEntries={calculations.fixedEntries}
          onAdd={(category) =>
            openAddEntry({ category, type: "EXPENSE" })
          }
        />
      </BudgetSection>

      {/* Manual entries section */}
      <BudgetSection
        title="Manuelle budsjettposter"
        icon={<Receipt className="h-4 w-4" />}
        badge={
          calculations.manualEntries.length > 0 ? (
            <Badge variant="outline">
              {calculations.manualEntries.length}{" "}
              {calculations.manualEntries.length === 1 ? "post" : "poster"}
            </Badge>
          ) : null
        }
        onAdd={() => openAddEntry({})}
        addLabel="Legg til post"
      >
        <EntryList
          entries={calculations.manualEntries}
          multiplier={multiplier}
          onEdit={(entry) => {
            setEditingEntry(entry)
            setEntryDefaults({})
            setEntryDialogOpen(true)
          }}
          onDelete={handleDeleteEntry}
          isPending={isPending}
          emptyText="Ingen manuelle poster lagt til"
          showType
        />
      </BudgetSection>

      {/* Dialogs */}
      <MemberDialog
        open={memberDialogOpen}
        onOpenChange={setMemberDialogOpen}
        member={editingMember}
      />
      <LoanDialog
        open={loanDialogOpen}
        onOpenChange={setLoanDialogOpen}
        loan={editingLoan}
      />
      <TripDialog
        open={tripDialogOpen}
        onOpenChange={setTripDialogOpen}
        trip={editingTrip}
      />
      <EntryDialog
        open={entryDialogOpen}
        onOpenChange={setEntryDialogOpen}
        entry={editingEntry}
        defaults={entryDefaults}
      />
    </div>
  )
}

// ─── Sub-components ─────────────────────────────────────────────

function BudgetSection({
  title,
  icon,
  badge,
  onAdd,
  addLabel,
  children,
}: {
  title: string
  icon: React.ReactNode
  badge: React.ReactNode
  onAdd: () => void
  addLabel: string
  children: React.ReactNode
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2 overflow-hidden">
            {icon}
            <CardTitle className="min-w-0 text-base truncate">{title}</CardTitle>
            <span>{badge}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onAdd}
            className="w-full shrink-0 sm:w-auto"
          >
            <PlusCircle className="h-3.5 w-3.5 sm:mr-1.5" />
            <span className="hidden sm:inline">{addLabel}</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function EntryList({
  entries,
  multiplier,
  onEdit,
  onDelete,
  isPending,
  emptyText,
  showCategory,
  showType,
}: {
  entries: BudgetEntryData[]
  multiplier: number
  onEdit: (entry: BudgetEntryData) => void
  onDelete: (id: string) => void
  isPending: boolean
  emptyText: string
  showCategory?: boolean
  showType?: boolean
}) {
  if (entries.length === 0) {
    return (
      <p className="text-muted-foreground py-4 text-center text-sm">
        {emptyText}
      </p>
    )
  }

  return (
    <div className="divide-border divide-y">
      {entries.map((entry) => (
        <div
          key={entry.id}
          className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{entry.name}</p>
            <div className="flex flex-wrap gap-2">
              {showCategory && entry.category && (
                <Badge variant="secondary" className="text-xs">
                  {CATEGORY_LABELS[entry.category]}
                </Badge>
              )}
              {showType && (
                <Badge
                  variant="secondary"
                  className={`text-xs ${
                    entry.type === "INCOME"
                      ? "text-green-700 dark:text-green-400"
                      : entry.type === "DEDUCTION"
                        ? "text-blue-700 dark:text-blue-400"
                        : "text-red-700 dark:text-red-400"
                  }`}
                >
                  {ENTRY_TYPE_LABELS[entry.type]}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-start sm:gap-2">
            <p
              className={`font-medium tabular-nums text-sm sm:text-base ${
                entry.type === "INCOME"
                  ? "text-green-600 dark:text-green-400"
                  : entry.type === "DEDUCTION"
                    ? "text-blue-600 dark:text-blue-400"
                    : ""
              }`}
            >
              {entry.type === "DEDUCTION" && "−"}
              {formatCurrency(entry.monthlyAmount * multiplier)}
            </p>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onEdit(entry)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onDelete(entry.id)}
              disabled={isPending}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}

function QuickAddButtons({
  categories,
  existingEntries,
  onAdd,
}: {
  categories: BudgetCategory[]
  existingEntries: BudgetEntryData[]
  onAdd: (category: BudgetCategory) => void
}) {
  const existingCategories = new Set(
    existingEntries.map((e) => e.category).filter(Boolean)
  )
  const missing = categories.filter((c) => !existingCategories.has(c))

  if (missing.length === 0) return null

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {missing.map((category) => (
        <Button
          key={category}
          variant="ghost"
          size="sm"
          className="text-muted-foreground h-auto px-2 py-1 text-xs"
          onClick={() => onAdd(category)}
        >
          <PlusCircle className="mr-1 h-3 w-3" />
          {CATEGORY_LABELS[category]}
        </Button>
      ))}
    </div>
  )
}
