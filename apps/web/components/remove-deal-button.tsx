"use client"

import { useTransition } from "react"
import { X } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { removeItemDeal } from "@/lib/actions/shopping-deal"

export function RemoveDealButton({
  itemId,
  itemName,
}: {
  itemId: string
  itemName: string
}) {
  const [isPending, startTransition] = useTransition()

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      disabled={isPending}
      onClick={() => startTransition(() => removeItemDeal(itemId))}
      aria-label={`Fjern tilbudet på ${itemName}`}
      title="Fjern tilbudet"
      className="shrink-0 text-muted-foreground"
    >
      <X className="h-3.5 w-3.5" />
    </Button>
  )
}
