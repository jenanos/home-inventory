import { requireAdmin } from "@/lib/session"
import { Toaster } from "@workspace/ui/components/sonner"
import Link from "next/link"
import { Home, ArrowLeft } from "lucide-react"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireAdmin()

  return (
    <div className="min-h-svh w-full">
      <header className="border-border border-b">
        <div className="mx-auto flex max-w-5xl items-center gap-4 p-4">
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground flex items-center gap-2 text-sm transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Tilbake til appen
          </Link>
          <div className="flex items-center gap-2">
            <Home className="text-primary h-5 w-5" />
            <span className="font-heading text-lg">Administrasjon</span>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl p-4 md:p-8">{children}</main>
      <Toaster />
    </div>
  )
}
