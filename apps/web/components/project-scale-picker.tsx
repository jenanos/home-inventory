"use client"

import type { ProjectScale } from "@workspace/db"
import { Label } from "@workspace/ui/components/label"
import { cn } from "@workspace/ui/lib/utils"

import {
  PROJECT_SCALES,
  PROJECT_SCALE_HINTS,
  PROJECT_SCALE_LABEL_ONE,
} from "@/lib/project-labels"

/** Two big choices with a hint each: routine upkeep or a larger job. */
export function ProjectScalePicker({
  value,
  onChange,
}: {
  value: ProjectScale
  onChange: (value: ProjectScale) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label id="project-scale-label">Omfang</Label>
      <div
        role="radiogroup"
        aria-labelledby="project-scale-label"
        className="grid grid-cols-2 gap-2"
      >
        {PROJECT_SCALES.map((scale) => {
          const selected = value === scale
          return (
            <button
              key={scale}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(scale)}
              className={cn(
                "flex flex-col gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors",
                selected
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border hover:bg-muted"
              )}
            >
              <span className="text-sm font-medium">
                {PROJECT_SCALE_LABEL_ONE[scale]}
              </span>
              <span className="text-xs text-muted-foreground">
                {PROJECT_SCALE_HINTS[scale]}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
