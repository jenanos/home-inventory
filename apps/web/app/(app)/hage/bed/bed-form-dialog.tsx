"use client"

import { useState, useTransition, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Loader2, Save } from "lucide-react"
import type { GardenBed, SunNeed } from "@workspace/db"
import { createGardenBed, updateGardenBed } from "@/lib/actions/plant"

const NONE = "__none__"

export function BedFormDialog({
  bed,
  trigger,
}: {
  bed?: Pick<GardenBed, "id" | "name" | "description" | "sunExposure" | "notes">
  trigger: ReactNode
}) {
  const router = useRouter()
  const isEdit = Boolean(bed)
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState(bed?.name ?? "")
  const [description, setDescription] = useState(bed?.description ?? "")
  const [sunExposure, setSunExposure] = useState<SunNeed | "">(
    bed?.sunExposure ?? ""
  )
  const [notes, setNotes] = useState(bed?.notes ?? "")
  const [error, setError] = useState("")

  function handleSubmit() {
    if (!name.trim()) {
      setError("Navn er påkrevd")
      return
    }
    setError("")

    startTransition(async () => {
      const fields = {
        name: name.trim(),
        description: description.trim() || null,
        sunExposure: sunExposure || null,
        notes: notes.trim() || null,
      }
      try {
        if (bed) await updateGardenBed({ id: bed.id, ...fields })
        else await createGardenBed(fields)

        if (!isEdit) {
          setName("")
          setDescription("")
          setSunExposure("")
          setNotes("")
        }
        setOpen(false)
        router.refresh()
      } catch {
        setError(
          "Kunne ikke lagre bedet. Finnes det allerede et bed med samme navn?"
        )
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Rediger bed" : "Nytt bed"}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="bed-name">Navn *</Label>
            <Input
              id="bed-name"
              placeholder="F.eks. Høyre staudebed"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Sol</Label>
            <Select
              value={sunExposure || NONE}
              onValueChange={(v) =>
                setSunExposure(v === NONE ? "" : (v as SunNeed))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Velg" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Ikke angitt</SelectItem>
                <SelectItem value="FULL_SUN">Mye sol</SelectItem>
                <SelectItem value="PARTIAL_SHADE">Halvskygge</SelectItem>
                <SelectItem value="SHADE">Skygge</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="bed-description">Beskrivelse</Label>
            <Textarea
              id="bed-description"
              placeholder="Hvor bedet ligger, jordsmonn, størrelse …"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="bed-notes">Notater</Label>
            <Textarea
              id="bed-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {isEdit ? "Lagre endringer" : "Opprett bed"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
