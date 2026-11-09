"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Badge } from "@workspace/ui/components/badge"
import { cn } from "@workspace/ui/lib/utils"
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
  Cloud,
  CloudSun,
  Loader2,
  MoreVertical,
  Pencil,
  Sun,
  Trash2,
} from "lucide-react"
import type { GardenBedForWeb } from "@/lib/application/garden/read"
import { attachmentUrl } from "@/lib/attachment-urls"
import { deleteGardenBed } from "@/lib/actions/plant"
import { BedFormDialog } from "./bed-form-dialog"

const sunConfig = {
  FULL_SUN: { label: "Mye sol", icon: Sun },
  PARTIAL_SHADE: { label: "Halvskygge", icon: CloudSun },
  SHADE: { label: "Skygge", icon: Cloud },
} as const

export function BedCard({ bed }: { bed: GardenBedForWeb }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const sun = bed.sunExposure ? sunConfig[bed.sunExposure] : undefined
  const cover = bed.attachments[0]

  function handleDelete() {
    if (!confirming) {
      setConfirming(true)
      return
    }
    startTransition(async () => {
      try {
        await deleteGardenBed(bed.id)
        router.refresh()
      } catch {
        setConfirming(false)
      }
    })
  }

  return (
    <Card
      className={cn("flex h-full flex-col", cover && "overflow-hidden pt-0")}
    >
      {cover && (
        <Link href={`/hage/bed/${bed.id}`} tabIndex={-1} aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element -- authenticated API route */}
          <img
            src={attachmentUrl(cover.id, { thumbnail: true })}
            alt=""
            className="h-40 w-full object-cover"
            loading="lazy"
          />
        </Link>
      )}
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base leading-tight break-words">
              <Link href={`/hage/bed/${bed.id}`} className="hover:underline">
                {bed.name}
              </Link>
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {bed.placements.length} plante(r)
            </p>
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
              <BedFormDialog
                bed={bed}
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
        {sun && (
          <div>
            <Badge variant="outline" className="text-xs">
              <sun.icon className="mr-1 h-3 w-3" />
              {sun.label}
            </Badge>
          </div>
        )}
        {bed.description && (
          <p className="line-clamp-3 text-sm text-muted-foreground">
            {bed.description}
          </p>
        )}
        {bed.placements.length > 0 && (
          <ul className="flex flex-col gap-0.5 text-sm">
            {bed.placements.map((placement) => (
              <li key={placement.id}>
                {placement.plant.name}
                {placement.quantity ? (
                  <span className="text-muted-foreground">
                    {" "}
                    × {placement.quantity}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
