"use client"

import { useState, useTransition } from "react"
import {
  createCategory,
  updateCategory,
  deleteCategory,
} from "@/lib/actions/category"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Badge } from "@workspace/ui/components/badge"
import { Separator } from "@workspace/ui/components/separator"
import { Loader2, Plus, Pencil, Trash2, Check, X } from "lucide-react"
import { toast } from "sonner"

interface Category {
  id: string
  name: string
  icon: string | null
  color: string | null
  isDefault: boolean
}

interface CategoriesSectionProps {
  categories: Category[]
}

export function CategoriesSection({ categories }: CategoriesSectionProps) {
  const [newName, setNewName] = useState("")
  const [newColor, setNewColor] = useState("#6B7280")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [isPending, startTransition] = useTransition()

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    startTransition(async () => {
      try {
        await createCategory(newName.trim(), undefined, newColor)
        toast.success("Kategori opprettet")
        setNewName("")
      } catch {
        toast.error("Kunne ikke opprette kategori")
      }
    })
  }

  function handleUpdate(id: string) {
    if (!editName.trim()) return
    startTransition(async () => {
      try {
        await updateCategory(id, { name: editName.trim() })
        toast.success("Kategori oppdatert")
        setEditingId(null)
      } catch {
        toast.error("Kunne ikke oppdatere kategori")
      }
    })
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      try {
        await deleteCategory(id)
        toast.success("Kategori slettet")
      } catch {
        toast.error("Kunne ikke slette kategori")
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {categories.map((cat) => (
          <div key={cat.id} className="flex items-center justify-between gap-2">
            {editingId === cat.id ? (
              <div className="flex flex-1 items-center gap-2">
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="flex-1"
                  autoFocus
                />
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => handleUpdate(cat.id)}
                  disabled={isPending}
                >
                  <Check className="h-4 w-4" />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => setEditingId(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  {cat.color && (
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: cat.color }}
                    />
                  )}
                  <span className="text-sm">{cat.name}</span>
                  {cat.isDefault && (
                    <Badge variant="outline" className="text-xs">
                      Standard
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingId(cat.id)
                      setEditName(cat.name)
                    }}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  {!cat.isDefault && (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => handleDelete(cat.id)}
                      disabled={isPending}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      <Separator />

      <form onSubmit={handleCreate} className="space-y-3">
        <Label>Ny kategori</Label>
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Kategorinavn"
            className="flex-1"
          />
          <input
            type="color"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            className="h-9 w-9 cursor-pointer rounded border-0"
          />
          <Button type="submit" disabled={isPending || !newName.trim()}>
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
