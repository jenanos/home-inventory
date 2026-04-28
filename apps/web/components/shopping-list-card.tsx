import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { cn } from "@workspace/ui/lib/utils"
import { getListColorPreset } from "@/lib/list-colors"

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    maximumFractionDigits: 0,
  }).format(amount)

interface ShoppingListCardProps {
  href: string
  name: string
  color: string | null
  itemCount: number
  purchasedCount: number
  totalCost: number
  /** Optional slot for an edit button (a client component). */
  editAction?: React.ReactNode
  className?: string
}

export function ShoppingListCard({
  href,
  name,
  color,
  itemCount,
  purchasedCount,
  totalCost,
  editAction,
  className,
}: ShoppingListCardProps) {
  const preset = getListColorPreset(color)
  const progress =
    itemCount > 0 ? Math.round((purchasedCount / itemCount) * 100) : 0

  return (
    <div
      className={cn(
        "group relative flex overflow-hidden rounded-xl shadow-xs ring-1 ring-foreground/10 transition-colors hover:bg-muted/40",
        className
      )}
      style={{ backgroundColor: preset.tint }}
    >
      <span
        aria-hidden="true"
        className="w-1 shrink-0"
        style={{ backgroundColor: preset.accent }}
      />
      <Link href={href} className="absolute inset-0 z-0">
        <span className="sr-only">Åpne {name}</span>
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="min-w-0 flex-1 truncate font-heading text-base font-medium">
            {name}
          </h3>
          <span className="shrink-0 text-xs font-medium text-muted-foreground tabular-nums">
            {progress}%
          </span>
          {editAction && (
            <span className="relative z-10 flex shrink-0 items-center">
              {editAction}
            </span>
          )}
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-opacity sm:opacity-60 sm:group-hover:opacity-100" />
        </div>

        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="truncate">
            {purchasedCount} av {itemCount}{" "}
            {itemCount === 1 ? "ting" : "ting"}
            {totalCost > 0 ? (
              <>
                {" · "}
                <span className="tabular-nums">{formatCurrency(totalCost)}</span>
              </>
            ) : null}
          </span>
        </div>

        {itemCount > 0 && (
          <div className="h-1 rounded-full bg-foreground/10">
            <div
              className="h-1 rounded-full transition-all"
              style={{
                width: `${progress}%`,
                backgroundColor: preset.accent,
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
