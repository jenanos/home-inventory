"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Loader2, MoreVertical, Pencil, Sparkles, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { deletePackingBundle } from "@/lib/actions/packing"
import { describeBundleConditions } from "@/lib/packing-labels"
import { BundleFormDialog, type EditableBundle } from "./bundle-form-dialog"

export function BundleCard({ bundle }: { bundle: EditableBundle }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)

  function handleDelete() {
    if (!confirming) {
      setConfirming(true)
      return
    }
    startTransition(async () => {
      const result = await deletePackingBundle(bundle.id)
      if (!result.ok) {
        setConfirming(false)
        toast.error(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base leading-tight break-words">
              {bundle.name}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {describeBundleConditions(bundle)}
            </p>
          </div>
          <DropdownMenu
            onOpenChange={(open) => {
              if (!open) setConfirming(false)
            }}
          >
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="shrink-0"
                aria-label={`Handlinger for ${bundle.name}`}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-w-72">
              <BundleFormDialog
                bundle={bundle}
                trigger={
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Rediger
                  </DropdownMenuItem>
                }
              />
              <DropdownMenuItem
                variant="destructive"
                onSelect={(e) => {
                  e.preventDefault()
                  handleDelete()
                }}
                disabled={isPending}
              >
                {isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" />
                )}
                {confirming
                  ? "Bekreft – tingene blir værende på listene"
                  : "Slett"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        {bundle.autoAdd && (
          <div>
            <Badge variant="secondary" className="text-xs">
              <Sparkles className="mr-1 h-3 w-3" />
              Legges til automatisk
            </Badge>
          </div>
        )}
        {bundle.description && (
          <p className="line-clamp-3 text-sm text-muted-foreground">
            {bundle.description}
          </p>
        )}
        {bundle.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ingen ting ennå</p>
        ) : (
          <ul className="flex flex-col gap-0.5 text-sm">
            {bundle.items.map((item) => (
              <li key={item.id} className="break-words">
                {item.name}
                {item.quantity > 1 && (
                  <span className="text-muted-foreground tabular-nums">
                    {" "}
                    × {item.quantity}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
