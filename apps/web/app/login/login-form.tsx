"use client"

import { useState, use } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Mail, Loader2 } from "lucide-react"

export function LoginForm({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>
}) {
  const { callbackUrl } = use(searchParams)
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const result = await signIn("resend", {
        email,
        redirectTo: callbackUrl || "/",
        redirect: false,
      })

      if (result?.error) {
        setError("Noe gikk galt. Pr\u00f8v igjen.")
        setIsLoading(false)
        return
      }

      router.push("/login/verify")
    } catch {
      setError("Noe gikk galt. Pr\u00f8v igjen.")
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="email">E-postadresse</Label>
        <div className="relative">
          <Input
            id="email"
            type="email"
            placeholder="deg@eksempel.no"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            autoFocus
            disabled={isLoading}
            className="pl-9"
          />
          <Mail className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" disabled={isLoading} size="lg" className="w-full">
        {isLoading ? (
          <>
            <Loader2 className="animate-spin" data-icon="inline-start" />
            Sender lenke...
          </>
        ) : (
          "Send magisk lenke"
        )}
      </Button>
    </form>
  )
}
