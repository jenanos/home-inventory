// TODO: Vurder oppgradering fra next-auth@5.0.0-beta.30 til stabil v5-release.
// Se også @auth/core override i rot package.json (pnpm.overrides).
import NextAuth from "next-auth"
import type { NextAuthConfig } from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { Prisma, db } from "@workspace/db"
import Resend from "next-auth/providers/resend"

const prismaAdapter = PrismaAdapter(db)
const isDevelopment = process.env.NODE_ENV === "development"
const baseUseVerificationToken = prismaAdapter.useVerificationToken?.bind(prismaAdapter)
const baseDeleteSession = prismaAdapter.deleteSession?.bind(prismaAdapter)

type DevCallbackState = {
  url: string
  createdAt: number
}

type UsedVerificationToken = {
  identifier: string
  token: string
  expires: Date
  usedAt: number
}

const g = globalThis as unknown as {
  __devCallbackState?: DevCallbackState | null
  __recentVerificationTokens?: Map<string, UsedVerificationToken>
}

function getRecentVerificationTokenCache() {
  g.__recentVerificationTokens ??= new Map<string, UsedVerificationToken>()
  return g.__recentVerificationTokens
}

function getVerificationCacheKey(params: { identifier?: string; token: string }) {
  return `${params.identifier ?? ""}:${params.token}`
}

function readRecentVerificationToken(params: { identifier?: string; token: string }) {
  if (!isDevelopment) return null

  const cache = getRecentVerificationTokenCache()
  const cacheKey = getVerificationCacheKey(params)
  const cached = cache.get(cacheKey)

  if (!cached) return null

  if (Date.now() - cached.usedAt > 15_000) {
    cache.delete(cacheKey)
    return null
  }

  return {
    identifier: cached.identifier,
    token: cached.token,
    expires: cached.expires,
  }
}

function cacheVerificationToken(token: {
  identifier: string
  token: string
  expires: Date
}) {
  if (!isDevelopment) return

  const cache = getRecentVerificationTokenCache()
  cache.set(getVerificationCacheKey(token), {
    ...token,
    usedAt: Date.now(),
  })
}

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
    const cached = readRecentVerificationToken(params)
    if (cached) {
      return cached
    }

    if (params.identifier) {
      if (!baseUseVerificationToken) {
        throw new Error("Prisma adapter mangler useVerificationToken")
      }

      const token = await baseUseVerificationToken(params)
      if (token) {
        cacheVerificationToken(token)
      }
      return token
    }

    // @auth/core may omit identifier from the callback URL query params.
    // The Prisma adapter requires both fields for the compound unique lookup,
    // so we fall back to finding by token alone when identifier is missing.
    const existing = await db.verificationToken.findFirst({
      where: { token: params.token },
    })
    if (!existing) return null

    const token = await db.verificationToken.delete({
      where: {
        identifier_token: {
          identifier: existing.identifier,
          token: existing.token,
        },
      },
    })

    cacheVerificationToken(token)
    return token
  },
}

// In dev mode, store the callback URL on globalThis so the verify page
// can offer a safe local shortcut without requiring the user to copy
// a long URL from the terminal (which often gets truncated).
// globalThis is shared across all server-side module evaluations in the same process.
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
  if (!isDevelopment) {
    return
  }

  if (!isAllowedDevCallbackUrl(url)) {
    g.__devCallbackState = null
    return
  }

  g.__devCallbackState = {
    url,
    createdAt: Date.now(),
  }
}
export function getDevCallbackUrl() {
  if (!isDevelopment) {
    return null
  }

  const state = g.__devCallbackState
  if (!state) return null
  if (Date.now() - state.createdAt > 10 * 60_000) {
    g.__devCallbackState = null
    return null
  }
  return state.url
}

async function isEmailAllowed(email: string): Promise<boolean> {
  const adminEmail = process.env.ADMIN_EMAIL
  if (adminEmail && email.toLowerCase() === adminEmail.toLowerCase()) {
    return true
  }

  const existingUser = await db.user.findUnique({ where: { email } })
  return existingUser !== null
}

const config = {
  adapter,
  providers: [
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.EMAIL_FROM ?? "Home Overview <noreply@resend.dev>",
      ...(process.env.NODE_ENV === "development" && {
        sendVerificationRequest({ url }: { url: string }) {
          setDevCallbackUrl(url)
          console.log("\n════════════════════════════════════════")
          console.log("  🔗 Magic link klar på /login/verify")
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
