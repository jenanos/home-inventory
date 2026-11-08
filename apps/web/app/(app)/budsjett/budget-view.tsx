"use client"

import { type ReactNode, useMemo, useState, useTransition } from "react"
import {
  Landmark,
  Pencil,
  Plane,
  PlusCircle,
  Receipt,
  Settings2,
  Trash2,
  Users,
  Wallet,
} from "lucide-react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
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
import {
  calculateBudgetOverview,
  entryMonthlyAmount,
  loanMonthlyAmounts,
  memberCalculatedNetIncome,
  memberNetIncome,
  tripCostPerTrip,
  tripMonthlyCost,
} from "@/lib/application/budget/calculations"
import {
  BUDGET_ENTRY_OPTIONAL_FIELDS,
  BUDGET_LOAN_OPTIONAL_FIELDS,
  BUDGET_MEMBER_OPTIONAL_FIELDS,
  BUDGET_SETTINGS_OPTIONAL_FIELDS,
  BUDGET_TRIP_OPTIONAL_FIELDS,
} from "@/lib/application/budget/fields"
import { toast } from "sonner"
import type {
  BudgetEntryType,
  BudgetFrequency,
  BudgetLoanRepaymentType,
  BudgetLoanType,
  TripTransportType,
} from "@workspace/db"
import { MemberDialog } from "./member-dialog"
import { LoanDialog } from "./loan-dialog"
import { EntryDialog } from "./entry-dialog"
import { TripDialog } from "./trip-dialog"
import { CategoryDialog } from "./category-dialog"
import { SettingsDialog } from "./settings-dialog"
import { KeyFigures } from "./key-figures"
import { RowDetails, countEmptyFields } from "./row-details"
import { ViewOptionsMenu, useBudgetViewOptions } from "./view-options"
import type { BudgetViewOptions } from "./view-options"
import {
  ENTRY_TYPE_LABELS,
  ENTRY_TYPE_TONE,
  FREQUENCY_SUFFIX,
  LOAN_TYPE_LABELS,
  formatCurrency,
} from "./budget-format"

export interface BudgetCategoryData {
  id: string
  name: string
}

export interface BudgetData {
  id: string
  taxDeductionPercent: number
  propertyValue: number | null
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
  netMonthlyIncome: number | null
  notes: string | null
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
  /** `YYYY-MM-DD` */
  fixedRateUntil: string | null
  notes: string | null
}

export interface BudgetTripData {
  id: string
  name: string
  transportType: TripTransportType
  annualTrips: number
  ticketPerTrip: number | null
  tollPerTrip: number | null
  ferryPerTrip: number | null
  fuelPerTrip: number | null
  otherPerTrip: number | null
  notes: string | null
}

export interface BudgetEntryData {
  id: string
  name: string
  category: BudgetCategoryData | null
  type: BudgetEntryType
  amount: number
  frequency: BudgetFrequency
  provider: string | null
  paymentDay: number | null
  /** `YYYY-MM-DD` */
  renewalDate: string | null
  notes: string | null
}

interface BudgetViewProps {
  budget: BudgetData
}

/** Runs a delete after the user confirms it in the browser dialog. */
function useConfirmedDelete() {
  const [isPending, startTransition] = useTransition()

  function remove(
    message: string,
    action: () => Promise<void>,
    labels: { success: string; error: string }
  ) {
    if (!confirm(message)) return
    startTransition(async () => {
      try {
        await action()
        toast.success(labels.success)
      } catch {
        toast.error(labels.error)
      }
    })
  }

  return [isPending, remove] as const
}

