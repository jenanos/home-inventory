"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, ShoppingCart, Settings, Wrench, Wallet } from "lucide-react"
import { cn } from "@workspace/ui/lib/utils"

export function MobileNav() {
  const pathname = usePathname()

  const items = [
    { href: "/", label: "Oversikt", icon: LayoutDashboard },
    { href: "/lists", label: "Innkjøp", icon: ShoppingCart },
    { href: "/vedlikehold", label: "Vedlikehold", icon: Wrench },
    { href: "/budsjett", label: "Budsjett", icon: Wallet },
    { href: "/settings", label: "Innstillinger", icon: Settings },
  ]

  return (
    <nav className="bg-card/95 border-border fixed inset-x-0 bottom-0 z-50 border-t backdrop-blur-sm md:hidden">
      <div className="flex items-center justify-around">
        {items.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href)
          return (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                "flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-xs transition-colors",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <item.icon className="h-5 w-5" />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
