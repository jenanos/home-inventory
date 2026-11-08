"use client"

import { useCallback, useSyncExternalStore } from "react"
import { SlidersHorizontal } from "lucide-react"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"

export type BudgetViewOptions = {
  /** Show optional fields that have a value. */
  showDetails: boolean
  /** Show optional fields that are empty, as prompts to fill them in. */
  showEmpty: boolean
}

const DEFAULT_OPTIONS: BudgetViewOptions = {
  showDetails: true,
  showEmpty: false,
}

const STORAGE_KEY = "budget-view-options"
const CHANGE_EVENT = "budget-view-options-change"

/*
 * A per-browser display preference, so it lives in localStorage rather than
 * the database. Read through useSyncExternalStore: the server and the first
 * client render use the defaults, then the stored value takes over without a
 * hydration mismatch.
 */

let cachedRaw: string | null = null
let cachedOptions = DEFAULT_OPTIONS

function readOptions(): BudgetViewOptions {
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return DEFAULT_OPTIONS
  }
  if (raw === cachedRaw) return cachedOptions

  cachedRaw = raw
  try {
    const parsed = raw ? (JSON.parse(raw) as Partial<BudgetViewOptions>) : {}
    cachedOptions = {
      showDetails:
        typeof parsed.showDetails === "boolean"
          ? parsed.showDetails
          : DEFAULT_OPTIONS.showDetails,
      showEmpty:
        typeof parsed.showEmpty === "boolean"
          ? parsed.showEmpty
          : DEFAULT_OPTIONS.showEmpty,
    }
  } catch {
    cachedOptions = DEFAULT_OPTIONS
  }
  return cachedOptions
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange)
  window.addEventListener(CHANGE_EVENT, onChange)
  return () => {
    window.removeEventListener("storage", onChange)
    window.removeEventListener(CHANGE_EVENT, onChange)
  }
}

export function useBudgetViewOptions() {
  const options = useSyncExternalStore(
    subscribe,
    readOptions,
    () => DEFAULT_OPTIONS
  )

  const update = useCallback((patch: Partial<BudgetViewOptions>) => {
    const next = { ...readOptions(), ...patch }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // Private mode or storage disabled: the choice just is not remembered.
      cachedRaw = JSON.stringify(next)
      cachedOptions = next
    }
    window.dispatchEvent(new Event(CHANGE_EVENT))
  }, [])

  return [options, update] as const
}

export function ViewOptionsMenu({
  options,
  onChange,
  emptyFieldCount,
}: {
  options: BudgetViewOptions
  onChange: (patch: Partial<BudgetViewOptions>) => void
  /** How many optional fields are empty across the budget. */
  emptyFieldCount: number
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <SlidersHorizontal className="h-3.5 w-3.5" data-icon="inline-start" />
          Visning
          {!options.showEmpty && emptyFieldCount > 0 && (
            <Badge variant="secondary" className="ml-1 tabular-nums">
              {emptyFieldCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Valgfrie felter</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={options.showDetails}
          onCheckedChange={(checked) =>
            onChange({ showDetails: checked === true })
          }
        >
          Vis utfylte detaljer
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={options.showEmpty}
          onCheckedChange={(checked) =>
            onChange({ showEmpty: checked === true })
          }
        >
          <span className="flex flex-col">
            <span>Vis tomme felter</span>
            <span className="text-xs text-muted-foreground">
              {emptyFieldCount === 0
                ? "Alt er fylt ut"
                : `${emptyFieldCount} kan fylles ut`}
            </span>
          </span>
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
