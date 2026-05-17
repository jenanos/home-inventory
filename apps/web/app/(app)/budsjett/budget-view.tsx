"use client"

import { type ReactNode, useMemo, useState, useTransition } from "react"
import {
  Landmark,
  Pencil,
  Plane,
  PlusCircle,
  Receipt,
  Trash2,
  Users,
  Wallet,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { BudgetStatsSummary } from "@/components/budget-stats-summary"
import {
  deleteBudgetCategory,
  deleteBudgetEntry,
  deleteBudgetLoan,
  deleteBudgetMember,
  deleteBudgetTrip,
} from "@/lib/actions/budget"
import { toast } from "sonner"
import type {
  BudgetEntryType,
  BudgetLoanRepaymentType,
  BudgetLoanType,
  TripTransportType,
} from "@workspace/db"
import { MemberDialog } from "./member-dialog"
import { LoanDialog } from "./loan-dialog"
import { EntryDialog } from "./entry-dialog"
import { TripDialog } from "./trip-dialog"
import { CategoryDialog } from "./category-dialog"

export interface BudgetCategoryData {
  id: string
  name: string
}

export interface BudgetData {
  id: string
  taxDeductionPercent: number
  categories: BudgetCategoryData[]
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
  repaymentType: BudgetLoanRepaymentType
  principalAmount: number
  annualInterestRate: number
  termMonths: number
  monthlyFees: number
  monthlyInterest: number
  monthlyPrincipal: number
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
  category: BudgetCategoryData | null
  type: BudgetEntryType
  monthlyAmount: number
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

function getEntryDisposableImpact(entry: BudgetEntryData) {
  return entry.type === "EXPENSE" ? -entry.monthlyAmount : entry.monthlyAmount
}

function getEntryExpenses(entries: BudgetEntryData[]) {
  return entries
    .filter((entry) => entry.type === "EXPENSE")
    .reduce((sum, entry) => sum + entry.monthlyAmount, 0)
}

function getEntryIncome(entries: BudgetEntryData[]) {
  return entries
    .filter((entry) => entry.type === "INCOME")
    .reduce((sum, entry) => sum + entry.monthlyAmount, 0)
}

function getEntryDeductions(entries: BudgetEntryData[]) {
  return entries
    .filter((entry) => entry.type === "DEDUCTION")
    .reduce((sum, entry) => sum + entry.monthlyAmount, 0)
}

interface BudgetViewProps {
  budget: BudgetData
}

export function BudgetView({ budget }: BudgetViewProps) {
  const [period, setPeriod] = useState<"month" | "year">("month")
  const multiplier = period === "year" ? 12 : 1

  const [memberDialogOpen, setMemberDialogOpen] = useState(false)
  const [editingMember, setEditingMember] = useState<BudgetMemberData | null>(null)

  const [loanDialogOpen, setLoanDialogOpen] = useState(false)
  const [editingLoan, setEditingLoan] = useState<BudgetLoanData | null>(null)

  const [tripDialogOpen, setTripDialogOpen] = useState(false)
  const [editingTrip, setEditingTrip] = useState<BudgetTripData | null>(null)

  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<BudgetCategoryData | null>(
    null
  )

  const [entryDialogOpen, setEntryDialogOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<BudgetEntryData | null>(null)
  const [entryDefaults, setEntryDefaults] = useState<{
    categoryId?: string | null
    type?: BudgetEntryType
  }>({})

  const [isPending, startTransition] = useTransition()

  const calculations = useMemo(() => {
    const totalNetIncome = budget.members.reduce(
      (sum, member) =>
        sum + member.grossMonthlyIncome * (1 - member.taxPercent / 100),
      0
    )

    const totalLoanInterest = budget.loans.reduce(
      (sum, loan) => sum + loan.monthlyInterest,
      0
    )
    const totalLoanPrincipal = budget.loans.reduce(
      (sum, loan) => sum + loan.monthlyPrincipal,
      0
    )
    const totalLoanFees = budget.loans.reduce(
      (sum, loan) => sum + loan.monthlyFees,
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

    const monthlyTaxDeduction =
      (totalLoanInterest * 12 * (budget.taxDeductionPercent / 100)) / 12

    const uncategorizedEntries = budget.entries.filter((entry) => !entry.category)
    const categoryGroups = budget.categories.map((category) => {
      const entries = budget.entries.filter(
        (entry) => entry.category?.id === category.id
      )

      return {
        category,
        entries,
        disposableImpact: entries.reduce(
          (sum, entry) => sum + getEntryDisposableImpact(entry),
          0
        ),
      }
    })

    const entryIncome = getEntryIncome(budget.entries)
    const entryExpenses = getEntryExpenses(budget.entries)
    const entryDeductions = getEntryDeductions(budget.entries)

    const totalIncome = totalNetIncome + entryIncome
    const totalExpenses = totalLoanCost + totalTripCost + entryExpenses
    const totalDeductions = monthlyTaxDeduction + entryDeductions
    const disposable = totalIncome - totalExpenses + totalDeductions

    return {
      totalNetIncome,
      totalLoanInterest,
      totalLoanCost,
      totalTripCost,
      monthlyTaxDeduction,
      categoryGroups,
      uncategorizedEntries,
      uncategorizedImpact: uncategorizedEntries.reduce(
        (sum, entry) => sum + getEntryDisposableImpact(entry),
        0
      ),
      totalIncome,
      totalExpenses,
      totalDeductions,
      disposable,
    }
  }, [budget])

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

  function handleDeleteCategory(category: BudgetCategoryData) {
    const entryCount =
      calculations.categoryGroups.find((group) => group.category.id === category.id)
        ?.entries.length ?? 0
    const message =
      entryCount > 0
        ? `Slette kategorien "${category.name}"? ${entryCount} ${entryCount === 1 ? "post blir" : "poster blir"} ukategorisert.`
        : `Slette kategorien "${category.name}"?`

    if (!confirm(message)) return

    startTransition(async () => {
      try {
        await deleteBudgetCategory(category.id)
        toast.success("Kategori slettet")
      } catch {
        toast.error("Kunne ikke slette kategori")
      }
    })
  }

  function openAddEntry(defaults: {
    categoryId?: string | null
    type?: BudgetEntryType
  }) {
    setEditingEntry(null)
    setEntryDefaults(defaults)
    setEntryDialogOpen(true)
  }

  function openCreateCategory() {
    setEditingCategory(null)
    setCategoryDialogOpen(true)
  }

  return (
    <div className="flex flex-col gap-6 overflow-x-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs
          value={period}
          onValueChange={(value) => setPeriod(value as "month" | "year")}
        >
          <TabsList>
            <TabsTrigger value="month">Per måned</TabsTrigger>
            <TabsTrigger value="year">Per år</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button variant="outline" size="sm" onClick={openCreateCategory}>
          <PlusCircle className="h-3.5 w-3.5" data-icon="inline-start" />
          Legg til kategori
        </Button>
      </div>

      <BudgetStatsSummary
        disposable={calculations.disposable * multiplier}
        disposableSubtitle={
          period === "year"
            ? "per år, etter alle kostnader og fradrag"
            : "per måned, etter alle kostnader og fradrag"
        }
        items={[
          {
            label: "Netto inntekt",
            value: calculations.totalIncome * multiplier,
            tone: "income",
          },
          {
            label: "Kostnader",
            value: calculations.totalExpenses * multiplier,
            tone: "expense",
          },
          {
            label: "Rentefradrag",
            value: calculations.monthlyTaxDeduction * multiplier,
            tone: "info",
          },
        ]}
      />

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
          <p className="py-4 text-center text-sm text-muted-foreground">
            Ingen medlemmer lagt til ennå
          </p>
        ) : (
          <div className="divide-y divide-border">
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
                    <p className="break-words text-xs text-muted-foreground sm:text-sm">
                      Brutto: {formatCurrency(member.grossMonthlyIncome * multiplier)}
                      {" · "}
                      Skatt: {member.taxPercent}%
                    </p>
                  </div>
                  <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-start">
                    <div className="text-right">
                      <p className="text-sm font-medium tabular-nums sm:text-base">
                        {formatCurrency(netIncome * multiplier)}
                      </p>
                      <Badge variant="secondary" className="hidden text-xs sm:inline-flex">
                        Beregnet
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1 sm:gap-2">
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
                </div>
              )
            })}
          </div>
        )}
      </BudgetSection>

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
          <p className="py-4 text-center text-sm text-muted-foreground">
            Ingen lån lagt til ennå
          </p>
        ) : (
          <div className="divide-y divide-border">
            {budget.loans.map((loan) => {
              const totalMonthly =
                loan.monthlyInterest + loan.monthlyPrincipal + loan.monthlyFees
              const needsSetup =
                loan.principalAmount <= 0 || loan.termMonths <= 0
              const termYears = loan.termMonths / 12
              const termLabel =
                Number.isInteger(termYears)
                  ? `${termYears} år`
                  : `${termYears.toFixed(1)} år`

              return (
                <div
                  key={loan.id}
                  className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-x-2 gap-y-1 font-medium sm:flex-wrap">
                      {loan.loanName}
                      <span className="hidden text-sm font-normal text-muted-foreground sm:inline">
                        {loan.bankName}
                      </span>
                      <Badge variant="secondary" className="hidden text-xs sm:inline-flex">
                        {loan.loanType === "MORTGAGE" ? "Boliglån" : "Annet"}
                      </Badge>
                      <Badge variant="secondary" className="hidden text-xs sm:inline-flex">
                        {loan.repaymentType === "ANNUITY"
                          ? "Annuitet"
                          : "Serie"}
                      </Badge>
                    </p>
                    {needsSetup ? (
                      <p className="text-xs text-amber-600 dark:text-amber-400 sm:text-sm">
                        Mangler lånebeløp og nedbetalingstid – rediger lånet for
                        å fullføre.
                      </p>
                    ) : (
                      <p className="flex flex-wrap gap-x-1 gap-y-1 break-words text-xs text-muted-foreground sm:text-sm">
                        <span className="sm:hidden">{loan.bankName}</span>
                        <span className="hidden sm:inline">
                          {formatCurrency(loan.principalAmount)} ·{" "}
                          {loan.annualInterestRate}% · {termLabel}
                        </span>
                        <span className="hidden sm:inline">·</span>
                        <span className="hidden sm:inline">
                          Renter: {formatCurrency(loan.monthlyInterest * multiplier)}
                        </span>
                        <span className="hidden sm:inline">·</span>
                        <span className="hidden sm:inline">
                          Avdrag: {formatCurrency(loan.monthlyPrincipal * multiplier)}
                        </span>
                        {loan.monthlyFees > 0 && (
                          <>
                            <span className="hidden sm:inline">·</span>
                            <span className="hidden sm:inline">
                              Gebyrer: {formatCurrency(loan.monthlyFees * multiplier)}
                            </span>
                          </>
                        )}
                      </p>
                    )}
                  </div>
                  <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-start">
                    <p className="text-sm font-medium tabular-nums sm:text-base">
                      {formatCurrency(totalMonthly * multiplier)}
                    </p>
                    <div className="flex items-center gap-1 sm:gap-2">
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
                </div>
              )
            })}
            {calculations.totalLoanInterest > 0 && (
              <div className="flex flex-col gap-3 bg-muted/50 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-blue-700 dark:text-blue-400">
                    Rentefradrag
                  </p>
                  <p className="break-words text-xs text-muted-foreground sm:text-sm">
                    {budget.taxDeductionPercent}% av totale rentekostnader (
                    {formatCurrency(calculations.totalLoanInterest * 12)}/år)
                  </p>
                </div>
                <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-start">
                  <div className="text-right">
                    <p className="text-sm font-medium tabular-nums text-blue-700 dark:text-blue-400 sm:text-base">
                      −{formatCurrency(calculations.monthlyTaxDeduction * multiplier)}
                    </p>
                    <Badge variant="secondary" className="hidden text-xs sm:inline-flex">
                      Beregnet
                    </Badge>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </BudgetSection>

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
          <p className="py-4 text-center text-sm text-muted-foreground">
            Ingen reiser lagt til ennå
          </p>
        ) : (
          <div className="divide-y divide-border">
            {budget.trips.map((trip) => {
              const perTrip =
                trip.transportType === "AIR_OR_PUBLIC"
                  ? trip.ticketPerTrip
                  : trip.tollPerTrip + trip.ferryPerTrip + trip.fuelPerTrip
              const monthly = (trip.annualTrips * perTrip) / 12

              return (
                <div
                  key={trip.id}
                  className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{trip.name}</p>
                    <p className="break-words text-xs text-muted-foreground sm:text-sm">
                      {trip.transportType === "AIR_OR_PUBLIC"
                        ? `Fly/offentlig · ${trip.annualTrips} reiser/år · Billett ${formatCurrency(perTrip)}/reise`
                        : `Bil · ${trip.annualTrips} reiser/år · Bom/ferge/drivstoff ${formatCurrency(perTrip)}/reise`}
                    </p>
                  </div>
                  <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-start">
                    <p className="text-sm font-medium tabular-nums sm:text-base">
                      {formatCurrency(monthly * multiplier)}
                    </p>
                    <div className="flex items-center gap-1 sm:gap-2">
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
                </div>
              )
            })}
          </div>
        )}
      </BudgetSection>

      {calculations.categoryGroups.map(({ category, entries, disposableImpact }) => (
        <BudgetSection
          key={category.id}
          title={category.name}
          icon={<Wallet className="h-4 w-4" />}
          badge={<ImpactBadge value={disposableImpact * multiplier} />}
          onAdd={() => openAddEntry({ categoryId: category.id, type: "EXPENSE" })}
          addLabel="Legg til post"
          headerActions={
            <div className="flex items-center gap-1 sm:gap-2">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  setEditingCategory(category)
                  setCategoryDialogOpen(true)
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => handleDeleteCategory(category)}
                disabled={isPending}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          }
        >
          <EntryList
            entries={entries}
            multiplier={multiplier}
            onEdit={(entry) => {
              setEditingEntry(entry)
              setEntryDefaults({})
              setEntryDialogOpen(true)
            }}
            onDelete={handleDeleteEntry}
            isPending={isPending}
            emptyText="Ingen poster i kategorien"
            showType
          />
        </BudgetSection>
      ))}

      <BudgetSection
        title="Ukategoriserte budsjettposter"
        icon={<Receipt className="h-4 w-4" />}
        badge={<ImpactBadge value={calculations.uncategorizedImpact * multiplier} />}
        onAdd={() => openAddEntry({ type: "EXPENSE" })}
        addLabel="Legg til post"
      >
        <EntryList
          entries={calculations.uncategorizedEntries}
          multiplier={multiplier}
          onEdit={(entry) => {
            setEditingEntry(entry)
            setEntryDefaults({})
            setEntryDialogOpen(true)
          }}
          onDelete={handleDeleteEntry}
          isPending={isPending}
          emptyText="Ingen ukategoriserte poster"
          showType
        />
      </BudgetSection>

      <CategoryDialog
        open={categoryDialogOpen}
        onOpenChange={setCategoryDialogOpen}
        category={editingCategory}
      />
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
        categories={budget.categories}
        defaults={entryDefaults}
      />
    </div>
  )
}

