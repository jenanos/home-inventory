"use client"

import { useState, useTransition, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { Check, Loader2, Pencil, Plus, Trash2, Users, X } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"

import {
  createPackingPerson,
  deletePackingPerson,
  renamePackingPerson,
} from "@/lib/actions/packing"

export type PackingPersonOption = { id: string; name: string }

/**
 * The people the household packs for. They are names, not app users, so
 * children can be added; every packing list shares them. The default trigger
 * is made here, in the client, so a server page can render the dialog without
 * passing an element through `asChild`.
 */
export function PersonsDialog({
  persons,
  trigger,
}: {
  persons: PackingPersonOption[]
  trigger?: ReactNode
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [newName, setNewName] = useState("")
  const [error, setError] = useState("")

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError("")
    startTransition(async () => {
      const result = await action()
      if (!result.ok) {
        setError(result.error ?? "Noe gikk galt")
        return
      }
      router.refresh()
    })
  }

  function handleAdd() {
    const name = newName.trim()
    if (!name) return
    run(async () => {
      const result = await createPackingPerson({ name })
      if (result.ok) setNewName("")
      return result
    })
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            <Users className="h-4 w-4" data-icon="inline-start" />
            Personer ({persons.length})
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Personer</DialogTitle>
          <DialogDescription>
            Hvem du pakker for, f.eks. barna. De trenger ikke bruke appen, og
            gjelder alle pakkelistene.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
          {persons.length > 0 && (
            <ul className="flex flex-col gap-1">
              {persons.map((person) => (
                <PersonRow
                  key={person.id}
                  person={person}
                  disabled={isPending}
                  onRename={(name) =>
                    run(() => renamePackingPerson({ id: person.id, name }))
                  }
                  onDelete={() => run(() => deletePackingPerson(person.id))}
                />
              ))}
            </ul>
          )}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              handleAdd()
            }}
          >
            <Input
              placeholder="Navn, f.eks. Ola"
              aria-label="Ny person"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              disabled={isPending}
            />
            <Button
              type="submit"
              variant="outline"
              disabled={isPending || !newName.trim()}
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" data-icon="inline-start" />
              )}
              Legg til
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function PersonRow({
  person,
  disabled,
  onRename,
  onDelete,
}: {
  person: PackingPersonOption
  disabled: boolean
  onRename: (name: string) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(person.name)
  const [confirming, setConfirming] = useState(false)

  if (editing) {
    return (
      <li>
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim() && name.trim() !== person.name) onRename(name)
            setEditing(false)
          }}
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label={`Nytt navn for ${person.name}`}
            autoFocus
          />
          <Button
            type="submit"
            variant="ghost"
            size="icon-sm"
            aria-label="Lagre"
          >
            <Check className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Avbryt"
            onClick={() => {
              setName(person.name)
              setEditing(false)
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </form>
      </li>
    )
  }

  return (
    <li className="flex items-center gap-1 rounded-md border px-3 py-1">
      <span className="flex-1 truncate text-sm">{person.name}</span>
      {confirming ? (
        <>
          <span className="text-xs text-muted-foreground">
            Tingene blir felles
          </span>
          <Button
            variant="destructive"
            size="sm"
            disabled={disabled}
            onClick={onDelete}
          >
            Slett
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Avbryt"
            onClick={() => setConfirming(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </>
      ) : (
        <>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={disabled}
            aria-label={`Endre navn på ${person.name}`}
            onClick={() => setEditing(true)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={disabled}
            aria-label={`Slett ${person.name}`}
            onClick={() => setConfirming(true)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </>
      )}
    </li>
  )
}
