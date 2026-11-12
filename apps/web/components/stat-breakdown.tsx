import Link from "next/link"
import { cn } from "@workspace/ui/lib/utils"

import type { Tally } from "@/lib/dashboard-stats"
import { formatNOK } from "@/lib/project-labels"

export type BreakdownRow = {
  key: string
  label: string
  tally: Tally
  href?: string
}

/**
 * Rows of "label · count · sum" with a thin bar scaled to the largest sum.
 * One hue for every row: the label, not the color, says what a row is.
 */
export function StatBreakdown({
  rows,
  emptyText = "Ingenting her.",
  countLabel = ["stk", "stk"],
  className,
}: {
  rows: BreakdownRow[]
  emptyText?: string
  /** Singular and plural noun after the count. */
  countLabel?: [string, string]
  className?: string
}) {
  const visible = rows.filter((row) => row.tally.count > 0)
  if (visible.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>
  }
  const max = Math.max(...visible.map((row) => row.tally.total), 0)

  return (
    <ul className={cn("flex flex-col gap-2.5", className)}>
      {visible.map((row) => {
        const width = max > 0 ? (row.tally.total / max) * 100 : 0
        const noun = row.tally.count === 1 ? countLabel[0] : countLabel[1]
        const content = (
          <>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">
                <span className="font-medium">{row.label}</span>
                <span className="ml-2 text-xs text-muted-foreground tabular-nums">
                  {row.tally.count} {noun}
                  {row.tally.unpriced > 0 && (
                    <> · {row.tally.unpriced} uten pris</>
                  )}
                </span>
              </span>
              <span className="shrink-0 tabular-nums">
                {row.tally.total > 0 ? formatNOK(row.tally.total) : "—"}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              {width > 0 && (
                <div
                  className="h-full rounded-full bg-primary/80"
                  style={{ width: `${Math.max(width, 2)}%` }}
                />
              )}
            </div>
          </>
        )

        return (
          <li key={row.key}>
            {row.href ? (
              <Link
                href={row.href}
                className="-mx-2 flex flex-col gap-1 rounded-md px-2 py-1 transition-colors hover:bg-muted/60"
              >
                {content}
              </Link>
            ) : (
              <div className="flex flex-col gap-1">{content}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** A small labelled figure: "Kjøpt · 12 300 kr · 14 varer". */
export function StatFigure({
  label,
  tally,
  noun = ["vare", "varer"],
  muted = false,
  note,
  className,
}: {
  label: string
  tally: Tally
  noun?: [string, string]
  muted?: boolean
  note?: string
  className?: string
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "font-heading text-lg font-semibold tabular-nums sm:text-xl",
          muted && "text-muted-foreground"
        )}
      >
        {tally.total > 0 ? formatNOK(tally.total) : "—"}
      </p>
      <p className="text-xs text-muted-foreground tabular-nums">
        {tally.count} {tally.count === 1 ? noun[0] : noun[1]}
        {tally.unpriced > 0 && <> · {tally.unpriced} uten pris</>}
        {note && <> · {note}</>}
      </p>
    </div>
  )
}
