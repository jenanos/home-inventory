"use client"

import type { ReactNode } from "react"
import { Button } from "@workspace/ui/components/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@workspace/ui/components/drawer"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { useMediaQuery } from "@/hooks/use-media-query"

/**
 * The side sheet (desktop) or bottom drawer (mobile) every budget form opens
 * in. Both scroll, since a form with its optional details open is taller than
 * a small screen.
 */
export function BudgetFormSheet({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  children: ReactNode
}) {
  const isDesktop = useMediaQuery("(min-width: 768px)")

  if (isDesktop) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="gap-0">
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
          </SheetHeader>
          <ScrollArea className="min-h-0 flex-1">
            <div className="min-w-0 px-4 pb-6">{children}</div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{title}</DrawerTitle>
        </DrawerHeader>
        <ScrollArea className="max-h-[70vh] overflow-x-hidden">
          <div className="min-w-0 px-4 pb-6">{children}</div>
        </ScrollArea>
      </DrawerContent>
    </Drawer>
  )
}

export function FormActions({
  onCancel,
  isPending,
  submitLabel,
}: {
  onCancel: () => void
  isPending: boolean
  submitLabel: string
}) {
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button
        type="button"
        variant="outline"
        onClick={onCancel}
        className="w-full sm:w-auto"
      >
        Avbryt
      </Button>
      <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
        {submitLabel}
      </Button>
    </div>
  )
}
