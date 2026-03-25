"use client"

import { useState, useTransition } from "react"
import { updateProfile } from "@/lib/actions/user"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

interface ProfileFormProps {
  name: string
  email: string
}

export function ProfileForm({ name: initialName, email }: ProfileFormProps) {
  const [name, setName] = useState(initialName)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      try {
        await updateProfile(name)
        toast.success("Profilen er oppdatert")
      } catch {
        toast.error("Kunne ikke oppdatere profilen")
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Navn</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ditt navn"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">E-post</Label>
        <Input id="email" value={email} disabled />
        <p className="text-muted-foreground text-xs">
          E-postadressen kan ikke endres
        </p>
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Lagre
      </Button>
    </form>
  )
}
