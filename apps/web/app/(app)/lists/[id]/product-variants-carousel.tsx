"use client"

import { useState, useTransition } from "react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { cn } from "@workspace/ui/lib/utils"
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Store,
  Star,
  Check,
  ImageIcon,
} from "lucide-react"
import { setPreferredAlternative } from "@/lib/actions/product-alternative"
import type { AlternativeData } from "./item-list"

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    maximumFractionDigits: 0,
  }).format(amount)

interface ProductVariantsCarouselProps {
  itemId: string
  itemName: string
  alternatives: AlternativeData[]
  children: React.ReactNode
}

export function ProductVariantsCarousel({
  itemId,
  itemName,
  alternatives,
  children,
}: ProductVariantsCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPending, startTransition] = useTransition()

  if (alternatives.length === 0) return null

  const current = alternatives[currentIndex]!
  const isSelected = currentIndex === 0
  const total = alternatives.length

  function goNext() {
    setCurrentIndex((i) => (i + 1) % total)
  }

  function goPrev() {
    setCurrentIndex((i) => (i - 1 + total) % total)
  }

  function handleSetSelected() {
    startTransition(async () => {
      await setPreferredAlternative(itemId, current.id)
      setCurrentIndex(0)
    })
  }

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        className="w-[calc(100vw-2rem)] sm:w-80 p-0"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-3 space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Produktvalg for {itemName}
            </span>
            <Badge variant="secondary" className="text-[10px]">
              {currentIndex + 1} / {total}
            </Badge>
          </div>

          {/* Carousel card */}
          <div className="rounded-lg border bg-card overflow-hidden">
            {/* Image area */}
            {current.imageUrl ? (
              <div className="relative aspect-[16/10] bg-muted">
                <img
                  key={current.id}
                  src={current.imageUrl}
                  alt={current.name}
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = "none"
                  }}
                />
                {isSelected && (
                  <div className="absolute top-2 right-2">
                    <Badge className="bg-primary text-primary-foreground text-[10px] gap-1">
                      <Check className="h-3 w-3" />
                      Valgt
                    </Badge>
                  </div>
                )}
              </div>
            ) : (
              <div className="relative flex items-center justify-center aspect-[16/10] bg-muted/50">
                <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
                {isSelected && (
                  <div className="absolute top-2 right-2">
                    <Badge className="bg-primary text-primary-foreground text-[10px] gap-1">
                      <Check className="h-3 w-3" />
                      Valgt
                    </Badge>
                  </div>
                )}
              </div>
            )}

            {/* Info */}
            <div className="p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">
                    {current.name}
                  </p>
                  {current.storeName && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                      <Store className="h-3 w-3" />
                      {current.storeName}
                    </p>
                  )}
                </div>
                {current.price != null && current.price > 0 && (
                  <span className="text-sm font-bold tabular-nums shrink-0">
                    {formatCurrency(current.price)}
                  </span>
                )}
              </div>

              {current.notes && (
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {current.notes}
                </p>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1">
                {!isSelected && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs flex-1"
                    onClick={handleSetSelected}
                    disabled={isPending}
                  >
                    <Star className="h-3 w-3" data-icon="inline-start" />
                    Velg denne
                  </Button>
                )}
                {current.url && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    asChild
                  >
                    <a
                      href={current.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="h-3 w-3" data-icon="inline-start" />
                      Lenke
                    </a>
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Navigation */}
          {total > 1 && (
            <div className="flex items-center justify-between">
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={goPrev}
                disabled={isPending}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>

              {/* Dots indicator */}
              <div className="flex items-center gap-1.5">
                {alternatives.map((alt, i) => (
                  <button
                    key={alt.id}
                    type="button"
                    onClick={() => setCurrentIndex(i)}
                    className={cn(
                      "h-1.5 rounded-full transition-all",
                      i === currentIndex
                        ? "w-4 bg-primary"
                        : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                    )}
                    aria-label={`Vis alternativ ${i + 1}: ${alt.name}`}
                  />
                ))}
              </div>

              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={goNext}
                disabled={isPending}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
