"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { createHousehold } from "@/lib/actions/household"
import { Home, Loader2, Check, ArrowRight } from "lucide-react"

type Step = "create" | "done"

export function OnboardingForm() {
  const router = useRouter()
  const [step, setStep] = useState<Step>("create")
  const [name, setName] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [householdName, setHouseholdName] = useState("")

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const household = await createHousehold(name.trim())
      setHouseholdName(household.name)
      setStep("done")
    } catch {
      setError("Noe gikk galt. Pr\u00f8v igjen.")
    } finally {
      setIsLoading(false)
    }
  }

  if (step === "done") {
    return (
      <div className="grid gap-6 text-center">
        <div className="flex flex-col items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
            <Check className="size-6 text-primary" />
          </div>
          <div>
            <p className="font-heading text-lg font-medium">Alt er klart!</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Husstanden{" "}
              <span className="font-medium text-foreground">
                {householdName}
              </span>{" "}
              er opprettet.
            </p>
          </div>
        </div>

        <Button size="lg" className="w-full" onClick={() => router.push("/")}>
          G&aring; til oversikten
          <ArrowRight data-icon="inline-end" />
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={handleCreate} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="household-name">Navn p&aring; husstand</Label>
        <div className="relative">
          <Input
            id="household-name"
            type="text"
            placeholder="F.eks. Familien Hansen"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
            disabled={isLoading}
            className="pl-9"
            minLength={2}
            maxLength={50}
          />
          <Home className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" disabled={isLoading} size="lg" className="w-full">
        {isLoading ? (
          <>
            <Loader2 className="animate-spin" data-icon="inline-start" />
            Oppretter...
          </>
        ) : (
          "Opprett husstand"
        )}
      </Button>
    </form>
  )
}
