"use client"

import { useState, useTransition, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@workspace/ui/components/sheet"
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@workspace/ui/components/drawer"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"
import { Switch } from "@workspace/ui/components/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { Calendar } from "@workspace/ui/components/calendar"
import { Separator } from "@workspace/ui/components/separator"
import { cn } from "@workspace/ui/lib/utils"
import { Loader2, CalendarIcon, Save } from "lucide-react"
import { createPlant, updatePlant } from "@/lib/actions/plant"
import type {
  Lifecycle,
  Plant,
  PlantType,
  SunNeed,
  WateringMethod,
  WateringNeed,
} from "@workspace/db"
import { useMediaQuery } from "@/hooks/use-media-query"

const NONE = "__none__"

export function PlantFormDialog({
  plant,
  trigger,
}: {
  plant?: Plant
  trigger: ReactNode
}) {
  const router = useRouter()
  const isEdit = Boolean(plant)
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const isDesktop = useMediaQuery("(min-width: 768px)")

  const [name, setName] = useState(plant?.name ?? "")
  const [species, setSpecies] = useState(plant?.species ?? "")
  const [location, setLocation] = useState(plant?.location ?? "")
  const [plantType, setPlantType] = useState<PlantType | "">(
    plant?.plantType ?? ""
  )
  const [description, setDescription] = useState(plant?.description ?? "")
  const [careInstructions, setCareInstructions] = useState(
    plant?.careInstructions ?? ""
  )
  const [wateringNeed, setWateringNeed] = useState<WateringNeed | "">(
    plant?.wateringNeed ?? ""
  )
  const [wateringMethod, setWateringMethod] = useState<WateringMethod | "">(
    plant?.wateringMethod ?? ""
  )
  const [sunNeed, setSunNeed] = useState<SunNeed | "">(plant?.sunNeed ?? "")
  const [lifecycle, setLifecycle] = useState<Lifecycle | "">(
    plant?.lifecycle ?? ""
  )
  const [pruningSeason, setPruningSeason] = useState(plant?.pruningSeason ?? "")
  const [bloomTime, setBloomTime] = useState(plant?.bloomTime ?? "")
  const [soilType, setSoilType] = useState(plant?.soilType ?? "")
  const [fertilizer, setFertilizer] = useState(plant?.fertilizer ?? "")
  const [hardinessZone, setHardinessZone] = useState(plant?.hardinessZone ?? "")
  const [lastWateredAt, setLastWateredAt] = useState<Date | undefined>(
    plant?.lastWateredAt ?? undefined
  )
  const [lastPrunedAt, setLastPrunedAt] = useState<Date | undefined>(
    plant?.lastPrunedAt ?? undefined
  )
  const [plantedAt, setPlantedAt] = useState<Date | undefined>(
    plant?.plantedAt ?? undefined
  )
  const [isToxic, setIsToxic] = useState(plant?.isToxic ?? false)
  const [toxicityNotes, setToxicityNotes] = useState(plant?.toxicityNotes ?? "")
  const [pests, setPests] = useState(plant?.pests ?? "")
  const [notes, setNotes] = useState(plant?.notes ?? "")
  const [imageUrl, setImageUrl] = useState(plant?.imageUrl ?? "")
  const [sourceUrl, setSourceUrl] = useState(plant?.sourceUrl ?? "")
  const [error, setError] = useState("")

  function resetForm() {
    if (isEdit) return
    setName("")
    setSpecies("")
    setLocation("")
    setPlantType("")
    setDescription("")
    setCareInstructions("")
    setWateringNeed("")
    setWateringMethod("")
    setSunNeed("")
    setLifecycle("")
    setPruningSeason("")
    setBloomTime("")
    setSoilType("")
    setFertilizer("")
    setHardinessZone("")
    setLastWateredAt(undefined)
    setLastPrunedAt(undefined)
    setPlantedAt(undefined)
    setIsToxic(false)
    setToxicityNotes("")
    setPests("")
    setNotes("")
    setImageUrl("")
    setSourceUrl("")
    setError("")
  }

  function handleSubmit() {
    if (!name.trim()) {
      setError("Navn er påkrevd")
      return
    }

    startTransition(async () => {
      try {
        if (isEdit && plant) {
          await updatePlant({
            id: plant.id,
            name: name.trim(),
            species: species.trim() || null,
            location: location.trim() || null,
            plantType: plantType || null,
            description: description.trim() || null,
            careInstructions: careInstructions.trim() || null,
            wateringNeed: wateringNeed || null,
            wateringMethod: wateringMethod || null,
            sunNeed: sunNeed || null,
            lifecycle: lifecycle || null,
            pruningSeason: pruningSeason.trim() || null,
            bloomTime: bloomTime.trim() || null,
            soilType: soilType.trim() || null,
            fertilizer: fertilizer.trim() || null,
            hardinessZone: hardinessZone.trim() || null,
            lastWateredAt: lastWateredAt ?? null,
            lastPrunedAt: lastPrunedAt ?? null,
            plantedAt: plantedAt ?? null,
            isToxic,
            toxicityNotes: toxicityNotes.trim() || null,
            pests: pests.trim() || null,
            notes: notes.trim() || null,
            imageUrl: imageUrl.trim() || null,
            sourceUrl: sourceUrl.trim() || null,
          })
        } else {
          await createPlant({
            name: name.trim(),
            species: species.trim() || undefined,
            location: location.trim() || undefined,
            plantType: plantType || undefined,
            description: description.trim() || undefined,
            careInstructions: careInstructions.trim() || undefined,
            wateringNeed: wateringNeed || undefined,
            wateringMethod: wateringMethod || undefined,
            sunNeed: sunNeed || undefined,
            lifecycle: lifecycle || undefined,
            pruningSeason: pruningSeason.trim() || undefined,
            bloomTime: bloomTime.trim() || undefined,
            soilType: soilType.trim() || undefined,
            fertilizer: fertilizer.trim() || undefined,
            hardinessZone: hardinessZone.trim() || undefined,
            lastWateredAt,
            lastPrunedAt,
            plantedAt,
            isToxic,
            toxicityNotes: toxicityNotes.trim() || undefined,
            pests: pests.trim() || undefined,
            notes: notes.trim() || undefined,
            imageUrl: imageUrl.trim() || undefined,
            sourceUrl: sourceUrl.trim() || undefined,
          })
        }
        resetForm()
        setOpen(false)
        router.refresh()
      } catch {
        setError(
          isEdit ? "Kunne ikke lagre planten" : "Kunne ikke opprette planten"
        )
      }
    })
  }

  const datePicker = (
    label: string,
    value: Date | undefined,
    onChange: (d: Date | undefined) => void
  ) => (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "justify-start text-left font-normal",
              !value && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {value ? value.toLocaleDateString("nb-NO") : "Velg dato"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" selected={value} onSelect={onChange} />
        </PopoverContent>
      </Popover>
    </div>
  )

  const formContent = (
    <div className="flex flex-col gap-4 overflow-y-auto px-1">
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex flex-col gap-2">
        <Label htmlFor="plant-name">Navn *</Label>
        <Input
          id="plant-name"
          placeholder="F.eks. Lavendel"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="plant-species">Art</Label>
          <Input
            id="plant-species"
            placeholder="Lavandula angustifolia"
            value={species}
            onChange={(e) => setSpecies(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="plant-location">Plassering</Label>
          <Input
            id="plant-location"
            placeholder="Bed ved inngang"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label>Type</Label>
          <Select
            value={plantType || NONE}
            onValueChange={(v) =>
              setPlantType(v === NONE ? "" : (v as PlantType))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Velg type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Ikke angitt</SelectItem>
              <SelectItem value="TREE">Tre</SelectItem>
              <SelectItem value="SHRUB">Busk</SelectItem>
              <SelectItem value="PERENNIAL">Staude</SelectItem>
              <SelectItem value="ANNUAL">Ettårig</SelectItem>
              <SelectItem value="FLOWER">Blomst</SelectItem>
              <SelectItem value="HERB">Krydder/urt</SelectItem>
              <SelectItem value="VEGETABLE">Grønnsak</SelectItem>
              <SelectItem value="CLIMBER">Klatreplante</SelectItem>
              <SelectItem value="GRASS">Gress/prydgress</SelectItem>
              <SelectItem value="OTHER">Annet</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label>Livssyklus</Label>
          <Select
            value={lifecycle || NONE}
            onValueChange={(v) =>
              setLifecycle(v === NONE ? "" : (v as Lifecycle))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Velg" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Ikke angitt</SelectItem>
              <SelectItem value="ANNUAL">Ettårig</SelectItem>
              <SelectItem value="BIENNIAL">Toårig</SelectItem>
              <SelectItem value="PERENNIAL">Flerårig</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="plant-description">Beskrivelse</Label>
        <Textarea
          id="plant-description"
          placeholder="Beskriv planten..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="plant-care">Stellinstruksjoner</Label>
        <Textarea
          id="plant-care"
          placeholder="Hvordan stelles planten..."
          value={careInstructions}
          onChange={(e) => setCareInstructions(e.target.value)}
          rows={2}
        />
      </div>

      <Separator />

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label>Vannbehov</Label>
          <Select
            value={wateringNeed || NONE}
            onValueChange={(v) =>
              setWateringNeed(v === NONE ? "" : (v as WateringNeed))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Velg" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Ikke angitt</SelectItem>
              <SelectItem value="LOW">Lite</SelectItem>
              <SelectItem value="MEDIUM">Middels</SelectItem>
              <SelectItem value="HIGH">Mye</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label>Vanningsmetode</Label>
          <Select
            value={wateringMethod || NONE}
            onValueChange={(v) =>
              setWateringMethod(v === NONE ? "" : (v as WateringMethod))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Velg" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Ikke angitt</SelectItem>
              <SelectItem value="MANUAL">Manuell</SelectItem>
              <SelectItem value="AUTOMATIC">Automatisk</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label>Solbehov</Label>
          <Select
            value={sunNeed || NONE}
            onValueChange={(v) => setSunNeed(v === NONE ? "" : (v as SunNeed))}
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
          <Label htmlFor="plant-hardiness">Hardførhetssone</Label>
          <Input
            id="plant-hardiness"
            placeholder="F.eks. H5"
            value={hardinessZone}
            onChange={(e) => setHardinessZone(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="plant-pruning">Beskjæringssesong</Label>
          <Input
            id="plant-pruning"
            placeholder="F.eks. Tidlig vår"
            value={pruningSeason}
            onChange={(e) => setPruningSeason(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="plant-bloom">Blomstringstid</Label>
          <Input
            id="plant-bloom"
            placeholder="F.eks. Juni–august"
            value={bloomTime}
            onChange={(e) => setBloomTime(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="plant-soil">Jordtype</Label>
          <Input
            id="plant-soil"
            placeholder="F.eks. Veldrenert"
            value={soilType}
            onChange={(e) => setSoilType(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="plant-fertilizer">Gjødsling</Label>
          <Input
            id="plant-fertilizer"
            placeholder="Type + frekvens"
            value={fertilizer}
            onChange={(e) => setFertilizer(e.target.value)}
          />
        </div>
      </div>

      <Separator />

      <div className="grid grid-cols-2 gap-4">
        {datePicker("Sist vannet", lastWateredAt, setLastWateredAt)}
        {datePicker("Sist beskåret", lastPrunedAt, setLastPrunedAt)}
      </div>
      <div className="grid grid-cols-2 gap-4">
        {datePicker("Plantet", plantedAt, setPlantedAt)}
      </div>

      <Separator />

      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="plant-toxic">Giftig</Label>
          <p className="text-muted-foreground text-xs">
            Marker hvis planten er giftig
          </p>
        </div>
        <Switch id="plant-toxic" checked={isToxic} onCheckedChange={setIsToxic} />
      </div>

      {isToxic && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="plant-toxic-notes">Giftnotat</Label>
          <Input
            id="plant-toxic-notes"
            placeholder="F.eks. Giftig for hund/katt"
            value={toxicityNotes}
            onChange={(e) => setToxicityNotes(e.target.value)}
          />
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="plant-pests">Skadedyr / sykdommer</Label>
        <Textarea
          id="plant-pests"
          placeholder="Vanlige skadedyr å se etter..."
          value={pests}
          onChange={(e) => setPests(e.target.value)}
          rows={2}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="plant-notes">Notater</Label>
        <Textarea
          id="plant-notes"
          placeholder="Egne notater..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="plant-image">Bilde-URL</Label>
        <Input
          id="plant-image"
          placeholder="https://..."
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="plant-source">Lenke til nettside</Label>
        <Input
          id="plant-source"
          placeholder="F.eks. https://no.wikipedia.org/..."
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
        />
      </div>

      <Button onClick={handleSubmit} disabled={isPending} className="mt-2">
        {isPending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Save className="mr-2 h-4 w-4" />
        )}
        {isEdit ? "Lagre endringer" : "Opprett plante"}
      </Button>
    </div>
  )

  const title = isEdit ? "Rediger plante" : "Ny plante"

  if (isDesktop) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
          </SheetHeader>
          {formContent}
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>{trigger}</DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{title}</DrawerTitle>
        </DrawerHeader>
        <div className="max-h-[80vh] overflow-y-auto px-4 pb-6">
          {formContent}
        </div>
      </DrawerContent>
    </Drawer>
  )
}
