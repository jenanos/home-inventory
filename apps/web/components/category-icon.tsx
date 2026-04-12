import {
  Baby,
  Sofa,
  Monitor,
  ChefHat,
  Bath,
  BedDouble,
  Briefcase,
  Box,
  CircleHelp,
  HousePlug,
  Lamp,
  Lightbulb,
  Refrigerator,
  Shirt,
  Archive,
  Sparkles,
  Wrench,
  Flower2,
  type LucideProps,
} from "lucide-react"
import type { ComponentType } from "react"

const ICON_MAP: Record<string, ComponentType<LucideProps>> = {
  baby: Baby,
  sofa: Sofa,
  monitor: Monitor,
  "chef-hat": ChefHat,
  bath: Bath,
  "bed-double": BedDouble,
  briefcase: Briefcase,
  refrigerator: Refrigerator,
  "house-plug": HousePlug,
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
  const normalizedName = name.toLowerCase()
  const Icon = ICON_MAP[normalizedName] ?? CircleHelp
  return <Icon className={className} />
}
