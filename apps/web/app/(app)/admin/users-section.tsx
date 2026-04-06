"use client"

import { useState, useTransition } from "react"
import { addUser, deleteUser } from "@/lib/actions/admin"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Badge } from "@workspace/ui/components/badge"
import { Separator } from "@workspace/ui/components/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Loader2, UserPlus, Trash2 } from "lucide-react"
import { toast } from "sonner"

interface UserData {
  id: string
  email: string
  name: string | null
  isAdmin: boolean
  createdAt: string
  households: { id: string; name: string; role: string }[]
}

interface UsersSectionProps {
  users: UserData[]
  currentUserId: string
}

export function UsersSection({ users, currentUserId }: UsersSectionProps) {
  const [email, setEmail] = useState("")
  const [isPending, startTransition] = useTransition()

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return
    startTransition(async () => {
      try {
        await addUser(email)
        toast.success("Bruker lagt til")
        setEmail("")
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Kunne ikke legge til bruker"
        )
      }
    })
  }

  function handleDelete(userId: string) {
    if (!confirm("Er du sikker på at du vil slette denne brukeren?")) return
    startTransition(async () => {
      try {
        await deleteUser(userId)
        toast.success("Bruker slettet")
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Kunne ikke slette bruker"
        )
      }
    })
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleAdd} className="space-y-3">
        <Label htmlFor="add-user-email">Legg til ny bruker</Label>
        <div className="flex gap-2">
          <Input
            id="add-user-email"
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
          Brukeren vil kunne logge inn med magisk lenke etter at de er lagt til.
        </p>
      </form>

      <Separator />

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>E-post</TableHead>
              <TableHead>Navn</TableHead>
              <TableHead>Husstand</TableHead>
              <TableHead>Opprettet</TableHead>
              <TableHead className="w-[60px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {user.email}
                    {user.isAdmin && <Badge variant="default">Admin</Badge>}
                  </div>
                </TableCell>
                <TableCell>{user.name ?? "—"}</TableCell>
                <TableCell>
                  {user.households.length > 0
                    ? user.households
                        .map(
                          (h) =>
                            `${h.name} (${h.role === "OWNER" ? "eier" : "medlem"})`
                        )
                        .join(", ")
                    : "Ingen"}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {new Date(user.createdAt).toLocaleDateString("nb-NO")}
                </TableCell>
                <TableCell>
                  {user.id !== currentUserId && !user.isAdmin && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleDelete(user.id)}
                      disabled={isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
