// TODO: Vurder oppgradering fra next-auth@5.0.0-beta.30 til stabil v5-release.
// Se også @auth/core override i rot package.json (pnpm.overrides).
import NextAuth from "next-auth"
import type { NextAuthConfig } from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { db } from "@workspace/db"
import Resend from "next-auth/providers/resend"

const prismaAdapter = PrismaAdapter(db)

const adapter: typeof prismaAdapter = {
  ...prismaAdapter,
  async useVerificationToken(params) {
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

// In dev mode, store the callback URL on globalThis so the verify page
// can auto-redirect without requiring the user to copy a long URL
// from the terminal (which often gets truncated).
// globalThis is shared across all server-side module evaluations in the same process.
const g = globalThis as unknown as { __devCallbackUrl?: string | null }

function isAllowedDevCallbackUrl(url: string): boolean {
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

export function setDevCallbackUrl(url: string) {
  if (process.env.NODE_ENV !== "development") {
    return
  }

  if (!isAllowedDevCallbackUrl(url)) {
    g.__devCallbackUrl = null
    return
  }

  g.__devCallbackUrl = url
}
export function getDevCallbackUrl() {
  if (process.env.NODE_ENV !== "development") {
    return null
  }

  const url = g.__devCallbackUrl
  g.__devCallbackUrl = null
  return url ?? null
}

const config = {
  adapter,
  providers: [
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.EMAIL_FROM ?? "Home Inventory <noreply@resend.dev>",
      ...(process.env.NODE_ENV === "development" && {
        sendVerificationRequest({ url }: { url: string }) {
          setDevCallbackUrl(url)
          console.log("\n════════════════════════════════════════")
          console.log("  🔗 Magic link (auto-redirecting)")
          console.log("════════════════════════════════════════\n")
        },
      }),
    }),
  ],
  pages: {
    signIn: "/login",
    verifyRequest: "/login/verify",
  },
  callbacks: {
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
