import { Card, CardContent } from "@workspace/ui/components/card"
import { Banknote, PiggyBank } from "lucide-react"
import { cn } from "@workspace/ui/lib/utils"

const formatNOK = (amount: number) =>
  new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    maximumFractionDigits: 0,
  }).format(amount)

export interface BudgetBreakdownItem {
  label: string
  value: number
  tone?: "income" | "expense" | "neutral" | "info"
}

interface BudgetStatsSummaryProps {
  disposable: number
  disposableLabel?: string
  disposableSubtitle?: string
  items: BudgetBreakdownItem[]
  className?: string
}

const toneClass: Record<NonNullable<BudgetBreakdownItem["tone"]>, string> = {
  income: "text-emerald-600 dark:text-emerald-400",
  expense: "text-red-600 dark:text-red-400",
  info: "text-blue-600 dark:text-blue-400",
  neutral: "text-foreground",
}

export function BudgetStatsSummary({
  disposable,
  disposableLabel = "Disponibelt",
  disposableSubtitle = "etter alle utgifter",
  items,
  className,
}: BudgetStatsSummaryProps) {
  const positive = disposable >= 0

  return (
    <Card size="sm" className={cn("shadow-sm", className)}>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{disposableLabel}</p>
            <p
              className={cn(
                "font-heading text-2xl font-semibold tabular-nums sm:text-3xl",
                positive
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-600 dark:text-red-400"
              )}
            >
              {formatNOK(disposable)}
            </p>
            <p className="text-xs text-muted-foreground">
              {disposableSubtitle}
            </p>
          </div>
          {positive ? (
            <PiggyBank className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <Banknote className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 border-t border-border pt-3">
          {items.map((item) => (
            <div key={item.label} className="min-w-0">
              <p className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">
                {item.label}
              </p>
              <p
                className={cn(
                  "truncate font-heading text-sm font-semibold tabular-nums sm:text-base",
                  toneClass[item.tone ?? "neutral"]
                )}
              >
                {formatNOK(item.value)}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
