import { requireAuth, getUserHousehold } from "@/lib/session"
import { redirect } from "next/navigation"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { OnboardingForm } from "./onboarding-form"

export default async function OnboardingPage() {
  const session = await requireAuth()
  const membership = await getUserHousehold(session.user.id)

  if (membership) {
    redirect("/")
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="font-heading text-3xl tracking-tight">
            Velkommen!
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            La oss sette opp husstanden din for &aring; komme i gang.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Opprett husstand</CardTitle>
            <CardDescription>
              Gi husstanden din et navn &mdash; du kan endre det senere.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <OnboardingForm />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