export function BudgetView({ budget }: BudgetViewProps) {
  const [period, setPeriod] = useState<"month" | "year">("month")
  const multiplier = period === "year" ? 12 : 1
  const periodLabel = period === "year" ? "per år" : "per måned"
  const [viewOptions, setViewOptions] = useBudgetViewOptions()

  const [memberDialogOpen, setMemberDialogOpen] = useState(false)
  const [editingMember, setEditingMember] = useState<BudgetMemberData | null>(
    null
  )

  const [loanDialogOpen, setLoanDialogOpen] = useState(false)
  const [editingLoan, setEditingLoan] = useState<BudgetLoanData | null>(null)

  const [tripDialogOpen, setTripDialogOpen] = useState(false)
  const [editingTrip, setEditingTrip] = useState<BudgetTripData | null>(null)

  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false)
  const [editingCategory, setEditingCategory] =
    useState<BudgetCategoryData | null>(null)

  const [settingsOpen, setSettingsOpen] = useState(false)

  const [entryDialogOpen, setEntryDialogOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<BudgetEntryData | null>(null)
  const [entryDefaults, setEntryDefaults] = useState<{
    categoryId?: string | null
    type?: BudgetEntryType
  }>({})

  const [isPending, confirmDelete] = useConfirmedDelete()

  const calculations = useMemo(() => calculateBudgetOverview(budget), [budget])

  const settingsRow = {
    propertyValue: budget.propertyValue,
    hasMortgage: calculations.mortgageDebt > 0,
  }
  const emptyFieldCount =
    countEmptyFields(BUDGET_MEMBER_OPTIONAL_FIELDS, budget.members) +
    countEmptyFields(BUDGET_LOAN_OPTIONAL_FIELDS, budget.loans) +
    countEmptyFields(BUDGET_TRIP_OPTIONAL_FIELDS, budget.trips) +
    countEmptyFields(BUDGET_ENTRY_OPTIONAL_FIELDS, budget.entries) +
    countEmptyFields(BUDGET_SETTINGS_OPTIONAL_FIELDS, [settingsRow])

  function editMember(member: BudgetMemberData | null) {
    setEditingMember(member)
    setMemberDialogOpen(true)
  }

  function editLoan(loan: BudgetLoanData | null) {
    setEditingLoan(loan)
    setLoanDialogOpen(true)
  }

  function editTrip(trip: BudgetTripData | null) {
    setEditingTrip(trip)
    setTripDialogOpen(true)
  }

  function editEntry(entry: BudgetEntryData) {
    setEditingEntry(entry)
    setEntryDefaults({})
    setEntryDialogOpen(true)
  }

  function openAddEntry(defaults: {
    categoryId?: string | null
    type?: BudgetEntryType
  }) {
    setEditingEntry(null)
    setEntryDefaults(defaults)
    setEntryDialogOpen(true)
  }

  function handleDeleteCategory(category: BudgetCategoryData) {
    const entryCount =
      calculations.categoryGroups.find(
        (group) => group.category.id === category.id
      )?.entries.length ?? 0
    const message =
      entryCount > 0
        ? `Slette kategorien «${category.name}»? ${entryCount} ${entryCount === 1 ? "post blir" : "poster blir"} ukategorisert.`
        : `Slette kategorien «${category.name}»?`

    confirmDelete(message, () => deleteBudgetCategory(category.id), {
      success: "Kategori slettet",
      error: "Kunne ikke slette kategori",
    })
  }

  const showKeyFigures = budget.members.length > 0 || budget.loans.length > 0

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
        <div className="flex flex-wrap items-center gap-2">
          <ViewOptionsMenu
            options={viewOptions}
            onChange={setViewOptions}
            emptyFieldCount={emptyFieldCount}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 className="h-3.5 w-3.5" data-icon="inline-start" />
            Innstillinger
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setEditingCategory(null)
              setCategoryDialogOpen(true)
            }}
          >
            <PlusCircle className="h-3.5 w-3.5" data-icon="inline-start" />
            Legg til kategori
          </Button>
        </div>
      </div>

      <BudgetStatsSummary
        disposable={calculations.disposable * multiplier}
        disposableSubtitle={`${periodLabel}, etter kostnader, sparing og fradrag`}
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
          ...(calculations.totalSavings > 0
            ? [
                {
                  label: "Sparing",
                  value: calculations.totalSavings * multiplier,
                  tone: "savings" as const,
                },
              ]
            : []),
          {
            label: "Fradrag",
            value: calculations.totalDeductions * multiplier,
            tone: "info",
          },
        ]}
      />

      {showKeyFigures && (
        <KeyFigures
          figures={{ ...calculations, propertyValue: budget.propertyValue }}
          multiplier={multiplier}
          periodLabel={periodLabel}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}

      <BudgetSection
        title="Inntekter"
        icon={<Users className="h-4 w-4" />}
        badge={
          <Badge
            variant="outline"
            className="text-green-700 dark:text-green-400"
          >
            {formatCurrency(calculations.totalNetIncome * multiplier)} netto
          </Badge>
        }
        onAdd={() => editMember(null)}
        addLabel="Legg til medlem"
      >
        {budget.members.length === 0 ? (
          <EmptyText>Ingen medlemmer lagt til ennå</EmptyText>
        ) : (
          <div className="divide-y divide-border">
            {budget.members.map((member) => (
              <BudgetRow
                key={member.id}
                title={member.name}
                subtitle={
                  <>
                    Brutto:{" "}
                    {formatCurrency(member.grossMonthlyIncome * multiplier)}
                    {" · "}
                    Skatt: {member.taxPercent}%
                    {member.netMonthlyIncome != null && (
                      <>
                        {" · "}
                        <span className="line-through">
                          {formatCurrency(
                            memberCalculatedNetIncome(member) * multiplier
                          )}
                        </span>
                      </>
                    )}
                  </>
                }
                details={
                  <RowDetails
                    fields={BUDGET_MEMBER_OPTIONAL_FIELDS}
                    row={member}
                    options={viewOptions}
                    onEdit={() => editMember(member)}
                  />
                }
                amount={formatCurrency(memberNetIncome(member) * multiplier)}
                amountNote={
                  member.netMonthlyIncome != null ? "Utbetalt" : "Beregnet"
                }
                onEdit={() => editMember(member)}
                onDelete={() =>
                  confirmDelete(
                    `Slette inntekten for «${member.name}»?`,
                    () => deleteBudgetMember(member.id),
                    {
                      success: "Medlem slettet",
                      error: "Kunne ikke slette medlem",
                    }
                  )
                }
                isPending={isPending}
              />
            ))}
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
        onAdd={() => editLoan(null)}
        addLabel="Legg til lån"
      >
        {budget.loans.length === 0 ? (
          <EmptyText>Ingen lån lagt til ennå</EmptyText>
        ) : (
          <div className="divide-y divide-border">
            {budget.loans.map((loan) => (
              <LoanRow
                key={loan.id}
                loan={loan}
                multiplier={multiplier}
                viewOptions={viewOptions}
                onEdit={() => editLoan(loan)}
                onDelete={() =>
                  confirmDelete(
                    `Slette lånet «${loan.loanName}»?`,
                    () => deleteBudgetLoan(loan.id),
                    { success: "Lån slettet", error: "Kunne ikke slette lån" }
                  )
                }
                isPending={isPending}
              />
            ))}
            {calculations.totalLoanInterest > 0 && (
              <div className="flex flex-col gap-3 bg-muted/50 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-blue-700 dark:text-blue-400">
                    Rentefradrag
                  </p>
                  <p className="text-xs break-words text-muted-foreground sm:text-sm">
                    {budget.taxDeductionPercent}% av rentekostnadene neste 12
                    måneder (
                    {formatCurrency(calculations.totalLoanInterest * 12)})
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-blue-700 tabular-nums sm:text-base dark:text-blue-400">
                    −
                    {formatCurrency(
                      calculations.monthlyTaxDeduction * multiplier
                    )}
                  </p>
                  <Badge
                    variant="secondary"
                    className="hidden text-xs sm:inline-flex"
                  >
                    Beregnet
                  </Badge>
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
        onAdd={() => editTrip(null)}
        addLabel="Legg til reise"
      >
        {budget.trips.length === 0 ? (
          <EmptyText>Ingen reiser lagt til ennå</EmptyText>
        ) : (
          <div className="divide-y divide-border">
            {budget.trips.map((trip) => (
              <BudgetRow
                key={trip.id}
                title={trip.name}
                subtitle={`${trip.transportType === "AIR_OR_PUBLIC" ? "Fly/offentlig" : "Bil"} · ${trip.annualTrips} reiser/år · ${formatCurrency(tripCostPerTrip(trip))}/reise`}
                details={
                  <RowDetails
                    fields={BUDGET_TRIP_OPTIONAL_FIELDS}
                    row={trip}
                    options={viewOptions}
                    onEdit={() => editTrip(trip)}
                  />
                }
                amount={formatCurrency(tripMonthlyCost(trip) * multiplier)}
                onEdit={() => editTrip(trip)}
                onDelete={() =>
                  confirmDelete(
                    `Slette reisen «${trip.name}»?`,
                    () => deleteBudgetTrip(trip.id),
                    {
                      success: "Reise slettet",
                      error: "Kunne ikke slette reise",
                    }
                  )
                }
                isPending={isPending}
              />
            ))}
          </div>
        )}
      </BudgetSection>

      {calculations.categoryGroups.map(
        ({ category, entries, disposableImpact }) => (
          <BudgetSection
            key={category.id}
            title={category.name}
            icon={<Wallet className="h-4 w-4" />}
            badge={<ImpactBadge value={disposableImpact * multiplier} />}
            onAdd={() =>
              openAddEntry({ categoryId: category.id, type: "EXPENSE" })
            }
            addLabel="Legg til post"
            headerActions={
              <div className="flex items-center gap-1 sm:gap-2">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Rediger kategorien ${category.name}`}
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
                  aria-label={`Slett kategorien ${category.name}`}
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
              viewOptions={viewOptions}
              onEdit={editEntry}
              onDelete={confirmDelete}
              isPending={isPending}
              emptyText="Ingen poster i kategorien"
            />
          </BudgetSection>
        )
      )}

      <BudgetSection
        title="Ukategoriserte budsjettposter"
        icon={<Receipt className="h-4 w-4" />}
        badge={
          <ImpactBadge value={calculations.uncategorizedImpact * multiplier} />
        }
        onAdd={() => openAddEntry({ type: "EXPENSE" })}
        addLabel="Legg til post"
      >
        <EntryList
          entries={calculations.uncategorizedEntries}
          multiplier={multiplier}
          viewOptions={viewOptions}
          onEdit={editEntry}
          onDelete={confirmDelete}
          isPending={isPending}
          emptyText="Ingen ukategoriserte poster"
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
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        taxDeductionPercent={budget.taxDeductionPercent}
        propertyValue={budget.propertyValue}
      />
    </div>
  )
}

function EmptyText({ children }: { children: ReactNode }) {
  return (
    <p className="py-4 text-center text-sm text-muted-foreground">{children}</p>
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
            <CardTitle className="min-w-0 truncate text-base">
              {title}
            </CardTitle>
            <span className="shrink-0">{badge}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {headerActions}
            <Button
              variant="outline"
              size="sm"
              onClick={onAdd}
              aria-label={addLabel}
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

/** One line in a section: name and facts on the left, amount and actions on the right. */
function BudgetRow({
  title,
  titleExtras,
  subtitle,
  details,
  amount,
  amountClassName,
  amountNote,
  onEdit,
  onDelete,
  isPending,
}: {
  title: string
  titleExtras?: ReactNode
  subtitle?: ReactNode
  details?: ReactNode
  amount: ReactNode
  amountClassName?: string
  amountNote?: string
  onEdit: () => void
  onDelete: () => void
  isPending: boolean
}) {
  return (
    <div className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
          <span className="truncate">{title}</span>
          {titleExtras}
        </p>
        {subtitle && (
          <div className="text-xs break-words text-muted-foreground sm:text-sm">
            {subtitle}
          </div>
        )}
        {details}
      </div>
      <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-start">
        <div className="text-right">
          <p
            className={`text-sm font-medium tabular-nums sm:text-base ${amountClassName ?? ""}`}
          >
            {amount}
          </p>
          {amountNote && (
            <Badge
              variant="secondary"
              className="hidden text-xs sm:inline-flex"
            >
              {amountNote}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Rediger ${title}`}
            onClick={onEdit}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Slett ${title}`}
            onClick={onDelete}
            disabled={isPending}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}

function LoanRow({
  loan,
  multiplier,
  viewOptions,
  onEdit,
  onDelete,
  isPending,
}: {
  loan: BudgetLoanData
  multiplier: number
  viewOptions: BudgetViewOptions
  onEdit: () => void
  onDelete: () => void
  isPending: boolean
}) {
  const monthly = loanMonthlyAmounts(loan)
  const needsSetup = loan.principalAmount <= 0 || loan.termMonths <= 0
  const termYears = loan.termMonths / 12
  const termLabel = Number.isInteger(termYears)
    ? `${termYears} år`
    : `${termYears.toFixed(1)} år`

  return (
    <BudgetRow
      title={loan.loanName}
      titleExtras={
        <>
          <span className="hidden text-sm font-normal text-muted-foreground sm:inline">
            {loan.bankName}
          </span>
          <Badge variant="secondary" className="hidden text-xs sm:inline-flex">
            {LOAN_TYPE_LABELS[loan.loanType]}
          </Badge>
          <Badge variant="secondary" className="hidden text-xs sm:inline-flex">
            {loan.repaymentType === "ANNUITY" ? "Annuitet" : "Serie"}
          </Badge>
        </>
      }
      subtitle={
        needsSetup ? (
          <span className="text-amber-600 dark:text-amber-400">
            Mangler restgjeld og nedbetalingstid – rediger lånet for å fullføre.
          </span>
        ) : (
          <span className="flex flex-wrap gap-x-1 gap-y-1">
            <span className="sm:hidden">{loan.bankName}</span>
            <span className="hidden sm:inline">
              {formatCurrency(loan.principalAmount)} · {loan.annualInterestRate}
              % · {termLabel}
            </span>
            <span className="hidden sm:inline">·</span>
            <span className="hidden sm:inline">
              Renter: {formatCurrency(monthly.monthlyInterest * multiplier)}
            </span>
            <span className="hidden sm:inline">·</span>
            <span className="hidden sm:inline">
              Avdrag: {formatCurrency(monthly.monthlyPrincipal * multiplier)}
            </span>
            {loan.monthlyFees > 0 && (
              <>
                <span className="hidden sm:inline">·</span>
                <span className="hidden sm:inline">
                  Gebyrer: {formatCurrency(loan.monthlyFees * multiplier)}
                </span>
              </>
            )}
          </span>
        )
      }
      details={
        <RowDetails
          fields={BUDGET_LOAN_OPTIONAL_FIELDS}
          row={loan}
          options={viewOptions}
          onEdit={onEdit}
        />
      }
      amount={formatCurrency(monthly.monthlyCost * multiplier)}
      onEdit={onEdit}
      onDelete={onDelete}
      isPending={isPending}
    />
  )
}

function EntryList({
  entries,
  multiplier,
  viewOptions,
  onEdit,
  onDelete,
  isPending,
  emptyText,
}: {
  entries: BudgetEntryData[]
  multiplier: number
  viewOptions: BudgetViewOptions
  onEdit: (entry: BudgetEntryData) => void
  onDelete: ReturnType<typeof useConfirmedDelete>[1]
  isPending: boolean
  emptyText: string
}) {
  if (entries.length === 0) {
    return <EmptyText>{emptyText}</EmptyText>
  }

  return (
    <div className="divide-y divide-border">
      {entries.map((entry) => (
        <BudgetRow
          key={entry.id}
          title={entry.name}
          subtitle={
            <span className="flex flex-wrap items-center gap-2">
              <Badge
                variant="secondary"
                className={`text-xs ${ENTRY_TYPE_TONE[entry.type]}`}
              >
                {ENTRY_TYPE_LABELS[entry.type]}
              </Badge>
              {entry.frequency !== "MONTHLY" && (
                <span>
                  {formatCurrency(entry.amount)}
                  {FREQUENCY_SUFFIX[entry.frequency]}
                </span>
              )}
            </span>
          }
          details={
            <RowDetails
              fields={BUDGET_ENTRY_OPTIONAL_FIELDS}
              row={entry}
              options={viewOptions}
              onEdit={() => onEdit(entry)}
            />
          }
          amount={
            <>
              {entry.type === "DEDUCTION" && "−"}
              {formatCurrency(entryMonthlyAmount(entry) * multiplier)}
            </>
          }
          amountClassName={
            entry.type === "EXPENSE" ? "" : ENTRY_TYPE_TONE[entry.type]
          }
          onEdit={() => onEdit(entry)}
          onDelete={() =>
            onDelete(
              `Slette posten «${entry.name}»?`,
              () => deleteBudgetEntry(entry.id),
              { success: "Post slettet", error: "Kunne ikke slette post" }
            )
          }
          isPending={isPending}
        />
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