function BudgetSection({
  title,
  icon,
  badge,
  onAdd,
  addLabel,
  headerActions,
  children,
}: {
  title: string
  icon: ReactNode
  badge: ReactNode
  onAdd: () => void
  addLabel: string
  headerActions?: ReactNode
  children: ReactNode
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2 overflow-hidden">
            {icon}
            <CardTitle className="min-w-0 truncate text-base">{title}</CardTitle>
            <span className="shrink-0">{badge}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {headerActions}
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
      <p className="py-4 text-center text-sm text-muted-foreground">{emptyText}</p>
    )
  }

  return (
    <div className="divide-y divide-border">
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
                  {entry.category.name}
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
          <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-start">
            <p
              className={`text-sm font-medium tabular-nums sm:text-base ${
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
            <div className="flex items-center gap-1 sm:gap-2">
              <Button variant="ghost" size="icon-sm" onClick={() => onEdit(entry)}>
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
        </div>
      ))}
    </div>
  )
}

function ImpactBadge({ value }: { value: number }) {
  let toneClass: string | undefined

  if (value > 0) {
    toneClass = "text-green-700 dark:text-green-400"
  } else if (value < 0) {
    toneClass = "text-red-700 dark:text-red-400"
  }

  return (
    <Badge variant="outline" className={toneClass}>
      {formatCurrency(value)}
    </Badge>
  )
}
