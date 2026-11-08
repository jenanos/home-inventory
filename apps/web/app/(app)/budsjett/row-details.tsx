"use client"

import type { ReactNode } from "react"
import { Plus } from "lucide-react"
import { Badge } from "@workspace/ui/components/badge"
import {
  emptyFields,
  fieldValue,
  filledFields,
  type BudgetOptionalField,
} from "@/lib/application/budget/fields"
import {
  SOON_DAYS,
  daysUntil,
  formatCurrency,
  formatDate,
} from "./budget-format"
import type { BudgetViewOptions } from "./view-options"

const MONEY_FIELDS = new Set([
  "netMonthlyIncome",
  "otherPerTrip",
  "propertyValue",
])
const DATE_FIELDS = new Set(["fixedRateUntil", "renewalDate"])

function DateValue({ value }: { value: string }) {
  const days = daysUntil(value)
  let badge: ReactNode = null

  if (days < 0) {
    badge = (
      <Badge variant="secondary" className="text-xs">
        utløpt
      </Badge>
    )
  } else if (days <= SOON_DAYS) {
    badge = (
      <Badge
        variant="outline"
        className="text-xs text-amber-700 dark:text-amber-400"
      >
        om {days} {days === 1 ? "dag" : "dager"}
      </Badge>
    )
  }

  return (
    <span className="inline-flex items-center gap-1">
      {formatDate(value)}
      {badge}
    </span>
  )
}

function formatValue(key: string, value: unknown): ReactNode {
  if (MONEY_FIELDS.has(key) && typeof value === "number") {
    return formatCurrency(value)
  }
  if (DATE_FIELDS.has(key) && typeof value === "string") {
    return <DateValue value={value} />
  }
  if (key === "paymentDay") return `den ${String(value)}.`
  return String(value)
}

/**
 * The optional fields of one budget row, under its name. Filled fields show
 * when `showDetails` is on; empty ones show as small prompts when `showEmpty`
 * is on, and open the row's form. Notes get their own line.
 */
export function RowDetails({
  fields,
  row,
  options,
  onEdit,
}: {
  fields: BudgetOptionalField[]
  row: object
  options: BudgetViewOptions
  onEdit: () => void
}) {
  const filled = options.showDetails ? filledFields(fields, row) : []
  const empty = options.showEmpty ? emptyFields(fields, row) : []
  const inline = filled.filter((field) => field.key !== "notes")
  const notes = filled.find((field) => field.key === "notes")

  if (filled.length === 0 && empty.length === 0) return null

  return (
    <div className="mt-1 flex flex-col gap-1">
      {(inline.length > 0 || empty.length > 0) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {inline.map((field) => (
            <span key={field.key} className="inline-flex items-center gap-1">
              <span>{field.label}:</span>
              <span className="text-foreground">
                {formatValue(field.key, fieldValue(row, field.key))}
              </span>
            </span>
          ))}
          {empty.map((field) => (
            <button
              key={field.key}
              type="button"
              onClick={onEdit}
              title={field.hint}
              className="inline-flex items-center gap-0.5 rounded-sm border border-dashed px-1.5 py-0.5 transition-colors hover:border-foreground/40 hover:text-foreground"
            >
              <Plus className="h-3 w-3" />
              {field.label}
            </button>
          ))}
        </div>
      )}
      {notes && (
        <p className="line-clamp-2 text-xs whitespace-pre-line text-muted-foreground italic">
          {String(fieldValue(row, "notes"))}
        </p>
      )}
    </div>
  )
}

export function countEmptyFields(
  fields: BudgetOptionalField[],
  rows: object[]
) {
  return rows.reduce((sum, row) => sum + emptyFields(fields, row).length, 0)
}
