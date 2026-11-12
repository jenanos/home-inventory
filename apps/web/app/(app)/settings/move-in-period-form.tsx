"use client"

import { useState, useTransition } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"

import { updateMoveInPeriod } from "@/lib/actions/household"

export function MoveInPeriodForm({
  moveInPeriodEndsOn,
}: {
  moveInPeriodEndsOn: string | null
}) {
  const [value, setValue] = useState(moveInPeriodEndsOn ?? "")
  const [isPending, startTransition] = useTransition()

  function save(next: string | null) {
    startTransition(async () => {
      try {
        await updateMoveInPeriod(next)
        setValue(next ?? "")
        toast.success(
          next
            ? "Innflyttingsperioden er lagret"
            : "Innflyttingsperioden er fjernet"
        )
      } catch {
        toast.error("Kunne ikke lagre datoen")
      }
    })
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        save(value || null)
      }}
      className="space-y-3"
    >
      <div className="space-y-2">
        <Label htmlFor="move-in-period-ends">
          Innflyttingsperioden varte til og med
        </Label>
        <Input
          id="move-in-period-ends"
          type="date"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="w-auto"
        />
        <p className="text-xs text-muted-foreground">
          Innkjøp til og med denne dagen telles som innflytting i
          innkjøpstallene, så du kan se dem for seg.
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          type="submit"
          disabled={isPending || value === (moveInPeriodEndsOn ?? "")}
        >
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Lagre
        </Button>
        {moveInPeriodEndsOn && (
          <Button
            type="button"
            variant="ghost"
            disabled={isPending}
            onClick={() => save(null)}
          >
            Fjern
          </Button>
        )}
      </div>
    </form>
  )
}
