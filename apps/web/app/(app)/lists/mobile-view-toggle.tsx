"use client"

import { useEffect, useTransition } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { LayoutList, Rows3 } from "lucide-react"
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { cn } from "@workspace/ui/lib/utils"

import {
  MOBILE_VIEW_COOKIE,
  MOBILE_VIEW_PARAM,
  type MobileShoppingView,
} from "@/lib/board/view"

const ONE_YEAR = 60 * 60 * 24 * 365

/**
 * Phones only: the overview as list cards, or every item in one long list.
 * The desktop has the board for that.
 */
export function MobileViewToggle({ view }: { view: MobileShoppingView }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    document.cookie = `${MOBILE_VIEW_COOKIE}=${view}; path=/; max-age=${ONE_YEAR}; samesite=lax`
  }, [view])

  function navigate(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set(MOBILE_VIEW_PARAM, value)
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    })
  }

  return (
    <Tabs
      value={view}
      onValueChange={navigate}
      className={cn("lg:hidden", isPending && "opacity-70")}
    >
      <TabsList className="w-full">
        <TabsTrigger value="lister">
          <LayoutList />
          Per liste
        </TabsTrigger>
        <TabsTrigger value="alle">
          <Rows3 />
          Alle varer
        </TabsTrigger>
      </TabsList>
    </Tabs>
  )
}
