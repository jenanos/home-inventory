import Link from "next/link"
import { Shield } from "lucide-react"
import { requireHousehold, isCurrentUserAdmin } from "@/lib/session"
import { db } from "@workspace/db"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Button } from "@workspace/ui/components/button"
import { Separator } from "@workspace/ui/components/separator"
import { listConnectedApps } from "@/lib/queries/connected-apps"
import { ProfileForm } from "./profile-form"
import { MembersSection } from "./members-section"
import { CategoriesSection } from "./categories-section"
import { ConnectedAppsSection } from "./connected-apps-section"

const dateFormatter = new Intl.DateTimeFormat("nb-NO", {
  dateStyle: "medium",
  timeStyle: "short",
})

export default async function SettingsPage() {
  const { session, membership } = await requireHousehold()
  const isAdmin = await isCurrentUserAdmin()

  const [user, members, categories, grants] = await Promise.all([
    db.user.findUnique({ where: { id: session.user.id } }),
    db.householdMember.findMany({
      where: { householdId: membership.householdId },
      include: { user: true },
    }),
    db.category.findMany({
      where: { householdId: membership.householdId },
      orderBy: { name: "asc" },
    }),
    listConnectedApps(session.user.id),
  ])

  const isOwner = membership.role === "OWNER"
  const connectedApps = grants.map((grant) => ({
    grantId: grant.grantId,
    clientName: grant.clientName,
    scopes: grant.scopes,
    connectedAt: dateFormatter.format(grant.connectedAt),
    lastUsedAt: grant.lastUsedAt
      ? dateFormatter.format(grant.lastUsedAt)
      : null,
  }))

  return (
    <div className="space-y-6 sm:space-y-8">
      <h1 className="font-heading text-2xl sm:text-3xl">Innstillinger</h1>

      <Card>
        <CardHeader>
          <CardTitle>Profil</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileForm name={user?.name ?? ""} email={user?.email ?? ""} />
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

      <Card>
        <CardHeader>
          <CardTitle>Tilkoblede apper</CardTitle>
          <CardDescription>
            Apper som kan lese eller endre data på dine vegne via MCP. Å trekke
            tilbake tilgangen stopper fornying umiddelbart; et allerede utstedt
            tilgangstoken kan leve til det utløper.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ConnectedAppsSection apps={connectedApps} />
        </CardContent>
      </Card>

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Administrasjon</CardTitle>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/admin">
                <Shield className="mr-2 h-4 w-4" />
                Gå til adminpanel
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
