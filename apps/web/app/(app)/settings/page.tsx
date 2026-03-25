import { requireHousehold } from "@/lib/session"
import { db } from "@workspace/db"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Separator } from "@workspace/ui/components/separator"
import { ProfileForm } from "./profile-form"
import { MembersSection } from "./members-section"
import { CategoriesSection } from "./categories-section"

export default async function SettingsPage() {
  const { session, membership } = await requireHousehold()

  const [user, members, categories] = await Promise.all([
    db.user.findUnique({ where: { id: session.user.id } }),
    db.householdMember.findMany({
      where: { householdId: membership.householdId },
      include: { user: true },
    }),
    db.category.findMany({
      where: { householdId: membership.householdId },
      orderBy: { name: "asc" },
    }),
  ])

  const isOwner = membership.role === "OWNER"

  return (
    <div className="space-y-8">
      <h1 className="font-heading text-3xl">Innstillinger</h1>

      <Card>
        <CardHeader>
          <CardTitle>Profil</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileForm
            name={user?.name ?? ""}
            email={user?.email ?? ""}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Medlemmer — {membership.household.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <MembersSection
            members={members.map((m) => ({
              userId: m.userId,
              role: m.role,
              name: m.user.name ?? m.user.email,
              email: m.user.email,
            }))}
            householdId={membership.householdId}
            isOwner={isOwner}
            currentUserId={session.user.id}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Kategorier</CardTitle>
        </CardHeader>
        <CardContent>
          <CategoriesSection
            categories={categories.map((c) => ({
              id: c.id,
              name: c.name,
              icon: c.icon,
              color: c.color,
              isDefault: c.isDefault,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  )
}
