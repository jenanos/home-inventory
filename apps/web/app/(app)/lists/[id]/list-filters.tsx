"use client"

import { useCallback, useState } from "react"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Button } from "@workspace/ui/components/button"
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@workspace/ui/components/drawer"
import { X, SlidersHorizontal } from "lucide-react"
import { CategoryIcon } from "@/components/category-icon"

interface ListFiltersProps {
  categories: Array<{ id: string; name: string; icon: string | null; color: string | null }>
  members: Array<{ id: string; name: string; email: string }>
}

const PRIORITY_OPTIONS = [
  { value: "HIGH", label: "Hoy" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Lav" },
] as const

const PHASE_OPTIONS = [
  { value: "BEFORE_MOVE", label: "For innflytting" },
  { value: "FIRST_WEEK", label: "Forste uke" },
  { value: "CAN_WAIT", label: "Kan vente" },
  { value: "NO_RUSH", label: "Ingen hast" },
] as const

const STATUS_OPTIONS = [
  { value: "PENDING", label: "Ventende" },
  { value: "PURCHASED", label: "Kjopt" },
  { value: "SKIPPED", label: "Hoppet over" },
] as const

const SORT_OPTIONS = [
  { value: "priority", label: "Prioritet" },
  { value: "price", label: "Pris" },
  { value: "date", label: "Dato lagt til" },
  { value: "category", label: "Kategori" },
  { value: "name", label: "Navn" },
] as const

export function ListFilters({ categories, members }: ListFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const currentCategory = searchParams.get("category") ?? ""
  const currentPriority = searchParams.get("priority") ?? ""
  const currentPhase = searchParams.get("phase") ?? ""
  const currentAssigned = searchParams.get("assigned") ?? ""
  const currentStatus = searchParams.get("status") ?? ""
  const currentSort = searchParams.get("sort") ?? "priority"

  const hasFilters =
    !!(currentCategory || currentPriority || currentPhase || currentAssigned || currentStatus)

  const activeFilterCount = [currentCategory, currentPriority, currentPhase, currentAssigned, currentStatus].filter(Boolean).length

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value && value !== "all") {
        params.set(key, value)
      } else {
        params.delete(key)
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    },
    [router, pathname, searchParams]
  )

  function clearFilters() {
    const params = new URLSearchParams()
    if (currentSort !== "priority") {
      params.set("sort", currentSort)
    }
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  const filterSelects = (
    <>
      <Select value={currentCategory || "all"} onValueChange={(v) => updateParam("category", v)}>
        <SelectTrigger size="sm" className="h-8 w-auto text-xs">
          <SelectValue placeholder="Kategori" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Alle kategorier</SelectItem>
          {categories.map((cat) => (
            <SelectItem key={cat.id} value={cat.id}>
              <span className="flex items-center gap-1.5">
                {cat.icon && <CategoryIcon name={cat.icon} className="h-3.5 w-3.5" />}
                {cat.name}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={currentPriority || "all"} onValueChange={(v) => updateParam("priority", v)}>
        <SelectTrigger size="sm" className="h-8 w-auto text-xs">
          <SelectValue placeholder="Prioritet" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Alle prioriteter</SelectItem>
          {PRIORITY_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={currentPhase || "all"} onValueChange={(v) => updateParam("phase", v)}>
        <SelectTrigger size="sm" className="h-8 w-auto text-xs">
          <SelectValue placeholder="Fase" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Alle faser</SelectItem>
          {PHASE_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {members.length > 1 && (
        <Select value={currentAssigned || "all"} onValueChange={(v) => updateParam("assigned", v)}>
          <SelectTrigger size="sm" className="h-8 w-auto text-xs">
            <SelectValue placeholder="Tildelt" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle personer</SelectItem>
            {members.map((member) => (
              <SelectItem key={member.id} value={member.id}>
                {member.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Select value={currentStatus || "all"} onValueChange={(v) => updateParam("status", v)}>
        <SelectTrigger size="sm" className="h-8 w-auto text-xs">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Alle statuser</SelectItem>
          {STATUS_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  )

  const sortSelect = (
    <Select value={currentSort} onValueChange={(v) => updateParam("sort", v)}>
      <SelectTrigger size="sm" className="h-8 w-auto text-xs">
        <SelectValue placeholder="Sorter" />
      </SelectTrigger>
      <SelectContent>
        {SORT_OPTIONS.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            Sorter: {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )

  return (
    <>
      {/* Desktop: show all filters inline */}
      <div className="hidden sm:flex flex-wrap items-center gap-2">
        {filterSelects}

        <div className="h-6 w-px bg-border" />

        {sortSelect}

        {hasFilters && (
          <Button
            variant="ghost"
            size="xs"
            onClick={clearFilters}
            className="text-muted-foreground"
          >
            <X className="h-3 w-3" data-icon="inline-start" />
            Nullstill
          </Button>
        )}
      </div>

      {/* Mobile: collapse filters into drawer, keep sort visible */}
      <div className="flex sm:hidden items-center gap-2">
        <MobileFilterDrawer
          categories={categories}
          members={members}
          hasFilters={hasFilters}
          activeFilterCount={activeFilterCount}
          clearFilters={clearFilters}
          updateParam={updateParam}
          currentCategory={currentCategory}
          currentPriority={currentPriority}
          currentPhase={currentPhase}
          currentAssigned={currentAssigned}
          currentStatus={currentStatus}
        />

        {sortSelect}
      </div>
    </>
  )
}

function MobileFilterDrawer({
  categories,
  members,
  hasFilters,
  activeFilterCount,
  clearFilters,
  updateParam,
  currentCategory,
  currentPriority,
  currentPhase,
  currentAssigned,
  currentStatus,
}: {
  categories: ListFiltersProps["categories"]
  members: ListFiltersProps["members"]
  hasFilters: boolean
  activeFilterCount: number
  clearFilters: () => void
  updateParam: (key: string, value: string) => void
  currentCategory: string
  currentPriority: string
  currentPhase: string
  currentAssigned: string
  currentStatus: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 text-xs">
          <SlidersHorizontal className="h-3.5 w-3.5" data-icon="inline-start" />
          Filtrering
          {activeFilterCount > 0 && (
            <span className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
              {activeFilterCount}
            </span>
          )}
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader className="flex flex-row items-center justify-between">
          <DrawerTitle>Filtrering</DrawerTitle>
          {hasFilters && (
            <Button
              variant="ghost"
              size="xs"
              onClick={clearFilters}
              className="text-muted-foreground"
            >
              <X className="h-3 w-3" data-icon="inline-start" />
              Nullstill
            </Button>
          )}
        </DrawerHeader>
        <div className="grid gap-4 px-4 pb-6">
          <div className="grid gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Kategori</span>
            <Select value={currentCategory || "all"} onValueChange={(v) => updateParam("category", v)}>
              <SelectTrigger size="sm" className="h-9 w-full text-xs">
                <SelectValue placeholder="Alle kategorier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle kategorier</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    <span className="flex items-center gap-1.5">
                      {cat.icon && <CategoryIcon name={cat.icon} className="h-3.5 w-3.5" />}
                      {cat.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Prioritet</span>
              <Select value={currentPriority || "all"} onValueChange={(v) => updateParam("priority", v)}>
                <SelectTrigger size="sm" className="h-9 w-full text-xs">
                  <SelectValue placeholder="Alle" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle</SelectItem>
                  {PRIORITY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Fase</span>
              <Select value={currentPhase || "all"} onValueChange={(v) => updateParam("phase", v)}>
                <SelectTrigger size="sm" className="h-9 w-full text-xs">
                  <SelectValue placeholder="Alle" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle</SelectItem>
                  {PHASE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className={members.length > 1 ? "grid grid-cols-2 gap-3" : ""}>
            <div className="grid gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Status</span>
              <Select value={currentStatus || "all"} onValueChange={(v) => updateParam("status", v)}>
                <SelectTrigger size="sm" className="h-9 w-full text-xs">
                  <SelectValue placeholder="Alle" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle</SelectItem>
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {members.length > 1 && (
              <div className="grid gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Tildelt</span>
                <Select value={currentAssigned || "all"} onValueChange={(v) => updateParam("assigned", v)}>
                  <SelectTrigger size="sm" className="h-9 w-full text-xs">
                    <SelectValue placeholder="Alle" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle</SelectItem>
                    {members.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
