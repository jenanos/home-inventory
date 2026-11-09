import type { Metadata } from "next"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Clock } from "lucide-react"

import { getActiveUploadLink } from "@/lib/application/attachments/upload-links"
import { UploadLinkForm } from "./upload-link-form"

export const metadata: Metadata = {
  title: "Last opp bilder",
  // The URL is a credential; keep it out of search engines and referrers.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}

const TARGET_LABELS = {
  plant: "planten",
  bed: "bedet",
  project: "prosjektet",
} as const

export default async function UploadLinkPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const link = await getActiveUploadLink(token)

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center gap-4 p-4">
      {link ? (
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-xl">
              Last opp til {TARGET_LABELS[link.target.type]} «{link.targetName}»
            </CardTitle>
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              Lenken virker til{" "}
              {link.expiresAt.toLocaleTimeString("nb-NO", {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "Europe/Oslo",
              })}{" "}
              · maks {link.remainingFiles} filer
            </p>
          </CardHeader>
          <CardContent>
            <UploadLinkForm token={token} />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-xl">
              Lenken virker ikke lenger
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Opplastingslenker varer i 30 minutter og kan brukes til et begrenset
            antall filer. Be assistenten om en ny lenke, eller last opp direkte
            i appen.
          </CardContent>
        </Card>
      )}
    </main>
  )
}
