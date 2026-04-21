// TODO: Vurder oppgradering fra next-auth@5.0.0-beta.30 til stabil v5-release.
// Se også @auth/core override i rot package.json (pnpm.overrides).
import NextAuth from "next-auth"
import type { NextAuthConfig } from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { Prisma, db } from "@workspace/db"
import Resend from "next-auth/providers/resend"
import { Resend as ResendClient } from "resend"
import { randomInt } from "node:crypto"

const prismaAdapter = PrismaAdapter(db)
const baseUseVerificationToken = prismaAdapter.useVerificationToken?.bind(prismaAdapter)
const baseDeleteSession = prismaAdapter.deleteSession?.bind(prismaAdapter)

function isPrismaErrorWithCode(error: unknown, code: string) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
  )
}

const adapter: typeof prismaAdapter = {
  ...prismaAdapter,
  async deleteSession(sessionToken) {
    if (!baseDeleteSession) return null

    try {
      const deletedSession = await baseDeleteSession(sessionToken)
      return deletedSession ?? null
    } catch (error) {
      // Auth.js may try to clear a stale session cookie during email sign-in.
      // Missing session rows should be treated as already signed out.
      if (isPrismaErrorWithCode(error, "P2025")) {
        return null
      }

      throw error
    }
  },
  async useVerificationToken(params) {
    if (params.identifier) {
      if (!baseUseVerificationToken) {
        throw new Error("Prisma adapter mangler useVerificationToken")
      }
      return baseUseVerificationToken(params)
    }

    // @auth/core may omit identifier from the callback URL query params.
    // The Prisma adapter requires both fields for the compound unique lookup,
    // so we fall back to finding by token alone when identifier is missing.
    const existing = await db.verificationToken.findFirst({
      where: { token: params.token },
    })
    if (!existing) return null

    return db.verificationToken.delete({
      where: {
        identifier_token: {
          identifier: existing.identifier,
          token: existing.token,
        },
      },
    })
  },
}

async function isEmailAllowed(email: string): Promise<boolean> {
  const adminEmail = process.env.ADMIN_EMAIL
  if (adminEmail && email.toLowerCase() === adminEmail.toLowerCase()) {
    return true
  }

  const existingUser = await db.user.findUnique({ where: { email } })
  return existingUser !== null
}

const OTP_LENGTH = 6
const OTP_MAX_AGE_SECONDS = 10 * 60

function generateNumericOtp(length = OTP_LENGTH): string {
  let code = ""
  for (let i = 0; i < length; i++) {
    code += randomInt(0, 10).toString()
  }
  return code
}

const emailFrom = process.env.EMAIL_FROM ?? "Home Overview <noreply@resend.dev>"

const config = {
  adapter,
  providers: [
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: emailFrom,
    }),
    Resend({
      id: "otp",
      name: "Email OTP",
      apiKey: process.env.RESEND_API_KEY,
      from: emailFrom,
      maxAge: OTP_MAX_AGE_SECONDS,
      generateVerificationToken: () => generateNumericOtp(),
      async sendVerificationRequest({ identifier: email, token }) {
        const apiKey = process.env.RESEND_API_KEY
        if (!apiKey) {
          throw new Error("RESEND_API_KEY mangler")
        }

        const resend = new ResendClient(apiKey)
        const { error } = await resend.emails.send({
          from: emailFrom,
          to: email,
          subject: `Innloggingskode: ${token}`,
          text: `Din innloggingskode for Hjemoversikt er: ${token}\n\nKoden er gyldig i 10 minutter. Har du ikke bedt om denne koden, kan du se bort fra denne e-posten.`,
          html: `<!doctype html>
<html>
  <body style="font-family: system-ui, -apple-system, Segoe UI, sans-serif; background:#f8fafc; margin:0; padding:24px;">
    <div style="max-width:480px; margin:0 auto; background:#ffffff; border-radius:12px; padding:32px; border:1px solid #e2e8f0;">
      <h1 style="font-size:20px; margin:0 0 16px;">Logg inn i Hjemoversikt</h1>
      <p style="margin:0 0 8px; color:#475569;">Bruk denne koden for å fullføre innloggingen:</p>
      <div style="font-size:32px; font-weight:600; letter-spacing:8px; padding:16px; background:#f1f5f9; border-radius:8px; text-align:center; margin:24px 0; color:#0f172a;">${token}</div>
      <p style="margin:0; color:#64748b; font-size:14px;">Koden er gyldig i 10 minutter. Har du ikke bedt om den, kan du ignorere denne e-posten.</p>
    </div>
  </body>
</html>`,
        })

        if (error) {
          throw new Error(`Kunne ikke sende innloggingskode: ${error.message}`)
        }
      },
    }),
  ],
  pages: {
    signIn: "/login",
    verifyRequest: "/login/verify",
  },
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false
      return isEmailAllowed(user.email)
    },
    session({ session, user }) {
      session.user.id = user.id
      return session
    },
  },
} satisfies NextAuthConfig

const nextAuth = NextAuth(config)

export const handlers: typeof nextAuth.handlers = nextAuth.handlers
export const auth: typeof nextAuth.auth = nextAuth.auth
export const signIn: typeof nextAuth.signIn = nextAuth.signIn
export const signOut: typeof nextAuth.signOut = nextAuth.signOut
