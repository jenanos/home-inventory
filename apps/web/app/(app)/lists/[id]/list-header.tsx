"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import {
  ArrowLeft,
  Share2,
  Copy,
  Check,
  Link as LinkIcon,
  Loader2,
  ShoppingCart,
} from "lucide-react"
import { createShareLink } from "@/lib/actions/share-link"

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    maximumFractionDigits: 0,
  }).format(amount)

interface ListHeaderProps {
  listId: string
  listName: string
  totalSum: number
  purchasedSum: number
  itemCount: number
  purchasedCount: number
  shareLinks: Array<{ id: string; token: string; isActive: boolean }>
}

export function ListHeader({
  listId,
  listName,
  totalSum,
  purchasedSum,
  itemCount,
  purchasedCount,
  shareLinks,
}: ListHeaderProps) {
  const [copied, setCopied] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [links, setLinks] = useState(shareLinks)
  const [expiryDays, setExpiryDays] = useState("7")

  const activeLink = links.find((l) => l.isActive)

  function getShareUrl(token: string) {
    if (typeof window === "undefined") return ""
    return `${window.location.origin}/shared/${token}`
  }

  function handleCopy(token: string) {
    navigator.clipboard.writeText(getShareUrl(token))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleCreateLink() {
    startTransition(async () => {
      const days = expiryDays === "never" ? undefined : Number(expiryDays)
      const link = await createShareLink(listId, days)
      setLinks((prev) => [
        ...prev,
        { id: link.id, token: link.token, isActive: true },
      ])
    })
  }

  const pendingCount = itemCount - purchasedCount

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link href="/lists">
            <ArrowLeft className="h-4 w-4" />
            <span className="sr-only">Tilbake</span>
          </Link>
        </Button>
        <h1 className="font-heading text-2xl font-medium flex-1 truncate">
          {listName}
        </h1>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              <Share2 className="h-4 w-4" data-icon="inline-start" />
              Del
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[calc(100vw-2rem)] sm:w-80" align="end">
            <div className="grid gap-4">
              <div className="grid gap-1">
                <h4 className="font-heading font-medium">Del listen</h4>
                <p className="text-xs text-muted-foreground">
                  Opprett en delingslenke slik at andre kan se listen.
                </p>
              </div>

              {activeLink ? (
                <div className="grid gap-2">
                  <Label className="text-xs text-muted-foreground">
                    Delingslenke
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      readOnly
                      value={getShareUrl(activeLink.token)}
                      className="h-8 text-xs"
                    />
                    <Button
                      variant="outline"
                      size="icon-sm"
                      onClick={() => handleCopy(activeLink.token)}
                    >
                      {copied ? (
                        <Check className="h-3.5 w-3.5 text-green-600" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="expiry" className="text-xs">
                      Utloper etter
                    </Label>
                    <Select value={expiryDays} onValueChange={setExpiryDays}>
                      <SelectTrigger className="h-8 w-full text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 dag</SelectItem>
                        <SelectItem value="7">7 dager</SelectItem>
                        <SelectItem value="30">30 dager</SelectItem>
                        <SelectItem value="never">Aldri</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleCreateLink}
                    disabled={isPending}
                    className="w-full"
                  >
                    {isPending ? (
                      <>
                        <Loader2
                          className="h-3.5 w-3.5 animate-spin"
                          data-icon="inline-start"
                        />
                        Oppretter...
                      </>
                    ) : (
                      <>
                        <LinkIcon
                          className="h-3.5 w-3.5"
                          data-icon="inline-start"
                        />
                        Opprett lenke
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-1.5">
          <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm">
            <span className="font-medium">{purchasedCount}</span>
            <span className="text-muted-foreground">/{itemCount} kjopt</span>
          </span>
        </div>

        {totalSum > 0 && (
          <div className="flex items-center gap-2 rounded-lg bg-primary/5 px-3 py-1.5">
            <span className="text-sm">
              <span className="text-muted-foreground">Total: </span>
              <span className="font-medium">{formatCurrency(totalSum)}</span>
            </span>
          </div>
        )}

        {purchasedSum > 0 && purchasedSum < totalSum && (
          <div className="flex items-center gap-2 rounded-lg bg-green-500/5 px-3 py-1.5">
            <span className="text-sm">
              <span className="text-muted-foreground">Kjopt: </span>
              <span className="font-medium text-green-700 dark:text-green-400">
                {formatCurrency(purchasedSum)}
              </span>
            </span>
          </div>
        )}

        {pendingCount > 0 && (
          <Badge variant="secondary" className="text-xs">
            {pendingCount} gjenstaar
          </Badge>
        )}
      </div>
    </div>
  )
}
