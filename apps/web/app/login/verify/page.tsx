import Link from "next/link"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Button } from "@workspace/ui/components/button"
import { MailCheck, ArrowLeft } from "lucide-react"

function isSafeDevRedirectUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    const isHttp = parsed.protocol === "http:" || parsed.protocol === "https:"
    const isLocalHost =
      parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1"
    return isHttp && isLocalHost
  } catch {
    return false
  }
}

export default async function VerifyPage() {
  let devCallbackUrl: string | null = null

  if (process.env.NODE_ENV === "development") {
    const { getDevCallbackUrl } = await import("@/lib/auth")
    const callbackUrl = getDevCallbackUrl()
    if (callbackUrl && isSafeDevRedirectUrl(callbackUrl)) {
      devCallbackUrl = callbackUrl
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <Card>
          <CardHeader className="items-center text-center">
            <div className="mb-2 flex size-12 items-center justify-center rounded-full bg-primary/10">
              <MailCheck className="size-6 text-primary" />
            </div>
            <CardTitle className="text-xl">Sjekk e-posten din</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            {devCallbackUrl ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Utviklingsmodus er aktiv. Bruk knappen under for &aring;
                  fortsette med den lokale magiske lenken.
                </p>
                <div className="mt-6">
                  <Button className="w-full" asChild>
                    <a href={devCallbackUrl}>Fortsett til innlogging</a>
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Vi har sendt deg en innloggingslenke. Klikk p&aring; lenken i
                e-posten for &aring; logge inn.
              </p>
            )}

            <div className="mt-6">
              <Button variant="ghost" size="sm" asChild>
                <Link href="/login">
                  <ArrowLeft data-icon="inline-start" />
                  Tilbake til innlogging
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
