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
import {
  Droplet,
  Droplets,
  Sun,
  CloudSun,
  Cloud,
  Skull,
  MoreVertical,
  Pencil,
  Trash2,
  Sprout,
  Loader2,
  ExternalLink,
} from "lucide-react"
import type { Plant } from "@workspace/db"
import { deletePlant } from "@/lib/actions/plant"
import { PlantFormDialog } from "./plant-form-dialog"

const plantTypeLabel: Record<string, string> = {
  TREE: "Tre",
  SHRUB: "Busk",
  PERENNIAL: "Staude",
  ANNUAL: "Ettårig",
  FLOWER: "Blomst",
  HERB: "Krydder",
  VEGETABLE: "Grønnsak",
  CLIMBER: "Klatreplante",
  GRASS: "Gress",
  OTHER: "Annet",
}

const wateringNeedConfig: Record<
  string,
  { label: string; icon: typeof Droplet }
> = {
  LOW: { label: "Lite vann", icon: Droplet },
  MEDIUM: { label: "Middels vann", icon: Droplet },
  HIGH: { label: "Mye vann", icon: Droplets },
}

const sunNeedConfig: Record<string, { label: string; icon: typeof Sun }> = {
  FULL_SUN: { label: "Mye sol", icon: Sun },
  PARTIAL_SHADE: { label: "Halvskygge", icon: CloudSun },
  SHADE: { label: "Skygge", icon: Cloud },
}

const wateringMethodLabel: Record<string, string> = {
  MANUAL: "Manuell vanning",
  AUTOMATIC: "Automatisk vanning",
}

export function PlantCard({ plant }: { plant: Plant }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)

  function handleDelete() {
    if (!confirming) {
      setConfirming(true)
      return
    }
    startTransition(async () => {
      try {
        await deletePlant(plant.id)
        router.refresh()
      } catch {
        setConfirming(false)
      }
    })
  }

  const watering = plant.wateringNeed
    ? wateringNeedConfig[plant.wateringNeed]
    : undefined
  const sun = plant.sunNeed ? sunNeedConfig[plant.sunNeed] : undefined

  return (
    <Card className="flex h-full flex-col overflow-hidden pt-0">
      {plant.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- arbitrary remote URLs (no configured image domains)
        <img
          src={plant.imageUrl}
          alt={plant.name}
          className="h-40 w-full object-cover"
          loading="lazy"
        />
      )}
      <CardHeader className={plant.imageUrl ? "pb-3" : "pt-6 pb-3"}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base leading-tight break-words">
              {plant.name}
            </CardTitle>
            {plant.species && (
              <p className="text-sm text-muted-foreground italic">
                {plant.species}
              </p>
            )}
          </div>
          <DropdownMenu
            onOpenChange={(open) => {
              if (!open) setConfirming(false)
            }}
          >
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="shrink-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <PlantFormDialog
                plant={plant}
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
                {confirming ? "Bekreft sletting" : "Slett"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        {plant.location && (
          <p className="text-sm text-muted-foreground">📍 {plant.location}</p>
        )}
        {plant.description && (
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {plant.description}
          </p>
        )}

        <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
          {plant.plantType && (
            <Badge variant="secondary" className="text-xs">
              <Sprout className="mr-1 h-3 w-3" />
              {plantTypeLabel[plant.plantType] ?? plant.plantType}
            </Badge>
          )}
          {watering && (
            <Badge variant="outline" className="text-xs">
              <watering.icon className="mr-1 h-3 w-3" />
              {watering.label}
            </Badge>
          )}
          {sun && (
            <Badge variant="outline" className="text-xs">
              <sun.icon className="mr-1 h-3 w-3" />
              {sun.label}
            </Badge>
          )}
          {plant.wateringMethod && (
            <Badge variant="outline" className="text-xs">
              {wateringMethodLabel[plant.wateringMethod]}
            </Badge>
          )}
          {plant.isToxic && (
            <Badge
              variant="outline"
              className="border-red-300 bg-red-100 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-900/30 dark:text-red-400"
            >
              <Skull className="mr-1 h-3 w-3" />
              Giftig
            </Badge>
          )}
        </div>

        {plant.sourceUrl && (
          <a
            href={plant.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary inline-flex items-center gap-1 text-sm hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Mer info
          </a>
        )}
      </CardContent>
    </Card>
  )
}
