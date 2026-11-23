"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  Copy,
  Loader2,
  MoreVertical,
  Pencil,
  RotateCcw,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"
import {
  deletePackingList,
  duplicatePackingList,
  setAllPackingItemsPacked,
} from "@/lib/actions/packing"
import {
  PackingListFormDialog,
  type EditableList,
} from "../packing-list-form-dialog"

export function ListActions({
  list,
  hasPacked,
}: {
  list: EditableList
  hasPacked: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)

  function handleDuplicate() {
    startTransition(async () => {
      const result = await duplicatePackingList({ listId: list.id })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("Listen er kopiert, uten avkrysninger")
      router.push(`/pakkelister/${result.data.id}`)
    })
  }

  function handleReset() {
    startTransition(async () => {
      const result = await setAllPackingItemsPacked({
        listId: list.id,
        packed: false,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      router.refresh()
    })
  }

  function handleDelete() {
    if (!confirming) {
      setConfirming(true)
      return
    }
    startTransition(async () => {
      const result = await deletePackingList(list.id)
      if (!result.ok) {
        setConfirming(false)
        toast.error(result.error)
        return
      }
      router.push("/pakkelister")
    })
  }

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (!open) setConfirming(false)
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="shrink-0"
          aria-label="Handlinger for pakkelisten"
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MoreVertical className="h-4 w-4" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <PackingListFormDialog
          list={list}
          trigger={
            <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
              <Pencil className="mr-2 h-4 w-4" />
              Rediger
            </DropdownMenuItem>
          }
        />
        <DropdownMenuItem onSelect={handleDuplicate} disabled={isPending}>
          <Copy className="mr-2 h-4 w-4" />
          Kopier liste
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={handleReset}
          disabled={isPending || !hasPacked}
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          Nullstill avkrysning
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={(e) => {
            e.preventDefault()
            handleDelete()
          }}
          disabled={isPending}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          {confirming ? "Bekreft sletting" : "Slett liste"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
