"use client"

import { useState, type ReactNode } from "react"
import { ChevronDown } from "lucide-react"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"
import { cn } from "@workspace/ui/lib/utils"

/**
 * The optional fields of a form. Collapsed for a new row so the form stays
 * short, open when the row already has something filled in.
 */
export function MoreDetails({
  filledCount,
  children,
}: {
  filledCount: number
  children: ReactNode
}) {
  const [open, setOpen] = useState(filledCount > 0)

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-md border border-dashed"
    >
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium">
        <span>
          Flere detaljer
          <span className="ml-2 font-normal text-muted-foreground">
            {filledCount > 0 ? `${filledCount} utfylt` : "valgfritt"}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 transition-transform",
            open && "rotate-180"
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-4 px-3 pt-1 pb-3">
        {children}
      </CollapsibleContent>
    </Collapsible>
  )
}
