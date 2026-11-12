"use client"

import { useState, type ReactNode } from "react"
import { ChevronDown } from "lucide-react"
import { Card, CardContent } from "@workspace/ui/components/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"
import { cn } from "@workspace/ui/lib/utils"

/**
 * A stats card that shows only its key figures until asked for more, so it
 * doesn't fill the screen on a phone. The details stay one tap away.
 */
export function ExpandableStats({
  summary,
  children,
  className,
}: {
  /** Always visible: the two or three figures that matter most. */
  summary: ReactNode
  /** Shown when expanded. */
  children: ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <Card size="sm" className={cn("shadow-sm", className)}>
      <Collapsible open={open} onOpenChange={setOpen} asChild>
        <CardContent className="flex flex-col gap-4">
          {summary}
          <CollapsibleContent className="flex flex-col gap-4">
            {children}
          </CollapsibleContent>
          <CollapsibleTrigger className="-mx-1 -mb-1 flex items-center gap-1 self-start rounded-md px-1 py-0.5 text-xs font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50">
            {open ? "Færre tall" : "Flere tall"}
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                open && "rotate-180"
              )}
              aria-hidden
            />
          </CollapsibleTrigger>
        </CardContent>
      </Collapsible>
    </Card>
  )
}
