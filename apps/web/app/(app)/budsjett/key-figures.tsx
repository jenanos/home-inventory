import type { ReactNode } from "react"
import { Card, CardContent } from "@workspace/ui/components/card"
import { cn } from "@workspace/ui/lib/utils"
import { formatCurrency, formatNumber } from "./budget-format"

/**
 * Norwegian lending rules (boliglånsforskriften): total debt at most five
 * times gross yearly income, and a mortgage at most 90 % of the home's value.
 */
const DEBT_TO_INCOME_LIMIT = 5
const LOAN_TO_VALUE_LIMIT = 90

type KeyFigureInput = {
  savingsRate: number | null
  savingsIncludingPrincipal: number
  totalSavings: number
  totalLoanPrincipal: number
  debtToIncomeRatio: number | null
  totalDebt: number
  loanToValue: number | null
  mortgageDebt: number
  propertyValue: number | null
}

function Figure({
  label,
  value,
  detail,
  tone,
}: {
  label: string
  value: string
  detail: ReactNode
  tone?: "warning" | "good"
}) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[11px] tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p
        className={cn(
          "font-heading text-lg font-semibold tabular-nums",
          tone === "warning" && "text-amber-600 dark:text-amber-400",
          tone === "good" && "text-emerald-600 dark:text-emerald-400"
        )}
      >
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}

/**
 * Ratios that say more than the totals: how much is saved, how heavy the debt
 * is against income, and how much of the home is mortgaged. A figure that
 * cannot be computed says what is missing.
 */
export function KeyFigures({
  figures,
  multiplier,
  periodLabel,
  onOpenSettings,
}: {
  figures: KeyFigureInput
  multiplier: number
  periodLabel: string
  onOpenSettings: () => void
}) {
  const hasMortgage = figures.mortgageDebt > 0
  const hasDebt = figures.totalDebt > 0

  return (
    <Card size="sm" className="shadow-sm">
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Figure
          label="Sparegrad"
          value={
            figures.savingsRate === null
              ? "–"
              : `${formatNumber(figures.savingsRate)} %`
          }
          tone={
            figures.savingsRate !== null && figures.savingsRate >= 10
              ? "good"
              : undefined
          }
          detail={
            figures.savingsRate === null
              ? "Legg inn inntekter for å beregne"
              : `${formatCurrency(figures.savingsIncludingPrincipal * multiplier)} ${periodLabel}, hvorav avdrag ${formatCurrency(figures.totalLoanPrincipal * multiplier)}`
          }
        />
        {hasDebt && (
          <Figure
            label="Gjeldsgrad"
            value={
              figures.debtToIncomeRatio === null
                ? "–"
                : `${formatNumber(figures.debtToIncomeRatio)}×`
            }
            tone={
              figures.debtToIncomeRatio !== null &&
              figures.debtToIncomeRatio > DEBT_TO_INCOME_LIMIT
                ? "warning"
                : undefined
            }
            detail={
              figures.debtToIncomeRatio === null
                ? "Legg inn bruttoinntekt for å beregne"
                : `${formatCurrency(figures.totalDebt)} gjeld mot brutto årsinntekt (bankene går normalt maks til ${DEBT_TO_INCOME_LIMIT}×)`
            }
          />
        )}
        {hasMortgage && (
          <Figure
            label="Belåningsgrad"
            value={
              figures.loanToValue === null
                ? "–"
                : `${formatNumber(figures.loanToValue)} %`
            }
            tone={
              figures.loanToValue !== null &&
              figures.loanToValue > LOAN_TO_VALUE_LIMIT
                ? "warning"
                : undefined
            }
            detail={
              figures.loanToValue === null ? (
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  Legg inn boligverdi for å beregne
                </button>
              ) : (
                `${formatCurrency(figures.mortgageDebt)} av ${formatCurrency(figures.propertyValue ?? 0)}`
              )
            }
          />
        )}
      </CardContent>
    </Card>
  )
}
