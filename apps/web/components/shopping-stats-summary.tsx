import { Card, CardContent } from "@workspace/ui/components/card"
import { Progress } from "@workspace/ui/components/progress"
import { CheckCircle2, Clock, Wallet } from "lucide-react"
import { cn } from "@workspace/ui/lib/utils"

const formatNOK = (amount: number) =>
  new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    maximumFractionDigits: 0,
  }).format(amount)

interface ShoppingStatsSummaryProps {
  totalEstimated: number
  purchasedTotal: number
  totalCount: number
  purchasedCount: number
  pendingCount: number
  className?: string
}

export function ShoppingStatsSummary({
  totalEstimated,
  purchasedTotal,
  totalCount,
  purchasedCount,
  pendingCount,
  className,
}: ShoppingStatsSummaryProps) {
  const progress =
    totalEstimated > 0
      ? Math.min(Math.round((purchasedTotal / totalEstimated) * 100), 100)
      : 0

  return (
    <Card size="sm" className={cn("shadow-sm", className)}>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Kjøpt av estimert</p>
            <p className="font-heading text-xl font-semibold tabular-nums sm:text-2xl">
              {formatNOK(purchasedTotal)}
              <span className="ml-1 text-sm font-normal text-muted-foreground">
                / {formatNOK(totalEstimated)}
              </span>
            </p>
          </div>
          <span className="shrink-0 text-sm font-medium text-muted-foreground tabular-nums">
            {progress}%
          </span>
        </div>

        <Progress value={progress} />

        <div className="flex items-center justify-between gap-2 text-xs sm:text-sm">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Wallet className="h-3.5 w-3.5" />
            <span className="tabular-nums">{totalCount}</span> totalt
          </span>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span className="tabular-nums">{pendingCount}</span> igjen
          </span>
          <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span className="tabular-nums">{purchasedCount}</span> kjøpt
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
