import Link from "next/link"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { OtpForm } from "./otp-form"

export default function OtpLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string | string[] }>
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
            <CardTitle className="text-xl">Logg inn med kode</CardTitle>
            <CardDescription>
              Vi sender en 6-sifret engangskode til e-posten din.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <OtpForm searchParams={searchParams} />
            <div className="mt-4 text-center text-sm">
              <Link
                href="/login"
                className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Bruk magisk lenke i stedet
              </Link>
            </div>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Kun for inviterte brukere. Koden er gyldig i 10 minutter.
        </p>
      </div>
    </div>
  )
}
