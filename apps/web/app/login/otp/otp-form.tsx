"use client"

import { useState, use } from "react"
import { signIn } from "next-auth/react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Mail, KeyRound, Loader2, ArrowLeft } from "lucide-react"

type Step = "email" | "code"

export function OtpForm({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string | string[] }>
}) {
  const { callbackUrl: rawCallbackUrl } = use(searchParams)
  const callbackUrl = Array.isArray(rawCallbackUrl)
    ? rawCallbackUrl[0]
    : rawCallbackUrl
  const safeCallbackUrl =
    callbackUrl && callbackUrl.startsWith("/") && !callbackUrl.startsWith("//")
      ? callbackUrl
      : "/"

  const [step, setStep] = useState<Step>("email")
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSendCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const result = await signIn("otp", {
        email,
        redirectTo: safeCallbackUrl,
        redirect: false,
      })

      if (result?.error) {
        if (result.code === "AccessDenied" || result.error === "AccessDenied") {
          setError(
            "Denne e-postadressen har ikke tilgang. Kontakt administrator for å få en invitasjon.",
          )
        } else {
          setError("Noe gikk galt. Prøv igjen.")
        }
        setIsLoading(false)
        return
      }

      setStep("code")
      setIsLoading(false)
    } catch {
      setError("Noe gikk galt. Prøv igjen.")
      setIsLoading(false)
    }
  }

  function handleVerifyCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    const trimmed = code.trim()
    if (!/^\d{6}$/.test(trimmed)) {
      setError("Koden må være 6 sifre.")
      setIsLoading(false)
      return
    }

    const url = new URL("/api/auth/callback/otp", window.location.origin)
    url.searchParams.set("token", trimmed)
    url.searchParams.set("email", email)
    url.searchParams.set("callbackUrl", safeCallbackUrl)
    window.location.href = url.toString()
  }

  if (step === "code") {
    return (
      <form onSubmit={handleVerifyCode} className="grid gap-4">
        <p className="text-sm text-muted-foreground">
          Vi sendte en kode til <span className="font-medium">{email}</span>.
          Skriv den inn under.
        </p>

        <div className="grid gap-2">
          <Label htmlFor="code">Engangskode</Label>
          <div className="relative">
            <Input
              id="code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              required
              autoFocus
              disabled={isLoading}
              className="pl-9 tracking-[0.4em]"
            />
            <KeyRound className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
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
              Logger inn...
            </>
          ) : (
            "Logg inn"
          )}
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isLoading}
          onClick={() => {
            setStep("email")
            setCode("")
            setError(null)
          }}
        >
          <ArrowLeft data-icon="inline-start" />
          Bruk en annen e-post
        </Button>
      </form>
    )
  }

  return (
    <form onSubmit={handleSendCode} className="grid gap-4">
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
            Sender kode...
          </>
        ) : (
          "Send kode"
        )}
      </Button>
    </form>
  )
}
