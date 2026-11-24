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
  Archive,
  ArchiveRestore,
  Copy,
  CopyPlus,
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
  updatePackingList,
} from "@/lib/actions/packing"
import {
  PackingListFormDialog,
  type EditableList,
} from "../packing-list-form-dialog"

/**
 * The list's menu. What it offers follows the kind: a template is copied and
 * started from, a trip is packed, finished and saved as a template, and a
 * finished trip is reopened or reused.
 */
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
  const [editing, setEditing] = useState(false)

  function handleCopy(
    kind: EditableList["kind"],
    message: string,
    name?: string
  ) {
    startTransition(async () => {
      const result = await duplicatePackingList({
        listId: list.id,
        kind,
        name,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(message)
      router.push(`/pakkelister/${result.data.id}`)
    })
  }

  function handleKind(kind: EditableList["kind"], message: string) {
    startTransition(async () => {
      const result = await updatePackingList({ id: list.id, kind })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(message)
      router.refresh()
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
    <>
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
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            <Pencil className="mr-2 h-4 w-4" />
            Rediger
          </DropdownMenuItem>

          {list.kind === "TEMPLATE" && (
            <DropdownMenuItem
              onSelect={() => handleCopy("TEMPLATE", "Malen er kopiert")}
              disabled={isPending}
            >
              <Copy className="mr-2 h-4 w-4" />
              Kopier mal
            </DropdownMenuItem>
          )}

          {list.kind === "TRIP" && (
            <>
              <DropdownMenuItem
                onSelect={() =>
                  handleCopy("TRIP", "Listen er kopiert, uten avkrysninger")
                }
                disabled={isPending}
              >
                <Copy className="mr-2 h-4 w-4" />
                Kopier liste
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  handleCopy(
                    "TEMPLATE",
                    "Lagret som mal, uten avkrysninger",
                    list.name
                  )
                }
                disabled={isPending}
              >
                <CopyPlus className="mr-2 h-4 w-4" />
                Lagre som mal
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={handleReset}
                disabled={isPending || !hasPacked}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Nullstill avkrysning
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  handleKind("ARCHIVED", "Turen er flyttet til historikk")
                }
                disabled={isPending}
              >
                <Archive className="mr-2 h-4 w-4" />
                Fullfør tur
              </DropdownMenuItem>
            </>
          )}

          {list.kind === "ARCHIVED" && (
            <>
              <DropdownMenuItem
                onSelect={() =>
                  handleCopy("TRIP", "Ny tur laget fra den gamle", list.name)
                }
                disabled={isPending}
              >
                <Copy className="mr-2 h-4 w-4" />
                Bruk som ny tur
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  handleCopy("TEMPLATE", "Lagret som mal", list.name)
                }
                disabled={isPending}
              >
                <CopyPlus className="mr-2 h-4 w-4" />
                Lagre som mal
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => handleKind("TRIP", "Turen er gjenåpnet")}
                disabled={isPending}
              >
                <ArchiveRestore className="mr-2 h-4 w-4" />
                Gjenåpne tur
              </DropdownMenuItem>
            </>
          )}

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
      {editing && (
        <PackingListFormDialog
          list={list}
          defaultOpen
          onClose={() => setEditing(false)}
        />
      )}
    </>
  )
}
