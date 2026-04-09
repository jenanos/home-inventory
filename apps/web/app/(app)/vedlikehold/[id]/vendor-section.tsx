"use client"

import { useState, useTransition } from "react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Badge } from "@workspace/ui/components/badge"
import { Separator } from "@workspace/ui/components/separator"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@workspace/ui/components/drawer"
import {
  Users,
  Plus,
  Loader2,
  CheckCircle2,
  Phone,
  Mail,
  Globe,
  Trash2,
  Star,
  Pencil,
} from "lucide-react"
import {
  createTaskVendor,
  deleteTaskVendor,
  selectTaskVendor,
  updateTaskVendor,
} from "@/lib/actions/maintenance-task"
import { useMediaQuery } from "@/hooks/use-media-query"

interface Vendor {
  id: string
  name: string
  description: string | null
  phone: string | null
  email: string | null
  website: string | null
  estimatedPrice: number | null
  notes: string | null
  isSelected: boolean
  taskId: string
}

interface VendorSectionProps {
  taskId: string
  vendors: Vendor[]
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    maximumFractionDigits: 0,
  }).format(amount)

export function VendorSection({ taskId, vendors }: VendorSectionProps) {
  const [isPending, startTransition] = useTransition()
  const [addOpen, setAddOpen] = useState(false)
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null)
  const isDesktop = useMediaQuery("(min-width: 768px)")

  // Add form state
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [website, setWebsite] = useState("")
  const [estimatedPrice, setEstimatedPrice] = useState("")
  const [notes, setNotes] = useState("")

  // Edit form state
  const [editName, setEditName] = useState("")
  const [editDescription, setEditDescription] = useState("")
  const [editPhone, setEditPhone] = useState("")
  const [editEmail, setEditEmail] = useState("")
  const [editWebsite, setEditWebsite] = useState("")
  const [editEstimatedPrice, setEditEstimatedPrice] = useState("")
  const [editNotes, setEditNotes] = useState("")

  function resetAddForm() {
    setName("")
    setDescription("")
    setPhone("")
    setEmail("")
    setWebsite("")
    setEstimatedPrice("")
    setNotes("")
  }

  function openEditForm(vendor: Vendor) {
    setEditingVendor(vendor)
    setEditName(vendor.name)
    setEditDescription(vendor.description ?? "")
    setEditPhone(vendor.phone ?? "")
    setEditEmail(vendor.email ?? "")
    setEditWebsite(vendor.website ?? "")
    setEditEstimatedPrice(vendor.estimatedPrice?.toString() ?? "")
    setEditNotes(vendor.notes ?? "")
  }

  function handleAdd() {
    if (!name.trim()) return
    startTransition(async () => {
      await createTaskVendor({
        taskId,
        name: name.trim(),
        description: description.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        website: website.trim() || undefined,
        estimatedPrice: estimatedPrice ? parseFloat(estimatedPrice) : undefined,
        notes: notes.trim() || undefined,
      })
      resetAddForm()
      setAddOpen(false)
    })
  }

  function handleUpdate() {
    if (!editingVendor || !editName.trim()) return
    startTransition(async () => {
      await updateTaskVendor({
        id: editingVendor.id,
        name: editName.trim(),
        description: editDescription.trim() || null,
        phone: editPhone.trim() || null,
        email: editEmail.trim() || null,
        website: editWebsite.trim() || null,
        estimatedPrice: editEstimatedPrice
          ? parseFloat(editEstimatedPrice)
          : null,
        notes: editNotes.trim() || null,
      })
      setEditingVendor(null)
    })
  }

  function handleSelect(vendorId: string) {
    startTransition(async () => {
      await selectTaskVendor(vendorId)
    })
  }

  function handleDelete(vendorId: string) {
    startTransition(async () => {
      await deleteTaskVendor(vendorId)
    })
  }

  const vendorFormFields = (
    prefix: "add" | "edit",
    values: {
      name: string
      description: string
      phone: string
      email: string
      website: string
      estimatedPrice: string
      notes: string
    },
    setters: {
      setName: (v: string) => void
      setDescription: (v: string) => void
      setPhone: (v: string) => void
      setEmail: (v: string) => void
      setWebsite: (v: string) => void
      setEstimatedPrice: (v: string) => void
      setNotes: (v: string) => void
    }
  ) => (
    <div className="flex flex-col gap-4 px-1">
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${prefix}-vendor-name`}>Navn *</Label>
        <Input
          id={`${prefix}-vendor-name`}
          placeholder="F.eks. Byggmester Hansen AS"
          value={values.name}
          onChange={(e) => setters.setName(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${prefix}-vendor-desc`}>Beskrivelse</Label>
        <Textarea
          id={`${prefix}-vendor-desc`}
          placeholder="Kort beskrivelse av aktøren..."
          value={values.description}
          onChange={(e) => setters.setDescription(e.target.value)}
          rows={2}
        />
      </div>

      <Separator />

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${prefix}-vendor-phone`}>Telefon</Label>
          <Input
            id={`${prefix}-vendor-phone`}
            placeholder="+47 000 00 000"
            value={values.phone}
            onChange={(e) => setters.setPhone(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${prefix}-vendor-email`}>E-post</Label>
          <Input
            id={`${prefix}-vendor-email`}
            type="email"
            placeholder="post@firma.no"
            value={values.email}
            onChange={(e) => setters.setEmail(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${prefix}-vendor-website`}>Nettside</Label>
        <Input
          id={`${prefix}-vendor-website`}
          placeholder="https://www.firma.no"
          value={values.website}
          onChange={(e) => setters.setWebsite(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${prefix}-vendor-price`}>Estimert pris (NOK)</Label>
        <Input
          id={`${prefix}-vendor-price`}
          type="number"
          placeholder="0"
          value={values.estimatedPrice}
          onChange={(e) => setters.setEstimatedPrice(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${prefix}-vendor-notes`}>Notater</Label>
        <Textarea
          id={`${prefix}-vendor-notes`}
          placeholder="Ekstra notater..."
          value={values.notes}
          onChange={(e) => setters.setNotes(e.target.value)}
          rows={2}
        />
      </div>
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-heading flex items-center gap-2 text-lg font-semibold">
          <Users className="h-5 w-5" />
          Aktører
        </h2>
        <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="mr-1 h-4 w-4" />
          Legg til aktør
        </Button>
      </div>

      {vendors.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-8">
          <Users className="text-muted-foreground mb-3 h-8 w-8" />
          <p className="text-muted-foreground text-sm">
            Ingen aktører lagt til ennå
          </p>
          <p className="text-muted-foreground text-xs">
            Legg til aktører og velg en som endelig vedtatt
          </p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {vendors.map((vendor) => (
            <Card
              key={vendor.id}
              className={
                vendor.isSelected
                  ? "border-primary ring-primary/20 ring-2"
                  : ""
              }
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">{vendor.name}</CardTitle>
                    {vendor.isSelected && (
                      <Badge className="bg-primary text-primary-foreground">
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                        Vedtatt
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => openEditForm(vendor)}
                      disabled={isPending}
                      aria-label="Rediger aktør"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    {!vendor.isSelected && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleSelect(vendor.id)}
                        disabled={isPending}
                        aria-label="Velg som endelig aktør"
                      >
                        <Star className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-red-600 hover:text-red-700 dark:text-red-400"
                      onClick={() => handleDelete(vendor.id)}
                      disabled={isPending}
                      aria-label="Slett aktør"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                {vendor.description && (
                  <p className="text-muted-foreground text-sm">
                    {vendor.description}
                  </p>
                )}
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {vendor.estimatedPrice !== null && (
                  <p className="text-sm font-medium tabular-nums">
                    {formatCurrency(vendor.estimatedPrice)}
                  </p>
                )}

                <div className="flex flex-wrap gap-3 text-xs">
                  {vendor.phone && (
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {vendor.phone}
                    </span>
                  )}
                  {vendor.email && (
                    <a
                      href={`mailto:${vendor.email}`}
                      className="text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                    >
                      <Mail className="h-3 w-3" />
                      {vendor.email}
                    </a>
                  )}
                  {vendor.website && (() => {
                    try {
                      const url = new URL(vendor.website)
                      if (url.protocol === "http:" || url.protocol === "https:") {
                        return (
                          <a
                            href={vendor.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                          >
                            <Globe className="h-3 w-3" />
                            Nettside
                          </a>
                        )
                      }
                    } catch {
                      // invalid URL, don't render link
                    }
                    return null
                  })()}
                </div>

                {vendor.notes && (
                  <p className="text-muted-foreground mt-1 text-xs">
                    {vendor.notes}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add vendor sheet/drawer */}
      {isDesktop ? (
        <Sheet open={addOpen} onOpenChange={setAddOpen}>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Legg til aktør</SheetTitle>
            </SheetHeader>
            {vendorFormFields(
              "add",
              { name, description, phone, email, website, estimatedPrice, notes },
              {
                setName,
                setDescription,
                setPhone,
                setEmail,
                setWebsite,
                setEstimatedPrice,
                setNotes,
              }
            )}
            <div className="mt-4 px-1">
              <Button onClick={handleAdd} disabled={isPending} className="w-full">
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Legg til aktør
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      ) : (
        <Drawer open={addOpen} onOpenChange={setAddOpen}>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>Legg til aktør</DrawerTitle>
            </DrawerHeader>
            <div className="overflow-y-auto px-4 pb-6">
              {vendorFormFields(
                "add",
                { name, description, phone, email, website, estimatedPrice, notes },
                {
                  setName,
                  setDescription,
                  setPhone,
                  setEmail,
                  setWebsite,
                  setEstimatedPrice,
                  setNotes,
                }
              )}
              <div className="mt-4 px-1">
                <Button onClick={handleAdd} disabled={isPending} className="w-full">
                  {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Legg til aktør
                </Button>
              </div>
            </div>
          </DrawerContent>
        </Drawer>
      )}

      {/* Edit vendor sheet/drawer */}
      {isDesktop ? (
        <Sheet
          open={editingVendor !== null}
          onOpenChange={(open) => !open && setEditingVendor(null)}
        >
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Rediger aktør</SheetTitle>
            </SheetHeader>
            {vendorFormFields(
              "edit",
              {
                name: editName,
                description: editDescription,
                phone: editPhone,
                email: editEmail,
                website: editWebsite,
                estimatedPrice: editEstimatedPrice,
                notes: editNotes,
              },
              {
                setName: setEditName,
                setDescription: setEditDescription,
                setPhone: setEditPhone,
                setEmail: setEditEmail,
                setWebsite: setEditWebsite,
                setEstimatedPrice: setEditEstimatedPrice,
                setNotes: setEditNotes,
              }
            )}
            <div className="mt-4 px-1">
              <Button
                onClick={handleUpdate}
                disabled={isPending}
                className="w-full"
              >
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Lagre endringer
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      ) : (
        <Drawer
          open={editingVendor !== null}
          onOpenChange={(open) => !open && setEditingVendor(null)}
        >
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>Rediger aktør</DrawerTitle>
            </DrawerHeader>
            <div className="overflow-y-auto px-4 pb-6">
              {vendorFormFields(
                "edit",
                {
                  name: editName,
                  description: editDescription,
                  phone: editPhone,
                  email: editEmail,
                  website: editWebsite,
                  estimatedPrice: editEstimatedPrice,
                  notes: editNotes,
                },
                {
                  setName: setEditName,
                  setDescription: setEditDescription,
                  setPhone: setEditPhone,
                  setEmail: setEditEmail,
                  setWebsite: setEditWebsite,
                  setEstimatedPrice: setEditEstimatedPrice,
                  setNotes: setEditNotes,
                }
              )}
              <div className="mt-4 px-1">
                <Button
                  onClick={handleUpdate}
                  disabled={isPending}
                  className="w-full"
                >
                  {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Lagre endringer
                </Button>
              </div>
            </div>
          </DrawerContent>
        </Drawer>
      )}
    </div>
  )
}
