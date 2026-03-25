import { requireHousehold } from "@/lib/session"
import { db } from "@workspace/db"
import { SidebarProvider } from "@workspace/ui/components/sidebar"
import { Toaster } from "@workspace/ui/components/sonner"
import { AppSidebar } from "./app-sidebar"
import { MobileNav } from "./mobile-nav"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { session, membership } = await requireHousehold()

  const lists = await db.shoppingList.findMany({
    where: { householdId: membership.householdId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true },
  })

  const user = {
    id: session.user.id,
    name: session.user.name ?? session.user.email ?? "",
    email: session.user.email ?? "",
    image: session.user.image ?? undefined,
  }

  const householdName = membership.household.name

  return (
    <SidebarProvider>
      <div className="flex min-h-svh w-full">
        <AppSidebar
          user={user}
          householdName={householdName}
          lists={lists}
        />
        <main className="flex-1 pb-20 md:pb-0">
          <div className="mx-auto max-w-5xl p-4 md:p-8">{children}</div>
        </main>
        <MobileNav lists={lists} />
      </div>
      <Toaster />
    </SidebarProvider>
  )
}
