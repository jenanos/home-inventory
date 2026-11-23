import { Badge } from "@workspace/ui/components/badge"
import { Clock, Globe, Leaf } from "lucide-react"
import type {
  PackingDurationValue,
  PackingSeasonValue,
} from "@/lib/application/packing/rules"
import { DURATION_SHORT_LABELS, SEASON_LABELS } from "@/lib/packing-labels"

export function TripBadges({
  season,
  duration,
  abroad,
}: {
  season: PackingSeasonValue | null
  duration: PackingDurationValue | null
  abroad: boolean
}) {
  if (!season && !duration && !abroad) return null

  return (
    <div className="flex flex-wrap gap-1.5">
      {season && (
        <Badge variant="outline" className="text-xs">
          <Leaf className="mr-1 h-3 w-3" />
          {SEASON_LABELS[season]}
        </Badge>
      )}
      {duration && (
        <Badge variant="outline" className="text-xs">
          <Clock className="mr-1 h-3 w-3" />
          {DURATION_SHORT_LABELS[duration]}
        </Badge>
      )}
      {abroad && (
        <Badge variant="outline" className="text-xs">
          <Globe className="mr-1 h-3 w-3" />
          Utenlands
        </Badge>
      )}
    </div>
  )
}
