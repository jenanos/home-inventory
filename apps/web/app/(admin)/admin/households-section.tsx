"use client"

import { useTransition } from "react"
import { deleteHousehold } from "@/lib/actions/admin"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"

interface HouseholdData {
  id: string
  name: string
  createdAt: string
  members: { name: string; role: string }[]
}

interface HouseholdsSectionProps {
  households: HouseholdData[]
}

export function HouseholdsSection({ households }: HouseholdsSectionProps) {
  const [isPending, startTransition] = useTransition()

  function handleDelete(householdId: string, name: string) {
    if (
      !confirm(
        `Er du sikker på at du vil slette husstanden "${name}"? Alt innhold vil bli slettet.`
      )
    )
      return
    startTransition(async () => {
      try {
        await deleteHousehold(householdId)
        toast.success("Husstand slettet")
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Kunne ikke slette husstand"
        )
      }
    })
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Navn</TableHead>
            <TableHead>Medlemmer</TableHead>
            <TableHead>Opprettet</TableHead>
            <TableHead className="w-[60px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {households.map((household) => (
            <TableRow key={household.id}>
              <TableCell className="font-medium">{household.name}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {household.members.map((m, i) => (
                    <Badge
                      key={i}
                      variant={m.role === "OWNER" ? "default" : "secondary"}
                    >
                      {m.name}
                    </Badge>
                  ))}
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {new Date(household.createdAt).toLocaleDateString("nb-NO")}
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleDelete(household.id, household.name)}
                  disabled={isPending}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {households.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-muted-foreground text-center">
                Ingen husstander ennå.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
