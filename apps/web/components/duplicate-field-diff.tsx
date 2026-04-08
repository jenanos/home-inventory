"use client"

import { useState } from "react"
import { Badge } from "@workspace/ui/components/badge"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Button } from "@workspace/ui/components/button"
import { ChevronDown, ChevronRight, AlertTriangle } from "lucide-react"

// ─── Types ─────────────────────────────────────────────────────

export interface FieldDiff {
  key: string
  label: string
  existingValue: string
  newValue: string
}

export interface DuplicateItem<T> {
  importedItem: T
  existingId: string
  existingLabel: string
  diffs: FieldDiff[]
}

// ─── Utility ───────────────────────────────────────────────────

export function computeFieldDiffs(
  fields: { key: string; label: string; existingValue: unknown; newValue: unknown; format?: (v: unknown) => string }[]
): FieldDiff[] {
  const diffs: FieldDiff[] = []
  for (const field of fields) {
    const fmt = field.format ?? String
    const existingStr = field.existingValue != null ? fmt(field.existingValue) : ""
    const newStr = field.newValue != null ? fmt(field.newValue) : ""

    if (existingStr !== newStr && newStr !== "") {
      diffs.push({
        key: field.key,
        label: field.label,
        existingValue: existingStr || "(tom)",
        newValue: newStr,
      })
    }
  }
  return diffs
}

// ─── Component ─────────────────────────────────────────────────

interface DuplicateFieldDiffCardProps {
  label: string
  diffs: FieldDiff[]
  selectedFields: Set<string>
  onToggleField: (field: string) => void
}

export function DuplicateFieldDiffCard({
  label,
  diffs,
  selectedFields,
  onToggleField,
}: DuplicateFieldDiffCardProps) {
  const [expanded, setExpanded] = useState(true)

  if (diffs.length === 0) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-lg border border-yellow-200 bg-yellow-50 dark:border-yellow-900/50 dark:bg-yellow-950/30">
        <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-500 shrink-0" />
        <span className="text-sm font-medium flex-1">{label}</span>
        <Badge variant="outline" className="text-xs text-yellow-700 dark:text-yellow-400">
          Duplikat – ingen endringer
        </Badge>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-yellow-200 bg-yellow-50 dark:border-yellow-900/50 dark:bg-yellow-950/30 overflow-hidden">
      <Button
        variant="ghost"
        className="w-full justify-between h-auto py-2.5 px-3 rounded-none hover:bg-yellow-100 dark:hover:bg-yellow-950/50"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-500 shrink-0" />
          <span className="text-sm font-medium truncate">{label}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="secondary" className="text-xs">
            {diffs.length} {diffs.length === 1 ? "endring" : "endringer"}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {selectedFields.size}/{diffs.length} valgt
          </Badge>
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </Button>

      {expanded && (
        <div className="border-t border-yellow-200 dark:border-yellow-900/50">
          <div className="divide-y divide-yellow-200 dark:divide-yellow-900/50">
            {diffs.map((diff) => (
              <label
                key={diff.key}
                className="flex items-start gap-3 p-3 cursor-pointer hover:bg-yellow-100/50 dark:hover:bg-yellow-950/40 transition-colors"
              >
                <Checkbox
                  checked={selectedFields.has(diff.key)}
                  onCheckedChange={() => onToggleField(diff.key)}
                  className="mt-0.5 shrink-0"
                />
                <div className="flex flex-col gap-1 min-w-0 flex-1">
                  <span className="text-xs font-medium text-muted-foreground">{diff.label}</span>
                  <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                    <div className="flex items-baseline gap-1.5 min-w-0">
                      <span className="text-[10px] text-muted-foreground shrink-0 uppercase">Nå:</span>
                      <span className="text-xs line-through text-muted-foreground truncate">{diff.existingValue}</span>
                    </div>
                    <div className="flex items-baseline gap-1.5 min-w-0">
                      <span className="text-[10px] text-muted-foreground shrink-0 uppercase">Ny:</span>
                      <span className="text-xs font-medium truncate">{diff.newValue}</span>
                    </div>
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Summary badge for duplicate count ─────────────────────────

interface DuplicateSummaryProps {
  newCount: number
  duplicateCount: number
  updateCount: number
}

export function DuplicateSummary({ newCount, duplicateCount, updateCount }: DuplicateSummaryProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      {newCount > 0 && (
        <span>
          {newCount} {newCount === 1 ? "ny" : "nye"}
        </span>
      )}
      {duplicateCount > 0 && (
        <span className="text-yellow-700 dark:text-yellow-400">
          {duplicateCount} {duplicateCount === 1 ? "duplikat" : "duplikater"}
          {updateCount > 0 && (
            <span className="text-muted-foreground"> ({updateCount} oppdateres)</span>
          )}
        </span>
      )}
    </div>
  )
}
