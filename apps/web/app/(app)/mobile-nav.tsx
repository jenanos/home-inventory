"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"
import { Ellipsis, LogOut, Settings2, Shield } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"
import { cn } from "@workspace/ui/lib/utils"

import type { QuickNavPageId } from "@/lib/quick-nav"
import { NAV_ITEMS, isNavItemActive, navItem } from "./nav-items"

interface MobileNavProps {
  /** The pages chosen for the bar, in order (Innstillinger → Hurtigpanel). */
  quickPages: QuickNavPageId[]
  isAdmin?: boolean
}

/**
 * The phone's bottom bar: the user's chosen pages plus "Mer", a sheet with
 * every page. There is no room for all of them side by side.
 */
export function MobileNav({ quickPages, isAdmin }: MobileNavProps) {
  const pathname = usePathname()
  const [moreOpen, setMoreOpen] = useState(false)

  const quickItems = quickPages.map(navItem)
  // "Mer" lights up when the current page is not in the bar.
  const moreActive = !quickItems.some((item) =>
    isNavItemActive(item.href, pathname)
  )

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm md:hidden">
      <div className="flex items-center justify-around">
        {quickItems.map((item) => {
          const isActive = isNavItemActive(item.href, pathname)
          return (
            <Link
              key={item.id}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex min-h-[56px] min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-xs transition-colors",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <item.icon className="h-5 w-5" />
              <span className="max-w-full truncate">{item.label}</span>
            </Link>
          )
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          className={cn(
            "flex min-h-[56px] min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-xs transition-colors",
            moreActive
              ? "text-primary"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Ellipsis className="h-5 w-5" />
          <span>Mer</span>
        </button>
      </div>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[85svh] overflow-y-auto rounded-t-xl pb-[calc(1rem+env(safe-area-inset-bottom))]"
        >
          <SheetHeader className="pb-0">
            <SheetTitle>Alle sider</SheetTitle>
            <SheetDescription>
              Velg hvilke sider som ligger i panelet nederst under
              Innstillinger.
            </SheetDescription>
          </SheetHeader>
          <div className="grid grid-cols-3 gap-2 px-4">
            {NAV_ITEMS.map((item) => {
              const isActive = isNavItemActive(item.href, pathname)
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-lg border px-2 py-3 text-center text-xs font-medium transition-colors",
                    isActive
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-muted"
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  <span>{item.label}</span>
                </Link>
              )
            })}
            {isAdmin && (
              <Link
                href="/admin"
                onClick={() => setMoreOpen(false)}
                className="flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-lg border border-border px-2 py-3 text-center text-xs font-medium transition-colors hover:bg-muted"
              >
                <Shield className="h-5 w-5" />
                <span>Administrasjon</span>
              </Link>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 px-4">
            <Link
              href="/settings#hurtigpanel"
              onClick={() => setMoreOpen(false)}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <Settings2 className="h-4 w-4" />
              Tilpass hurtigpanelet
            </Link>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
              Logg ut
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  )
}
