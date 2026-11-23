"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Progress } from "@workspace/ui/components/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { cn } from "@workspace/ui/lib/utils"
import {
  Check,
  ChevronRight,
  ExternalLink,
  Gift,
  Link2,
  Loader2,
  Lock,
  Plus,
  Unlink,
} from "lucide-react"

import {
  addGiftWish,
  createGiftList,
  setGiftListEvent,
} from "@/lib/actions/event"
import { formatNOK } from "@/lib/project-labels"
import type { ShoppingListSummary } from "@/lib/project-purchases"

export type GiftItemView = {
  id: string
  name: string
  status: "PENDING" | "PURCHASED" | "SKIPPED"
  /** Effective price: the preferred alternative's, else the estimate. */
  price: number | null
  url: string | null
  storeName: string | null
}

export type GiftListView = {
  id: string
  name: string
  isPrivate: boolean
  summary: ShoppingListSummary
  items: GiftItemView[]
}

interface GiftsSectionProps {
  eventId: string
  lists: GiftListView[]
  /** Visible lists without an event, offered for linking. */
  unlinkedLists: Array<{ id: string; name: string; isPrivate: boolean }>
}

export function GiftsSection({
  eventId,
  lists,
  unlinkedLists,
}: GiftsSectionProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState("")

  function run(action: () => Promise<void>, message: string) {
    setError("")
    startTransition(async () => {
      try {
        await action()
        router.refresh()
      } catch {
        setError(message)
      }
    })
  }

  const pending = lists.reduce(
    (sum, list) =>
      sum + list.summary.estimatedTotal - list.summary.purchasedTotal,
    0
  )

  return (
    <section id="gaver" className="flex scroll-mt-20 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-heading text-lg font-semibold">
          <Gift className="h-5 w-5" />
          Gaveønsker
          {pending > 0 && (
            <span className="text-sm font-normal text-muted-foreground tabular-nums">
              · {formatNOK(pending)} igjen
            </span>
          )}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {unlinkedLists.length > 0 && (
            <Select
              value=""
              disabled={isPending}
              onValueChange={(listId) =>
                run(
                  () => setGiftListEvent({ listId, eventId }),
                  "Kunne ikke koble listen til hendelsen"
                )
              }
            >
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
            disabled={isPending}
            onClick={() =>
              run(async () => {
                await createGiftList({ eventId })
              }, "Kunne ikke opprette gavelisten")
            }
          >
            <Plus className="mr-1 h-4 w-4" />
            Ny gaveliste
          </Button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <AddGiftWishForm eventId={eventId} />

      {lists.length === 0 ? (
        <Card className="flex flex-col items-center justify-center px-4 py-8 text-center">
          <Gift className="mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Ingen gaveønsker ennå</p>
          <p className="text-xs text-muted-foreground">
            Det første ønsket lager en gaveliste under Innkjøp. Gjør listen
            privat der hvis gaven skal være en overraskelse.
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {lists.map((list) => (
            <GiftListCard
              key={list.id}
              list={list}
              disabled={isPending}
              onUnlink={() =>
                run(
                  () =>
                    setGiftListEvent({
                      listId: list.id,
                      eventId: null,
                      previousEventId: eventId,
                    }),
                  "Kunne ikke koble fra listen"
                )
              }
            />
          ))}
        </div>
      )}
    </section>
  )
}

function GiftListCard({
  list,
  disabled,
  onUnlink,
}: {
  list: GiftListView
  disabled: boolean
  onUnlink: () => void
}) {
  const { itemCount, purchasedCount } = list.summary
  const percent =
    itemCount > 0 ? Math.round((purchasedCount / itemCount) * 100) : 0

  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Link
            href={`/lists/${list.id}`}
            className="flex min-w-0 flex-1 items-center gap-2"
          >
            <span className="truncate font-medium">{list.name}</span>
            {list.isPrivate && (
              <Lock
                className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                aria-label="Privat liste"
              />
            )}
            <span className="shrink-0 text-xs text-muted-foreground">
              {itemCount === 0 ? "Tom" : `${purchasedCount}/${itemCount} kjøpt`}
            </span>
            <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
          </Link>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onUnlink}
            disabled={disabled}
            aria-label={`Koble ${list.name} fra hendelsen`}
            title="Koble fra hendelsen"
          >
            <Unlink className="h-4 w-4" />
          </Button>
        </div>
        {itemCount > 0 && <Progress value={percent} />}
        {list.items.length > 0 && (
          <ul className="flex flex-col divide-y text-sm">
            {list.items.map((item) => (
              <GiftItemRow key={item.id} item={item} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function GiftItemRow({ item }: { item: GiftItemView }) {
  const done = item.status !== "PENDING"

  return (
    <li className="flex items-center gap-2 py-1.5">
      <span
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
          item.status === "PURCHASED" &&
            "border-green-600 bg-green-600 text-white dark:border-green-500 dark:bg-green-500"
        )}
        aria-label={
          item.status === "PURCHASED"
            ? "Kjøpt"
            : item.status === "SKIPPED"
              ? "Droppet"
              : "Ikke kjøpt"
        }
      >
        {item.status === "PURCHASED" && <Check className="h-3 w-3" />}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          done && "text-muted-foreground line-through"
        )}
      >
        {item.name}
        {item.storeName && (
          <span className="text-xs text-muted-foreground">
            {" "}
            · {item.storeName}
          </span>
        )}
      </span>
      {item.url && (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-muted-foreground hover:text-foreground"
          aria-label={`Åpne lenke for ${item.name}`}
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
      {item.price !== null && item.price > 0 && (
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {formatNOK(item.price)}
        </span>
      )}
    </li>
  )
}

function AddGiftWishForm({ eventId }: { eventId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState("")
  const [price, setPrice] = useState("")
  const [url, setUrl] = useState("")
  const [error, setError] = useState("")

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    const parsedPrice = price.trim()
      ? Number(price.replace(",", ".").replace(/\s/g, ""))
      : null
    if (parsedPrice !== null && !Number.isFinite(parsedPrice)) {
      setError("Prisen må være et tall")
      return
    }
    setError("")

    startTransition(async () => {
      const result = await addGiftWish({
        eventId,
        name: name.trim(),
        estimatedPrice: parsedPrice,
        url: url.trim() || null,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      if (result.data.skipped) {
        setError(`«${name.trim()}» står allerede på gavelisten`)
        return
      }
      setName("")
      setPrice("")
      setUrl("")
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          placeholder="Legg til gaveønske, f.eks. Ullsokker"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Gaveønske"
          className="sm:flex-1"
        />
        <div className="flex gap-2">
          <Input
            placeholder="Pris"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            aria-label="Pris"
            className="w-24"
          />
          <Input
            placeholder="Lenke (valgfritt)"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            aria-label="Lenke"
            className="min-w-0 flex-1 sm:w-48"
          />
          <Button
            type="submit"
            disabled={isPending || !name.trim()}
            aria-label="Legg til gaveønske"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </form>
  )
}
