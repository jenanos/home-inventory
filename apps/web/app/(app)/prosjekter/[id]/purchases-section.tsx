"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import { Progress } from "@workspace/ui/components/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import {
  ChevronRight,
  Link2,
  Loader2,
  Lock,
  Plus,
  ShoppingCart,
  Unlink,
} from "lucide-react"

import {
  createProjectShoppingList,
  setShoppingListProject,
} from "@/lib/actions/project"
import { formatNOK } from "@/lib/project-labels"
import type { ShoppingListSummary } from "@/lib/project-purchases"

interface LinkedList {
  id: string
  name: string
  isPrivate: boolean
  summary: ShoppingListSummary
}

interface PurchasesSectionProps {
  projectId: string
  projectTitle: string
  lists: LinkedList[]
  /** Visible lists without a project, offered for linking. */
  unlinkedLists: Array<{ id: string; name: string; isPrivate: boolean }>
}

export function PurchasesSection({
  projectId,
  projectTitle,
  lists,
  unlinkedLists,
}: PurchasesSectionProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState("")

  function handleCreate() {
    setError("")
    startTransition(async () => {
      try {
        const list = await createProjectShoppingList({
          projectId,
          name: projectTitle,
        })
        router.push(`/lists/${list.id}`)
      } catch {
        setError("Kunne ikke opprette innkjøpslisten")
      }
    })
  }

  function handleLink(listId: string) {
    setError("")
    startTransition(async () => {
      try {
        await setShoppingListProject({ listId, projectId })
      } catch {
        setError("Kunne ikke koble listen til prosjektet")
      }
    })
  }

  function handleUnlink(listId: string) {
    setError("")
    startTransition(async () => {
      try {
        await setShoppingListProject({
          listId,
          projectId: null,
          previousProjectId: projectId,
        })
      } catch {
        setError("Kunne ikke koble fra listen")
      }
    })
  }

  const total = lists.reduce(
    (sum, list) => sum + list.summary.estimatedTotal,
    0
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-heading text-lg font-semibold">
          <ShoppingCart className="h-5 w-5" />
          Innkjøp
          {total > 0 && (
            <span className="text-sm font-normal text-muted-foreground tabular-nums">
              · {formatNOK(total)}
            </span>
          )}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {unlinkedLists.length > 0 && (
            <Select value="" onValueChange={handleLink} disabled={isPending}>
              <SelectTrigger
                size="sm"
                aria-label="Koble til eksisterende liste"
              >
                <Link2 className="h-4 w-4" />
                <SelectValue placeholder="Koble til liste" />
              </SelectTrigger>
              <SelectContent>
                {unlinkedLists.map((list) => (
                  <SelectItem key={list.id} value={list.id}>
                    {list.name}
                    {list.isPrivate ? " (privat)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleCreate}
            disabled={isPending}
          >
            {isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-1 h-4 w-4" />
            )}
            Ny innkjøpsliste
          </Button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {lists.length === 0 ? (
        <Card className="flex flex-col items-center justify-center px-4 py-8 text-center">
          <ShoppingCart className="mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Ingen innkjøp knyttet til prosjektet
          </p>
          <p className="text-xs text-muted-foreground">
            Lag en innkjøpsliste for materialer og utstyr du trenger
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {lists.map((list) => {
            const { itemCount, purchasedCount, estimatedTotal } = list.summary
            const percent =
              itemCount > 0 ? Math.round((purchasedCount / itemCount) * 100) : 0

            return (
              <Card key={list.id} size="sm">
                <CardContent className="flex items-center gap-3">
                  <Link
                    href={`/lists/${list.id}`}
                    className="flex min-w-0 flex-1 flex-col gap-1.5"
                  >
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{list.name}</span>
                      {list.isPrivate && (
                        <Lock
                          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                          aria-label="Privat liste"
                        />
                      )}
                      <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>
                        {itemCount === 0
                          ? "Ingen varer ennå"
                          : `${purchasedCount}/${itemCount} kjøpt`}
                      </span>
                      {estimatedTotal > 0 && (
                        <span className="tabular-nums">
                          {formatNOK(estimatedTotal)}
                        </span>
                      )}
                    </div>
                    {itemCount > 0 && <Progress value={percent} />}
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleUnlink(list.id)}
                    disabled={isPending}
                    aria-label={`Koble ${list.name} fra prosjektet`}
                    title="Koble fra prosjektet"
                  >
                    <Unlink className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
