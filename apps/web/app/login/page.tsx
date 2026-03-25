import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { LoginForm } from "./login-form"

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>
}) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-heading text-3xl tracking-tight">
            Hjem&shy;oversikt
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Hold orden p&aring; hjemmet ditt
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Logg inn</CardTitle>
            <CardDescription>
              Skriv inn e-postadressen din, s&aring; sender vi deg en magisk
              innloggingslenke.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm searchParams={searchParams} />
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Ingen passord n&oslash;dvendig &mdash; vi sender en sikker lenke til
          e-posten din.
        </p>
      </div>
    </div>
  )
}
