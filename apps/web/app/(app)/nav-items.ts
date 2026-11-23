import {
  CalendarHeart,
  Flower2,
  Hammer,
  LayoutDashboard,
  Luggage,
  Settings,
  ShoppingCart,
  Wallet,
  type LucideIcon,
} from "lucide-react"

import type { QuickNavPageId } from "@/lib/quick-nav"

export type NavItem = {
  id: QuickNavPageId
  href: string
  label: string
  icon: LucideIcon
}

/** Every page in the app's menus, in menu order. */
export const NAV_ITEMS: readonly NavItem[] = [
  { id: "overview", href: "/", label: "Oversikt", icon: LayoutDashboard },
  { id: "lists", href: "/lists", label: "Innkjøp", icon: ShoppingCart },
  { id: "projects", href: "/prosjekter", label: "Prosjekter", icon: Hammer },
  { id: "budget", href: "/budsjett", label: "Budsjett", icon: Wallet },
  { id: "garden", href: "/hage", label: "Hage", icon: Flower2 },
  { id: "events", href: "/hendelser", label: "Hendelser", icon: CalendarHeart },
  { id: "packing", href: "/pakkelister", label: "Pakkelister", icon: Luggage },
  { id: "settings", href: "/settings", label: "Innstillinger", icon: Settings },
]

export function navItem(id: QuickNavPageId): NavItem {
  return NAV_ITEMS.find((item) => item.id === id)!
}

export function isNavItemActive(href: string, pathname: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href)
}
