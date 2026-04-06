import { requireAdmin } from "@/lib/session"
import { db } from "@workspace/db"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { UsersSection } from "./users-section"
import { HouseholdsSection } from "./households-section"

export default async function AdminPage() {
  const { session } = await requireAdmin()

  const [users, households] = await Promise.all([
    db.user.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        householdMembers: {
          include: { household: true },
        },
      },
    }),
    db.household.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        members: {
          include: { user: true },
        },
      },
    }),
  ])

  return (
    <div className="space-y-6 sm:space-y-8">
      <h1 className="font-heading text-2xl sm:text-3xl">Administrasjon</h1>

      <Card>
        <CardHeader>
          <CardTitle>Brukere ({users.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <UsersSection
            users={users.map((u) => ({
              id: u.id,
              email: u.email,
              name: u.name,
              isAdmin: u.isAdmin,
              createdAt: u.createdAt.toISOString(),
              households: u.householdMembers.map((m) => ({
                id: m.household.id,
                name: m.household.name,
                role: m.role,
              })),
            }))}
            currentUserId={session.user.id}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Husstander ({households.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <HouseholdsSection
            households={households.map((h) => ({
              id: h.id,
              name: h.name,
              createdAt: h.createdAt.toISOString(),
              members: h.members.map((m) => ({
                name: m.user.name ?? m.user.email,
                role: m.role,
              })),
            }))}
          />
        </CardContent>
      </Card>
    </div>
  )
}
