"use client"

import { useState, useTransition } from "react"
import { ArrowDown, ArrowUp, Ellipsis, Loader2, RotateCcw } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { cn } from "@workspace/ui/lib/utils"

import { setQuickNavPages } from "@/lib/actions/user"
import {
  DEFAULT_QUICK_NAV_PAGES,
  MAX_QUICK_NAV_PAGES,
  type QuickNavPageId,
} from "@/lib/quick-nav"
import { NAV_ITEMS, navItem } from "../nav-items"

interface QuickNavSectionProps {
  pages: QuickNavPageId[]
}

/**
 * Picks the pages in the phone's bottom bar and their order. Each change is
 * saved at once; the rest of the pages stay one tap away under "Mer".
 */
export function QuickNavSection({ pages }: QuickNavSectionProps) {
  const [selected, setSelected] = useState(pages)
  const [isPending, startTransition] = useTransition()

  function save(next: QuickNavPageId[]) {
    const previous = selected
    setSelected(next)
    startTransition(async () => {
      try {
        setSelected(await setQuickNavPages(next))
      } catch {
        setSelected(previous)
        toast.error("Kunne ikke lagre hurtigpanelet")
      }
    })
  }

  function toggle(id: QuickNavPageId) {
    if (selected.includes(id)) {
      if (selected.length === 1) return
      save(selected.filter((page) => page !== id))
    } else if (selected.length < MAX_QUICK_NAV_PAGES) {
      save([...selected, id])
    }
  }

  function move(index: number, offset: -1 | 1) {
    const next = [...selected]
    const target = index + offset
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target]!, next[index]!]
    save(next)
  }

  const isFull = selected.length >= MAX_QUICK_NAV_PAGES
  const isDefault =
    selected.length === DEFAULT_QUICK_NAV_PAGES.length &&
    selected.every((page, index) => page === DEFAULT_QUICK_NAV_PAGES[index])

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Forhåndsvisning</p>
        <div
          aria-hidden
          className="flex items-center justify-around rounded-lg border bg-card"
        >
          {selected.map((id) => {
            const item = navItem(id)
            return (
              <span
                key={id}
                className="flex min-w-0 flex-1 flex-col items-center gap-1 px-1 py-2 text-xs text-muted-foreground"
              >
                <item.icon className="h-5 w-5" />
                <span className="max-w-full truncate">{item.label}</span>
              </span>
            )
          })}
          <span className="flex min-w-0 flex-1 flex-col items-center gap-1 px-1 py-2 text-xs text-muted-foreground">
            <Ellipsis className="h-5 w-5" />
            <span>Mer</span>
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">
            Sider i panelet ({selected.length}/{MAX_QUICK_NAV_PAGES})
          </p>
          {isPending && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
        <ol className="flex flex-col gap-1.5">
          {selected.map((id, index) => {
            const item = navItem(id)
            return (
              <li
                key={id}
                className="flex items-center gap-2 rounded-md border px-3 py-1.5"
              >
                <item.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate text-sm">{item.label}</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label={`Flytt ${item.label} opp`}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => move(index, 1)}
                  disabled={index === selected.length - 1}
                  aria-label={`Flytt ${item.label} ned`}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
              </li>
            )
          })}
        </ol>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Velg sider</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {NAV_ITEMS.map((item) => {
            const checked = selected.includes(item.id)
            const disabled =
              (!checked && isFull) || (checked && selected.length === 1)
            return (
              <label
                key={item.id}
                className={cn(
                  "flex items-center gap-3 rounded-md border px-3 py-2 text-sm",
                  disabled && !checked
                    ? "cursor-not-allowed opacity-60"
                    : "cursor-pointer hover:bg-muted/50"
                )}
              >
                <Checkbox
                  checked={checked}
                  disabled={disabled}
                  onCheckedChange={() => toggle(item.id)}
                />
                <item.icon className="h-4 w-4 text-muted-foreground" />
                <span>{item.label}</span>
              </label>
            )
          })}
        </div>
        {isFull && (
          <p className="text-xs text-muted-foreground">
            Panelet er fullt. Fjern en side for å velge en annen.
          </p>
        )}
      </fieldset>

      {!isDefault && (
        <div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => save([...DEFAULT_QUICK_NAV_PAGES])}
            disabled={isPending}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Tilbakestill
          </Button>
        </div>
      )}
    </div>
  )
}
