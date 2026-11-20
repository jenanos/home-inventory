"use client"

import { useEffect, useTransition } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Columns3, List } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { cn } from "@workspace/ui/lib/utils"

import type { BoardGroupingOption } from "@/lib/board/types"
import {
  GROUP_PARAM,
  VIEW_PARAM,
  groupCookieName,
  viewCookieName,
  type BoardScope,
  type PageView,
} from "@/lib/board/view"

const ONE_YEAR = 60 * 60 * 24 * 365

function remember(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${ONE_YEAR}; samesite=lax`
}

/**
 * Switches a page between its list and its board, and picks what the board
 * is grouped on. Desktop only: the board needs the width.
 */
export function BoardToolbar({
  scope,
  view,
  grouping,
  groupings,
  className,
}: {
  scope: BoardScope
  view: PageView
  grouping: string
  groupings: readonly BoardGroupingOption[]
  className?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  // The page opens the way it was last seen, also when that came from a link.
  useEffect(() => {
    remember(viewCookieName(scope), view)
    if (view === "tavle") remember(groupCookieName(scope), grouping)
  }, [scope, view, grouping])

  function navigate(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set(key, value)
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    })
  }

  return (
    <div
      className={cn(
        "hidden items-center gap-2 lg:flex",
        isPending && "opacity-70",
        className
      )}
    >
      {view === "tavle" && (
        <Select
          value={grouping}
          onValueChange={(value) => navigate(GROUP_PARAM, value)}
        >
          <SelectTrigger size="sm" className="h-8 w-auto text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {groupings.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                Grupper: {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Tabs value={view} onValueChange={(value) => navigate(VIEW_PARAM, value)}>
        <TabsList className="h-8">
          <TabsTrigger value="liste" className="text-xs">
            <List />
            Liste
          </TabsTrigger>
          <TabsTrigger value="tavle" className="text-xs">
            <Columns3 />
            Tavle
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  )
}
