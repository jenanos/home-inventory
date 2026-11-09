"use client"

import { useState, useTransition } from "react"
import { Check } from "lucide-react"
import { toast } from "sonner"
import { setColorPalette } from "@/lib/actions/user"
import { cn } from "@workspace/ui/lib/utils"
import { COLOR_PALETTES, type ColorPaletteId } from "@/lib/color-palettes"

interface AppearanceSectionProps {
  palette: ColorPaletteId
}

/** Shows the palette at once, before the server round trip finishes. */
function applyPalette(id: ColorPaletteId) {
  document.documentElement.dataset.palette = id
}

export function AppearanceSection({ palette }: AppearanceSectionProps) {
  const [selected, setSelected] = useState(palette)
  const [, startTransition] = useTransition()

  function selectPalette(id: ColorPaletteId) {
    if (id === selected) {
      return
    }

    const previous = selected
    setSelected(id)
    applyPalette(id)
    startTransition(async () => {
      try {
        await setColorPalette(id)
      } catch {
        setSelected(previous)
        applyPalette(previous)
        toast.error("Kunne ikke lagre fargepaletten")
      }
    })
  }

  return (
    <div
      role="radiogroup"
      aria-label="Fargepalett"
      className="grid gap-3 sm:grid-cols-2"
    >
      {COLOR_PALETTES.map((option) => {
        const isSelected = option.id === selected

        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => selectPalette(option.id)}
            className={cn(
              "flex flex-col gap-3 rounded-lg border p-3 text-left transition-colors",
              "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              isSelected
                ? "border-primary ring-2 ring-primary/30"
                : "hover:bg-muted/50"
            )}
          >
            <PalettePreview id={option.id} />
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-0.5">
                <p className="font-medium">{option.label}</p>
                <p className="text-xs text-muted-foreground">
                  {option.description}
                </p>
              </div>
              {isSelected && (
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}

/** A miniature of the app (sidebar, card, button, chart) in a palette. */
function PalettePreview({ id }: { id: ColorPaletteId }) {
  return (
    <div
      data-palette={id}
      aria-hidden
      className="flex h-24 overflow-hidden rounded-md border border-border bg-background"
    >
      <div className="flex w-1/4 flex-col gap-1.5 border-r border-sidebar-border bg-sidebar p-2">
        <span className="h-1.5 w-full rounded-full bg-sidebar-primary" />
        <span className="h-1.5 w-3/4 rounded-full bg-sidebar-accent" />
        <span className="h-1.5 w-2/3 rounded-full bg-sidebar-accent" />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-2">
        <div className="flex flex-1 flex-col justify-between rounded border border-border bg-card p-1.5">
          <span className="h-1.5 w-1/2 rounded-full bg-foreground/80" />
          <div className="flex items-end gap-1">
            <span className="h-5 w-2 rounded-sm bg-chart-1" />
            <span className="h-3 w-2 rounded-sm bg-chart-2" />
            <span className="h-4 w-2 rounded-sm bg-chart-3" />
            <span className="h-2 w-2 rounded-sm bg-chart-4" />
            <span className="h-3.5 w-2 rounded-sm bg-chart-5" />
          </div>
        </div>
        <div className="flex gap-1.5">
          <span className="h-3 w-10 rounded bg-primary" />
          <span className="h-3 w-8 rounded bg-accent" />
          <span className="h-3 w-6 rounded bg-muted" />
        </div>
      </div>
    </div>
  )
}
