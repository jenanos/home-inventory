"use client"

import { useState, useTransition } from "react"
import { inviteToHousehold, removeMember } from "@/lib/actions/household"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Badge } from "@workspace/ui/components/badge"
import { Separator } from "@workspace/ui/components/separator"
import { Loader2, UserPlus, Trash2 } from "lucide-react"
import { toast } from "sonner"

interface Member {
  userId: string
  role: string
  name: string
  email: string
}

interface MembersSectionProps {
  members: Member[]
  householdId: string
  isOwner: boolean
  currentUserId: string
}

export function MembersSection({
  members,
  householdId,
  isOwner,
  currentUserId,
}: MembersSectionProps) {
  const [email, setEmail] = useState("")
  const [isPending, startTransition] = useTransition()

  function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return
    startTransition(async () => {
      try {
        await inviteToHousehold(householdId, email)
        toast.success("Medlem lagt til")
        setEmail("")
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Kunne ikke legge til medlem"
        )
      }
    })
  }

  function handleRemove(userId: string) {
    startTransition(async () => {
      try {
        await removeMember(householdId, userId)
        toast.success("Medlem fjernet")
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Kunne ikke fjerne medlem"
        )
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {members.map((member) => (
          <div
            key={member.userId}
            className="flex items-center justify-between"
          >
            <div>
              <p className="text-sm font-medium">{member.name}</p>
              <p className="text-muted-foreground text-xs">{member.email}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={member.role === "OWNER" ? "default" : "secondary"}>
                {member.role === "OWNER" ? "Eier" : "Medlem"}
              </Badge>
              {isOwner && member.userId !== currentUserId && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleRemove(member.userId)}
                  disabled={isPending}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {isOwner && (
        <>
          <Separator />
          <form onSubmit={handleInvite} className="space-y-3">
            <Label htmlFor="invite-email">Legg til medlem</Label>
            <div className="flex gap-2">
              <Input
                id="invite-email"
                type="email"
                placeholder="e-post@eksempel.no"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1"
              />
              <Button type="submit" disabled={isPending || !email}>
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              Brukeren får tilgang til appen og kan logge inn med magisk lenke.
            </p>
          </form>
        </>
      )}
    </div>
  )
}
