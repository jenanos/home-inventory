"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { ExternalLink, Tag, X } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Switch } from "@workspace/ui/components/switch"

import { removeItemDeal, setItemDealWatch } from "@/lib/actions/shopping-deal"
import { toOsloDay } from "@/lib/dashboard-stats"
import {
  dealSavingsPercent,
  describeDealPeriod,
  formatDealPrice,
} from "@/lib/shopping-deals"
import type { ShoppingItemData } from "./item-list"

const checkedFormatter = new Intl.DateTimeFormat("nb-NO", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Oslo",
})

function parseTargetPrice(value: string) {
  const normalized = value.replace(/\s/g, "").replace(",", ".")
  if (!normalized) return null
  const number = Number(normalized)
  return Number.isFinite(number) && number >= 0 ? number : undefined
}

/**
 * Deal watching for one item: whether an assistant's deal check should look
 * for offers on it, what counts as a good offer, and the offer it found.
 * Saved on its own, separately from the item's other fields.
 */
export function DealWatchSection({ item }: { item: ShoppingItemData }) {
  const [watch, setWatch] = useState(item.dealWatch)
  const [note, setNote] = useState(item.dealWatchNote ?? "")
  const [targetPrice, setTargetPrice] = useState(
    item.dealTargetPrice != null ? String(item.dealTargetPrice) : ""
  )
  const [deal, setDeal] = useState(item.deal)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const saved = useRef({ note: item.dealWatchNote ?? "", targetPrice })

  useEffect(() => {
    const price =
      item.dealTargetPrice != null ? String(item.dealTargetPrice) : ""
    setWatch(item.dealWatch)
    setNote(item.dealWatchNote ?? "")
    setTargetPrice(price)
    setDeal(item.deal)
    setError(null)
    saved.current = { note: item.dealWatchNote ?? "", targetPrice: price }
    // Only when another item is opened: the snapshot is stale after a save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id])

  function save(next: { watch: boolean; note: string; targetPrice: string }) {
    const price = parseTargetPrice(next.targetPrice)
    if (price === undefined) {
      setError("Målpris må være et tall.")
      return
    }

    setError(null)
    startTransition(async () => {
      try {
        await setItemDealWatch({
          itemId: item.id,
          watch: next.watch,
          note: next.note.trim() || null,
          targetPrice: price,
        })
        saved.current = { note: next.note, targetPrice: next.targetPrice }
      } catch {
        setError("Kunne ikke lagre. Prøv igjen.")
      }
    })
  }

  function handleToggle(checked: boolean) {
    setWatch(checked)
    save({ watch: checked, note, targetPrice })
  }

  function handleBlur() {
    if (
      note === saved.current.note &&
      targetPrice === saved.current.targetPrice
    ) {
      return
    }
    save({ watch, note, targetPrice })
  }

  function handleRemoveDeal() {
    startTransition(async () => {
      try {
        await removeItemDeal(item.id)
        setDeal(null)
      } catch {
        setError("Kunne ikke fjerne tilbudet. Prøv igjen.")
      }
    })
  }

  const today = toOsloDay(new Date())
  const period = deal ? describeDealPeriod(deal, today) : null
  const savings = deal ? dealSavingsPercent(deal) : null

  return (
    <div className="grid gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="grid gap-0.5">
          <Label htmlFor={`deal-watch-${item.id}`}>Følg med på tilbud</Label>
          <p className="text-xs text-muted-foreground">
            {item.dealCheckedAt
              ? `Sist sjekket ${checkedFormatter.format(new Date(item.dealCheckedAt))}`
              : "En assistent med tilgang til appen sjekker butikkenes tilbud."}
          </p>
        </div>
        <Switch
          id={`deal-watch-${item.id}`}
          checked={watch}
          onCheckedChange={handleToggle}
          disabled={isPending}
        />
      </div>

      {watch && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_9rem]">
          <div className="grid gap-1.5">
            <Label htmlFor={`deal-note-${item.id}`}>Godt tilbud er</Label>
            <Input
              id={`deal-note-${item.id}`}
              value={note}
              placeholder="F.eks. Bosch eller Siemens, minst 8 kg"
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
              onBlur={handleBlur}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`deal-target-${item.id}`}>Målpris (kr)</Label>
            <Input
              id={`deal-target-${item.id}`}
              value={targetPrice}
              inputMode="decimal"
              placeholder="Valgfri"
              onChange={(e) => setTargetPrice(e.target.value)}
              onBlur={handleBlur}
            />
          </div>
        </div>
      )}

      {deal && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300/70 bg-amber-50/70 p-3 text-sm dark:border-amber-500/30 dark:bg-amber-950/20">
          <Tag className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
          <div className="min-w-0 flex-1">
            <p>
              <span className="font-semibold text-amber-800 dark:text-amber-300">
                {formatDealPrice(deal.price)}
              </span>{" "}
              hos <span className="font-medium">{deal.store}</span>
              {savings ? ` (−${savings} %)` : null}
            </p>
            <p className="text-xs text-muted-foreground">
              {[
                deal.productName,
                deal.priceNote,
                deal.regularPrice != null
                  ? `før ${formatDealPrice(deal.regularPrice)}`
                  : null,
                period,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {deal.url && (
              <a
                href={deal.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                Til tilbudet
              </a>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={handleRemoveDeal}
            disabled={isPending}
            aria-label="Fjern tilbudet"
            title="Fjern tilbudet"
            className="text-muted-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
