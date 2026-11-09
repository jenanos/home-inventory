import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Pencil, Sprout } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"

import { AttachmentGallery } from "@/components/attachments/attachment-gallery"
import { getGalleryAttachments } from "@/lib/queries/attachments"
import { getGardenBed } from "@/lib/queries/plant"
import { requireHousehold } from "@/lib/session"
import { BedFormDialog } from "../bed-form-dialog"

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const SUN_LABELS = {
  FULL_SUN: "Mye sol",
  PARTIAL_SHADE: "Halvskygge",
  SHADE: "Skygge",
} as const

export default async function GardenBedPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  if (!UUID_PATTERN.test(id)) notFound()

  const { context } = await requireHousehold()
  const [bed, attachments] = await Promise.all([
    getGardenBed(context, id),
    getGalleryAttachments(context, { type: "bed", id }),
  ])
  if (!bed) notFound()

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/hage/bed">
            <ArrowLeft className="h-4 w-4" data-icon="inline-start" />
            Bed
          </Link>
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl font-bold tracking-tight break-words">
            {bed.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {bed.placements.length} plante(r)
            {bed.sunExposure ? ` · ${SUN_LABELS[bed.sunExposure]}` : ""}
          </p>
        </div>
        <BedFormDialog
          bed={bed}
          trigger={
            <Button variant="outline" className="shrink-0">
              <Pencil className="h-4 w-4" data-icon="inline-start" />
              Rediger
            </Button>
          }
        />
      </div>

      <AttachmentGallery
        targetType="bed"
        targetId={bed.id}
        attachments={attachments}
        coverHint="Hovedbildet vises på bedkortet i bedoversikten."
      />

      {(bed.description || bed.notes) && (
        <Card>
          <CardContent className="flex flex-col gap-4">
            {bed.description && (
              <div>
                <h2 className="text-xs text-muted-foreground">Beskrivelse</h2>
                <p className="text-sm whitespace-pre-line">{bed.description}</p>
              </div>
            )}
            {bed.notes && (
              <div>
                <h2 className="text-xs text-muted-foreground">Notater</h2>
                <p className="text-sm whitespace-pre-line">{bed.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold">Planter</h2>
        {bed.placements.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ingen planter i dette bedet ennå. Legg dem til fra planteskjemaet.
          </p>
        ) : (
          <ul className="flex flex-col divide-y rounded-lg border">
            {bed.placements.map((placement) => (
              <li key={placement.id}>
                <Link
                  href={`/hage/${placement.plant.id}`}
                  className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50"
                >
                  <Sprout className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {placement.plant.name}
                      {placement.quantity ? (
                        <span className="text-muted-foreground">
                          {" "}
                          × {placement.quantity}
                        </span>
                      ) : null}
                    </span>
                    {(placement.plant.species || placement.notes) && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {[placement.plant.species, placement.notes]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
