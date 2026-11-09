import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ExternalLink, MapPin, Pencil, Skull } from "lucide-react"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"

import { AttachmentGallery } from "@/components/attachments/attachment-gallery"
import { getGalleryAttachments } from "@/lib/queries/attachments"
import { getGardenBeds, getPlant } from "@/lib/queries/plant"
import { requireHousehold } from "@/lib/session"
import { PlantFormDialog } from "../plant-form-dialog"

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const LABELS = {
  plantType: {
    TREE: "Tre",
    SHRUB: "Busk",
    PERENNIAL: "Staude",
    ANNUAL: "Ettårig",
    FLOWER: "Blomst",
    HERB: "Krydder/urt",
    VEGETABLE: "Grønnsak",
    CLIMBER: "Klatreplante",
    GRASS: "Gress",
    OTHER: "Annet",
  },
  lifecycle: { ANNUAL: "Ettårig", BIENNIAL: "Toårig", PERENNIAL: "Flerårig" },
  wateringNeed: { LOW: "Lite", MEDIUM: "Middels", HIGH: "Mye" },
  wateringMethod: { MANUAL: "Manuell", AUTOMATIC: "Automatisk" },
  sunNeed: {
    FULL_SUN: "Mye sol",
    PARTIAL_SHADE: "Halvskygge",
    SHADE: "Skygge",
  },
} as const

function formatDate(date: Date | null) {
  return date
    ? date.toLocaleDateString("nb-NO", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null
}

export default async function PlantPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  if (!UUID_PATTERN.test(id)) notFound()

  const { context } = await requireHousehold()
  const [plant, beds, attachments] = await Promise.all([
    getPlant(context, id),
    getGardenBeds(context),
    getGalleryAttachments(context, { type: "plant", id }),
  ])
  if (!plant) notFound()

  const facts: Array<[string, string | null]> = [
    ["Type", plant.plantType ? LABELS.plantType[plant.plantType] : null],
    ["Livssyklus", plant.lifecycle ? LABELS.lifecycle[plant.lifecycle] : null],
    ["Sol", plant.sunNeed ? LABELS.sunNeed[plant.sunNeed] : null],
    [
      "Vannbehov",
      plant.wateringNeed ? LABELS.wateringNeed[plant.wateringNeed] : null,
    ],
    [
      "Vanning",
      plant.wateringMethod ? LABELS.wateringMethod[plant.wateringMethod] : null,
    ],
    ["Jord", plant.soilType],
    ["Gjødsling", plant.fertilizer],
    ["Herdighetssone", plant.hardinessZone],
    ["Blomstring", plant.bloomTime],
    ["Beskjæring", plant.pruningSeason],
    ["Plantet", formatDate(plant.plantedAt)],
    ["Sist vannet", formatDate(plant.lastWateredAt)],
    ["Sist beskåret", formatDate(plant.lastPrunedAt)],
  ]
  const texts: Array<[string, string | null]> = [
    ["Beskrivelse", plant.description],
    ["Stell", plant.careInstructions],
    ["Skadedyr og sykdommer", plant.pests],
    ["Notater", plant.notes],
  ]

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/hage">
            <ArrowLeft className="h-4 w-4" data-icon="inline-start" />
            Hage
          </Link>
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl font-bold tracking-tight break-words">
            {plant.name}
          </h1>
          {plant.species && (
            <p className="text-muted-foreground italic">{plant.species}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {plant.placements.map((placement) => (
              <Badge key={placement.id} variant="outline" asChild>
                <Link href={`/hage/bed/${placement.bed.id}`}>
                  <MapPin className="mr-1 h-3 w-3" />
                  {placement.bed.name}
                  {placement.quantity ? ` × ${placement.quantity}` : ""}
                </Link>
              </Badge>
            ))}
            {plant.isToxic && (
              <Badge
                variant="outline"
                className="border-red-300 bg-red-100 text-red-800 dark:border-red-900/50 dark:bg-red-900/30 dark:text-red-400"
              >
                <Skull className="mr-1 h-3 w-3" />
                Giftig{plant.toxicityNotes ? `: ${plant.toxicityNotes}` : ""}
              </Badge>
            )}
          </div>
        </div>
        <PlantFormDialog
          plant={plant}
          beds={beds.map((bed) => ({ id: bed.id, name: bed.name }))}
          trigger={
            <Button variant="outline" className="shrink-0">
              <Pencil className="h-4 w-4" data-icon="inline-start" />
              Rediger
            </Button>
          }
        />
      </div>

      <AttachmentGallery
        targetType="plant"
        targetId={plant.id}
        attachments={attachments}
        coverHint="Hovedbildet vises på plantekortet i hageoversikten."
      />

      {attachments.length === 0 && plant.imageUrl && (
        <p className="-mt-3 text-xs text-muted-foreground">
          Plantekortet bruker bildelenken{" "}
          <a
            href={plant.imageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            fra nettet
          </a>{" "}
          til du laster opp et eget bilde.
        </p>
      )}

      <Card>
        <CardContent className="flex flex-col gap-5">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
            {facts
              .filter(([, value]) => value)
              .map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="text-sm">{value}</dd>
                </div>
              ))}
          </dl>
          {texts
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <div key={label}>
                <h2 className="text-xs text-muted-foreground">{label}</h2>
                <p className="text-sm whitespace-pre-line">{value}</p>
              </div>
            ))}
          {plant.sourceUrl && (
            <a
              href={plant.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Mer info
            </a>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
