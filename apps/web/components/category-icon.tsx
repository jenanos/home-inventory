import {
  Sofa,
  Monitor,
  ChefHat,
  Bath,
  BedDouble,
  Lamp,
  Wrench,
  Flower2,
  Sparkles,
  Shirt,
  Lightbulb,
  Archive,
  Box,
  type LucideProps,
} from "lucide-react"
import type { ComponentType } from "react"

const ICON_MAP: Record<string, ComponentType<LucideProps>> = {
  sofa: Sofa,
  monitor: Monitor,
  "chef-hat": ChefHat,
  bath: Bath,
  "bed-double": BedDouble,
  lamp: Lamp,
  wrench: Wrench,
  "flower-2": Flower2,
  sparkles: Sparkles,
  shirt: Shirt,
  lightbulb: Lightbulb,
  archive: Archive,
  box: Box,
}

export function CategoryIcon({
  name,
  className = "h-3.5 w-3.5",
}: {
  name: string
  className?: string
}) {
  const Icon = ICON_MAP[name]
  if (!Icon) return <span>{name}</span>
  return <Icon className={className} />
}
