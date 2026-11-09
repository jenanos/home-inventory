"use client"

import { useRef, useState, useTransition, type DragEvent } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  ImagePlus,
  Loader2,
  Star,
  Trash2,
} from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { cn } from "@workspace/ui/lib/utils"

import {
  deleteAttachment,
  makeAttachmentCover,
  updateAttachmentCaption,
} from "@/lib/actions/attachment"
import type { AttachmentTargetType } from "@/lib/application/attachments/target"
import { attachmentUrl } from "@/lib/attachment-urls"

export type GalleryAttachment = {
  id: string
  kind: "IMAGE" | "DOCUMENT"
  fileName: string
  caption: string | null
  byteSize: number
  width: number | null
  height: number | null
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} kB`
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`
}

export function AttachmentGallery({
  targetType,
  targetId,
  attachments,
  title = "Bilder og filer",
  coverHint,
}: {
  targetType: AttachmentTargetType
  targetId: string
  attachments: GalleryAttachment[]
  title?: string
  /** Shown when the first image is used as the cover picture elsewhere. */
  coverHint?: string
}) {
  const router = useRouter()
  const fileInput = useRef<HTMLInputElement>(null)
  const cameraInput = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<{ done: number; total: number }>()
  const [dragging, setDragging] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  const images = attachments.filter((item) => item.kind === "IMAGE")
  const documents = attachments.filter((item) => item.kind === "DOCUMENT")
  const uploading = progress !== undefined

  async function upload(files: File[]) {
    if (files.length === 0 || uploading) return
    setProgress({ done: 0, total: files.length })
    let failed = 0

    // One request per file: a slow phone connection then shows progress, and
    // one bad file does not stop the others.
    for (const [index, file] of files.entries()) {
      const form = new FormData()
      form.set("targetType", targetType)
      form.set("targetId", targetId)
      form.append("file", file)
      try {
        const response = await fetch("/api/attachments", {
          method: "POST",
          body: form,
        })
        if (!response.ok) {
          failed++
          const body = (await response.json().catch(() => null)) as {
            error?: { message?: string }
          } | null
          toast.error(
            `${file.name}: ${body?.error?.message ?? "Opplastingen feilet."}`
          )
        }
      } catch {
        failed++
        toast.error(`${file.name}: Opplastingen feilet. Sjekk nettet.`)
      }
      setProgress({ done: index + 1, total: files.length })
    }

    setProgress(undefined)
    if (failed < files.length) {
      toast.success(
        files.length - failed === 1
          ? "Lastet opp"
          : `Lastet opp ${files.length - failed} filer`
      )
    }
    router.refresh()
  }

  function onDrop(event: DragEvent) {
    event.preventDefault()
    setDragging(false)
    void upload([...event.dataTransfer.files])
  }

  const openIndex = images.findIndex((image) => image.id === openId)
  const openImage = openIndex >= 0 ? images[openIndex] : undefined

  return (
    <section
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-transparent transition-colors",
        dragging && "border-dashed border-primary bg-primary/5"
      )}
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold">{title}</h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="md:hidden"
            disabled={uploading}
            onClick={() => cameraInput.current?.click()}
          >
            <Camera className="h-4 w-4" data-icon="inline-start" />
            Ta bilde
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => fileInput.current?.click()}
          >
            {uploading ? (
              <Loader2
                className="h-4 w-4 animate-spin"
                data-icon="inline-start"
              />
            ) : (
              <ImagePlus className="h-4 w-4" data-icon="inline-start" />
            )}
            {uploading
              ? `Laster opp ${Math.min(progress.done + 1, progress.total)} av ${progress.total}`
              : "Last opp"}
          </Button>
        </div>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(event) => {
            void upload([...(event.target.files ?? [])])
            event.target.value = ""
          }}
        />
        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(event) => {
            void upload([...(event.target.files ?? [])])
            event.target.value = ""
          }}
        />
      </div>

      {attachments.length === 0 ? (
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground transition-colors hover:bg-muted/50"
        >
          <ImagePlus className="mb-1 h-6 w-6" />
          Ingen bilder eller filer ennå
          <span className="text-xs">
            Last opp bilder eller PDF-er, eller dra dem hit
          </span>
        </button>
      ) : (
        <>
          {images.length > 0 && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {images.map((image, index) => (
                <button
                  key={image.id}
                  type="button"
                  onClick={() => setOpenId(image.id)}
                  className="group relative aspect-square overflow-hidden rounded-lg bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  aria-label={image.caption ?? image.fileName}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- authenticated API route, not a static asset */}
                  <img
                    src={attachmentUrl(image.id, { thumbnail: true })}
                    alt={image.caption ?? image.fileName}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                  {index === 0 && coverHint && (
                    <span className="absolute top-1 left-1 rounded-full bg-background/90 p-1 shadow-sm">
                      <Star className="h-3 w-3 fill-current text-amber-500" />
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
          {documents.length > 0 && (
            <ul className="flex flex-col divide-y rounded-lg border">
              {documents.map((document) => (
                <DocumentRow key={document.id} document={document} />
              ))}
            </ul>
          )}
        </>
      )}

      <Dialog
        open={Boolean(openImage)}
        onOpenChange={(open) => !open && setOpenId(null)}
      >
        {openImage && (
          <ImageViewer
            key={openImage.id}
            image={openImage}
            isCover={openIndex === 0}
            coverHint={coverHint}
            onPrevious={
              openIndex > 0
                ? () => setOpenId(images[openIndex - 1]!.id)
                : undefined
            }
            onNext={
              openIndex < images.length - 1
                ? () => setOpenId(images[openIndex + 1]!.id)
                : undefined
            }
            onDeleted={() => setOpenId(null)}
          />
        )}
      </Dialog>
    </section>
  )
}

function ImageViewer({
  image,
  isCover,
  coverHint,
  onPrevious,
  onNext,
  onDeleted,
}: {
  image: GalleryAttachment
  isCover: boolean
  coverHint?: string
  onPrevious?: () => void
  onNext?: () => void
  onDeleted: () => void
}) {
  const router = useRouter()
  const [caption, setCaption] = useState(image.caption ?? "")
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isPending, startTransition] = useTransition()

  function run(
    action: () => Promise<void>,
    success: string,
    after?: () => void
  ) {
    startTransition(async () => {
      try {
        await action()
        toast.success(success)
        after?.()
        router.refresh()
      } catch {
        toast.error("Kunne ikke lagre endringen.")
      }
    })
  }

  return (
    <DialogContent className="max-h-[95vh] gap-3 overflow-y-auto sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle className="truncate pr-6 text-base">
          {image.caption ?? image.fileName}
        </DialogTitle>
        <DialogDescription>
          {image.width && image.height
            ? `${image.width} × ${image.height} · `
            : ""}
          {formatSize(image.byteSize)}
        </DialogDescription>
      </DialogHeader>

      <div className="relative flex items-center justify-center overflow-hidden rounded-lg bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element -- authenticated API route, not a static asset */}
        <img
          src={attachmentUrl(image.id)}
          alt={image.caption ?? image.fileName}
          className="max-h-[60vh] w-auto object-contain"
        />
        {onPrevious && (
          <Button
            variant="secondary"
            size="icon"
            className="absolute left-2 rounded-full opacity-90"
            onClick={onPrevious}
            aria-label="Forrige bilde"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
        )}
        {onNext && (
          <Button
            variant="secondary"
            size="icon"
            className="absolute right-2 rounded-full opacity-90"
            onClick={onNext}
            aria-label="Neste bilde"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        )}
      </div>

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          run(
            () =>
              updateAttachmentCaption({
                id: image.id,
                caption: caption.trim() || null,
              }),
            "Bildeteksten er lagret"
          )
        }}
      >
        <Input
          placeholder="Bildetekst, f.eks. «Juni 2026, i full blomst»"
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
          aria-label="Bildetekst"
        />
        <Button
          type="submit"
          variant="outline"
          disabled={isPending || caption === (image.caption ?? "")}
        >
          Lagre
        </Button>
      </form>

      <div className="flex flex-wrap gap-2">
        {coverHint && (
          <Button
            variant="outline"
            size="sm"
            disabled={isPending || isCover}
            onClick={() =>
              run(() => makeAttachmentCover(image.id), "Satt som hovedbilde")
            }
          >
            <Star
              className={cn(
                "h-4 w-4",
                isCover && "fill-current text-amber-500"
              )}
              data-icon="inline-start"
            />
            {isCover ? "Hovedbilde" : "Bruk som hovedbilde"}
          </Button>
        )}
        <Button variant="outline" size="sm" asChild>
          <a href={attachmentUrl(image.id, { download: true })}>
            <Download className="h-4 w-4" data-icon="inline-start" />
            Last ned
          </a>
        </Button>
        <Button
          variant={confirmDelete ? "destructive" : "outline"}
          size="sm"
          className="ml-auto"
          disabled={isPending}
          onClick={() => {
            if (!confirmDelete) {
              setConfirmDelete(true)
              return
            }
            run(
              () => deleteAttachment(image.id),
              "Bildet er slettet",
              onDeleted
            )
          }}
        >
          {isPending ? (
            <Loader2
              className="h-4 w-4 animate-spin"
              data-icon="inline-start"
            />
          ) : (
            <Trash2 className="h-4 w-4" data-icon="inline-start" />
          )}
          {confirmDelete ? "Bekreft sletting" : "Slett"}
        </Button>
      </div>
      {coverHint && isCover && (
        <p className="text-xs text-muted-foreground">{coverHint}</p>
      )}
    </DialogContent>
  )
}

function DocumentRow({ document }: { document: GalleryAttachment }) {
  const router = useRouter()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isPending, startTransition] = useTransition()

  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <a
          href={attachmentUrl(document.id)}
          target="_blank"
          rel="noopener noreferrer"
          className="block truncate text-sm font-medium hover:underline"
        >
          {document.caption ?? document.fileName}
        </a>
        <p className="truncate text-xs text-muted-foreground">
          {document.caption ? `${document.fileName} · ` : ""}
          {formatSize(document.byteSize)}
        </p>
      </div>
      <Button variant="ghost" size="icon-sm" asChild>
        <a
          href={attachmentUrl(document.id)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Åpne ${document.fileName}`}
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      </Button>
      <Button variant="ghost" size="icon-sm" asChild>
        <a
          href={attachmentUrl(document.id, { download: true })}
          aria-label={`Last ned ${document.fileName}`}
        >
          <Download className="h-4 w-4" />
        </a>
      </Button>
      <Button
        variant={confirmDelete ? "destructive" : "ghost"}
        size={confirmDelete ? "sm" : "icon-sm"}
        disabled={isPending}
        aria-label={`Slett ${document.fileName}`}
        onBlur={() => setConfirmDelete(false)}
        onClick={() => {
          if (!confirmDelete) {
            setConfirmDelete(true)
            return
          }
          startTransition(async () => {
            try {
              await deleteAttachment(document.id)
              toast.success("Filen er slettet")
              router.refresh()
            } catch {
              toast.error("Kunne ikke slette filen.")
            }
          })
        }}
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : confirmDelete ? (
          "Slett?"
        ) : (
          <Trash2 className="h-4 w-4" />
        )}
      </Button>
    </li>
  )
}
